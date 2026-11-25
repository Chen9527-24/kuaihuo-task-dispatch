"""Saved generation collections and the atomic handoff to a shared dispatch database."""
import json
import sqlite3
import uuid

PLATFORMS = {"抖音": "douyin", "小红书": "xiaohongshu", "快手": "kuaishou"}


def initialize(db):
    db.execute("""
        CREATE TABLE IF NOT EXISTS studio_collections (
            generation_id TEXT NOT NULL REFERENCES studio_tasks(id),
            batch_id TEXT NOT NULL, platform TEXT NOT NULL,
            revision INTEGER NOT NULL, rows_json TEXT NOT NULL,
            PRIMARY KEY(generation_id,batch_id,platform)
        )
    """)


def _original_rows(batch, platform):
    return [dict(row, id=f"generated-{i}") for i, row in enumerate(batch["rows"])
            if row["platform"] == platform]


def _id_groups(task_ids):
    ids = list(dict.fromkeys(task_ids))
    for start in range(0, len(ids), 300):
        chunk = ids[start:start + 300]
        yield chunk, ",".join("?" for _ in chunk)


def collection_counts(db, task_ids):
    result = {}
    for chunk, marks in _id_groups(task_ids):
        edited = db.execute(f"""
            SELECT generation_id,batch_id,platform,json_array_length(rows_json)
            FROM studio_collections WHERE generation_id IN ({marks})
        """, chunk)
        for task_id, batch, platform, count in edited:
            result[(task_id, batch, platform)] = count
    return result


def task_links(db, task_ids):
    """Attach only links for generation tasks already visible to this caller."""
    result = {}
    for chunk, marks in _id_groups(task_ids):
        links = db.execute(f"""
            SELECT g.generation_id, g.batch_id, g.platform, g.dispatch_id, t.status,
                   count(c.id), count(c.visitor)
            FROM generation_origins g JOIN tasks t ON t.id=g.dispatch_id
            LEFT JOIN comments c ON c.task_id=t.id
            WHERE g.generation_id IN ({marks}) GROUP BY t.id ORDER BY t.id
        """, chunk)
        for generation_id, batch_id, platform, task_id, status, total, claimed in links:
            result.setdefault(generation_id, []).append(dict(
                id=task_id, batchId=batch_id, platform=platform, status=status,
                total=total, claimed=claimed, remaining=total-claimed))
    return result


def decorate_task(db, task):
    """Overlay saved rows on the public copy, leaving the worker's model output intact."""
    links = task_links(db, [task["id"]]).get(task["id"], [])
    by_group = {(entry["batchId"], entry["platform"]): entry for entry in links}
    edits = {(bid, platform): (version, json.loads(rows)) for bid, platform, version, rows in
             db.execute("SELECT batch_id,platform,revision,rows_json FROM studio_collections WHERE generation_id=?",
                        (task["id"],))}
    batches = []
    for batch in task.get("batches", []):
        bid = batch["id"]
        platforms = dict.fromkeys(row["platform"] for row in batch["rows"])
        platforms.update(dict.fromkeys((batch.get("options") or {}).get("platforms") or {}))
        merged, collections = [], {}
        for platform in platforms:
            version, rows = edits.get((bid, platform), (0, None))
            merged.extend(_original_rows(batch, platform) if rows is None else rows)
            collections[platform] = dict(version=version, heatstart=by_group.get((bid, platform)))
        batches.append(dict(batch, rows=merged, collections=collections))
    task.update(batches=batches, heatstarts=links)
    return task


def _resolve(db, actor, task_id, batch_id, platform, dispatch):
    actor_id = actor.get("id") if actor else None
    current = db.execute("SELECT role FROM accounts WHERE id=? AND disabled=0", (actor_id,)).fetchone()
    if not current:
        raise dispatch.DomainError(401, "请先登录工作台")
    source = db.execute("SELECT owner,data FROM studio_tasks WHERE id=?", (task_id,)).fetchone()
    if not source or (source[0] != f"publisher:{actor_id}" and current[0] != "admin"):
        raise dispatch.DomainError(404, "找不到该生成任务")
    prefix, sep, owner = source[0].partition(":")
    if prefix != "publisher" or not sep or not owner.isdecimal():
        raise dispatch.DomainError(409, "请先绑定这条历史生成记录")
    task = json.loads(source[1])
    batch = next((b for b in task["batches"] if b["id"] == batch_id), None)
    if not batch or not isinstance(platform, str) or platform not in PLATFORMS:
        raise dispatch.DomainError(404, "没有这个批次或平台的评论")
    original = _original_rows(batch, platform)
    if not original and platform not in (batch.get("options") or {}).get("platforms", {}):
        raise dispatch.DomainError(404, "该批次没有这个平台的评论")
    return int(owner), task, batch, original


def _edit(current_rows, changes, platform, dispatch):
    if not isinstance(changes, list) or len(changes) > 1000 or any(not isinstance(item, dict) for item in changes):
        raise dispatch.DomainError(400, "请提交最多 1000 条评论")
    texts = dispatch.comment_values([item.get("text") for item in changes])
    existing = {row["id"]: row for row in current_rows}
    result = []
    for item, text in zip(changes, texts):
        row_id = item.get("id")
        if row_id is None:
            row = dict(id=uuid.uuid4().hex, platform=platform, type="主评论", reply="", advice="")
        elif isinstance(row_id, str) and row_id in existing:
            row = existing.pop(row_id)
        else:
            raise dispatch.DomainError(409, "评论已变化，请重新打开评论集")
        result.append(dict(row, text=text))
    return result


def handle(db, actor, task_id, batch_id, platform, action, body=None, *, dispatch, authorize=None):
    """Read, save or create against one publisher-owned collection in one transaction."""
    if action not in ("read", "save", "create"):
        raise dispatch.DomainError(405, "请求方式有误")
    if body is None:
        body = {}
    if not isinstance(body, dict):
        raise dispatch.DomainError(400, "请求内容有误")
    db.row_factory = sqlite3.Row
    with db:
        db.execute("BEGIN" if action == "read" else "BEGIN IMMEDIATE")
        if authorize:
            current = authorize(db)
            if not current or current["id"] != actor["id"]:
                raise dispatch.DomainError(401, "登录状态已变更，请重新登录工作台")
            actor = current
        owner, task, batch, rows = _resolve(db, actor, task_id, batch_id, platform, dispatch)
        key = (task_id, batch_id, platform)
        stored = db.execute("""
            SELECT revision,rows_json FROM studio_collections
            WHERE generation_id=? AND batch_id=? AND platform=?
        """, key).fetchone()
        version = 0
        if stored:
            version, raw = stored
            rows = json.loads(raw)
        links = task_links(db, [task_id]).get(task_id, [])
        heat = next((entry for entry in links if entry["batchId"] == batch_id and entry["platform"] == platform), None)
        if action == "save" and heat:
            raise dispatch.DomainError(409, "已创建热启动，请进入该任务管理评论")
        if action == "save" or (action == "create" and not heat):
            if type(body.get("version")) is not int or body["version"] != version:
                raise dispatch.DomainError(409, "评论集已更新，请重新载入后再操作")
        if action == "save":
            updated = _edit(rows, body.get("rows"), platform, dispatch)
            if updated != rows:
                rows, version = updated, version+1
                db.execute("""
                    INSERT INTO studio_collections(generation_id,batch_id,platform,revision,rows_json)
                    VALUES (?,?,?,?,?) ON CONFLICT(generation_id,batch_id,platform)
                    DO UPDATE SET revision=excluded.revision,rows_json=excluded.rows_json
                """, (*key, version, json.dumps(rows, ensure_ascii=False, separators=(",", ":"))))
        if action == "create" and not heat:
            if not rows:
                raise dispatch.DomainError(400, "请先添加至少一条主评论")
            source = task.get("source", "") if task.get("mode") == "link" and task.get("platform") == platform else ""
            title = task.get("title") or (batch.get("options") or {}).get("title") or platform+"热启动"
            draft = dispatch.save(db, {
                "title": title[:120], "target_url": source, "target_platform": PLATFORMS[platform],
                "comments": [row["text"] for row in rows],
            }, owner, generated_share=True)["task"]
            account = batch.get("account") or {}
            db.execute("""
                INSERT INTO generation_origins(dispatch_id,generation_id,batch_id,platform,
                                              video_account_id,video_account_name) VALUES (?,?,?,?,?,?)
            """, (draft["id"], *key, account.get("id", ""), account.get("name", "")))
            heat = dict(id=draft["id"], batchId=batch_id, platform=platform, status=draft["status"],
                        total=draft["total"], claimed=draft["claimed"], remaining=draft["remaining"])
        return dict(platform=platform, batchId=batch_id, version=version, rows=rows, heatstart=heat)
