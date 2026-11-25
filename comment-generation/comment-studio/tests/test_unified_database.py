import concurrent.futures
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import studio_database
from workflow import Studio


class UnifiedDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.old = self.root / "studio.sqlite3"
        self.shared = self.root / "dispatch.sqlite3"
        self.owner = "a" * 32
        self.token = secrets.token_urlsafe(32)
        self.data = {"id": "task", "_owner": self.owner, "status": "ready", "_key": "douyin/video/001"}
        with sqlite3.connect(str(self.old)) as db:
            for table, columns in studio_database.TABLES.items():
                db.execute(f"CREATE TABLE {table} ({columns})")
            db.execute("INSERT INTO sessions VALUES (?,?)", (hashlib.sha256(self.token.encode()).hexdigest(), self.owner))
            db.execute("INSERT INTO tasks VALUES ('task',?,?)", (self.owner, json.dumps(self.data)))
            db.execute("INSERT INTO accounts VALUES ('profile',?,'{}')", (self.owner,))
            db.execute("INSERT INTO requests VALUES (?,'create-id','create','task')", (self.owner,))
            db.execute("INSERT INTO usage(owner,task,detail,status) VALUES (?,'task','{}','measured')", (self.owner,))
            db.execute("INSERT INTO assets VALUES ('asset','{}')")
            self.alias = lambda owner: hashlib.sha256((owner + "/" + self.data["_key"]).encode()).hexdigest()
            db.execute("INSERT INTO aliases VALUES (?,'asset')", (self.alias(self.owner),))
        with sqlite3.connect(str(self.shared)) as db:
            db.executescript("""
                CREATE TABLE accounts (id INTEGER PRIMARY KEY,username TEXT,role TEXT,disabled INTEGER DEFAULT 0);
                INSERT INTO accounts(id,username,role) VALUES (1,'admin','admin'),(2,'user','user'),(3,NULL,'guest');
                CREATE TABLE tasks(id INTEGER PRIMARY KEY, owner_id INTEGER, title TEXT);
                INSERT INTO tasks VALUES (77,2,'already published');
            """)

    def test_import_and_concurrent_claim(self):
        original = self.old.read_bytes()
        with patch.dict("os.environ", {"COMMENT_SHARED_DB": str(self.shared)}):
            app = Studio(self.root)
            self.addCleanup(app.close)
            self.assertEqual(app.legacy_summary(self.token, 1), {"tasks":1,"accounts":1,"usage":1,"claimed":False})
            self.assertEqual(app.legacy_summary("no", 1)["tasks"], 0)
            with self.assertRaisesRegex(ValueError, "正式账号"):
                app.claim_legacy(self.token, 3)
            with concurrent.futures.ThreadPoolExecutor(2) as pool:
                results = list(pool.map(lambda user: app.claim_legacy(self.token, user), (1, 2)))
            self.assertEqual(sum(r["claimed"] for r in results), 1)
            winner = 1 if results[0]["claimed"] else 2
            new_owner = f"publisher:{winner}"
            self.assertEqual(app.claim_legacy(self.token, winner), results[winner - 1])
            with app.db() as db:
                row = db.execute("SELECT owner,data FROM studio_tasks").fetchone()
                self.assertEqual((row[0], json.loads(row[1])["_owner"]), (new_owner, new_owner))
                for table in ("accounts", "requests", "usage"):
                    self.assertEqual(db.execute(f"SELECT owner FROM studio_{table}").fetchone()[0], new_owner)
                self.assertEqual(db.execute("SELECT asset FROM studio_aliases WHERE id=?", (self.alias(new_owner),)).fetchone()[0], "asset")
                self.assertEqual(db.execute("SELECT owner_id,title FROM tasks").fetchone(), (2, "already published"))
                self.assertEqual(db.execute("SELECT count(*) FROM accounts").fetchone()[0], 3)
            self.assertEqual(app.usage(None)[0]["publisherId"], winner)
            self.assertNotIn("owner", app.usage(None)[0])
            self.assertEqual(app.usage(f"publisher:{3 - winner}"), [])
            self.assertEqual(studio_database.initialize(self.shared, self.old)["tasks"], 1)
            self.assertEqual(self.old.read_bytes(), original)

    def test_invalid_ownership_rolls_back_every_table(self):
        with sqlite3.connect(str(self.old)) as db:
            db.execute("UPDATE tasks SET owner='wrong'")
        with self.assertRaisesRegex(ValueError, "归属"):
            studio_database.initialize(self.shared, self.old)
        with sqlite3.connect(str(self.shared)) as db:
            self.assertNotIn("studio_tasks", studio_database.table_names(db, "main"))
            self.assertEqual(db.execute("SELECT count(*) FROM tasks").fetchone()[0], 1)

    def test_migrated_source_change_is_detected(self):
        studio_database.initialize(self.shared, self.old)
        with sqlite3.connect(str(self.old)) as db:
            db.execute("UPDATE accounts SET data='new data'")
        with self.assertRaisesRegex(ValueError, "又有写入"):
            studio_database.initialize(self.shared, self.old)

    def test_standalone_legacy_in_place(self):
        studio_database.initialize(self.old)
        studio_database.initialize(self.old)
        with sqlite3.connect(str(self.old)) as db:
            self.assertEqual(db.execute("SELECT data FROM studio_tasks").fetchone()[0], json.dumps(self.data))
            self.assertNotIn("tasks", studio_database.table_names(db, "main"))
