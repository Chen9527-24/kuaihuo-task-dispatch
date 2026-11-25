"""Exercise the public reverse-proxy boundary using HTTP messages in memory."""
import argparse
from contextlib import closing, redirect_stdout
from http.client import HTTPResponse
from io import BytesIO, StringIO
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

import server


SITE = "https://task.example.org"
HOST = "task.example.org"


class PublicHttpTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.addCleanup(os.umask, os.umask(0o077))
        output = StringIO()
        argv = ["run.py", "--public-origin", SITE, "--data-dir", folder.name]
        with patch.object(sys, "argv", argv), patch.object(server, "ThreadingHTTPServer") as listener:
            self.service = listener.return_value
            self.service.server_port = 8780
            with redirect_stdout(output):
                server.main()
            listener.assert_called_once_with(("127.0.0.1", 8780), server.Handler)
        self.assertIn(SITE, output.getvalue())
        self.assertIsNone(self.service.key)
        self.assertNotIn("#key=", output.getvalue())

    def request(self, method, path, headers, body=None):
        payload = json.dumps(body).encode() if body is not None else b""
        lines = [f"{method} {path} HTTP/1.1", "Content-Type: application/json",
                 f"Content-Length: {len(payload)}", *headers]
        wire = ("\r\n".join(lines) + "\r\n\r\n").encode() + payload
        outgoing = BytesIO()
        connection = Mock()
        connection.makefile.return_value = BytesIO(wire)
        connection.sendall.side_effect = outgoing.write
        server.Handler(connection, ("127.0.0.1", 12345), self.service)
        outgoing.seek(0)
        connection.makefile.return_value = outgoing
        response = HTTPResponse(connection)
        response.begin()
        return response

    def test_only_configured_host_and_origin_are_accepted(self):
        host = "Host: " + HOST
        origin = "Origin: " + SITE
        self.assertEqual(200, self.request("GET", "/", [host + ":443"]).status)
        for headers in ([], ["Host: localhost:8780"], [host, host], ["Host: example.org",
                        "X-Forwarded-Host: " + HOST]):
            with self.subTest(headers=headers):
                self.assertEqual(403, self.request("GET", "/", headers).status)
        for headers in ([host], [host, "Origin: null"], [host, "Origin: http://" + HOST],
                        [host, origin, origin], [host, "Origin: https://example.org"],
                        [host, origin, "Sec-Fetch-Site: cross-site"]):
            with self.subTest(headers=headers):
                self.assertEqual(403, self.request("POST", "/api/account/guest", headers, {}).status)

    def publisher(self, headers):
        login = self.request("POST", "/api/account/register", headers,
                             {"username": "publisher", "password": "examplePassword!"})
        self.assertEqual(200, login.status)
        return login.getheader("Set-Cookie")

    def test_guest_upgrade_logout_and_account_task_isolation(self):
        host = ["Host: " + HOST, "Origin: " + SITE]

        def identify(headers):
            response = self.request("GET", "/api/account", headers)
            self.assertEqual(200, response.status)
            return json.loads(response.read())["user"]

        def enter(action, headers, data):
            response = self.request("POST", "/api/account/" + action, headers, data)
            self.assertEqual(200, response.status)
            user = json.loads(response.read())["user"]
            cookie = response.getheader("Set-Cookie")
            self.check_cookie(cookie)
            return user, host + ["Cookie: " + cookie.split(";")[0]]

        self.assertIsNone(identify(host))
        guest, guest_headers = enter("guest", host, {})
        self.assertEqual("guest", guest["role"])
        reused = self.request("POST", "/api/account/guest", guest_headers, {})
        self.assertEqual(guest["id"], json.loads(reused.read())["user"]["id"])
        saved = self.request("POST", "/api/tasks", guest_headers, {"title": "游客草稿", "comments": ["A"]})
        self.assertEqual(200, saved.status)
        task_id = json.loads(saved.read())["task"]["id"]
        creds = {"username": "Alice", "password": "initialPrivatePass"}
        member, member_headers = enter("register", guest_headers, creds)
        self.assertEqual((guest["id"], "user"), (member["id"], member["role"]))
        self.assertIsNone(identify(guest_headers))
        self.assertEqual(member, identify(member_headers))
        owner_tasks = json.loads(self.request("GET", "/api/tasks", member_headers).read())["tasks"]
        self.assertEqual([task_id], [r["id"] for r in owner_tasks])

        bob, bob_headers = enter("register", host, {"username": "Bobby", "password": "anotherPrivatePass"})
        self.assertNotEqual(member["id"], bob["id"])
        self.assertEqual([], json.loads(self.request("GET", "/api/tasks", bob_headers).read())["tasks"])
        self.assertEqual(404, self.request("GET", f"/api/tasks/{task_id}", bob_headers).status)
        self.assertEqual(404, self.request("POST", f"/api/tasks/{task_id}/edit", bob_headers,
                                           {"title": "B", "comments": []}).status)
        stale = bob_headers + ["X-KH-Owner: " + str(member["id"])]
        self.assertEqual(409, self.request("POST", "/api/tasks", stale,
                                           {"title": "旧标签页", "comments": []}).status)
        self.assertEqual([], json.loads(self.request("GET", "/api/tasks", bob_headers).read())["tasks"])

        stale_logout = self.request("POST", "/api/account/logout", stale, {})
        self.assertEqual(409, stale_logout.status)
        self.assertIsNone(stale_logout.getheader("Set-Cookie"))
        self.assertEqual(bob, identify(bob_headers))
        logout = self.request("POST", "/api/account/logout",
                              member_headers + ["X-KH-Owner: " + str(member["id"])], {})
        self.assertIsNone(json.loads(logout.read())["user"])
        self.assertIn("Max-Age=0", logout.getheader("Set-Cookie"))
        self.assertIsNone(identify(member_headers))
        returned, signed_in = enter("login", host, creds)
        self.assertEqual(member["id"], returned["id"])
        self.assertEqual(200, self.request("GET", f"/api/tasks/{task_id}", signed_in).status)

    def test_stale_guest_registration_cannot_create_or_convert_any_other_account(self):
        base = ["Host: " + HOST, "Origin: " + SITE]
        creds = {"username": "new-account", "password": "anotherPrivatePass"}
        visits = []
        for _ in range(2):
            session = self.request("POST", "/api/account/guest", base, {})
            user = json.loads(session.read())["user"]
            visits.append((user["id"], "Cookie: " + session.getheader("Set-Cookie").split(";")[0]))
        original, switched = visits
        stale = base + ["X-KH-Owner: " + str(original[0])]
        for headers in (stale, stale + [switched[1]]):
            response = self.request("POST", "/api/account/register", headers, creds)
            self.assertEqual(409, response.status)
            self.assertIsNone(response.getheader("Set-Cookie"))
        still_guest = self.request("GET", "/api/account", base + [switched[1]])
        self.assertEqual("guest", json.loads(still_guest.read())["user"]["role"])
        upgraded = self.request("POST", "/api/account/register", stale + [original[1]], creds)
        self.assertEqual(200, upgraded.status)
        self.assertEqual(original[0], json.loads(upgraded.read())["user"]["id"])

    def test_logout_before_task_transaction_prevents_creation(self):
        headers = ["Host: " + HOST, "Origin: " + SITE]
        entered = self.request("POST", "/api/account/guest", headers, {})
        cookie = entered.getheader("Set-Cookie").split(";")[0]
        token = cookie.split("=", 1)[1]
        handle = server.domain.handle

        def revoked_before_begin(*args, **kwargs):
            with closing(server.connect(self.service.db_path)) as separate:
                server.accounts.logout(separate, token)
            return handle(*args, **kwargs)

        with patch.object(server.domain, "handle", side_effect=revoked_before_begin):
            response = self.request("POST", "/api/tasks", headers + ["Cookie: " + cookie],
                                    {"title": "退出后的草稿", "comments": ["A"]})
        self.assertEqual(401, response.status)
        with closing(server.connect(self.service.db_path)) as db:
            self.assertEqual(0, db.execute("SELECT COUNT(*) FROM tasks").fetchone()[0])

    def test_account_rate_limit_uses_proxy_peer_and_allows_existing_sessions(self):
        host = ["Host: " + HOST, "Origin: " + SITE]
        response = self.request("POST", "/api/account/guest", host + ["X-Forwarded-For: 192.0.2.7"], {})
        self.assertEqual(200, response.status)
        cookie = "Cookie: " + response.getheader("Set-Cookie").split(";")[0]
        # Reserve the rest of this IP's allowance without creating more accounts.
        for _ in range(39):
            self.service.account_rate.check("192.0.2.7")
        forwarded = host + ["X-Forwarded-For: 192.0.2.9, 192.0.2.7"]
        self.assertEqual(429, self.request("POST", "/api/account/guest", forwarded, {}).status)
        self.assertEqual(200, self.request("POST", "/api/account/guest", forwarded + [cookie], {}).status)
        other = host + ["X-Forwarded-For: 192.0.2.9"]
        self.assertEqual(200, self.request("POST", "/api/account/guest", other, {}).status)

    def test_platform_admin_permission_moderation_and_password_reset(self):
        base = ["Host: " + HOST, "Origin: " + SITE]
        admin_credentials = {"username": "admin", "password": "systemAdminSample!"}
        with closing(server.connect(self.service.db_path)) as db:
            self.assertTrue(server.accounts.set_admin_password(db, admin_credentials["password"]))

        def request(method, path, headers, data=None, status=200):
            response = self.request(method, path, headers, data)
            payload = json.loads(response.read())
            self.assertEqual(status, response.status, (path, payload))
            return payload

        def session(which, data):
            response = self.request("POST", "/api/account/" + which, base, data)
            self.assertEqual(200, response.status)
            return base + ["Cookie: " + response.getheader("Set-Cookie").split(";")[0]]

        guest = session("guest", {})
        creds = {"username": "normal-account", "password": "secretMemberPass"}
        member = session("register", creds)
        uid = request("GET", "/api/account", member)["user"]["id"]
        admin = session("login", admin_credentials)
        request("GET", "/api/admin/accounts", base, status=401)
        for lower in (member, guest):
            request("GET", "/api/admin/tasks", lower, status=403)
            request("GET", "/api/admin/accounts", lower, status=403)
            request("POST", f"/api/admin/accounts/{uid}/password", lower, {"password": "guessThisChange"}, 403)
        members = request("GET", "/api/admin/accounts", admin)["accounts"]
        account = next(r for r in members if r["id"] == uid)
        self.assertEqual({"id", "username", "role", "disabled", "task_count"}, set(account))
        task = request("POST", "/api/tasks", member, {
            "title": "被管理的任务", "target_url": SITE + "/example", "comments": ["example"]
        })["task"]
        task_id = task["id"]
        personal = "/api/tasks/" + str(task_id)
        managed = "/api/admin/tasks/" + str(task_id)
        self.assertEqual([], request("GET", "/api/tasks", admin)["tasks"])
        request("GET", managed, member, status=403)
        request("GET", "/api/admin/tasks?owner_id=invalid", admin, status=400)
        listing = request("GET", "/api/admin/tasks?owner_id=" + str(uid), admin)["tasks"]
        self.assertEqual([task_id], [entry["id"] for entry in listing])
        self.assertEqual(uid, listing[0]["owner_id"])
        self.assertEqual(["example"], request("GET", managed, admin)["task"]["comments"])
        stale_admin = admin + ["X-KH-Owner: " + str(uid)]
        request("POST", managed + "/publish", stale_admin, {}, 409)
        request("POST", managed + "/publish", admin, {})
        # Moderation uses a larger body only for editing the comment pool.
        pool = {"version": task["comments_version"], "comments": ["example", "批量导入评论" * 250]}
        self.assertGreater(len(json.dumps(pool).encode()), 4096)
        request("POST", managed + "/comments", base, pool, 401)
        request("POST", managed + "/comments", member, pool, 403)
        request("POST", personal + "/comments", guest, pool, 404)
        request("POST", managed + "/comments", stale_admin, pool, 409)
        request("POST", managed + "/pause", admin, pool, 413)
        updated = request("POST", managed + "/comments", admin, pool)["task"]
        self.assertEqual(pool["comments"], updated["comments"])
        request("POST", personal + "/comments", member, {"comments": ["example"], "version": pool["version"]}, 409)
        restored = request("POST", personal + "/comments", member,
                           {"comments": ["example"], "version": updated["comments_version"]})["task"]
        self.assertEqual((["example"], [], uid), (restored["comments"], restored["locked_comments"], restored["owner_id"]))
        self.assertFalse(request("POST", managed + "/disable", admin, {})["task"]["platform_enabled"])
        request("POST", personal + "/pause", member, {})
        request("POST", personal + "/resume", member, {})
        self.assertFalse(request("GET", managed, admin)["task"]["platform_enabled"])
        blocked = self.request("POST", f"/api/public/{task_id}/video",
                               base + ["Cookie: __Host-kh_reader=" + "1" * 64], {"name": "观众"})
        self.assertIn(blocked.status, (403, 404, 409))
        self.assertTrue(request("POST", managed + "/enable", admin, {})["task"]["platform_enabled"])
        request("POST", f"/api/public/{task_id}/video", base + ["Cookie: __Host-kh_reader=" + "1" * 64],
                {"name": "观众"})
        target_account = "/api/admin/accounts/" + str(uid)
        self.assertTrue(request("POST", target_account + "/disable", admin, {})["account"]["disabled"])
        request("GET", "/api/tasks", member, status=401)
        stopped = self.request("POST", f"/api/public/{task_id}/claim",
                               base + ["Cookie: __Host-kh_reader=" + "1" * 64], {})
        self.assertIn(stopped.status, (403, 404, 409))
        self.assertFalse(request("POST", target_account + "/enable", admin, {})["account"]["disabled"])
        request("POST", target_account + "/password", admin, {"password": "newMemberPassword"})
        request("POST", "/api/account/login", base, creds, 401)
        session("login", {"username": creds["username"], "password": "newMemberPassword"})

    def test_manager_auth_and_guest_cookie(self):
        host = ["Host: " + HOST]
        same_origin = host + ["Origin: " + SITE]
        self.assertEqual(401, self.request("GET", "/api/tasks", host).status)
        self.assertEqual(404, self.request("POST", "/api/manage-session?key=old",
                                           same_origin, {}).status)
        self.assertEqual(404, self.request("POST", "/api/manage-session", same_origin,
                                           {"key": "historical-key"}).status)
        self.assertEqual(401, self.request("GET", "/api/tasks", host +
                                           ["Cookie: __Host-kh_publisher=historical-session"]).status)
        cookie = self.publisher(same_origin)
        self.assertTrue(cookie.startswith("__Host-kh_account="))
        self.check_cookie(cookie)
        manager = same_origin + ["Cookie: " + cookie.split(";")[0]]
        self.assertEqual(200, self.request("GET", "/api/tasks", manager).status)
        task = {"title": "Test", "target_url": SITE + "/static/example-video.mp4", "comments": ["A"]}
        created = self.request("POST", "/api/tasks", manager, task)
        self.assertEqual(200, created.status)
        task_id = json.loads(created.read())["task"]["id"]
        self.assertEqual(200, self.request("POST", f"/api/tasks/{task_id}/publish", manager, {}).status)
        guest_path = f"/api/public/{task_id}"
        visit = self.request("GET", guest_path, host)
        self.assertEqual(200, visit.status)
        guest_cookie = visit.getheader("Set-Cookie")
        self.assertTrue(guest_cookie.startswith("__Host-kh_reader="))
        self.check_cookie(guest_cookie)
        guest = same_origin + ["Cookie: " + guest_cookie.split(";")[0]]
        self.assertEqual(200, self.request("POST", guest_path + "/video", guest, {"name": "访客"}).status)
        for _ in range(2):
            claimed = self.request("POST", guest_path + "/claim", guest, {})
            self.assertEqual({"comment": "A"}, json.loads(claimed.read()))
        self.assertEqual(401, self.request("GET", "/api/tasks", guest).status)

    def test_full_database_rejects_growth_and_preserves_existing_task(self):
        headers = ["Host: " + HOST, "Origin: " + SITE]
        headers.append("Cookie: " + self.publisher(headers).split(";")[0])
        saved = self.request("POST", "/api/tasks", headers, {"title": "保留", "comments": ["原文案"]})
        self.assertEqual(200, saved.status)
        task_id = json.loads(saved.read())["task"]["id"]
        path = f"/api/tasks/{task_id}"

        self.assertEqual(64 * 1024 * 1024, self.service.db_limit_bytes)
        self.service.db_limit_bytes = 1024
        with closing(server.connect(self.service.db_path, self.service.db_limit_bytes)) as db:
            current_pages = db.execute("PRAGMA page_count").fetchone()[0]
            self.assertGreater(current_pages, 1)
            self.assertEqual(current_pages, db.execute("PRAGMA max_page_count").fetchone()[0])
        comments = [str(i) + ("字" * 1900) for i in range(50)]
        update = self.request("POST", path + "/edit", headers, {"title": "编辑", "comments": comments})
        self.assertEqual(507, update.status)
        self.assertIn("存储空间不足", json.loads(update.read())["error"])
        original = self.request("GET", path, headers)
        self.assertEqual(200, original.status)
        task = json.loads(original.read())["task"]
        self.assertEqual(("保留", ["原文案"]), (task["title"], task["comments"]))

    def test_limit_uses_actual_sqlite_page_size_and_local_connections_remain_uncapped(self):
        path = Path(self.service.db_path).with_name("other.sqlite3")
        with closing(server.connect(path)) as db:
            db.execute("PRAGMA page_size=8192")
            db.execute("CREATE TABLE test (data BLOB)")
        expected_pages = self.service.db_limit_bytes // 8192
        for _ in range(2):
            with closing(server.connect(path, self.service.db_limit_bytes)) as db:
                self.assertEqual(expected_pages, db.execute("PRAGMA max_page_count").fetchone()[0])
        with closing(server.connect(path)) as db:
            self.assertGreater(db.execute("PRAGMA max_page_count").fetchone()[0], expected_pages)

    def check_cookie(self, header):
        attributes = header.split("; ")[1:]
        self.assertTrue({"Secure", "HttpOnly", "SameSite=Strict", "Path=/"}.issubset(attributes))
        self.assertFalse(any(item.lower().startswith("domain=") for item in attributes))

    def test_two_published_tasks_remain_independent_for_one_browser(self):
        headers = ["Host: " + HOST, "Origin: " + SITE]
        manager = headers + ["Cookie: " + self.publisher(headers).split(";")[0]]
        targets = {"A": ("xiaohongshu", "  分享笔记｜制造现场\nhttps://xhslink.com/o/example  "),
                   "B": ("wechat_channels", "https://weixin.qq.com/sph/example")}

        def publish(label):
            platform, target = targets[label]
            task = {"title": label, "target_platform": platform, "target_url": target, "comments": [label + "文案"]}
            created = self.request("POST", "/api/tasks", manager, task)
            saved = json.loads(created.read())["task"]
            self.assertEqual((platform, target), (saved["target_platform"], saved["target_url"]))
            task_id = saved["id"]
            self.assertEqual(200, self.request("POST", f"/api/tasks/{task_id}/publish", manager, {}).status)
            return task_id

        a, b = publish("A"), publish("B")
        self.assertNotEqual(a, b)
        first = self.request("GET", f"/api/public/{a}", headers)
        guest = headers + ["Cookie: " + first.getheader("Set-Cookie").split(";")[0]]

        def read(task_id):
            result = self.request("GET", f"/api/public/{task_id}", guest)
            self.assertEqual(200, result.status)
            return json.loads(result.read())

        def receive(task_id, label):
            path = f"/api/public/{task_id}"
            self.assertNotIn("target_url", read(task_id)["task"])
            name = {"name": "同一位访客"}
            if targets[label][0] == "wechat_channels":
                self.assertEqual(409, self.request("POST", path + "/video", guest, name).status)
                receipt = json.loads(self.request("POST", path + "/claim", guest, name).read())
                self.assertEqual(label + "文案", receipt["comment"])
                visit = receipt["visit"]
                self.assertEqual(visit, json.loads(self.request("POST", path + "/video", guest, {}).read()))
                self.assertEqual(receipt, json.loads(self.request("POST", path + "/claim", guest, {}).read()))
            else:
                visit = json.loads(self.request("POST", path + "/video", guest, name).read())
                comment = self.request("POST", path + "/claim", guest, {})
                self.assertEqual({"comment": label + "文案"}, json.loads(comment.read()))
            self.assertEqual(targets[label], (visit["video_platform"], visit["video_url"]))

        receive(a, "A")
        untouched = read(b)
        self.assertEqual(("B", 1, None, None), (untouched["task"]["title"], untouched["task"]["remaining"],
                                               untouched["visit"], untouched["claim"]))
        receive(b, "B")
        self.assertEqual(200, self.request("POST", f"/api/tasks/{a}/close", manager, {}).status)
        for task_id, label, status in ((a, "A", "closed"), (b, "B", "open"), (a, "A", "closed")):
            result = read(task_id)
            self.assertEqual((task_id, label, status), (result["task"]["id"], result["task"]["title"],
                                                       result["task"]["status"]))
            self.assertEqual(targets[label], (result["visit"]["video_platform"], result["visit"]["video_url"]))
            self.assertEqual({"comment": label + "文案"}, result["claim"])


class PublicOriginOptionTest(unittest.TestCase):
    def test_canonical_https_dns_origin(self):
        self.assertEqual(SITE, server.public_origin("https://TASK.EXAMPLE.ORG:443/"))
        self.assertEqual(SITE + ":9443", server.public_origin(SITE + ":9443"))
        for value in ("http://" + HOST, SITE + "/manage", SITE + "?x", SITE + "#x",
                      "https://user@" + HOST, SITE + ":65536", "https://*.example.org"):
            with self.subTest(value=value), self.assertRaises(argparse.ArgumentTypeError):
                server.public_origin(value)
