"""Same-origin HTTP server for the comment studio. Python 3.9+."""
import json
import ipaddress
import hmac
import os
import re
import socket
import sqlite3
import sys
import tempfile
import threading
import time
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit

import media
import settings


ROOT = Path(__file__).resolve().parent
COOKIE = "comment_studio_session"
MAX_JSON = 512 * 1024
CHUNK = 128 * 1024
ITEM = r"[A-Za-z0-9_-]{1,128}"
STATIC_TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
    ".ico": "image/x-icon", ".png": "image/png", ".webp": "image/webp",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2",
}
MEDIA_TYPES = {
    "video/mp4": ".mp4", "video/quicktime": ".mov", "video/mpeg": ".mpeg",
    "video/webm": ".webm", "video/x-matroska": ".mkv", "video/x-msvideo": ".avi",
    "video/x-flv": ".flv", "application/octet-stream": ".bin",
}


class RequestError(Exception):
    def __init__(self, status, message, headers=None):
        super().__init__(message)
        self.status = status
        self.headers = headers or {}


def authority(value, scheme):
    """Return a normalized host and port without accepting userinfo or paths."""
    if not value or any(c in value for c in "/\\#?@,\t\r\n "):
        return None
    try:
        parts = urlsplit("//" + value)
        if parts.hostname is None:
            return None
        return parts.hostname.rstrip(".").lower(), parts.port or (443 if scheme == "https" else 80)
    except ValueError:
        return None


def parse_range(header, size):
    if header is None:
        return 0, size
    match = re.fullmatch(r"bytes=(\d{0,20})-(\d{0,20})", header.strip())
    if match and size > 0:
        start, end = match.groups()
        if start:
            first = int(start)
            last = min(size, int(end) + 1) if end else size
            if first < last:
                return first, last
        elif end and int(end) > 0:
            return max(0, size - int(end)), size
    raise RequestError(416, "请求的视频区间无效。", {"Content-Range": "bytes */%d" % size})


def oss_media_origin():
    endpoint = urlsplit(os.environ.get("OSS_ENDPOINT", "").strip())
    bucket = os.environ.get("OSS_BUCKET", "").strip()
    if (endpoint.scheme != "https" or not endpoint.hostname or endpoint.username is not None
            or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket)
            or not re.fullmatch(r"[a-zA-Z0-9.-]+", endpoint.hostname)):
        return ""
    return "https://%s.%s" % (bucket, endpoint.hostname.lower())


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, studio, web_root=ROOT / "web", data_dir=None):
        self.studio = studio
        self.web_root = Path(web_root).resolve()
        self.data_dir = Path(data_dir or tempfile.gettempdir())
        self.upload_slots = threading.BoundedSemaphore(3)
        self.max_upload = min(int(os.environ.get("COMMENT_MAX_UPLOAD_MB", os.environ.get("COMMENT_MAX_MEDIA_MB", "100"))) * 1024 * 1024, media.max_bytes())
        configured = os.environ.get("COMMENT_PUBLIC_ORIGIN", "").strip().rstrip("/")
        self.public_origin = None
        if configured:
            parsed = urlsplit(configured)
            if parsed.scheme not in ("http", "https") or parsed.path or parsed.query or parsed.fragment or not authority(parsed.netloc, parsed.scheme):
                raise ValueError("COMMENT_PUBLIC_ORIGIN 必须为网站的 HTTP(S) 来源地址。")
            self.public_origin = parsed
        self.unified = None
        if os.environ.get("COMMENT_SHARED_DB"):
            from unified import Unified
            self.unified = Unified(studio, self.public_origin.geturl() if self.public_origin else "")
        self.local_only = address[0] in ("localhost", "127.0.0.1", "::1")
        if address[0] == "::1":
            self.address_family = socket.AF_INET6
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    server_version = "CommentStudio"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(35)

    def log_request(self, code="-", size="-"):
        # Request URLs and provider data are deliberately excluded from access logs.
        pass

    def log_message(self, format, *args):
        pass

    def send_common(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store")
        for value in self.extra_cookies:
            self.send_header("Set-Cookie", value)
        if self.new_cookie:
            value = "%s=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000" % (COOKIE, self.new_cookie)
            if self.server.public_origin and self.server.public_origin.scheme == "https":
                value += "; Secure"
            self.send_header("Set-Cookie", value)

    def send_json(self, result, status=200, headers=None):
        body = json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_common()
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def error_json(self, status, message, headers=None):
        # An unread/partial request body must not be interpreted as another request.
        self.close_connection = True
        extra = {"Connection": "close", **(headers or {})}
        self.send_json({"error": message}, status, extra)

    def guard(self):
        host = self.headers.get("Host")
        if len(self.headers.get_all("Host", [])) != 1:
            raise RequestError(400, "主机标识无效。")
        public = self.server.public_origin
        expected_scheme = public.scheme if public else "http"
        target = authority(host, expected_scheme)
        if not target:
            raise RequestError(400, "主机标识无效。")
        public_target = authority(public.netloc, public.scheme) if public else None
        if self.server.local_only and target[0] not in ("127.0.0.1", "localhost", "::1") and target != public_target:
            raise RequestError(403, "网站来源不匹配。")
        if self.command in ("GET", "HEAD"):
            return
        if self.headers.get("Sec-Fetch-Site", "").lower() == "cross-site":
            raise RequestError(403, "请从当前工作台提交。")
        for name in ("Origin", "Referer"):
            value = self.headers.get(name)
            if not value:
                continue
            parts = urlsplit(value)
            if parts.scheme != expected_scheme or authority(parts.netloc, parts.scheme) != (public_target or target):
                raise RequestError(403, "请从当前工作台提交。")
            if name == "Origin" and (parts.path not in ("", "/") or parts.query or parts.fragment):
                raise RequestError(403, "请求来源无效。")

    def legacy_token(self):
        raw = self.headers.get("Cookie", "")
        if len(raw) <= 8192:
            jar = SimpleCookie()
            try:
                jar.load(raw)
                if COOKIE in jar and len(jar[COOKIE].value) <= 256:
                    return jar[COOKIE].value
            except CookieError:
                pass
        return ""

    def owner(self, task_id=None):
        if getattr(self.server, "unified", None):
            unified = getattr(self.server, "unified", None)
            return unified.owner(unified.actor(self), task_id)
        owner_id, new_token = self.server.studio.owner(self.legacy_token())
        self.new_cookie = new_token
        return owner_id

    def local_admin(self):
        if getattr(self.server, "unified", None):
            actor = getattr(self.server, "unified", None).actor(self, required=False)
            return bool(actor and actor["role"] == "admin")
        if not self.server.local_only:
            return False
        if self.server.public_origin:
            expected = os.environ.get("COMMENT_PROXY_ADMIN", "")
            supplied = self.headers.get("X-Plsc-Admin", "")
            return bool(self.server.public_origin.scheme == "https" and len(expected) >= 32
                        and self.client_address[0] in ("127.0.0.1", "::1")
                        and supplied.isascii() and hmac.compare_digest(expected, supplied))
        target = authority(self.headers.get("Host"), "http")
        if not target or target[0] not in ("localhost", "127.0.0.1", "::1") or target[1] != self.server.server_port:
            return False
        try:
            if not ipaddress.ip_address(self.client_address[0]).is_loopback:
                return False
        except (ValueError, TypeError, IndexError):
            return False
        proxy_headers = {"forwarded", "via", "x-real-ip", "x-original-host", "cf-connecting-ip"}
        if any(k.lower() in proxy_headers or k.lower().startswith("x-forwarded-") for k in self.headers):
            return False
        if self.headers.get("Sec-Fetch-Site", "").lower() == "cross-site":
            return False
        for header in ("Origin", "Referer"):
            if self.headers.get(header):
                url = urlsplit(self.headers[header])
                if url.scheme != "http" or authority(url.netloc, url.scheme) != target:
                    return False
        return True

    def admin_settings(self, editing=False):
        unified = getattr(self.server, "unified", None)
        if unified:
            if unified.actor(self)["role"] != "admin":
                raise RequestError(403, "仅管理员可以管理模型配置。")
        elif not self.local_admin():
            raise RequestError(404, "接口不存在。")
        return self.send_json(settings.update(self.json_body()) if editing else settings.view())

    def body_length(self, limit):
        lengths = self.headers.get_all("Content-Length", [])
        if self.headers.get("Transfer-Encoding") or len(lengths) != 1 or not re.fullmatch(r"\d{1,16}", lengths[0].strip()):
            raise RequestError(411, "请发送包含长度的完整请求。")
        size = int(lengths[0].strip())
        if size > limit:
            raise RequestError(413, "提交内容超过大小上限。")
        return size

    def json_body(self, limit=MAX_JSON):
        if self.headers.get_content_type().lower() != "application/json":
            raise RequestError(415, "请提交 JSON 格式的内容。")
        size = self.body_length(limit)
        raw = self.rfile.read(size)
        if len(raw) != size:
            raise RequestError(400, "请求未传输完整。")
        try:
            data = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeError, RecursionError):
            raise RequestError(400, "JSON 内容格式错误。")
        if not isinstance(data, dict):
            raise RequestError(400, "请求内容必须是对象。")
        return data

    def upload(self, owner, task_id):
        self.server.studio.task(owner, task_id)
        size = self.body_length(self.server.max_upload)
        media_type = self.headers.get_content_type().lower()
        if media_type not in MEDIA_TYPES:
            raise RequestError(415, "请选择 MP4、MOV 或 WebM 视频。")
        if not size:
            raise RequestError(400, "文件为空。")
        if not self.server.upload_slots.acquire(blocking=False):
            raise RequestError(429, "同时上传的文件较多，请稍后重试。")
        try:
            directory = self.server.data_dir / "incoming"
            directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=directory, suffix=MEDIA_TYPES[media_type]) as target:
                deadline = time.monotonic() + 600
                left = size
                while left:
                    if time.monotonic() > deadline:
                        raise RequestError(408, "上传超时，请重新选择文件。")
                    piece = self.rfile.read(min(left, CHUNK))
                    if not piece:
                        raise RequestError(400, "文件未传输完整。")
                    target.write(piece)
                    left -= len(piece)
                target.flush()
                return self.server.studio.upload(owner, task_id, Path(target.name))
        finally:
            self.server.upload_slots.release()

    def send_file(self, path, content_type, media=False, title=None, download=False):
        try:
            fh = path.open("rb")
        except FileNotFoundError:
            raise RequestError(404, "文件不存在或已到期。")
        with fh:
            size = os.fstat(fh.fileno()).st_size
            range_request = self.headers.get("Range") if media else None
            start, end = parse_range(range_request, size)
            self.send_response(206 if range_request else 200)
            self.send_common()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(end - start))
            if media:
                self.send_header("Accept-Ranges", "bytes")
                if range_request:
                    self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end - 1, size))
                if download:
                    suffix = MEDIA_TYPES.get(content_type, ".mp4")
                    name = str(title or "视频").replace("/", "_").replace("\\", "_")[:100]
                    if not name.lower().endswith(suffix):
                        name += suffix
                    self.send_header("Content-Disposition", "attachment; filename=video%s; filename*=UTF-8''%s" % (suffix, quote(name, safe="")))
            if content_type.startswith("text/html"):
                origin = oss_media_origin()
                allowed = "'self' blob:" + (" " + origin if origin else "")
                self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src %s; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'" % allowed)
            self.end_headers()
            if self.command == "HEAD":
                return
            fh.seek(start)
            left = end - start
            while left:
                data = fh.read(min(CHUNK, left))
                if not data:
                    self.close_connection = True
                    break
                self.wfile.write(data)
                left -= len(data)

    def static(self, path):
        if path in ("/", "/index.html", "/manage", "/manage/"):
            if not getattr(self.server, "unified", None):
                self.owner()
            path = "/index.html"
        if not re.fullmatch(r"/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.[A-Za-z0-9]+", path):
            raise RequestError(404, "页面不存在。")
        target = (self.server.web_root / path.lstrip("/")).resolve()
        kind = STATIC_TYPES.get(target.suffix.lower())
        if self.server.web_root not in target.parents or not kind or not target.is_file():
            raise RequestError(404, "页面不存在。")
        self.send_file(target, kind)

    def task_response(self, task, owner):
        unified = getattr(self.server, "unified", None)
        if unified:
            from heatbridge import decorate_task
            with unified.open() as db:
                decorate_task(db, task)
                if task.get("accountId"):
                    profile = db.execute("SELECT data FROM studio_accounts WHERE owner=? AND id=?",
                                         (owner, task["accountId"])).fetchone()
                    task["accountName"] = json.loads(profile[0]).get("name", "") if profile else ""
            task["ownerId"] = int(owner.split(":", 1)[1]) if owner.startswith("publisher:") else None
        return task

    def read_api(self, route, query):
        studio = self.server.studio
        unified = getattr(self.server, "unified", None)
        if route == "/api/status":
            return self.send_json(dict(studio.status(), localAdmin=self.local_admin(), unifiedAccounts=bool(unified)))
        if route == "/api/admin/settings":
            return self.admin_settings()
        actor = unified.actor(self) if unified else None
        if unified and route == "/api/legacy":
            return self.send_json(studio.legacy_summary(self.legacy_token(), actor["id"]))
        if unified and route == "/api/tasks":
            return self.send_json({"tasks": unified.history(actor)})
        task_path = re.match(r"/api/tasks/(%s)(?:/|$)" % ITEM, route)
        owner = self.owner(task_path[1] if task_path else None)
        if route == "/api/guides":
            return self.send_json({"guides": studio.guides()})
        if route == "/api/accounts":
            return self.send_json({"accounts": studio.accounts(owner)})
        if route == "/api/tasks":
            return self.send_json({"tasks": studio.tasks(owner)})
        if route == "/api/usage" and hasattr(studio, "usage"):
            return self.send_json(studio.usage(None if actor and actor["role"] == "admin" else owner))
        match = re.fullmatch(r"/api/tasks/(%s)(/media|/subtitles\.srt)?" % ITEM, route)
        if match:
            task_id, media_route = match.groups()
            if not media_route:
                return self.send_json(self.task_response(studio.task(owner, task_id), owner))
            if media_route == "/subtitles.srt":
                content = studio.subtitles(owner, task_id).encode("utf-8")
                self.send_response(200)
                self.send_common()
                self.send_header("Content-Type", "application/x-subrip; charset=utf-8")
                self.send_header("Content-Disposition", "attachment; filename=subtitles.srt; filename*=UTF-8''" + quote("口播字幕.srt"))
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(content)
                return
            download = query.get("download") == ["1"]
            redirect = getattr(studio, "media_redirect", None)
            remote_url = redirect(owner, task_id, download) if redirect else ""
            if remote_url:
                dest = urlsplit(remote_url)
                if (dest.scheme != "https" or not dest.netloc or dest.username is not None
                        or any(ord(c) < 33 for c in remote_url)):
                    raise RequestError(502, "暂时无法生成视频下载链接。")
                self.send_response(302)
                self.send_common()
                self.send_header("Location", remote_url)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            path, title = studio.media(owner, task_id)
            path = Path(path)
            try:
                kind = media.file_mime(path)
            except FileNotFoundError:
                raise RequestError(404, "视频不存在或已到期。")
            return self.send_file(path, kind, True, title, download)
        raise RequestError(404, "接口不存在。")

    def write_api(self, route):
        studio = self.server.studio
        unified = getattr(self.server, "unified", None)
        if unified and route == "/api/legacy" and self.command == "POST":
            actor = unified.actor(self)
            self.json_body()
            return self.send_json(studio.claim_legacy(self.legacy_token(), actor["id"]))
        task_path = re.match(r"/api/tasks/(%s)(?:/|$)" % ITEM, route)
        owner = self.owner(task_path[1] if task_path else None)
        if self.command == "PUT":
            if route == "/api/admin/settings":
                return self.admin_settings(editing=True)
            match = re.fullmatch(r"/api/accounts/(%s)" % ITEM, route)
            if not match:
                raise RequestError(404, "接口不存在。")
            return self.send_json(studio.save_account(owner, match.group(1), self.json_body()))
        if route == "/api/tasks":
            return self.send_json(self.task_response(studio.create(owner, self.json_body()), owner), 202)
        if route == "/api/accounts":
            return self.send_json(studio.save_account(owner, None, self.json_body()), 201)
        if route == "/api/prompt":
            return self.send_json({"prompt": studio.prompt(owner, self.json_body())})
        if unified and task_path and route == task_path[0] + "prompt":
            task = studio.task(owner, task_path[1])
            body = self.json_body()
            body.setdefault("accountId", task.get("accountId", ""))
            return self.send_json({"prompt": studio.prompt(owner, body)})
        match = re.fullmatch(r"/api/tasks/(%s)/(generate|retry|upload)" % ITEM, route)
        if match:
            task_id, operation = match.groups()
            if operation == "upload":
                result = self.upload(owner, task_id)
            elif operation == "generate":
                result = studio.generate(owner, task_id, self.json_body())
            else:
                result = studio.retry(owner, task_id, self.json_body())
            return self.send_json(self.task_response(result, owner), 202)
        raise RequestError(404, "接口不存在。")

    def dispatch(self):
        self.new_cookie = None
        self.extra_cookies = []
        unified = getattr(self.server, "unified", None)
        try:
            self.guard()
            if not self.path.startswith("/") or self.path.startswith("//"):
                raise RequestError(400, "请求路径无效。")
            address = urlsplit(self.path)
            path = unquote(address.path, errors="strict")
            if unified:
                from unified import PREFIX, GROUP
                if self.command not in ("GET", "HEAD") and self.server.public_origin and not self.headers.get("Origin"):
                    raise RequestError(403, "请从当前工作台提交。")
                if path == PREFIX or path.startswith(PREFIX + "/"):
                    return unified.membership(self, path[len(PREFIX):], address.query)
                group = GROUP.fullmatch(path)
                if group:
                    return unified.group(self, group)
                if path in ("/manage/setup.html", "/setup.html"):
                    self.send_response(302)
                    self.send_header("Location", "/manage?view=services")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
            if self.command in ("GET", "HEAD"):
                if path.startswith("/api/"):
                    self.read_api(path, parse_qs(address.query, max_num_fields=10))
                else:
                    self.static(path)
            else:
                self.write_api(path)
        except (ConnectionError, BrokenPipeError):
            self.close_connection = True
        except socket.timeout:
            self.error_json(408, "请求超时。")
        except RequestError as error:
            self.error_json(error.status, str(error), error.headers)
        except (KeyError, PermissionError):
            self.error_json(404, "任务、账号或文件不存在。")
        except ValueError as error:
            self.error_json(400, str(error))
        except sqlite3.OperationalError as error:
            if "locked" in str(error):
                return self.error_json(503, "数据正在更新，请稍后重试。")
            if "full" in str(error):
                return self.error_json(507, "存储空间不足，本次修改未保存。")
            print("数据库请求失败", file=sys.stderr)
            self.error_json(500, "数据库暂时不可用。")
        except Exception as error:
            if unified and isinstance(error, unified.error):
                return self.error_json(error.status, str(error))
            print("请求处理失败 [%s]" % type(error).__name__, file=sys.stderr)
            self.error_json(500, "服务暂时无法处理请求，请查看任务状态后重试。")

    do_GET = dispatch
    do_HEAD = dispatch
    do_POST = dispatch
    do_PUT = dispatch


def main():
    from workflow import Studio
    host = os.environ.get("COMMENT_HOST", "127.0.0.1")
    port = int(os.environ.get("COMMENT_PORT", "8766"))
    data_dir = Path(os.environ.get("COMMENT_DATA_DIR", str(ROOT / "data"))).expanduser().resolve()
    data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    settings.configure(data_dir)
    studio = Studio(data_dir)
    server = Server((host, port), studio, data_dir=data_dir)
    print("评论工作台已启动：http://%s:%s" % (host, server.server_port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if hasattr(studio, "close"):
            studio.close()


if __name__ == "__main__":
    main()
