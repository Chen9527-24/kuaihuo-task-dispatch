"""The comment pool is atomic, repeatable for one browser and private until publication."""
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import domain


class CommentPoolTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.path = Path(folder.name) / "isolated.sqlite3"
        self.db = self.connect()
        self.addCleanup(self.db.close)
        domain.initialize(self.db)

    def connect(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def task(self, pool):
        response = domain.handle(self.db, "POST", "/api/tasks",
                                 {"title": "校对样例", "target_url": "https://example.invalid/clip", "comments": pool}, admin=True)
        return response["task"]["id"]

    def action(self, task, action, data=None):
        return domain.handle(self.db, "POST", f"/api/tasks/{task}/{action}", data or {}, admin=True)

    def video(self, task, visitor, name="样例访客"):
        return domain.handle(self.db, "POST", f"/api/public/{task}/video", {"name": name}, visitor=visitor)

    def claim(self, task, visitor):
        return domain.handle(self.db, "POST", f"/api/public/{task}/claim", {}, visitor=visitor)

    def assert_error(self, code, fn, *args):
        with self.assertRaises(domain.DomainError) as caught:
            fn(*args)
        self.assertEqual(code, caught.exception.status)

    def test_repeated_independent_draft_creation_and_editor_conflict(self):
        body = dict(title="导入", target_platform="kuaishou", comments=["甲"],
                    clientRequestId="ece2ed7c-2f83-4980-a2e6-4c6dca43da4c")
        def create(payload):
            return domain.handle(self.db, "POST", "/api/tasks", payload, admin=True)["task"]
        draft = create(body)
        self.assertEqual(draft, create(body))
        self.assert_error(409, create, {**body, "comments":["乙"]})
        edit = dict(title="草稿更新", comments=["甲","丙"], comments_version=draft["comments_version"])
        changed = self.action(draft["id"], "edit", edit)["task"]
        self.assertEqual(changed["target_platform"], "kuaishou")
        self.assert_error(409, self.action, draft["id"], "edit", edit)
        self.assertEqual(create(body), changed)

    def test_draft_visibility_and_pool_validation(self):
        task = self.task([])
        self.assert_error(404, self.claim, task, "甲")
        self.assert_error(409, self.action, task, "publish")
        self.assert_error(400, self.task, ["重复", "重复"])
        self.action(task, "edit", {"title": "校对样例", "comments": ["甲", "乙"]})
        self.assert_error(409, self.action, task, "publish")
        self.action(task, "edit", {"title": "校对样例", "comments": ["甲", "乙"],
                                   "target_url": "https://example.invalid/clip"})
        self.action(task, "publish")
        public = domain.handle(self.db, "GET", f"/api/public/{task}", {})
        self.assertNotIn("comments", public["task"])
        self.assertNotIn("target_url", public["task"])
        self.assertIsNone(public["visit"])
        self.assertIsNone(public["claim"])
        self.assert_error(409, self.action, task, "edit", {"title": "修订", "comments": ["丙"]})

    def test_pausing_retains_prior_claims(self):
        task = self.task(["第一条", "第二条"])
        self.action(task, "publish")
        self.assert_error(409, self.claim, task, "甲")
        self.video(task, "甲")
        self.video(task, "乙")
        self.assertEqual({"comment": "第一条"}, self.claim(task, "甲"))
        self.action(task, "pause")
        self.assertEqual({"comment": "第一条"}, self.claim(task, "甲"))
        self.assert_error(409, self.claim, task, "乙")
        self.assert_error(409, self.video, task, "丙")
        self.action(task, "resume")
        self.assertEqual({"comment": "第二条"}, self.claim(task, "乙"))
        self.assert_error(409, self.video, task, "丙")
        self.assert_error(409, self.claim, task, "丙")
        self.action(task, "close")
        self.assertEqual({"comment": "第二条"}, self.claim(task, "乙"))

    def race(self, task, visitors, body=None):
        gate = Barrier(len(visitors))
        def take(visitor):
            db = self.connect()
            try:
                gate.wait(timeout=5)
                result = domain.handle(db, "POST", f"/api/public/{task}/claim", body or {}, visitor=visitor)
                return result["comment"]
            except domain.DomainError as error:
                return error.status
            finally:
                db.close()
        with ThreadPoolExecutor(max_workers=len(visitors)) as workers:
            return list(workers.map(take, visitors))

    def test_edit_without_legacy_instructions_keeps_saved_text(self):
        data = {"title": "历史草稿", "instructions": "原有说明", "comments": ["甲", "乙"]}
        tid = domain.handle(self.db, "POST", "/api/tasks", data, admin=True)["task"]["id"]
        updated = self.action(tid, "edit", {"title": "调整评论", "comments": ["乙"]})["task"]
        self.assertEqual("原有说明", updated["instructions"])
        self.assertEqual(["乙"], updated["comments"])

    def test_last_comment_can_only_be_claimed_once(self):
        task = self.task(["最后一条"])
        self.action(task, "publish")
        self.video(task, "甲")
        self.video(task, "乙")
        self.assertCountEqual(["最后一条", 409], self.race(task, ["甲", "乙"]))

    def test_simultaneous_retries_keep_one_comment(self):
        task = self.task(["第一条", "第二条"])
        self.action(task, "publish")
        self.video(task, "甲")
        self.assertEqual(["第一条", "第一条"], self.race(task, ["甲", "甲"]))
        public = domain.handle(self.db, "GET", f"/api/public/{task}", {}, visitor="甲")
        self.assertEqual(1, public["task"]["remaining"])
        self.assertEqual({"comment": "第一条"}, public["claim"])

    def test_channel_claim_registers_and_unlocks_in_one_transaction(self):
        video = "https://weixin.qq.com/sph/clip"
        task = domain.handle(self.db, "POST", "/api/tasks", {
            "title": "视频号示例", "target_url": video, "comments": ["唯一评论"]}, admin=True)["task"]["id"]
        self.action(task, "publish")
        path = f"/api/public/{task}"
        self.assert_error(409, self.video, task, "甲")
        self.assert_error(400, self.claim, task, "甲")
        self.assertCountEqual(["唯一评论", 409], self.race(task, ["甲", "乙"], {"name": "同名"}))
        users = {who: domain.handle(self.db, "GET", path, {}, visitor=who) for who in ("甲", "乙")}
        winner, = (who for who, state in users.items() if state["claim"])
        loser, = (who for who, state in users.items() if not state["claim"])
        self.assertIsNone(users[loser]["visit"])
        self.assertEqual({"video_platform": "wechat_channels", "name": "同名", "video_url": video}, users[winner]["visit"])
        self.action(task, "pause")
        self.assertEqual(video, self.video(task, winner)["video_url"])
        self.assertEqual(["唯一评论", "唯一评论"], self.race(task, [winner, winner]))
        self.assert_error(409, self.video, task, loser)
        self.assertEqual(1, self.db.execute("SELECT COUNT(*) FROM visits WHERE task_id=?", (task,)).fetchone()[0])

    def test_channel_legacy_visit_keeps_name_and_hides_link_until_claim(self):
        video = "https://channels.weixin.qq.com/clip"
        task = domain.handle(self.db, "POST", "/api/tasks", {
            "title": "历史视频号", "target_url": video, "comments": ["第一条"]}, admin=True)["task"]["id"]
        self.action(task, "publish")
        with self.db:
            self.db.execute("INSERT INTO visits(task_id,visitor,name) VALUES (?,?,?)", (task, "甲", "原昵称"))
        path = f"/api/public/{task}"
        self.action(task, "pause")
        self.assertEqual({"name": "原昵称"}, domain.handle(self.db, "GET", path, {}, visitor="甲")["visit"])
        self.assert_error(409, self.video, task, "甲")
        self.assert_error(409, self.claim, task, "甲")
        self.action(task, "resume")
        receipt = self.claim(task, "甲")
        self.action(task, "close")
        self.assertEqual({"name": "原昵称", "video_url": video, "video_platform": "wechat_channels"}, receipt["visit"])
        self.assertEqual(receipt, self.claim(task, "甲"))
        self.assertEqual({"comment": "第一条"}, domain.handle(self.db, "GET", path, {}, visitor="甲")["claim"])

    def test_edit_published_comment_pool_preserves_rows_and_recent_claims(self):
        task = self.task(["甲", "乙", "丙"])
        published = self.action(task, "publish")["task"]
        first_version = published["comments_version"]
        other = self.task(["另一条"])
        self.action(other, "publish")
        self.assert_error(409, self.action, other, "comments", {"version": first_version, "comments": ["甲"]})
        self.video(task, "一")
        self.assertEqual({"comment": "甲"}, self.claim(task, "一"))
        self.action(task, "pause")
        payload = {"version": first_version, "comments": ["丁", "丙", "甲", "戊"]}
        self.assert_error(409, self.action, task, "comments", {**payload, "comments": ["乙", "丙"]})
        def original_rows():
            return list(map(tuple, self.db.execute(
                "SELECT id,content,visitor FROM comments WHERE task_id=? AND content IN ('甲','丙') ORDER BY id", (task,))))
        before = original_rows()
        updated = self.action(task, "comments", payload)["task"]
        self.assertEqual(before, original_rows())
        self.assertEqual((["甲","丙","丁","戊"], ["甲"], 3),
                         (updated["comments"], updated["locked_comments"], updated["remaining"]))
        self.assertEqual(updated, self.action(task, "comments", payload)["task"])
        self.assertNotEqual(first_version, updated["comments_version"])
        self.assert_error(409, self.action, task, "comments", {**payload, "comments": ["甲", "丙", "旧页添加"]})
        self.action(task, "resume")
        self.video(task, "二")
        self.assertEqual({"comment": "丙"}, self.claim(task, "二"))
        self.assertEqual({"comment": "甲"}, self.claim(task, "一"))
        latest = self.action(task, "comments", {"version": updated["comments_version"], "comments": ["甲","丙"]})["task"]
        self.assertEqual(0, latest["remaining"])
        self.assertEqual(["甲", "丙"], latest["locked_comments"])
        self.action(task, "close")
        self.assert_error(409, self.action, task, "comments", {"version": latest["comments_version"], "comments": ["甲","丙","己"]})

    def test_simultaneous_pool_editors_cannot_overwrite(self):
        task = self.task(["初始"])
        start = self.action(task, "publish")["task"]
        barrier = Barrier(2)
        def edit(name):
            db = self.connect()
            try:
                barrier.wait(timeout=5)
                result = domain.handle(db, "POST", f"/api/tasks/{task}/comments",
                                       {"version": start["comments_version"], "comments": ["初始", name]}, admin=True)
                return result["task"]["comments"]
            except domain.DomainError as error:
                return error.status
            finally:
                db.close()
        with ThreadPoolExecutor(max_workers=2) as workers:
            results = list(workers.map(edit, ["编辑者甲", "编辑者乙"]))
        self.assertEqual(1, results.count(409))
        current = domain.handle(self.db, "GET", f"/api/tasks/{task}", {}, admin=True)["task"]
        self.assertIn(current["comments"], results)

    def test_anonymous_readers_cannot_edit(self):
        task = self.task(["第一条"])
        self.assert_error(401, domain.handle, self.db, "GET", "/api/tasks", {})
        self.assert_error(401, domain.handle, self.db, "POST", f"/api/tasks/{task}/publish", {})

    def test_named_visit_reveals_video_only_and_keeps_first_name(self):
        task = self.task(["第一条"])
        self.action(task, "publish")
        for invalid in ("  ", "换\n行", "甲" * 33):
            self.assert_error(400, self.video, task, "甲", invalid)
        first = self.video(task, "甲", "  同名  ")
        self.assertEqual({"name": "同名", "video_url": "https://example.invalid/clip", "video_platform": "other"}, first)
        self.assertEqual(first, self.video(task, "甲", "另一个名字"))
        self.assertEqual(first, self.video(task, "乙", "同名"))
        detail = domain.handle(self.db, "GET", f"/api/tasks/{task}", {}, admin=True)["task"]
        self.assertEqual(1, detail["remaining"])
        self.assertEqual([False, False], [v["has_comment"] for v in detail["visitors"]])
        self.claim(task, "乙")
        self.assert_error(409, self.claim, task, "甲")
        detail = domain.handle(self.db, "GET", f"/api/tasks/{task}", {}, admin=True)["task"]
        self.assertEqual([False, True], [v["has_comment"] for v in detail["visitors"]])
        self.assertEqual("第一条", detail["visitors"][1]["comment"])

    def test_platform_specific_validation_and_legacy_draft_edits(self):
        task = self.task(["评论"])
        values = {"title": "作品", "comments": ["评论"], "target_platform": "wechat_channels"}
        for invalid in ("打开后查看 https://weixin.qq.com/sph/x", "javascript:alert(1)", "//example.org",
                        "https://@example.org", "https://[", "https://[::1]extra", "https://<作品>/",
                        "https://example.org:99999",
                        "https://example.org/" + "a" * 2048):
            with self.subTest(invalid=invalid):
                self.assert_error(400, self.action, task, "edit", {**values, "target_url": invalid})
        self.action(task, "edit", values)
        self.assert_error(409, self.action, task, "publish")
        del values["target_platform"]
        # Clients predating platform selection must preserve a publisher's explicit choice.
        self.assert_error(400, self.action, task, "edit", {**values, "target_url": "作品口令"})
        changed = self.action(task, "edit", {**values, "target_url": "https://example.org/video"})["task"]
        self.assertEqual("wechat_channels", changed["target_platform"])
        for platform in ("douyin", "xiaohongshu", "other"):
            share = " \n作品口令 <作品> 【中文】 😀  \n"
            changed = self.action(task, "edit", {**values, "target_url": share, "target_platform": platform})["task"]
            self.assertEqual((platform, share), (changed["target_platform"], changed["target_url"]))
        for invalid in ("", "unknown", None, []):
            with self.subTest(platform=invalid):
                self.assert_error(400, self.action, task, "edit", {**values, "target_platform": invalid})
        self.assert_error(400, self.action, task, "edit", {**values, "target_url": "字" * 5001})
