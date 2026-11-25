"""Bridge invariants that survive older model batches and concurrent editors."""
import json
import os
import sqlite3
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import heatbridge

STUDIO = Path(__file__).resolve().parents[1]
DISPATCH = Path(os.environ.get("COMMENT_DISPATCH_ROOT") or STUDIO.parent / "dispatch")


class HeatBridgeTest(unittest.TestCase):
    def setUp(self):
        with patch.object(sys, "path", [str(DISPATCH), *sys.path]):
            import accounts
            import domain
        self.domain = domain
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.addCleanup(self.db.close)
        domain.initialize(self.db)
        self.db.execute("CREATE TABLE studio_tasks (id TEXT PRIMARY KEY,owner TEXT,data TEXT)")
        heatbridge.initialize(self.db)
        self.owner = accounts.guest(self.db)[0]
        self.other = accounts.guest(self.db)[0]
        self.admin = dict(self.db.execute("SELECT id,role FROM accounts WHERE role='admin'").fetchone())
        self.share = "复制打开快手\nhttps://v.kuaishou.com/abc/ " + "评" * 5350
        self.source = dict(id="t", title="试样", mode="link", source=self.share, platform="快手",
            batches=[dict(id="b", account=dict(id="v", name="内容账号"), options=dict(platforms={"快手":2, "抖音":1}),
                rows=[dict(platform="快手", text="第一", type="问题", reply="作者", advice="置顶"),
                      dict(platform="快手", text="第二", type="回应", reply="", advice=""),
                      dict(platform="抖音", text="同题另一版", type="提问", reply="", advice="")])])
        with self.db:
            self.db.execute("INSERT INTO studio_tasks VALUES (?,?,?)", ("t",f"publisher:{self.owner['id']}",json.dumps(self.source)))

    def route(self, action, body=None, actor=None, platform="快手", **kwargs):
        return heatbridge.handle(self.db, actor or self.owner, "t", "b", platform, action, body,
                                 dispatch=self.domain, **kwargs)

    def test_empty_group_restore_and_stable_metadata(self):
        old = self.route("read")["rows"]
        new = self.route("save", {"version":0, "rows":[{"id":old[0]["id"],"text":"改写"},{"text":"新增"}]})
        self.assertEqual((new["rows"][0]["reply"],new["rows"][0]["advice"]), ("作者","置顶"))
        self.assertFalse(new["rows"][1]["reply"])
        with self.assertRaisesRegex(self.domain.DomainError, "评论已变化"):
            self.route("save", {"version":1, "rows":[dict(id=old[1]["id"], text="已删条目")]})
        self.route("save", {"version":1, "rows":[]})
        self.assertEqual({("t","b","快手"):0}, heatbridge.collection_counts(self.db,["t"]))
        seen = heatbridge.decorate_task(self.db,dict(self.source))
        self.assertEqual([r["text"] for r in seen["batches"][0]["rows"]], ["同题另一版"])
        self.assertEqual(seen["batches"][0]["collections"]["快手"]["version"],2)
        with self.assertRaisesRegex(self.domain.DomainError, "至少一条"):
            self.route("create", {"version":2})
        with self.assertRaisesRegex(self.domain.DomainError, "重新载入"):
            self.route("save", {"version":1, "rows":[dict(text="错误版本")]})
        self.assertEqual(self.route("save", {"version":2, "rows":[dict(text="重加")]})["rows"][0]["text"], "重加")

    def test_admin_handoff_preserves_owner_legacy_limits_and_private_account(self):
        with self.assertRaises(self.domain.DomainError):
            self.route("create", {"version":0}, actor=self.other)
        with self.assertRaises(self.domain.DomainError):
            self.route("create", {"version":0}, authorize=lambda db: None)
        created = self.route("create", {"version":0}, actor=self.admin)["heatstart"]
        tid = created["id"]
        info = self.domain.detail(self.db,tid,self.owner["id"])
        self.assertEqual((info["target_platform"],info["target_url"],info["comments"]),
                         ("kuaishou",self.share,["第一","第二"]))
        self.assertEqual(info["origin"]["videoAccountName"], "内容账号")
        self.assertEqual(tid,self.route("create", {"version":-1})["heatstart"]["id"])
        with self.assertRaisesRegex(self.domain.DomainError, "已创建"):
            self.route("save", {"version":0,"rows":[]})
        edit = {"title":"旧客户端编辑","target_url":self.share,"comments":info["comments"]}
        self.domain.handle(self.db,"POST",f"/api/tasks/{tid}/edit",edit,owner_id=self.owner["id"])
        self.domain.handle(self.db,"POST",f"/api/tasks/{tid}/publish",{},owner_id=self.owner["id"])
        public = self.domain.public(self.db,tid,"visitor",None,{})
        self.assertNotIn("origin", public["task"])
        self.assertNotIn("target_url", public["task"])
        self.assertEqual(public["task"]["target_platform"], "kuaishou")
        self.assertEqual(self.domain.public(self.db,tid,"visitor","video",{"name":"样例"})["video_platform"], "kuaishou")
        self.domain.public(self.db,tid,"visitor","claim",{})
        self.db.commit()
        self.assertEqual(heatbridge.task_links(self.db,["t"])["t"][0]["claimed"], 1)
        cross = self.route("create", {"version":0}, platform="抖音")["heatstart"]
        self.assertEqual(self.domain.detail(self.db,cross["id"],self.owner["id"])["target_url"], "")
