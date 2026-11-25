"""Set the reserved administrator's first password on a local unified installation."""
import getpass
import os
from pathlib import Path
from contextlib import closing

import accounts
import domain
from server import connect


def main():
    value = os.environ.get("COMMENT_SHARED_DB")
    if not value or not Path(value).is_file():
        raise SystemExit("请先启动统一工作台，并将 COMMENT_SHARED_DB 指向已有共享数据库。")

    with closing(connect(Path(value))) as db:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounts'").fetchone():
            raise SystemExit("指定数据库尚未初始化账号。请先启动统一工作台。")
        row = db.execute("SELECT password_hash FROM accounts WHERE role='admin'").fetchone()
        if row is None:
            raise SystemExit("指定数据库没有预留的 admin 账号。")
        if row["password_hash"] is not None:
            raise SystemExit("admin 账号已设置密码。")
        password = getpass.getpass("设置 admin 密码（8–128 个字符）：")
        if getpass.getpass("请再输入一次：") != password:
            raise SystemExit("两次输入的密码不同。")
        try:
            created = accounts.set_admin_password(db, password)
        except domain.DomainError as exc:
            raise SystemExit(str(exc)) from None
        if not created:
            raise SystemExit("admin 账号已设置密码。")
    print("admin 密码已设置。现在可以登录统一工作台。")


if __name__ == "__main__":
    main()
