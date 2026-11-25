"""Local comment pool, adapted from the task publication and comment allocation flow."""
import re
from urllib.parse import urlsplit


class DomainError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def initialize(db):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY, title TEXT NOT NULL, instructions TEXT NOT NULL,
            target_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft'
                CHECK(status IN ('draft','open','paused','closed'))
        );
        CREATE TABLE IF NOT EXISTS visits (
            task_id INTEGER NOT NULL REFERENCES tasks(id), visitor TEXT NOT NULL, name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            PRIMARY KEY(task_id, visitor)
        );
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id),
            content TEXT NOT NULL, visitor TEXT,
            UNIQUE(task_id, visitor), UNIQUE(task_id, content)
        );
    """)


def text(value, label, maximum, required=False):
    if not isinstance(value, str) or (required and not value.strip()):
        raise DomainError(400, f"请填写{label}")
    value = value.strip()
    if len(value) > maximum:
        raise DomainError(400, f"{label}最多 {maximum} 个字符")
    return value


def task_values(body):
    title = text(body.get("title"), "标题", 120, required=True)
    instructions = text(body.get("instructions", ""), "领取说明", 5000)
    url = text(body.get("target_url", ""), "目标链接", 2048)
    if url:
        try:
            parts = urlsplit(url)
            # urlsplit validates numeric ports lazily when the port is read.
            port = parts.port
            valid = (parts.scheme in ("http", "https") and parts.hostname and port != 0
                     and not parts.username and not parts.password)
        except ValueError:
            valid = False
        if not valid or any(c.isspace() or ord(c) < 32 or c == "\\" for c in url):
            raise DomainError(400, "请填写完整的 http 或 https 链接")
    pool = body.get("comments")
    if not isinstance(pool, list) or len(pool) > 1000:
        raise DomainError(400, "每份任务可保存最多 1000 条评论")
    pool = [text(item, "每条评论", 2000, required=True) for item in pool]
    if len(set(pool)) != len(pool):
        raise DomainError(400, "请删除重复的评论文案")
    return (title, instructions, url), pool


TASK_SELECT = """
    SELECT t.*, COUNT(c.id) AS total, COUNT(c.visitor) AS claimed,
           COUNT(c.id)-COUNT(c.visitor) AS remaining
    FROM tasks t LEFT JOIN comments c ON c.task_id=t.id
"""


def detail(db, task_id, private=False):
    row = db.execute(TASK_SELECT + " WHERE t.id=? GROUP BY t.id", (task_id,)).fetchone()
    if not row or (not private and row["status"] == "draft"):
        raise DomainError(404, "未找到已发布的任务")
    task = dict(row)
    if private:
        task["visitors"] = [dict(r) for r in db.execute("""
            SELECT v.name, v.created_at, c.content AS comment, c.id IS NOT NULL AS has_comment
            FROM visits v LEFT JOIN comments c ON c.task_id=v.task_id AND c.visitor=v.visitor
            WHERE v.task_id=? ORDER BY v.created_at, v.rowid""", (task_id,))]
        for visit in task["visitors"]:
            visit["has_comment"] = bool(visit["has_comment"])
        task["comments"] = [r[0] for r in db.execute(
            "SELECT content FROM comments WHERE task_id=? ORDER BY id", (task_id,))]
    return task


def save(db, body, task_id=None):
    values, pool = task_values(body)
    if task_id is None:
        task_id = db.execute(
            "INSERT INTO tasks(title,instructions,target_url) VALUES (?,?,?)", values).lastrowid
    else:
        if detail(db, task_id, private=True)["status"] != "draft":
            raise DomainError(409, "只有草稿可以修改")
        db.execute("UPDATE tasks SET title=?,instructions=?,target_url=? WHERE id=?", (*values, task_id))
        db.execute("DELETE FROM comments WHERE task_id=?", (task_id,))
    db.executemany("INSERT INTO comments(task_id,content) VALUES (?,?)", ((task_id, c) for c in pool))
    return {"task": detail(db, task_id, private=True)}


TRANSITIONS = {
    "publish": (("draft",), "open"),
    "pause": (("open",), "paused"),
    "resume": (("paused",), "open"),
    "close": (("open","paused"), "closed"),
}


def change_status(db, task_id, action):
    task = detail(db, task_id, private=True)
    allowed, next_status = TRANSITIONS[action]
    if task["status"] not in allowed:
        raise DomainError(409, "当前任务状态无法进行此操作")
    if action == "publish" and not task["target_url"]:
        raise DomainError(409, "发布前请填写视频链接")
    if action == "publish" and not task["total"]:
        raise DomainError(409, "发布前请至少添加一条评论")
    db.execute("UPDATE tasks SET status=? WHERE id=?", (next_status, task_id))
    return {"task": detail(db, task_id, private=True)}


def public(db, task_id, visitor, action, body):
    task = detail(db, task_id)
    # Never disclose the video destination through the public task object.
    video = task.pop("target_url")
    row = db.execute("SELECT name FROM visits WHERE task_id=? AND visitor=?",
                     (task_id, visitor)).fetchone()
    visit = {"name": row["name"], "video_url": video} if row else None
    owned = db.execute("SELECT content FROM comments WHERE task_id=? AND visitor=?",
                       (task_id, visitor)).fetchone() if visit else None
    claim = {"comment": owned["content"]} if owned else None
    if not action:
        return {"task": task, "visit": visit, "claim": claim}
    if not visitor:
        raise DomainError(409, "请先打开任务链接并允许浏览器保存本站 Cookie")
    if action == "video" and visit:
        return visit
    if action == "claim" and claim:
        return claim
    if action == "claim" and not visit:
        raise DomainError(409, "请先填写访客名称并领取视频链接")
    if task["status"] != "open":
        raise DomainError(409, "当前任务已暂停或已关闭领取")
    if not task["remaining"]:
        raise DomainError(409, "该任务的评论已被领完")
    if action == "video":
        name = text(body.get("name"), "访客名称", 32, required=True)
        if not name.isprintable():
            raise DomainError(400, "访客名称请使用可显示字符")
        db.execute("INSERT INTO visits(task_id,visitor,name) VALUES (?,?,?)", (task_id, visitor, name))
        return {"name": name, "video_url": video}
    row = db.execute("SELECT id, content FROM comments WHERE task_id=? AND visitor IS NULL ORDER BY id LIMIT 1",
                     (task_id,)).fetchone()
    db.execute("UPDATE comments SET visitor=? WHERE id=?", (visitor, row["id"]))
    return {"comment": row["content"]}


def route(db, method, path, body, admin, visitor):
    match = re.fullmatch(r"/api/public/([1-9][0-9]{0,17})(?:/(claim|video))?", path)
    if match:
        task_id, action = match.groups()
        if method != ("POST" if action else "GET"):
            raise DomainError(405, "请求方式有误")
        return public(db, int(task_id), visitor, action, body)
    match = re.fullmatch(r"/api/tasks(?:/([1-9][0-9]{0,17})(?:/(edit|publish|pause|resume|close))?)?", path)
    if not match:
        raise DomainError(404, "未找到该页面")
    if not admin:
        raise DomainError(401, "请使用启动终端中的发布者入口")
    raw_id, action = match.groups()
    if raw_id is None:
        if method == "GET":
            return {"tasks": [dict(row) for row in db.execute(TASK_SELECT + " GROUP BY t.id ORDER BY t.id DESC")]}
        if method == "POST":
            return save(db, body)
    elif not action and method == "GET":
        return {"task": detail(db, int(raw_id), private=True)}
    elif method == "POST" and action:
        return save(db, body, int(raw_id)) if action == "edit" else change_status(db, int(raw_id), action)
    raise DomainError(405, "请求方式有误")


def handle(db, method, path, body, admin=False, visitor=None):
    # Serialize writers before reading available comments so the last slot can
    # only be allocated once. Repeated claims by a browser return its own text.
    db.execute("BEGIN IMMEDIATE" if method == "POST" else "BEGIN")
    try:
        result = route(db, method, path, body, admin, visitor)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
