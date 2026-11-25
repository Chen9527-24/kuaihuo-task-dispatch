"""Serve the local publisher and anonymous comment links using Python's standard library."""
import argparse
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from contextlib import closing
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import accounts
import domain


ROOT = Path(__file__).resolve().parent
WEEK = 7 * 24 * 3600
YEAR = 365 * 24 * 3600
PUBLIC_DB_LIMIT_BYTES = 64 * 1024 * 1024
STATIC = {
    "/": ("index.html", "text/html"),
    "/manage": ("index.html", "text/html"),
    "/static/style.css": ("style.css", "text/css"),
    "/static/app.js": ("app.js", "text/javascript"),
    "/static/comments.js": ("comments.js", "text/javascript"),
    "/static/collection.css": ("collection.css", "text/css"),
    "/static/exceljs.min.js": ("exceljs.min.js", "text/javascript"),
    "/static/exceljs.LICENSE.txt": ("exceljs.LICENSE.txt", "text/plain"),
    "/static/example-video.mp4": ("example-video.mp4", "video/mp4"),
}

# Site owners may provide their own public teaching images beside the local database.
GUIDES = {
    "douyin": {
        "video": {"ios": "dy-ios.png", "android": "dy-android.jpg"},
        "comment": {"ios": "dy1-ios.png", "android": "dy1-ios.png"},
    },
    "xiaohongshu": {
        "video": {"ios": "xhs-ios.png", "android": "xhs-android.png"},
        "comment": {"ios": "xhs-comment.png", "android": "xhs-comment.png"},
    },
}
GUIDE_PREFIX = "/static/task-guides/"
GUIDE_NAMES = {name for platform in GUIDES.values() for stage in platform.values()
               for name in stage.values()}


def guide_images(platform, directory):
    images = {}
    for stage, devices in GUIDES.get(platform, {}).items():
        urls = {device: GUIDE_PREFIX + name for device, name in devices.items()
                if (directory / name).is_file() and not (directory / name).is_symlink()}
        if urls:
            images[stage] = urls
    return images


def connect(path, limit_bytes=None):
    db = sqlite3.connect(path, timeout=10)
    try:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        if limit_bytes is not None:
            page_size = db.execute("PRAGMA page_size").fetchone()[0]
            # SQLite floors the limit at the current page count of an existing database.
            db.execute(f"PRAGMA max_page_count={max(1, limit_bytes // page_size)}").fetchone()
    except sqlite3.Error:
        db.close()
        raise
    return db


def initialize(path, limit_bytes=None, public_accounts=False):
    with closing(connect(path, limit_bytes)) as db:
        db.execute("PRAGMA journal_mode=WAL")
        domain.initialize(db)
        if public_accounts:
            return None
        with db:
            db.execute("CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL)")
            db.execute("INSERT OR IGNORE INTO settings VALUES ('manage_key',?)",
                       (secrets.token_urlsafe(32),))
            return db.execute("SELECT value FROM settings WHERE name='manage_key'").fetchone()[0]


def admin_signature(key, expires):
    return hmac.new(key.encode("ascii"), ("manage-session:" + expires).encode("ascii"),
                    hashlib.sha256).hexdigest()


def public_origin(value):
    """Accept one HTTPS DNS origin and return its browser serialization."""
    match = re.fullmatch(r"https://([a-z0-9.-]+)(?::([0-9]{1,5}))?/?", value, re.ASCII | re.I)
    if match:
        host = match[1].lower()
        port = int(match[2] or 443)
        if (len(host) <= 253 and 0 < port <= 65535
                and all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                        for label in host.split("."))):
            return "https://" + host + (f":{port}" if port != 443 else "")
    raise argparse.ArgumentTypeError("请填写 HTTPS 站点根地址，例如 https://task.example.com")


class AccountRateLimit:
    """Limit password work and anonymous account creation across request threads."""
    def __init__(self):
        self.lock = threading.Lock()
        self.window_end = 0
        self.per_ip = {}
        self.total = 0

    def check(self, address):
        with self.lock:
            now = time.monotonic()
            if now >= self.window_end:
                self.window_end = now + 300
                self.per_ip.clear()
                self.total = 0
            count = self.per_ip.get(address, 0)
            if count >= 40 or self.total >= 600:
                raise domain.DomainError(429, "账号操作过于频繁，请稍后再试。")
            self.per_ip[address] = count + 1
            self.total += 1


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

    def body(self, max_size=8 * 1024 * 1024):
        if self.headers.get_content_type() != "application/json":
            raise domain.DomainError(415, "请使用 JSON 格式提交")
        size = self.headers.get("Content-Length", "")
        if not size.isascii() or not size.isdecimal() or len(size) > 10:
            raise domain.DomainError(400, "请求长度无效")
        size = int(size)
        if size > max_size:
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
        secure = "; Secure" if self.server.public_origin else ""
        self.response_cookies.append(
            f"{name}={value}; HttpOnly; SameSite=Strict; Path=/; Max-Age={lifetime}{secure}")

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

    def expected_owner(self):
        header = self.headers.get_all("X-KH-Owner", [])
        if not header:
            return None
        if len(header) != 1 or not re.fullmatch(r"[1-9][0-9]{0,17}", header[0]):
            raise domain.DomainError(409, "账号状态已变更，请刷新工作台后重试。")
        return int(header[0])

    def account(self, db, path, data):
        if not self.server.public_origin:
            if self.command == "GET" and path == "/api/account":
                return {"local": True, "user": None}
            raise domain.DomainError(404, "未找到该页面")

        token = self.read_cookie(self.server.account_cookie)
        if path == "/api/account" and self.command == "GET":
            result = {"user": accounts.current(db, token)}
            management = os.environ.get("COMMENT_MANAGEMENT_ORIGIN")
            if management:
                result["manageOrigin"] = public_origin(management)
            return result
        if self.command != "POST":
            raise domain.DomainError(405, "请求方式有误")
        expected = self.expected_owner()
        user = accounts.checked_owner(db, token, expected)
        if path == "/api/account/logout":
            accounts.logout(db, token, expected_owner=expected)
            self.set_cookie(self.server.account_cookie, "", 0)
            return {"user": None}
        if path not in ("/api/account/login", "/api/account/register", "/api/account/guest"):
            raise domain.DomainError(404, "未找到该页面")
        if path == "/api/account/guest" and user:
            return {"user": user}

        # Caddy is the only public ingress. Its rightmost forwarded IP is the peer it saw.
        peer = self.client_address[0]
        if ipaddress.ip_address(peer).is_loopback:
            forwarded = self.headers.get("X-Forwarded-For", "").rsplit(",", 1)[-1].strip()
            try:
                peer = str(ipaddress.ip_address(forwarded))
            except ValueError:
                pass
        self.server.account_rate.check(peer)
        if path == "/api/account/guest":
            user, token = accounts.guest(db, token, expected_owner=expected)
        elif path == "/api/account/register":
            user, token = accounts.register(db, data.get("username"), data.get("password"),
                                            token, expected_owner=expected)
        else:
            user, token = accounts.login(db, data.get("username"), data.get("password"),
                                         token, expected_owner=expected)
        self.set_cookie(self.server.account_cookie, token, accounts.SESSION_TTL)
        return {"user": user}

    def admin_api(self, db, path, query, data):
        if not self.server.public_origin:
            raise domain.DomainError(404, "未找到该页面")
        token = self.read_cookie(self.server.account_cookie)
        user = accounts.current(db, token)
        if user is None:
            raise domain.DomainError(401, "请先登录管理员账号。")
        if user["role"] != "admin":
            raise domain.DomainError(403, "仅管理员可访问。")
        expected = self.expected_owner()
        owner = None
        if path == "/api/admin/tasks" and query:
            try:
                filters = parse_qs(query, keep_blank_values=True, max_num_fields=16)
            except ValueError:
                raise domain.DomainError(400, "任务筛选参数无效") from None
            if "owner_id" in filters:
                values = filters["owner_id"]
                if len(values) != 1 or not re.fullmatch(r"[1-9][0-9]{0,17}", values[0]):
                    raise domain.DomainError(400, "请选择有效的所属账号")
                owner = int(values[0])
        return domain.admin_handle(db, self.command, path, data, token, owner_id=owner, expected_owner=expected)

    def api(self, path, query):
        account_path = path == "/api/account" or path.startswith("/api/account/")
        admin_path = path == "/api/admin" or path.startswith("/api/admin/")
        admin_comments = re.fullmatch(r"/api/admin/tasks/[1-9][0-9]{0,17}/comments", path)
        small_body = account_path or (admin_path and not admin_comments)
        data = self.body(4096 if small_body else 8 * 1024 * 1024) if self.command == "POST" else {}
        if path == "/api/manage-session" and self.command == "POST":
            if self.server.public_origin:
                raise domain.DomainError(404, "未找到该页面")
            key = data.get("key")
            if not isinstance(key, str) or not hmac.compare_digest(key.encode(), self.server.key.encode()):
                raise domain.DomainError(403, "发布者入口无效，请使用终端中的完整地址")
            end = str(int(time.time()) + WEEK)
            self.set_cookie(self.server.admin_cookie, end + "." + admin_signature(self.server.key, end), WEEK)
            return self.reply(200, {"ok": True})
        public_task = path.startswith("/api/public/")
        visitor = self.visitor() if public_task else None
        with closing(connect(self.server.db_path, self.server.db_limit_bytes)) as db:
            if account_path:
                result = self.account(db, path, data)
            elif admin_path:
                result = self.admin_api(db, path, query, data)
            elif self.server.public_origin and (path == "/api/tasks" or path.startswith("/api/tasks/")):
                token = self.read_cookie(self.server.account_cookie)
                result = domain.handle(db, self.command, path, data,
                                       account_token=token, expected_owner=self.expected_owner())
            else:
                local_admin = not self.server.public_origin and self.admin()
                result = domain.handle(db, self.command, path, data, admin=local_admin, visitor=visitor)
        if public_task:
            visit = result.get("visit") or result
            if visit.get("video_platform"):
                images = guide_images(visit["video_platform"], self.server.guide_dir)
                if images:
                    result["guide_images"] = images
        self.reply(200, result)

    def dispatch(self):
        self.response_cookies = []
        try:
            hosts = self.headers.get_all("Host", [])
            if len(hosts) != 1 or hosts[0].lower() not in self.server.allowed_hosts:
                raise domain.DomainError(403, "请通过本站地址访问")
            if self.command == "POST":
                origin = self.server.public_origin or "http://" + hosts[0].lower()
                origins = self.headers.get_all("Origin", [] if self.server.public_origin else [origin])
                if (origins != [origin]
                        or "cross-site" in self.headers.get_all("Sec-Fetch-Site", [])):
                    raise domain.DomainError(403, "请从本站页面提交")
            address = urlsplit(self.path)
            path = address.path
            if path.startswith("/api/"):
                return self.api(path, address.query)
            if self.command == "GET" and path.startswith(GUIDE_PREFIX):
                name = path[len(GUIDE_PREFIX):]
                if name not in GUIDE_NAMES:
                    raise domain.DomainError(404, "教学图不存在")
                asset = self.server.guide_dir / name
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
            if (getattr(exc, "sqlite_errorname", "") == "SQLITE_FULL"
                    or str(exc) == "database or disk is full"):
                self.reply(507, {"error": "存储空间不足，本次修改未保存，请联系管理员。"})
            elif "locked" in str(exc):
                self.reply(503, {"error": "数据正被使用，请稍后重试"})
            else:
                raise

    do_GET = dispatch
    do_POST = dispatch


def main():
    parser = argparse.ArgumentParser(description="快火评论分发 · 免登录版")
    parser.add_argument("--port", type=int, default=8780, help="本机端口")
    parser.add_argument("--data-dir", type=Path, default=ROOT / ".local", help="本机数据目录")
    parser.add_argument("--public-origin", type=public_origin,
                        help="通过反向代理提供服务的 HTTPS 站点根地址")
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
        server.db_path = Path(os.environ.get("COMMENT_SHARED_DB") or args.data_dir / "comments.sqlite3")
        server.guide_dir = args.data_dir / "task-guides"
        server.db_limit_bytes = PUBLIC_DB_LIMIT_BYTES if args.public_origin else None
        server.key = initialize(server.db_path, server.db_limit_bytes, public_accounts=bool(args.public_origin))
        port = server.server_port
        server.public_origin = args.public_origin
        if args.public_origin:
            site = urlsplit(args.public_origin)
            server.allowed_hosts = {site.netloc}
            if site.port is None:
                server.allowed_hosts.add(site.netloc + ":443")
            server.account_cookie = "__Host-kh_account"
            server.account_rate = AccountRateLimit()
            server.visitor_cookie = "__Host-kh_reader"
            print("站点首页  " + args.public_origin, flush=True)
        else:
            server.allowed_hosts = {f"localhost:{port}", f"127.0.0.1:{port}"}
            server.admin_cookie = f"kh_publisher_{port}"
            server.visitor_cookie = f"kh_reader_{port}"
            base = f"http://127.0.0.1:{port}"
            print("本机首页  " + base, flush=True)
            print("发布者专用  " + base + "/manage#key=" + server.key, flush=True)
        print("发布后复制任务链接给领取者。按 Ctrl+C 停止。", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止。", file=sys.stderr)
