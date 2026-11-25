"""Publisher accounts and revocable, host-only browser sessions."""
import hashlib
import hmac
import re
import secrets
import sqlite3
import time
import unicodedata

from domain import DomainError


SESSION_TTL = 30 * 24 * 60 * 60
PASSWORD_ROUNDS = 600_000
USERNAME = re.compile(r"[A-Za-z0-9\u3400-\u4dbf\u4e00-\u9fff_.-]{3,32}")
TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")


def initialize(db):
    """Reserve the admin identity before any registration can be accepted."""
    with db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("""CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY, username TEXT, login TEXT UNIQUE, password_hash TEXT,
            role TEXT NOT NULL CHECK (role IN ('admin','user','guest')),
            CHECK ((role='guest' AND username IS NULL AND login IS NULL AND password_hash IS NULL)
                OR (role='user' AND username IS NOT NULL AND login IS NOT NULL AND password_hash IS NOT NULL)
                OR (role='admin' AND username='admin' AND login='admin'))
        )""")
        if "disabled" not in {r[1] for r in db.execute("PRAGMA table_info(accounts)")}:
            db.execute("ALTER TABLE accounts ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1))")
        db.execute("""CREATE TABLE IF NOT EXISTS account_sessions (
            token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL
        )""")
        db.execute("CREATE INDEX IF NOT EXISTS sessions_expiry ON account_sessions(expires_at)")
        db.execute("CREATE INDEX IF NOT EXISTS sessions_account ON account_sessions(account_id)")
        db.execute("INSERT OR IGNORE INTO accounts(username,login,role) VALUES ('admin','admin','admin')")


def username_for(value):
    if not isinstance(value, str):
        raise DomainError(400, "请输入账号")
    value = unicodedata.normalize("NFKC", value.strip())
    if not USERNAME.fullmatch(value):
        raise DomainError(400, "账号可使用 3 至 32 个中文、英文字母、数字、点、横线或下划线")
    return value, value.casefold()


def password_bytes(password):
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        raise DomainError(400, "密码长度为 8 至 128 个字符")
    try:
        return password.encode("utf-8")
    except UnicodeError:
        raise DomainError(400, "请输入有效的密码字符") from None


def password_digest(password):
    raw = password_bytes(password)
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", raw, salt, PASSWORD_ROUNDS)
    return f"pbkdf2_sha256${PASSWORD_ROUNDS}${salt.hex()}${digest.hex()}"


def password_matches(password, encoded):
    raw = password_bytes(password)
    # Unknown users and the unconfigured administrator take the same hash path.
    record = encoded or f"pbkdf2_sha256${PASSWORD_ROUNDS}${'00' * 16}${'00' * 32}"
    algorithm, rounds, salt, expected = record.split("$")
    if algorithm != "pbkdf2_sha256":
        return False
    actual = hashlib.pbkdf2_hmac("sha256", raw, bytes.fromhex(salt), int(rounds))
    return hmac.compare_digest(actual, bytes.fromhex(expected)) and encoded is not None


def set_admin_password(db, password):
    """Set the initial administrator password once, without replacing an existing credential."""
    digest = password_digest(password)
    with db:
        return db.execute("UPDATE accounts SET password_hash=? WHERE role='admin' AND password_hash IS NULL",
                          (digest,)).rowcount == 1


def token_hash(token):
    if not isinstance(token, str) or not TOKEN.fullmatch(token):
        return None
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def current(db, token):
    hashed = token_hash(token)
    if not hashed:
        return None
    row = db.execute("""SELECT a.id,a.username,a.role FROM account_sessions s
                        JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.disabled=0""",
                     (hashed, int(time.time()))).fetchone()
    return dict(row) if row else None


def issue(db, account_id, old_token):
    now = int(time.time())
    db.execute("DELETE FROM account_sessions WHERE expires_at<=?", (now,))
    db.execute("DELETE FROM account_sessions WHERE token_hash=?", (token_hash(old_token),))
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES (?,?,?)",
               (token_hash(token), account_id, now + SESSION_TTL))
    user = db.execute("SELECT id,username,role FROM accounts WHERE id=?", (account_id,)).fetchone()
    return dict(user), token


def checked_owner(db, token, expected_owner):
    user = current(db, token)
    if expected_owner is not None and (not user or user["id"] != expected_owner):
        raise DomainError(409, "登录状态已变更，请刷新后重试")
    return user


def guest(db, token=None, *, expected_owner=None):
    with db:
        db.execute("BEGIN IMMEDIATE")
        previous = checked_owner(db, token, expected_owner)
        if previous:
            return previous, token
        account_id = db.execute("INSERT INTO accounts(role) VALUES ('guest')").lastrowid
        return issue(db, account_id, token)


def register(db, username, password, token=None, *, expected_owner=None):
    username, login_name = username_for(username)
    previous = checked_owner(db, token, expected_owner)
    if previous and previous["role"] != "guest":
        raise DomainError(409, "请先退出当前账号")
    digest = password_digest(password)
    with db:
        db.execute("BEGIN IMMEDIATE")
        if checked_owner(db, token, expected_owner) != previous:
            raise DomainError(409, "登录状态已变更，请刷新后重试")
        try:
            if previous:
                account_id = previous["id"]
                db.execute("UPDATE accounts SET username=?,login=?,password_hash=?,role='user' WHERE id=?",
                           (username, login_name, digest, account_id))
            else:
                account_id = db.execute("""INSERT INTO accounts(username,login,password_hash,role)
                                           VALUES (?,?,?,'user')""", (username, login_name, digest)).lastrowid
        except sqlite3.IntegrityError:
            raise DomainError(409, "该账号已被使用，请换一个") from None
        return issue(db, account_id, token)


def login(db, username, password, token=None, *, expected_owner=None):
    try:
        _, login_name = username_for(username)
        row = db.execute("SELECT id,password_hash FROM accounts WHERE login=? AND disabled=0", (login_name,)).fetchone()
        verified = password_matches(password, row["password_hash"] if row else None)
    except DomainError:
        verified = False
    if not verified:
        raise DomainError(401, "账号或密码不正确")
    with db:
        db.execute("BEGIN IMMEDIATE")
        checked_owner(db, token, expected_owner)
        if not db.execute("SELECT 1 FROM accounts WHERE id=? AND disabled=0 AND password_hash=?",
                          (row["id"], row["password_hash"])).fetchone():
            raise DomainError(401, "账号或密码不正确")
        return issue(db, row["id"], token)


def logout(db, token, *, expected_owner=None):
    with db:
        db.execute("BEGIN IMMEDIATE")
        checked_owner(db, token, expected_owner)
        db.execute("DELETE FROM account_sessions WHERE token_hash=?", (token_hash(token),))


def require_admin(db, token, expected_owner):
    actor = checked_owner(db, token, expected_owner)
    if not actor:
        raise DomainError(401, "请先登录")
    if actor["role"] != "admin":
        raise DomainError(403, "仅管理员可以操作")


ACCOUNT_SELECT = """
    SELECT a.id,a.username,a.role,a.disabled,
           (SELECT COUNT(*) FROM tasks t WHERE t.owner_id=a.id) AS task_count FROM accounts a
"""


def account_info(row):
    info = dict(row)
    info["disabled"] = bool(info["disabled"])
    return info


def account_list(db):
    return [account_info(row) for row in db.execute(ACCOUNT_SELECT + " ORDER BY a.id")]


def manage_account(db, target_id, action, digest=None):
    row = db.execute(ACCOUNT_SELECT + " WHERE a.id=?", (target_id,)).fetchone()
    if not row:
        raise DomainError(404, "账号不存在")
    if row["role"] == "admin":
        raise DomainError(409, "管理员账号由服务器维护")
    if action == "password":
        if row["role"] != "user":
            raise DomainError(409, "游客账号没有密码")
        db.execute("UPDATE accounts SET password_hash=? WHERE id=?", (digest, target_id))
    else:
        db.execute("UPDATE accounts SET disabled=? WHERE id=?", (int(action == "disable"), target_id))
    if action in ("disable", "password"):
        db.execute("DELETE FROM account_sessions WHERE account_id=?", (target_id,))
    return account_info(db.execute(ACCOUNT_SELECT + " WHERE a.id=?", (target_id,)).fetchone())
