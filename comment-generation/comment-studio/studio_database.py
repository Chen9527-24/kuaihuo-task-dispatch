"""Initialize the generation tables and import a stopped legacy workspace atomically."""
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3


TABLES = {
    "sessions": "token TEXT PRIMARY KEY, owner TEXT NOT NULL",
    "accounts": "id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL",
    "tasks": "id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL",
    "requests": "owner TEXT, key TEXT, action TEXT, task TEXT, PRIMARY KEY(owner,key)",
    "assets": "id TEXT PRIMARY KEY, data TEXT NOT NULL",
    "aliases": "id TEXT PRIMARY KEY, asset TEXT NOT NULL",
    "usage": "id INTEGER PRIMARY KEY, owner TEXT, task TEXT, stage TEXT, provider TEXT, at REAL, units REAL, amount REAL, status TEXT, detail TEXT",
}


def acquire_lock(path):
    handle = path.open("a+b")
    try:
        if os.name == "nt":
            import msvcrt
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        raise ValueError("此数据目录或数据库已有一个工作台在运行。") from None
    return handle


def bound_shared_database(db):
    # Both writers must observe the same disk limit as the public dispatch service.
    size = db.execute("PRAGMA page_size").fetchone()[0]
    db.execute(f"PRAGMA max_page_count={64 * 1024 * 1024 // size}").fetchone()
    db.execute("PRAGMA foreign_keys=ON")


def table_names(db, schema):
    return {row[0] for row in db.execute(f"SELECT name FROM {schema}.sqlite_master WHERE type='table'")}


def legacy_prefix(tables):
    if all("studio_" + key in tables for key in TABLES):
        return "studio_"
    if all(key in tables for key in TABLES):
        return ""
    raise ValueError("旧生成数据库的表不完整，迁移已经停止。")


def counts_and_digest(db, prefix):
    checksum = hashlib.sha256()
    counts = {}
    for table in TABLES:
        count = 0
        checksum.update(table.encode())
        for row in db.execute(f"SELECT * FROM legacy.{prefix}{table} ORDER BY rowid"):
            checksum.update(json.dumps(row, ensure_ascii=True, separators=(",", ":")).encode())
            checksum.update(b"\n")
            count += 1
        counts[table] = count
    return counts, checksum.hexdigest()


def import_legacy(db):
    prefix = legacy_prefix(table_names(db, "legacy"))
    counts, signature = counts_and_digest(db, prefix)
    previous = db.execute("SELECT fingerprint FROM studio_imports WHERE name='legacy-workspace-v1'").fetchone()
    if previous:
        if previous[0] != signature:
            raise ValueError("旧生成数据库在导入后又有写入，已停止以避免漏迁。")
        return counts
    for table in TABLES:
        dest = "studio_" + table
        source = f"legacy.{prefix}{table}"
        if db.execute(f"SELECT 1 FROM {dest} LIMIT 1").fetchone():
            raise ValueError("目标库已有未经迁移登记的生成数据，已停止以避免覆盖。")
        old_cols = [r[1] for r in db.execute(f"PRAGMA legacy.table_info({prefix}{table})")]
        new_cols = [r[1] for r in db.execute(f"PRAGMA main.table_info({dest})")]
        if old_cols != new_cols:
            raise ValueError("旧生成数据库列定义不兼容：" + table)
        db.execute(f"INSERT INTO {dest} SELECT * FROM {source} ORDER BY rowid")
        if db.execute(f"SELECT count(*) FROM {dest}").fetchone()[0] != counts[table] or db.execute(
            f"SELECT * FROM {source} EXCEPT SELECT * FROM {dest} LIMIT 1"
        ).fetchone():
            raise ValueError("导入校验失败：" + table)
    for task_id, owner, raw in db.execute("SELECT id,owner,data FROM studio_tasks"):
        task = json.loads(raw)
        if task["id"] != task_id or task["_owner"] != owner:
            raise ValueError("旧任务的身份或归属不一致，迁移已撤回。")
    db.execute("INSERT INTO studio_imports VALUES ('legacy-workspace-v1',?,?)", (signature, json.dumps(counts)))
    return counts


def initialize(database, legacy_database=None):
    database = Path(database).resolve()
    legacy_database = Path(legacy_database).resolve() if legacy_database else None
    if legacy_database is not None and database == legacy_database:
        raise ValueError("共享库必须与旧生成数据库使用不同路径。")
    db = sqlite3.connect(database.as_uri(), uri=True, timeout=30)
    try:
        with db:
            if legacy_database is not None:
                bound_shared_database(db)
            db.execute("PRAGMA journal_mode=WAL")
            has_legacy = legacy_database is not None and legacy_database.is_file()
            if has_legacy:
                db.execute("ATTACH DATABASE ? AS legacy", (legacy_database.as_uri() + "?mode=ro",))
            db.execute("BEGIN IMMEDIATE")
            tables = table_names(db, "main")
            if legacy_database is None and "sessions" in tables and "studio_sessions" not in tables:
                # A standalone installation continues in place with the new table names.
                if legacy_prefix(tables) != "":
                    raise ValueError("旧库表名冲突。")
                for table in TABLES:
                    db.execute(f"ALTER TABLE {table} RENAME TO studio_{table}")
            for table, columns in TABLES.items():
                db.execute(f"CREATE TABLE IF NOT EXISTS studio_{table} ({columns})")
            db.execute("CREATE INDEX IF NOT EXISTS studio_task_owner ON studio_tasks(owner)")
            db.execute("CREATE INDEX IF NOT EXISTS studio_account_owner ON studio_accounts(owner)")
            db.execute("CREATE INDEX IF NOT EXISTS studio_usage_at ON studio_usage(at)")
            db.execute("CREATE TABLE IF NOT EXISTS studio_imports(name TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,counts TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS studio_legacy_claims(owner TEXT PRIMARY KEY,publisher INTEGER NOT NULL,summary TEXT NOT NULL)")
            return import_legacy(db) if has_legacy else {}
    finally:
        db.close()


def legacy_workspace(db, token, publisher_id, *, claim):
    """Caller authenticates the publisher; the old browser supplies an independent proof of ownership."""
    if type(publisher_id) is not int or publisher_id <= 0:
        raise ValueError("需要先登录发布者账号。")
    empty = {"tasks": 0, "accounts": 0, "usage": 0, "claimed": False}
    if not isinstance(token, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{43}", token):
        return empty
    db.execute("BEGIN IMMEDIATE" if claim else "BEGIN")
    publisher = db.execute("SELECT role FROM accounts WHERE id=? AND disabled=0", (publisher_id,)).fetchone()
    if not publisher or publisher[0] not in ("admin", "user"):
        raise ValueError("请登录正式账号后归入历史记录。")
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = db.execute("SELECT owner FROM studio_sessions WHERE token=?", (token_hash,)).fetchone()
    if not row or not re.fullmatch(r"[a-f0-9]{32}", row[0]):
        return empty
    old_owner = row[0]
    previous = db.execute("SELECT publisher,summary FROM studio_legacy_claims WHERE owner=?", (old_owner,)).fetchone()
    if previous:
        return json.loads(previous[1]) if previous[0] == publisher_id else empty
    summary = {
        table: db.execute(f"SELECT count(*) FROM studio_{table} WHERE owner=?", (old_owner,)).fetchone()[0]
        for table in ("tasks", "accounts", "usage")
    }
    summary["claimed"] = False
    if not claim or not any(summary.values()):
        return summary
    new_owner = f"publisher:{publisher_id}"
    tasks = db.execute("SELECT id,data FROM studio_tasks WHERE owner=?", (old_owner,)).fetchall()
    for task_id, raw in tasks:
        task = json.loads(raw)
        if task["status"] in ("queued", "running"):
            raise ValueError("请等待旧工作台任务完成后再归入。")
        task["_owner"] = new_owner
        db.execute("UPDATE studio_tasks SET owner=?,data=? WHERE id=? AND owner=?",
                   (new_owner, json.dumps(task, ensure_ascii=False), task_id, old_owner))
        if task.get("_key") and not task.get("_uploaded"):
            # Published links can still reuse their original media and transcript after the owner changes.
            def alias(owner):
                return hashlib.sha256((owner + "/" + task["_key"]).encode()).hexdigest()
            db.execute("INSERT OR IGNORE INTO studio_aliases(id,asset) SELECT ?,asset FROM studio_aliases WHERE id=?",
                       (alias(new_owner), alias(old_owner)))
    for table in ("accounts", "usage"):
        db.execute(f"UPDATE studio_{table} SET owner=? WHERE owner=?", (new_owner, old_owner))
    # A pre-existing request key has priority on this account; preserve conflicting audit rows under the old owner.
    db.execute("""UPDATE studio_requests AS old SET owner=? WHERE owner=?
                  AND NOT EXISTS (SELECT 1 FROM studio_requests AS current
                                  WHERE current.owner=? AND current.key=old.key)""", (new_owner, old_owner, new_owner))
    summary["claimed"] = True
    db.execute("INSERT INTO studio_legacy_claims VALUES(?,?,?)", (old_owner, publisher_id, json.dumps(summary)))
    return summary


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="将已停止的生成数据库导入现有分发数据库")
    parser.add_argument("legacy", type=Path)
    parser.add_argument("dispatch", type=Path)
    args = parser.parse_args()
    if not args.legacy.is_file() or not args.dispatch.is_file():
        parser.error("请提供两份现有的数据库文件。")
    check_db = sqlite3.connect(args.dispatch.resolve().as_uri() + "?mode=ro", uri=True)
    try:
        if not {"username", "role", "password_hash"}.issubset(
            r[1] for r in check_db.execute("PRAGMA table_info(accounts)")
        ):
            parser.error("目标必须是现有分发库。")
    finally:
        check_db.close()
    with acquire_lock(args.legacy.parent / "service.lock"), acquire_lock(args.dispatch.with_name(args.dispatch.name + ".studio.lock")):
        print(json.dumps(initialize(args.dispatch, args.legacy), ensure_ascii=False))
