"""Read-only smoke check of an installation started with the local Compose launcher."""
import json
from pathlib import Path
from urllib.request import build_opener, ProxyHandler, Request

root = Path(__file__).resolve().parents[2]
config = dict(line.split("=", 1) for line in (root / ".local/deploy.env").read_text(encoding="utf-8").splitlines()
              if line and not line.startswith("#") and "=" in line)
admin = "http://127.0.0.1:" + config["ADMIN_PORT"]
member = "http://127.0.0.1:" + config["MEMBER_PORT"]
client = build_opener(ProxyHandler({}))


def read(url, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    body = json.dumps(data).encode() if data is not None else None
    with client.open(Request(url, data=body, headers=headers), timeout=10) as reply:
        return reply.read()


health = json.loads(read(admin + "/api/v1/health"))["data"]
if not health["ok"] or health["redis"] != "PONG":
    raise SystemExit("API 或 Redis 未就绪")
login = json.loads(read(admin + "/api/v1/auth/login", {"username": config["SEED_ADMIN_USERNAME"],
                                                       "password": config["SEED_ADMIN_PASSWORD"]}))
tasks = json.loads(read(admin + "/api/v1/daily-tasks", token=login["data"]["accessToken"]))
assert tasks["code"] == 0 and isinstance(tasks["data"], list)
assert b"tenantId" in read(member + "/runtime-config.js")
assert b'<html' in read(member + "/") and b'<html' in read(admin + "/task-management")
print("管理账号、任务列表、API、Redis、H5 站点及租户配置均正常。")
