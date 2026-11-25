"""Start the complete login edition using Docker Compose. Python 3.9+."""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
from urllib import error, request


ROOT = Path(__file__).resolve().parent
STACK = ROOT / "full-stack"
PRIVATE = ROOT / ".local"
ENV = PRIVATE / "deploy.env"


def configure():
    PRIVATE.mkdir(exist_ok=True, mode=0o700)
    (PRIVATE / "certs").mkdir(exist_ok=True, mode=0o700)
    (PRIVATE / "wechat-domain").mkdir(exist_ok=True, mode=0o755)
    (PRIVATE / "task-guides").mkdir(exist_ok=True, mode=0o755)
    if ENV.exists():
        return
    values = {name: secrets.token_urlsafe(32) for name in (
        "POSTGRES_PASSWORD", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "SEED_ADMIN_PASSWORD")}
    lines = (STACK / "deploy.example.env").read_text(encoding="utf-8").splitlines()
    output = [line + values[line[:-1]] if line.endswith("=") and line[:-1] in values else line
              for line in lines]
    # Link the completed private file atomically so a concurrent first launch cannot change credentials.
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=PRIVATE, delete=False) as temp:
        temp.write("\n".join(output) + "\n")
    try:
        try:
            os.link(temp.name, ENV)
        except FileExistsError:
            pass
    finally:
        os.unlink(temp.name)


def settings():
    return dict(line.split("=", 1) for line in ENV.read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.startswith("#") and "=" in line)


def wait_for_sites(admin, member):
    opener = request.build_opener(request.ProxyHandler({}))
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        try:
            with opener.open(admin + "/api/v1/health", timeout=3) as reply:
                health = json.load(reply).get("data", {})
                if health.get("redis") != "PONG" or not health.get("ok"):
                    raise ValueError("后端尚未就绪")
            for url, marker in [(admin + "/task-management", b'<html'),
                                (member + "/runtime-config.js", b'tenantId')]:
                with opener.open(url, timeout=3) as reply:
                    body = reply.read()
                    if reply.status != 200 or marker not in body:
                        raise ValueError("应用尚未就绪")
            return
        except (OSError, ValueError, error.URLError):
            time.sleep(2)
    raise SystemExit("启动检查超时。用 python run.py --status 查看各服务，然后查看部署说明中的日志命令。")


def main():
    parser = argparse.ArgumentParser(description="快火任务管理登录完整版")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--configure", action="store_true", help="生成本机私有配置后退出")
    group.add_argument("--stop", action="store_true", help="停止运行，保留数据卷")
    group.add_argument("--status", action="store_true", help="查看容器状态")
    args = parser.parse_args()
    if args.stop or args.status:
        if not ENV.exists():
            raise SystemExit("此目录尚未初始化。")
    else:
        configure()
    if args.configure:
        print("本机配置与首次管理员账号位于", ENV)
        return
    if not shutil.which("docker"):
        raise SystemExit("完整登录版需要 Docker Engine 和 Compose v2。也可按 full-stack/docs/DEPLOYMENT.md 的原生方式启动。")
    command = ["docker", "compose", "--env-file", str(ENV), "-f", str(STACK / "compose.yaml")]
    action = ["ps", "-a"] if args.status else ["stop"] if args.stop else ["up", "-d", "--build"]
    subprocess.run(command + action, check=True, cwd=STACK)
    if args.stop or args.status:
        return
    config = settings()
    admin = "http://127.0.0.1:" + config["ADMIN_PORT"]
    member = "http://127.0.0.1:" + config["MEMBER_PORT"]
    wait_for_sites(admin, member)
    print("任务管理后台", admin + "/task-management")
    print("成员 H5", member + "/")
    print("首次管理员账号和密码见", ENV, "内 SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD。")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)
