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

    def race(self, task, visitors):
        gate = Barrier(len(visitors))
        def take(visitor):
            db = self.connect()
            try:
                gate.wait(timeout=5)
                result = domain.handle(db, "POST", f"/api/public/{task}/claim", {}, visitor=visitor)
                return result["comment"]
            except domain.DomainError as error:
                return error.status
            finally:
                db.close()
        with ThreadPoolExecutor(max_workers=len(visitors)) as workers:
            return list(workers.map(take, visitors))

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
        self.assertEqual({"name": "同名", "video_url": "https://example.invalid/clip"}, first)
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
