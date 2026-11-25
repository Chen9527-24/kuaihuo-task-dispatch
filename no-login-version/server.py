"""Serve the local publisher and anonymous comment links using Python's standard library."""
import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import time
from contextlib import closing
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import domain


ROOT = Path(__file__).resolve().parent
WEEK = 7 * 24 * 3600
YEAR = 365 * 24 * 3600
STATIC = {
    "/": ("index.html", "text/html"),
    "/manage": ("index.html", "text/html"),
    "/static/style.css": ("style.css", "text/css"),
    "/static/app.js": ("app.js", "text/javascript"),
    "/static/example-video.mp4": ("example-video.mp4", "video/mp4"),
}

# Site owners may provide their own public teaching images beside the local database.
GUIDES = {
    ("douyin.com", "iesdouyin.com"): {
        "video": {"ios": "dy-ios.png", "android": "dy-android.jpg"},
        "comment": {"ios": "dy1-ios.png", "android": "dy1-ios.png"},
    },
    ("xiaohongshu.com", "xhslink.com"): {
        "video": {"ios": "xhs-ios.png", "android": "xhs-android.png"},
        "comment": {"ios": "xhs-comment.png", "android": "xhs-comment.png"},
    },
}
GUIDE_PREFIX = "/static/task-guides/"
GUIDE_NAMES = {name for platform in GUIDES.values() for stage in platform.values()
               for name in stage.values()}


def guide_images(video_url, directory):
    host = (urlsplit(video_url).hostname or "").lower().rstrip(".")
    for domains, stages in GUIDES.items():
        if any(host == domain or host.endswith("." + domain) for domain in domains):
            images = {}
            for stage, devices in stages.items():
                urls = {device: GUIDE_PREFIX + name for device, name in devices.items()
                        if (directory / name).is_file() and not (directory / name).is_symlink()}
                if urls:
                    images[stage] = urls
            return images
    return {}


def connect(path):
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


def initialize(path):
    with closing(connect(path)) as db:
        db.execute("PRAGMA journal_mode=WAL")
        domain.initialize(db)
        with db:
            db.execute("CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL)")
            db.execute("INSERT OR IGNORE INTO settings VALUES ('manage_key',?)",
                       (secrets.token_urlsafe(32),))
            return db.execute("SELECT value FROM settings WHERE name='manage_key'").fetchone()[0]


def admin_signature(key, expires):
    return hmac.new(key.encode("ascii"), ("manage-session:" + expires).encode("ascii"),
                    hashlib.sha256).hexdigest()


class Handler(BaseHTTPRequestHandler):
    server_version = "CommentDispatch"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(20)

    def log_message(self, *_):
        pass

    def reply(self, status, data, mime="application/json"):
        if mime == "application/json":
            data = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; "
                         "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        for cookie in self.response_cookies:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        if self.headers.get_content_type() != "application/json":
            raise domain.DomainError(415, "请使用 JSON 格式提交")
        size = self.headers.get("Content-Length", "")
        if not size.isascii() or not size.isdecimal() or len(size) > 10:
            raise domain.DomainError(400, "请求长度无效")
        size = int(size)
        if size > 8 * 1024 * 1024:
            raise domain.DomainError(413, "请求内容过大")
        try:
            data = json.loads(self.rfile.read(size))
        except (UnicodeError, ValueError, RecursionError):
            raise domain.DomainError(400, "请求内容格式有误") from None
        if not isinstance(data, dict):
            raise domain.DomainError(400, "请求内容应为对象")
        return data

    def read_cookie(self, name):
        jar = SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie", ""))
            item = jar.get(name)
            return item.value if item else ""
        except CookieError:
            return ""

    def set_cookie(self, name, value, lifetime):
        self.response_cookies.append(
            f"{name}={value}; HttpOnly; SameSite=Strict; Path=/; Max-Age={lifetime}")

    def admin(self):
        value = self.read_cookie(self.server.admin_cookie)
        match = re.fullmatch(r"([0-9]{1,12})\.([0-9a-f]{64})", value)
        if not match or int(match[1]) <= time.time():
            return False
        return hmac.compare_digest(match[2], admin_signature(self.server.key, match[1]))

    def visitor(self):
        token = self.read_cookie(self.server.visitor_cookie)
        if re.fullmatch(r"[0-9a-f]{64}", token):
            return hashlib.sha256(token.encode("ascii")).hexdigest()
        self.set_cookie(self.server.visitor_cookie, secrets.token_hex(32), YEAR)
        return None

    def api(self, path):
        data = self.body() if self.command == "POST" else {}
        if path == "/api/manage-session" and self.command == "POST":
            key = data.get("key")
            if not isinstance(key, str) or not hmac.compare_digest(key.encode(), self.server.key.encode()):
                raise domain.DomainError(403, "发布者入口无效，请使用终端中的完整地址")
            end = str(int(time.time()) + WEEK)
            self.set_cookie(self.server.admin_cookie, end + "." + admin_signature(self.server.key, end), WEEK)
            return self.reply(200, {"ok": True})
        visitor = self.visitor() if path.startswith("/api/public/") else None
        with closing(connect(self.server.db_path)) as db:
            result = domain.handle(db, self.command, path, data, admin=self.admin(), visitor=visitor)
        if path.startswith("/api/public/"):
            visit = result.get("visit") or result
            if visit.get("video_url"):
                images = guide_images(visit["video_url"], self.server.db_path.parent / "task-guides")
                if images:
                    result["guide_images"] = images
        self.reply(200, result)

    def dispatch(self):
        self.response_cookies = []
        try:
            host = self.headers.get("Host", "").lower()
            port = self.server.server_port
            if host not in (f"localhost:{port}", f"127.0.0.1:{port}"):
                raise domain.DomainError(403, "请通过本机地址访问")
            if self.command == "POST" and (self.headers.get("Origin", "http://" + host) != "http://" + host
                                           or self.headers.get("Sec-Fetch-Site") == "cross-site"):
                raise domain.DomainError(403, "请从本机页面提交")
            path = urlsplit(self.path).path
            if path.startswith("/api/"):
                return self.api(path)
            if self.command == "GET" and path.startswith(GUIDE_PREFIX):
                name = path[len(GUIDE_PREFIX):]
                if name not in GUIDE_NAMES:
                    raise domain.DomainError(404, "教学图不存在")
                asset = self.server.db_path.parent / "task-guides" / name
                if asset.is_symlink() or not asset.is_file():
                    raise domain.DomainError(404, "教学图不存在")
                mime = "image/jpeg" if name.endswith(".jpg") else "image/png"
                return self.reply(200, asset.read_bytes(), mime)
            if self.command != "GET" or path not in STATIC:
                raise domain.DomainError(404, "页面不存在")
            name, mime = STATIC[path]
            asset = ROOT / "static" / name
            if not asset.is_file():
                raise domain.DomainError(404, "文件不存在")
            if not mime.startswith("video/"):
                mime += "; charset=utf-8"
            self.reply(200, asset.read_bytes(), mime)
        except domain.DomainError as exc:
            self.reply(exc.status, {"error": str(exc)})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            return
        except sqlite3.OperationalError as exc:
            if "locked" in str(exc):
                self.reply(503, {"error": "数据正被使用，请稍后重试"})
            else:
                raise

    do_GET = dispatch
    do_POST = dispatch


def main():
    parser = argparse.ArgumentParser(description="快火评论分发 · 免登录版")
    parser.add_argument("--port", type=int, default=8780, help="本机端口")
    parser.add_argument("--data-dir", type=Path, default=ROOT / ".local", help="本机数据目录")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("端口范围为 0 至 65535")
    os.umask(0o077)
    args.data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as exc:
        parser.exit(1, f"无法启动服务（{exc}），可用 --port 更换端口。\n")
    with server:
        server.db_path = args.data_dir / "comments.sqlite3"
        server.key = initialize(server.db_path)
        server.admin_cookie = f"kh_publisher_{server.server_port}"
        server.visitor_cookie = f"kh_reader_{server.server_port}"
        base = f"http://127.0.0.1:{server.server_port}"
        print("本机首页  " + base, flush=True)
        print("发布者专用  " + base + "/manage#key=" + server.key, flush=True)
        print("发布后复制任务链接给领取者。按 Ctrl+C 停止。", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止。", file=sys.stderr)
