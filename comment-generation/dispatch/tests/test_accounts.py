"""Cover account migration, publisher isolation and guest registration."""
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from unittest.mock import patch

import accounts
import domain


class AccountTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.path = Path(folder.name) / "tasks.sqlite"
        self.db = self.connect()
        self.addCleanup(self.db.close)
        domain.initialize(self.db)

    def connect(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def error(self, status, fn, *args, **kwargs):
        with self.assertRaises(domain.DomainError) as ctx:
            fn(*args, **kwargs)
        self.assertEqual(status, ctx.exception.status)

    def test_guest_upgrade_and_revocation(self):
        guest, token = accounts.guest(self.db)
        self.assertEqual((guest, token), accounts.guest(self.db, token))
        body = {"title": "旧草稿", "comments": ["测试文案"]}
        original = domain.handle(self.db, "POST", "/api/tasks", body, owner_id=guest["id"])["task"]
        user, new_token = accounts.register(self.db, "用户_甲", "自定密码八个字符", token)
        self.assertEqual(guest["id"], user["id"])
        self.assertEqual("user", user["role"])
        self.assertNotEqual(token, new_token)
        self.assertIsNone(accounts.current(self.db, token))
        tasks = domain.handle(self.db, "GET", "/api/tasks", {}, owner_id=user["id"])["tasks"]
        self.assertEqual([original["id"]], [t["id"] for t in tasks])
        self.assertEqual(user, accounts.current(self.db, new_token))
        accounts.logout(self.db, new_token)
        self.assertIsNone(accounts.current(self.db, new_token))
        self.error(401, accounts.login, self.db, "用户_甲", "输错密码八个字符")
        verified, session = accounts.login(self.db, "用户_甲", "自定密码八个字符")
        self.assertEqual(user, verified)
        with self.db:
            self.db.execute("UPDATE account_sessions SET expires_at=0 WHERE account_id=?", (user["id"],))
        self.assertIsNone(accounts.current(self.db, session))

    def test_isolation_for_all_actions(self):
        a, _ = accounts.guest(self.db)
        b, _ = accounts.guest(self.db)
        data = {"title": "甲的任务", "target_url": "https://example.org/video", "comments": ["甲的评论"]}
        item = domain.handle(self.db, "POST", "/api/tasks", data, owner_id=a["id"])["task"]
        path = f"/api/tasks/{item['id']}"
        self.assertEqual([], domain.handle(self.db, "GET", "/api/tasks", {}, owner_id=b["id"])["tasks"])
        self.error(404, domain.handle, self.db, "GET", path, {}, owner_id=b["id"])
        for action in ("edit", "publish", "pause", "resume", "close"):
            self.error(404, domain.handle, self.db, "POST", path + "/" + action, data, owner_id=b["id"])
        domain.handle(self.db, "POST", path + "/publish", {}, owner_id=a["id"])
        public = domain.handle(self.db, "GET", f"/api/public/{item['id']}", {})
        self.assertEqual("甲的任务", public["task"]["title"])
        self.assertFalse({"owner_id","visitors","comments","target_url"}.intersection(public["task"]))

    def test_stale_tab_cannot_change_another_account_session(self):
        previous, previous_token = accounts.guest(self.db)
        active, active_token = accounts.register(self.db, "NewUser", "correct-password")
        for action, args in ((accounts.guest, ()), (accounts.logout, ()),
                             (accounts.login, ("NewUser", "correct-password")),
                             (accounts.register, ("WrongOwner", "new-password"))):
            self.error(409, action, self.db, *args, active_token, expected_owner=previous["id"])
        self.assertEqual(active, accounts.current(self.db, active_token))
        # A logout in another connection can happen while registration hashes the password.
        digest = accounts.password_digest
        def revoke_before_write(password):
            other = self.connect()
            try:
                accounts.logout(other, previous_token, expected_owner=previous["id"])
            finally:
                other.close()
            return digest(password)
        with patch.object(accounts, "password_digest", side_effect=revoke_before_write):
            self.error(409, accounts.register, self.db, "WrongOwner", "new-password",
                       previous_token, expected_owner=previous["id"])
        self.assertIsNone(self.db.execute("SELECT id FROM accounts WHERE login='wrongowner'").fetchone())

    def test_publisher_route_requires_live_session_inside_transaction(self):
        publisher, token = accounts.guest(self.db)
        other, _ = accounts.guest(self.db)
        payload = {"title": "本人草稿", "comments": []}
        # Token mode always resolves the authenticated owner even if other authority was supplied.
        item = domain.handle(self.db, "POST", "/api/tasks", payload, admin=True, owner_id=other["id"],
                             account_token=token, expected_owner=publisher["id"])["task"]
        self.assertEqual(publisher["id"], item["owner_id"])
        self.error(409, domain.handle, self.db, "POST", "/api/tasks", payload,
                   account_token=token, expected_owner=other["id"])
        accounts.logout(self.db, token)
        self.error(401, domain.handle, self.db, "POST", "/api/tasks", payload,
                   admin=True, owner_id=publisher["id"], account_token=token)
        self.assertEqual(1, self.db.execute("SELECT count(*) FROM tasks").fetchone()[0])

    def test_migrate_published_ids_and_reserved_admin(self):
        # Reproduce the task schema and a shared task present before accounts existed.
        old = sqlite3.connect(":memory:")
        self.addCleanup(old.close)
        old.row_factory = sqlite3.Row
        old.execute("""CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL,
                       instructions TEXT NOT NULL,target_url TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft')""")
        old.execute("INSERT INTO tasks VALUES (77,'既有链接','说明','https://weixin.qq.com/sph/example','open')")
        old.commit()
        domain.initialize(old)
        self.error(409, accounts.register, old, "Ａｄｍｉｎ", "abcdefgh")
        self.error(401, accounts.login, old, "admin", "abcdefgh")
        self.assertTrue(accounts.set_admin_password(old, "administrator123"))
        self.assertFalse(accounts.set_admin_password(old, "differentpassword"))
        user, _ = accounts.login(old, "Admin", "administrator123")
        self.assertEqual("admin", user["role"])
        guest, _ = accounts.guest(old)
        domain.handle(old, "POST", "/api/tasks", {"title":"个人任务","comments":[]}, owner_id=guest["id"])
        domain.initialize(old)
        self.assertEqual([77], [t["id"] for t in domain.handle(old,"GET","/api/tasks",{},owner_id=user["id"])["tasks"]])
        migrated = domain.handle(old,"GET","/api/public/77",{})["task"]
        self.assertEqual(("既有链接", "wechat_channels"), (migrated["title"], migrated["target_platform"]))
        self.assertEqual(1,len(domain.handle(old,"GET","/api/tasks",{},owner_id=guest["id"])["tasks"]))

    def test_duplicate_registration_is_atomic(self):
        barrier = Barrier(2)
        def register(name):
            db = self.connect()
            try:
                barrier.wait(timeout=5)
                try:
                    accounts.register(db, name, "shared-password")
                    return 200
                except domain.DomainError as exc:
                    return exc.status
            finally:
                db.close()
        with ThreadPoolExecutor(2) as pool:
            self.assertCountEqual([200, 409], pool.map(register, ["TestUser", "testuser"]))
        self.assertEqual(1, self.db.execute("SELECT count(*) FROM accounts WHERE role='user'").fetchone()[0])

    def test_site_moderation_and_account_controls(self):
        accounts.set_admin_password(self.db, "site-admin-password")
        admin, admin_token = accounts.login(self.db, "admin", "site-admin-password")
        user, old_token = accounts.register(self.db, "Publisher", "publisher-password")
        guest, guest_token = accounts.guest(self.db)
        def admin_api(method, path, payload=None, **options):
            return domain.admin_handle(self.db, method, "/api/admin/" + path, payload or {},
                                       admin_token, **options)
        item = domain.handle(self.db, "POST", "/api/tasks", {
            "title": "测试", "target_url": "https://example.org/play", "comments": ["甲", "乙"]
        }, owner_id=user["id"])["task"]
        task = "tasks/" + str(item["id"])
        member = "accounts/" + str(user["id"])
        public = "/api/public/" + str(item["id"])
        for token, status in ((guest_token, 403), (old_token, 403), ("", 401)):
            self.error(status, domain.admin_handle, self.db, "GET", "/api/admin/accounts", {}, token)
        self.error(409, admin_api, "GET", "accounts", expected_owner=guest["id"])
        self.assertEqual(3, len(admin_api("GET", "accounts")["accounts"]))
        info = next(a for a in admin_api("GET", "accounts")["accounts"] if a["id"] == user["id"])
        self.assertEqual({"id","username","role","disabled","task_count"}, set(info))
        self.assertEqual(1, info["task_count"])
        self.assertEqual([], admin_api("GET", "tasks", owner_id=guest["id"])["tasks"])
        self.assertEqual(user["id"], admin_api("GET", "tasks")["tasks"][0]["owner_id"])
        self.assertEqual("open", admin_api("POST", task + "/publish")["task"]["status"])
        domain.handle(self.db, "POST", public + "/video", {"name": "回访者"}, visitor="v")
        receipt = domain.handle(self.db, "POST", public + "/claim", {}, visitor="v")
        self.assertEqual(["甲","乙"], admin_api("GET", task)["task"]["comments"])
        self.assertEqual("回访者", admin_api("GET", task)["task"]["visitors"][0]["name"])
        self.assertFalse(admin_api("POST", task + "/disable")["task"]["platform_enabled"])
        # A publisher may manage the task's own state but cannot override the site take-down.
        for action in ("pause", "resume"):
            domain.handle(self.db, "POST", "/api/" + task + "/" + action, {}, owner_id=user["id"])
        self.assertEqual("paused", domain.handle(self.db,"GET",public,{})["task"]["status"])
        self.error(409, domain.handle,self.db,"POST",public+"/video",{"name":"新人"},visitor="new")
        self.assertEqual(receipt,domain.handle(self.db,"POST",public+"/claim",{},visitor="v"))
        admin_api("POST", member + "/disable")
        self.assertIsNone(accounts.current(self.db, old_token))
        self.error(401, accounts.login, self.db, "Publisher", "publisher-password")
        self.error(401, domain.handle, self.db, "POST", "/api/" + task + "/pause", {}, owner_id=user["id"])
        admin_api("POST", task + "/enable")
        self.assertEqual("paused", domain.handle(self.db, "GET", public, {})["task"]["status"])
        self.assertEqual(receipt, domain.handle(self.db, "GET", public, {}, visitor="v")["claim"])
        admin_api("POST", member + "/enable")
        self.assertEqual("open", domain.handle(self.db, "GET", public, {})["task"]["status"])
        _, token = accounts.login(self.db, "Publisher", "publisher-password")
        admin_api("POST", member + "/password", {"password": "updated-password"})
        self.assertIsNone(accounts.current(self.db, token))
        self.error(401, accounts.login, self.db, "Publisher", "publisher-password")
        self.assertEqual(user, accounts.login(self.db,"Publisher","updated-password")[0])
        self.error(409, admin_api, "POST", f"accounts/{guest['id']}/password", {"password":"updated-password"})
        self.error(409, admin_api, "POST", f"accounts/{admin['id']}/disable")
        self.assertEqual("closed", admin_api("POST", task+"/close")["task"]["status"])


if __name__ == "__main__":
    unittest.main()
