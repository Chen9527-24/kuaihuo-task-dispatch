"""Local comment pool, adapted from the task publication and comment allocation flow."""
import hashlib
import json
import re
from urllib.parse import urlsplit


TARGET_PLATFORMS = ("douyin", "xiaohongshu", "kuaishou", "wechat_channels", "other")
PLATFORM_HOSTS = {
    "douyin": ("douyin.com", "iesdouyin.com"),
    "xiaohongshu": ("xiaohongshu.com", "xhslink.com", "xhslink.cn"),
    "kuaishou": ("kuaishou.com",),
    "wechat_channels": ("channels.weixin.qq.com", "finder.video.qq.com"),
}


class DomainError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def initialize(db):
    import accounts
    accounts.initialize(db)
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
        CREATE TABLE IF NOT EXISTS generation_origins (
            dispatch_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
            generation_id TEXT NOT NULL, batch_id TEXT NOT NULL, platform TEXT NOT NULL,
            video_account_id TEXT NOT NULL, video_account_name TEXT NOT NULL,
            UNIQUE(generation_id,batch_id,platform)
        );
        CREATE TABLE IF NOT EXISTS task_create_requests (
            owner_id INTEGER NOT NULL REFERENCES accounts(id), request_id TEXT NOT NULL,
            dispatch_id INTEGER NOT NULL REFERENCES tasks(id), fingerprint TEXT NOT NULL,
            PRIMARY KEY(owner_id,request_id)
        );
    """)
    with db:
        db.execute("BEGIN IMMEDIATE")
        columns = {r[1] for r in db.execute("PRAGMA table_info(tasks)")}
        if "owner_id" not in columns:
            db.execute("ALTER TABLE tasks ADD COLUMN owner_id INTEGER REFERENCES accounts(id)")
        if "platform_enabled" not in columns:
            db.execute("ALTER TABLE tasks ADD COLUMN platform_enabled INTEGER NOT NULL DEFAULT 1 CHECK(platform_enabled IN (0,1))")
        if "target_platform" not in columns:
            db.execute("""ALTER TABLE tasks ADD COLUMN target_platform TEXT
                       CHECK(target_platform IN ('douyin','xiaohongshu','wechat_channels','other'))""")
        if "comments_revision" not in columns:
            db.execute("ALTER TABLE tasks ADD COLUMN comments_revision INTEGER NOT NULL DEFAULT 0")
        # Deployed databases constrain the original column to four legacy codes.
        # Store the more specific platform for newer clients without rebuilding tasks.
        if "platform_variant" not in columns:
            db.execute("ALTER TABLE tasks ADD COLUMN platform_variant TEXT CHECK(platform_variant='kuaishou')")
        db.execute("UPDATE tasks SET owner_id=(SELECT id FROM accounts WHERE role='admin') WHERE owner_id IS NULL")
        db.execute("CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(owner_id,id)")


def text(value, label, maximum, required=False):
    if not isinstance(value, str) or (required and not value.strip()):
        raise DomainError(400, f"请填写{label}")
    value = value.strip()
    if len(value) > maximum:
        raise DomainError(400, f"{label}最多 {maximum} 个字符")
    return value


def web_target(value):
    if not value.lower().startswith(("https://", "http://")) or any(
            c.isspace() or ord(c) < 32 or c == "\\" or c == "\x7f" for c in value):
        return None
    try:
        parts = urlsplit(value)
        # Reading port also checks its numeric value and range.
        if not parts.hostname or parts.port == 0 or parts.username is not None or parts.password is not None:
            return None
        if parts.netloc.startswith("["):
            # urlsplit validates the bracketed IP, but ignores trailing non-port text.
            if not re.fullmatch(r"\[[^]]+\](?::[0-9]+)?", parts.netloc):
                return None
        elif not re.fullmatch(rb"[a-zA-Z0-9._-]+", parts.hostname.encode("idna")):
            return None
        return parts
    except ValueError:
        pass
    return None


def inferred_platform(value):
    # Existing tasks and older clients supplied a URL without an explicit platform.
    parts = web_target(value)
    if parts:
        host = parts.hostname.lower().rstrip(".")
        for platform, domains in PLATFORM_HOSTS.items():
            if any(host == name or host.endswith("." + name) for name in domains):
                return platform
        if host == "weixin.qq.com" and parts.path.startswith(("/sph/", "/finder/")):
            return "wechat_channels"
    return "other"


def task_values(body, stored_platform=None, share_limit=5000):
    title = text(body.get("title"), "标题", 120, required=True)
    instructions = text(body.get("instructions", ""), "领取说明", 5000)
    platform = body.get("target_platform", stored_platform)
    if "target_platform" in body and platform not in TARGET_PLATFORMS:
        raise DomainError(400, "请选择作品平台")
    target = body.get("target_url", "")
    if not isinstance(target, str) or len(target) > share_limit:
        raise DomainError(400, f"作品分享内容最多 {share_limit} 个字符")
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ud800-\udfff]", target):
        raise DomainError(400, "作品分享内容包含无效字符")
    if not target.strip():
        target = ""
    if (platform or inferred_platform(target)) == "wechat_channels" and target:
        target = text(target, "视频号链接", 2048)
        if not web_target(target):
            raise DomainError(400, "请填写完整的 http 或 https 视频号链接")
    return (title, instructions, target, platform), comment_values(body.get("comments"))


def comment_values(pool):
    if not isinstance(pool, list) or len(pool) > 1000:
        raise DomainError(400, "每份任务可保存最多 1000 条评论")
    pool = [text(item, "每条评论", 2000, required=True) for item in pool]
    if len(set(pool)) != len(pool):
        raise DomainError(400, "请删除重复的评论文案")
    return pool


TASK_SELECT = """
    SELECT t.id,t.title,t.instructions,t.target_url,COALESCE(t.platform_variant,t.target_platform) AS target_platform,
           t.status,t.platform_enabled,t.comments_revision,
           g.generation_id,g.batch_id,g.video_account_id,g.video_account_name,
           a.id AS owner_id,a.username AS owner_username,a.role AS owner_role,a.disabled AS owner_disabled,
           COUNT(c.id) AS total, COUNT(c.visitor) AS claimed,
           COUNT(c.id)-COUNT(c.visitor) AS remaining
    FROM tasks t JOIN accounts a ON a.id=t.owner_id LEFT JOIN comments c ON c.task_id=t.id
    LEFT JOIN generation_origins g ON g.dispatch_id=t.id
"""


def task_info(row):
    task = dict(row)
    task.pop("comments_revision")
    generation = task.pop("generation_id")
    batch = task.pop("batch_id")
    account = task.pop("video_account_id")
    account_name = task.pop("video_account_name")
    if generation:
        task["origin"] = dict(generationId=generation, batchId=batch, videoAccountId=account, videoAccountName=account_name)
    if task["target_platform"] is None:
        task["target_platform"] = inferred_platform(task["target_url"])
    task["platform_enabled"] = bool(task["platform_enabled"])
    task["owner_disabled"] = bool(task["owner_disabled"])
    return task


def list_tasks(db, owner_id):
    query = TASK_SELECT
    args = ()
    if owner_id is not None:
        query += " WHERE t.owner_id=?"
        args = (owner_id,)
    rows = db.execute(query + " GROUP BY t.id ORDER BY t.id DESC", args)
    return [task_info(row) for row in rows]


def detail(db, task_id, owner_id=None):
    private = owner_id is not None
    where, params = (" WHERE t.id=? AND t.owner_id=?", (task_id, owner_id)) if private else (" WHERE t.id=?", (task_id,))
    row = db.execute(TASK_SELECT + where + " GROUP BY t.id", params).fetchone()
    if not row or (not private and row["status"] == "draft"):
        raise DomainError(404, "未找到已发布的任务")
    task = task_info(row)
    if private:
        task["visitors"] = [dict(r) for r in db.execute("""
            SELECT v.name, v.created_at, c.content AS comment, c.id IS NOT NULL AS has_comment
            FROM visits v LEFT JOIN comments c ON c.task_id=v.task_id AND c.visitor=v.visitor
            WHERE v.task_id=? ORDER BY v.created_at, v.rowid""", (task_id,))]
        for visit in task["visitors"]:
            visit["has_comment"] = bool(visit["has_comment"])
        pool = db.execute("SELECT content, visitor IS NOT NULL FROM comments WHERE task_id=? ORDER BY id",
                          (task_id,)).fetchall()
        task["comments"] = [content for content, locked in pool]
        task["locked_comments"] = [content for content, locked in pool if locked]
        task["comments_version"] = f"{task_id}:{row['comments_revision']}"
    else:
        for key in ("owner_id", "owner_username", "owner_role", "origin"):
            task.pop(key, None)
        if task["status"] == "open" and (task["owner_disabled"] or not task["platform_enabled"]):
            task["status"] = "paused"
    return task


def save(db, body, owner_id, task_id=None, *, generated_share=False):
    stored_platform = None
    share_limit = 8000 if generated_share else 5000
    if task_id is not None:
        existing = db.execute("""SELECT status,COALESCE(platform_variant,target_platform) AS target_platform,
                              target_url,instructions,comments_revision FROM tasks WHERE id=? AND owner_id=?""",
                              (task_id, owner_id)).fetchone()
        if not existing:
            raise DomainError(404, "未找到已发布的任务")
        if existing["status"] != "draft":
            raise DomainError(409, "只有草稿可以修改")
        if "comments_version" in body and body["comments_version"] != f"{task_id}:{existing['comments_revision']}":
            raise DomainError(409, "草稿已更新，请重新打开后再保存")
        if body.get("target_url") == existing["target_url"]:
            share_limit = max(share_limit, len(existing["target_url"]))
        stored_platform = existing["target_platform"]
        if "instructions" not in body:
            body = {**body, "instructions": existing["instructions"]}
    (title, instructions, target, platform), pool = task_values(body, stored_platform, share_limit)
    request_id = body.get("clientRequestId") if task_id is None else None
    if request_id is not None:
        if not isinstance(request_id, str) or not re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", request_id):
            raise DomainError(400, "任务创建标识无效")
        request_id = request_id.lower()
        payload = json.dumps([title, instructions, target, platform, pool], ensure_ascii=False, separators=(",", ":"))
        fingerprint = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        old = db.execute("SELECT dispatch_id,fingerprint FROM task_create_requests WHERE owner_id=? AND request_id=?",
                         (owner_id,request_id)).fetchone()
        if old:
            if fingerprint != old["fingerprint"]:
                raise DomainError(409, "该草稿已经创建，请在任务列表中打开后修改")
            return {"task": detail(db, old["dispatch_id"], owner_id)}
    variant = platform if platform == "kuaishou" else None
    values = (title, instructions, target, "other" if variant else platform, variant)
    if task_id is None:
        task_id = db.execute("INSERT INTO tasks(title,instructions,target_url,target_platform,platform_variant,owner_id) VALUES (?,?,?,?,?,?)",
                             (*values, owner_id)).lastrowid
    else:
        db.execute("""UPDATE tasks SET title=?,instructions=?,target_url=?,target_platform=?,platform_variant=?,
                   comments_revision=comments_revision+1 WHERE id=?""", (*values, task_id))
        db.execute("DELETE FROM comments WHERE task_id=?", (task_id,))
    db.executemany("INSERT INTO comments(task_id,content) VALUES (?,?)", ((task_id, c) for c in pool))
    if request_id is not None:
        db.execute("INSERT INTO task_create_requests VALUES (?,?,?,?)", (owner_id, request_id, task_id, fingerprint))
    return {"task": detail(db, task_id, owner_id)}


def update_comments(db, task_id, owner_id, body):
    # Both publisher routes hold the same write lock as visitor claims.
    task = detail(db, task_id, owner_id)
    if task["status"] not in ("open", "paused"):
        raise DomainError(409, "仅已发布或已暂停的任务可管理评论")
    version = body.get("version")
    if not isinstance(version, str) or not re.fullmatch(rf"{task_id}:[0-9]+", version):
        raise DomainError(409, "请重新载入该任务的评论后再保存")
    pool = comment_values(body.get("comments"))
    wanted, existing = set(pool), set(task["comments"])
    if not wanted.issuperset(task["locked_comments"]):
        raise DomainError(409, "评论已被领取，无法删除。请重新载入后再保存")
    remove = existing - wanted
    add = [content for content in pool if content not in existing]
    if not remove and not add:
        return {"task": task}
    if version != task["comments_version"]:
        raise DomainError(409, "评论列表已有更新，请重新载入后再保存")
    db.executemany("DELETE FROM comments WHERE task_id=? AND content=? AND visitor IS NULL",
                   ((task_id, content) for content in remove))
    db.executemany("INSERT INTO comments(task_id,content) VALUES (?,?)", ((task_id, content) for content in add))
    db.execute("UPDATE tasks SET comments_revision=comments_revision+1 WHERE id=?", (task_id,))
    return {"task": detail(db, task_id, owner_id)}


TRANSITIONS = {
    "publish": (("draft",), "open"),
    "pause": (("open",), "paused"),
    "resume": (("paused",), "open"),
    "close": (("open","paused"), "closed"),
}


def change_status(db, task_id, action, owner_id):
    task = detail(db, task_id, owner_id)
    allowed, next_status = TRANSITIONS[action]
    if task["status"] not in allowed:
        raise DomainError(409, "当前任务状态无法进行此操作")
    if action == "publish" and not task["target_url"]:
        label = "视频号链接" if task["target_platform"] == "wechat_channels" else "作品分享内容"
        raise DomainError(409, f"发布前请填写{label}")
    if action == "publish" and not task["total"]:
        raise DomainError(409, "发布前请至少添加一条评论")
    db.execute("UPDATE tasks SET status=? WHERE id=?", (next_status, task_id))
    return {"task": detail(db, task_id, owner_id)}


def public(db, task_id, visitor, action, body):
    task = detail(db, task_id)
    # Never disclose the video destination through the public task object.
    video = {"video_url": task.pop("target_url"), "video_platform": task["target_platform"]}
    row = db.execute("SELECT name FROM visits WHERE task_id=? AND visitor=?",
                     (task_id, visitor)).fetchone()
    owned = db.execute("SELECT content FROM comments WHERE task_id=? AND visitor=?",
                       (task_id, visitor)).fetchone() if row else None
    claim = {"comment": owned["content"]} if owned else None
    comment_first = task["target_platform"] == "wechat_channels"
    visit = {"name": row["name"]} if row else None
    if visit and (not comment_first or claim):
        visit.update(video)
    if not action:
        return {"task": task, "visit": visit, "claim": claim}
    if not visitor:
        raise DomainError(409, "请先打开任务链接并允许浏览器保存本站 Cookie")
    if action == "video":
        if comment_first and not claim:
            raise DomainError(409, "请先领取评论，再打开视频号作品")
        if visit:
            return visit
    if action == "claim" and claim:
        return {**claim, "visit": visit} if comment_first else claim
    if action == "claim" and not visit and not comment_first:
        raise DomainError(409, "请先填写访客名称并领取视频链接")
    if task["status"] != "open":
        raise DomainError(409, "当前任务已暂停或已关闭领取")
    if not task["remaining"]:
        raise DomainError(409, "该任务的评论已被领完")
    if not visit:
        name = text(body.get("name"), "访客名称", 32, required=True)
        if not name.isprintable():
            raise DomainError(400, "访客名称请使用可显示字符")
        db.execute("INSERT INTO visits(task_id,visitor,name) VALUES (?,?,?)", (task_id, visitor, name))
        visit = {"name": name, **video}
    if action == "video":
        return visit
    row = db.execute("SELECT id, content FROM comments WHERE task_id=? AND visitor IS NULL ORDER BY id LIMIT 1",
                     (task_id,)).fetchone()
    db.execute("UPDATE comments SET visitor=? WHERE id=?", (visitor, row["id"]))
    claim = {"comment": row["content"]}
    # Return the unlocked link with the assignment, including for older named visits.
    return {**claim, "visit": {**visit, **video}} if comment_first else claim


def route(db, method, path, body, admin, visitor, owner_id):
    match = re.fullmatch(r"/api/public/([1-9][0-9]{0,17})(?:/(claim|video))?", path)
    if match:
        task_id, action = match.groups()
        if method != ("POST" if action else "GET"):
            raise DomainError(405, "请求方式有误")
        return public(db, int(task_id), visitor, action, body)
    match = re.fullmatch(r"/api/tasks(?:/([1-9][0-9]{0,17})(?:/(edit|publish|pause|resume|close|comments))?)?", path)
    if not match:
        raise DomainError(404, "未找到该页面")
    if owner_id is None and admin:
        owner_id = db.execute("SELECT id FROM accounts WHERE role='admin'").fetchone()[0]
    if owner_id is None or not db.execute("SELECT 1 FROM accounts WHERE id=? AND disabled=0",
                                         (owner_id,)).fetchone():
        raise DomainError(401, "请先登录发布者工作台")
    raw_id, action = match.groups()
    if raw_id is None:
        if method == "GET":
            return {"tasks": list_tasks(db, owner_id)}
        if method == "POST":
            return save(db, body, owner_id)
    elif not action and method == "GET":
        return {"task": detail(db, int(raw_id), owner_id)}
    elif method == "POST" and action:
        if action == "edit":
            return save(db, body, owner_id, int(raw_id))
        if action == "comments":
            return update_comments(db, int(raw_id), owner_id, body)
        return change_status(db, int(raw_id), action, owner_id)
    raise DomainError(405, "请求方式有误")


def handle(db, method, path, body, admin=False, visitor=None, owner_id=None, *, account_token=None, expected_owner=None):
    # Serialize writers before reading available comments so the last slot can
    # only be allocated once. Repeated claims by a browser return its own text.
    db.execute("BEGIN IMMEDIATE" if method == "POST" else "BEGIN")
    try:
        if account_token is not None:
            import accounts
            user = accounts.checked_owner(db, account_token, expected_owner)
            if user is None:
                raise DomainError(401, "请先登录发布者工作台")
            owner_id = user["id"]
            admin = False
        result = route(db, method, path, body, admin, visitor, owner_id)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


def admin_handle(db, method, path, body, token, *, owner_id=None, expected_owner=None):
    """Authorize site-wide actions again after acquiring the matching database transaction."""
    import accounts
    account_path = re.fullmatch(r"/api/admin/accounts/([1-9][0-9]{0,17})/(enable|disable|password)", path)
    digest = None
    if method == "POST" and account_path and account_path[2] == "password":
        accounts.require_admin(db, token, expected_owner)
        digest = accounts.password_digest(body.get("password"))
    with db:
        db.execute("BEGIN IMMEDIATE" if method == "POST" else "BEGIN")
        accounts.require_admin(db, token, expected_owner)
        if path == "/api/admin/accounts" and method == "GET":
            return {"accounts": accounts.account_list(db)}
        if account_path and method == "POST":
            return {"account": accounts.manage_account(db, int(account_path[1]), account_path[2], digest)}
        if path == "/api/admin/tasks" and method == "GET":
            return {"tasks": list_tasks(db, owner_id)}
        task_path = re.fullmatch(r"/api/admin/tasks/([1-9][0-9]{0,17})(?:/(edit|publish|pause|resume|close|enable|disable|comments))?", path)
        if not task_path:
            raise DomainError(404, "管理页面不存在")
        task_id, action = int(task_path[1]), task_path[2]
        owner = db.execute("SELECT owner_id FROM tasks WHERE id=?", (task_id,)).fetchone()
        if not owner:
            raise DomainError(404, "任务不存在")
        if action is None and method == "GET":
            return {"task": detail(db, task_id, owner[0])}
        if action == "edit" and method == "POST":
            return save(db, body, owner[0], task_id)
        if action == "comments" and method == "POST":
            return update_comments(db, task_id, owner[0], body)
        if method == "POST" and action in ("disable", "enable"):
            db.execute("UPDATE tasks SET platform_enabled=? WHERE id=?", (int(action == "enable"), task_id))
            return {"task": detail(db, task_id, owner[0])}
        if method == "POST" and action in TRANSITIONS:
            return change_status(db, task_id, action, owner[0])
        raise DomainError(405, "请求方式有误")
