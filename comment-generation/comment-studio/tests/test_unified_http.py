"""Exercise both HTTP sites against one disposable database, with offline media/model fixtures."""
import concurrent.futures
import hashlib
import importlib.util
import json
import os
import socket
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from contextlib import ExitStack, closing
from http.client import HTTPResponse
from http.cookies import SimpleCookie
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import quote

STUDIO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(STUDIO))
import generator
import media
import server
import settings
from workflow import Studio

DISPATCH = Path(os.environ.get("COMMENT_DISPATCH_ROOT") or STUDIO.parent / "dispatch")

ACCOUNT = "/studio-dispatch/api/account"
TASKS = "/studio-dispatch/api/tasks"
SHARE = "复制后打开抖音，看这条工厂视频\nhttps://v.douyin.com/TestPart/ 复制口令 ￥123"
TITLE = "急单先打样再开模"
SCRIPT = "首批先做二十个外壳，再确认是否开模。"


class Browser:
    """Send requests to a real handler over a socket pair; cookies belong to one origin."""
    def __init__(self, handler, app, host):
        self.handler = handler
        self.app = app
        self.host = host
        self.cookies = {}

    def request(self, method, path, body=None, headers=None, expected=200):
        values = {"Host": self.host, "Connection": "close", "Origin": "https://" + self.host}
        if self.cookies:
            values["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        raw = b""
        if body is not None:
            raw = json.dumps(body, ensure_ascii=False).encode()
            values.update({"Content-Type": "application/json", "Content-Length": str(len(raw))})
        values.update(headers or {})
        start = f"{method} {path} HTTP/1.1\r\n" + "".join(f"{k}: {v}\r\n" for k, v in values.items())
        with ExitStack() as scope:
            client, peer = socket.socketpair()
            scope.enter_context(client)
            scope.enter_context(peer)
            client.settimeout(5)
            worker = threading.Thread(target=self.handler, args=(peer, ("127.0.0.1", 12345), self.app))
            worker.start()
            client.sendall(start.encode("ascii") + b"\r\n" + raw)
            client.shutdown(socket.SHUT_WR)
            response = HTTPResponse(client, method=method)
            response.begin()
            with response:
                data = response.read()
                parsed = json.loads(data) if "application/json" in response.headers.get("Content-Type", "") else data
                for line in response.headers.get_all("Set-Cookie", []):
                    for key, item in SimpleCookie(line).items():
                        if item.value:
                            self.cookies[key] = item.value
                        else:
                            self.cookies.pop(key, None)
                permitted = (expected,) if isinstance(expected, int) else expected
                if response.status not in permitted:
                    raise AssertionError(f"{method} {path} expected {permitted}, got {response.status}: {str(parsed)[:350]}")
            worker.join(timeout=5)
            if worker.is_alive():
                raise AssertionError("handler did not finish")
            return parsed


class UnifiedHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(DISPATCH))
        cls.addClassCleanup(sys.path.remove, str(DISPATCH))
        spec = importlib.util.spec_from_file_location("acceptance_dispatch_server", DISPATCH / "server.py")
        cls.dispatch = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.dispatch)

    def setUp(self):
        temp = self.enter_scope(tempfile.TemporaryDirectory())
        self.root = Path(temp).resolve()
        self.database = self.root / "comments.sqlite3"
        legacy = self.root / "studio.sqlite3"
        with closing(sqlite3.connect(legacy)) as db, db:
            db.executescript("""
                CREATE TABLE sessions(token TEXT PRIMARY KEY,owner TEXT NOT NULL);
                CREATE TABLE accounts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,data TEXT NOT NULL);
                CREATE TABLE tasks(id TEXT PRIMARY KEY,owner TEXT NOT NULL,data TEXT NOT NULL);
                CREATE TABLE requests(owner TEXT,key TEXT,action TEXT,task TEXT,PRIMARY KEY(owner,key));
                CREATE TABLE assets(id TEXT PRIMARY KEY,data TEXT NOT NULL);
                CREATE TABLE aliases(id TEXT PRIMARY KEY,asset TEXT NOT NULL);
                CREATE TABLE usage(id INTEGER PRIMARY KEY,owner TEXT,task TEXT,stage TEXT,provider TEXT,
                    at REAL,units REAL,amount REAL,status TEXT,detail TEXT);
            """)
            self.legacy_token = "a" * 43
            old_owner = "d" * 32
            db.execute("INSERT INTO sessions VALUES (?,?)", (hashlib.sha256(self.legacy_token.encode()).hexdigest(), old_owner))
            db.execute("INSERT INTO accounts VALUES ('old-profile',?,?)",
                       (old_owner, json.dumps({"id": "old-profile", "name": "旧视频账号"})))

        self.dispatch.initialize(self.database, public_accounts=True)
        with closing(self.dispatch.connect(self.database)) as db:
            self.dispatch.accounts.set_admin_password(db, "offline-admin-password")
            user, _ = self.dispatch.accounts.register(db, "oldpublisher", "offline-publisher-password")
            self.old_user_id = user["id"]
            result = self.dispatch.domain.handle(db, "POST", "/api/tasks", {
                "title": "迁移前已发布", "target_url": SHARE, "target_platform": "douyin",
                "comments": ["迁移前已领取的评论", "另一条评论"]}, owner_id=user["id"])
            self.old_task_id = result["task"]["id"]
            self.dispatch.domain.handle(db, "POST", f"/api/tasks/{self.old_task_id}/publish", {}, owner_id=user["id"])

        public = SimpleNamespace(public_origin="https://task.example", allowed_hosts={"task.example"},
                                 db_path=self.database, db_limit_bytes=None, guide_dir=self.root / "task-guides", account_cookie="__Host-kh_account",
                                 visitor_cookie="__Host-kh_reader", account_rate=self.dispatch.AccountRateLimit())
        self.reader = Browser(self.dispatch.Handler, public, "task.example")
        old_path = f"/api/public/{self.old_task_id}"
        self.reader.request("GET", old_path)
        self.reader.request("POST", old_path + "/video", {"name": "既有领取人"})
        self.reader.request("POST", old_path + "/claim", {})

        env = {k: v for k, v in os.environ.items() if not k.startswith(("COMMENT_", "OSS_", "QWEN_", "ARK_", "DEEPSEEK_"))}
        env.update(COMMENT_SHARED_DB=str(self.database), COMMENT_DISPATCH_ROOT=str(DISPATCH),
                   COMMENT_PUBLIC_ORIGIN="https://studio.example", COMMENT_DEFAULT_PROVIDER="qwen",
                   QWEN_API_KEY="offline-fixture")
        self.enter_scope(patch.dict(os.environ, env, clear=True))
        self.enter_scope(patch.object(media, "status", return_value={"asrReady":True, "parserReady":True}))
        self.enter_scope(patch.object(media, "transcribe", return_value=SCRIPT))
        self.enter_scope(patch.object(media, "inspect_media", return_value=2))
        self.enter_scope(patch.object(media, "fetch_video", side_effect=self.download))
        self.mock_model = self.enter_scope(patch.object(generator, "generate", side_effect=self.model))
        self.studio = Studio(self.root)
        self.addCleanup(self.studio.close)
        with patch.object(server.ThreadingHTTPServer, "server_bind"), patch.object(server.ThreadingHTTPServer, "server_activate"):
            self.app = server.Server(("127.0.0.1", 8766), self.studio, data_dir=self.root)
        self.app.server_port = 8766
        self.addCleanup(self.app.server_close)
        self.user = self.browser()
        self.user.request("POST", ACCOUNT + "/login", {"username":"oldpublisher", "password":"offline-publisher-password"})

    def enter_scope(self, context):
        stack = ExitStack()
        self.addCleanup(stack.close)
        return stack.enter_context(context)

    def browser(self):
        return Browser(server.Handler, self.app, "studio.example")

    @staticmethod
    def download(source, target):
        Path(target).write_bytes(b"offline fixture")
        return {"title": TITLE, "platform":"抖音", "workId":"654321", "author":"测试工厂", "authorId":"fixture"}

    @staticmethod
    def model(script, options, account, provider, record_usage=None):
        return [{"platform":p, "type":"追问", "text":f"{p}打样问题{i}", "reply":"作者的答复",
                 "advice":"发布建议"} for p, count in options["platforms"].items() for i in range(count)]

    def generate(self, manual=False):
        body = {"mode":"manual" if manual else "link", "options":{"platforms":{"抖音":3,"小红书":1}, "provider":"qwen"}}
        body.update({"script":SCRIPT} if manual else {"source":SHARE})
        result = self.user.request("POST", "/api/tasks", body, expected=202)
        path = "/api/tasks/" + result["id"]
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            task = self.user.request("GET", path)
            if task["status"] == "ready":
                return path, path + "/batches/" + task["batches"][0]["id"] + "/platforms/"
            if task["status"] in ("failed", "needs_input"):
                self.fail(str(task.get("error")))
            time.sleep(0.02)
        self.fail("generation did not finish")

    def test_login_legacy_claim_admin_and_revocation(self):
        anonymous = self.browser()
        self.assertTrue(anonymous.request("GET", "/api/status")["unifiedAccounts"])
        self.assertIn(b"<html", anonymous.request("GET", "/manage").lower())
        anonymous.request("GET", "/api/tasks", expected=401)
        self.assertEqual(self.user.request("GET", ACCOUNT)["user"]["id"], self.old_user_id)
        self.assertFalse(self.user.request("GET", "/api/accounts")["accounts"])
        self.user.cookies["comment_studio_session"] = self.legacy_token
        self.assertEqual(self.user.request("GET", "/api/legacy")["accounts"], 1)
        guest = self.browser()
        guest.request("POST", ACCOUNT + "/guest", {})
        guest.cookies["comment_studio_session"] = self.legacy_token
        guest.request("POST", "/api/legacy", {}, expected=(400,403))
        self.assertEqual(guest.request("GET", "/api/accounts")["accounts"], [])
        self.assertEqual(self.user.request("GET", "/api/accounts")["accounts"], [])
        self.user.request("POST", "/api/legacy", {})
        profile = self.user.request("GET", "/api/accounts")["accounts"][0]
        self.assertEqual(profile["name"], "旧视频账号")
        other = self.browser()
        other.request("POST", ACCOUNT + "/register", {"username":"newpublisher", "password":"offline-second-123"})
        other.cookies["comment_studio_session"] = self.legacy_token
        other.request("POST", "/api/legacy", {}, expected=(200,403,404,409))
        self.assertEqual(other.request("GET", "/api/accounts")["accounts"], [])
        self.user.request("GET", "/api/admin/settings", expected=(403,404))
        self.user.request("GET", "/studio-dispatch/api/admin/accounts", expected=403)
        self.user.request("POST", ACCOUNT + "/logout", {}, headers={"Origin":"https://untrusted.example"}, expected=403)

        stale_tab = self.browser()
        stale_tab.cookies.update(self.user.cookies)
        self.user.request("POST", ACCOUNT + "/logout", {})
        for path in ("/api/tasks", "/api/accounts", TASKS):
            stale_tab.request("GET", path, expected=401)
        self.user.request("POST", ACCOUNT + "/login", {"username":"oldpublisher","password":"offline-publisher-password"})
        self.assertEqual(len(self.user.request("GET", "/api/accounts")["accounts"]), 1)
        admin = self.browser()
        admin.request("POST", ACCOUNT + "/login", {"username":"admin", "password":"offline-admin-password"})
        with patch.object(settings, "view", return_value={"groups":[]}):
            self.assertIn("groups", admin.request("GET", "/api/admin/settings"))
        self.assertIn("accounts", admin.request("GET", "/studio-dispatch/api/admin/accounts"))
        admin.request("POST", f"/studio-dispatch/api/admin/accounts/{self.old_user_id}/disable", {})
        self.user.request("GET", "/api/tasks", expected=401)
        self.user.request("GET", TASKS, expected=401)
        visit = self.reader.request("GET", f"/api/public/{self.old_task_id}")
        self.assertEqual(visit["claim"]["comment"], "迁移前已领取的评论")

    def test_edit_create_publish_claim_on_original_domain(self):
        task, batches = self.generate()
        group = batches + quote("抖音")
        original = self.user.request("GET", group)
        rows = original["rows"]
        edited = [{"id":rows[0]["id"],"text":"急单也先打样吗？"}, {"id":rows[1]["id"],"text":rows[1]["text"]}, {"text":"手工追加"}]
        saved = self.user.request("PUT", group, {"version":original["version"], "rows":edited})
        self.assertEqual(saved["rows"][0]["id"], rows[0]["id"])
        self.assertEqual(saved["rows"][1]["reply"], "作者的答复")
        self.user.request("PUT", group, {"version":original["version"], "rows":edited}, expected=409)
        self.assertEqual(self.studio.database, self.database)
        saved = self.user.request("PUT", group, {"version":saved["version"], "rows":[
            {"id":row["id"], "text":row["text"]} for row in saved["rows"][:2]]})
        edited = edited[:2]
        summary = self.user.request("GET", "/api/tasks")["tasks"][0]
        self.assertEqual(summary["commentCount"], 3, "2 edited Douyin + 1 Xiaohongshu")
        def create(_):
            return self.user.request("POST", group + "/heatstart", {"version":saved["version"]}, expected=(200,201))["heatstart"]["id"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as workers:
            ids = list(workers.map(create, range(2)))
        self.assertEqual(ids[0], ids[1])
        self.assertEqual(self.mock_model.call_count, 1)
        route = TASKS + "/" + str(ids[0])
        details = self.user.request("GET", route)["task"]
        self.assertEqual((details["title"],details["target_url"],details["target_platform"]), (TITLE, SHARE, "douyin"))
        self.assertEqual(details["comments"], [r["text"] for r in edited])
        self.assertEqual(details["status"], "draft")
        self.assertEqual(details["owner_id"], self.old_user_id)
        summary = self.user.request("GET", "/api/tasks")["tasks"][0]
        self.assertEqual([item["id"] for item in summary["heatstarts"]], [ids[0]])
        public = "/api/public/" + str(ids[0])
        self.reader.request("GET", public, expected=404)
        other = self.browser()
        other.request("POST", ACCOUNT + "/register", {"username":"separate", "password":"offline-other-123"})
        for url in (task, group, route):
            other.request("GET", url, expected=(403,404))
        other.request("POST", group + "/heatstart", {"version":saved["version"]}, expected=(403,404))
        self.user.request("POST", route + "/publish", {})
        self.reader.request("GET", public)
        opened = self.reader.request("POST", public + "/video", {"name":"领取人"})
        self.assertEqual(opened["video_url"], SHARE)
        claim = self.reader.request("POST", public + "/claim", {})["comment"]
        self.assertIn(claim, details["comments"])
        self.assertEqual(self.user.request("GET", group)["heatstart"]["claimed"], 1)
        live = self.user.request("GET", route)["task"]
        self.user.request("POST", route + "/comments", {"version":live["comments_version"], "comments":["删除已领取内容"]}, expected=409)
        self.assertEqual(self.reader.request("GET", public)["claim"]["comment"], claim)
        self.assertEqual(self.reader.request("GET", f"/api/public/{self.old_task_id}")["claim"]["comment"], "迁移前已领取的评论")

    def test_cross_platform_manual_and_independent_import(self):
        _, batches = self.generate()
        admin = self.browser()
        admin.request("POST", ACCOUNT + "/login", {"username":"admin", "password":"offline-admin-password"})
        group = batches + quote("抖音")
        admin_batch = admin.request("GET", group)
        assigned = admin.request("POST", group + "/heatstart", {"version":admin_batch["version"]}, expected=(200,201))["heatstart"]
        as_owner = self.user.request("GET", TASKS + f"/{assigned['id']}")["task"]
        self.assertEqual(as_owner["owner_id"], self.old_user_id)
        for route in (batches + quote("小红书"), self.generate(manual=True)[1] + quote("抖音")):
            batch = self.user.request("GET", route)
            heat = self.user.request("POST", route + "/heatstart", {"version":batch["version"]}, expected=(200,201))["heatstart"]
            detail_route = TASKS + "/" + str(heat["id"])
            details = self.user.request("GET", detail_route)["task"]
            self.assertEqual(details["target_url"], "")
            self.user.request("POST", detail_route + "/publish", {}, expected=409)
        source = "快手原分享 https://v.kuaishou.com/Example/"
        created = self.user.request("POST", TASKS, {"title":"手动导入任务", "target_platform":"kuaishou",
            "target_url":source, "comments":["独立导入第一条","独立导入第二条"]})["task"]
        self.assertEqual(created["target_platform"],"kuaishou")
        published = self.user.request("POST", TASKS + f"/{created['id']}/publish", {})["task"]
        self.assertEqual((published["status"], published["target_url"], published["total"]), ("open", source, 2))


if __name__ == "__main__":
    unittest.main()
