"""Local administrator settings. Secret values are never returned to the client."""
import json
import math
import os
from pathlib import Path
import tempfile
import threading
from urllib.parse import urlsplit

# key, label, type. Other deployment settings can be supplied through the environment.
GROUPS = [
    ("评论模型", [
        ("COMMENT_DEFAULT_PROVIDER","默认模型","qwen|deepseek|ark"),
        ("COMMENT_FALLBACK_PROVIDER","限流时备用模型","|qwen|deepseek|ark"),
        ("QWEN_ENABLED","千问服务开关","on|off"),("QWEN_API_KEY","千问 API Key","secret"),("QWEN_MODEL","千问模型 ID","text"),
        ("QWEN_BASE_URL","千问兼容 API 基础地址","url"),
        ("DEEPSEEK_ENABLED","DeepSeek 服务开关","on|off"),("DEEPSEEK_API_KEY","DeepSeek API Key","secret"),("DEEPSEEK_MODEL","DeepSeek 模型 ID","text"),
        ("ARK_ENABLED","豆包服务开关","on|off"),("ARK_API_KEY","火山方舟 API Key","secret"),("ARK_MODEL","豆包模型或接入点 ID","text")]),
    ("视频解析与转写",[
        ("COMMENT_PARSER_URL","自建视频解析服务地址","url"),("COMMENT_ASR","语音识别方式","paraformer|local|off"),
        ("DASHSCOPE_API_KEY","百炼 API Key（语音识别，也可用于千问）","secret"),
        ("COMMENT_ASR_BASE_URL","百炼转写 API 基础地址","url"),
        ("COMMENT_VIDEO_STORAGE","视频存储","local|oss"),("OSS_ENDPOINT","OSS 地域 Endpoint","url"),
        ("OSS_BUCKET","OSS 存储桶","text"),("OSS_ACCESS_KEY_ID","OSS AccessKey ID","secret"),
        ("OSS_ACCESS_KEY_SECRET","OSS AccessKey Secret","secret"),("OSS_SECURITY_TOKEN","OSS 临时令牌（可选）","secret")]),
    ("用量与预算",[
        ("COMMENT_DAILY_CALLS","每日模型请求上限","int"),("COMMENT_MONTHLY_CALLS","每月模型请求上限","int"),
        ("COMMENT_DAILY_ASR_SECONDS","每日转写秒数上限","int"),("COMMENT_MONTHLY_ASR_SECONDS","每月转写秒数上限","int"),
        ("COMMENT_DAILY_CNY","每日模型及转写预算（元）","number"),("COMMENT_MONTHLY_CNY","每月模型及转写预算（元）","number"),
        ("COMMENT_ASR_CNY_PER_SECOND","云转写单价（元/计费秒）","number")] +
        [(f"COMMENT_{p}_{d}_CNY_PER_M", f"{vendor}{label}单价（元/百万 token）", "number")
         for p,vendor in (("QWEN","千问"),("DEEPSEEK","DeepSeek"),("ARK","豆包"))
         for d,label in (("INPUT","输入"),("OUTPUT","输出"))])
]
FIELDS = {key: typ for _,rows in GROUPS for key,_,typ in rows}
DEFAULTS = {"QWEN_ENABLED":"on","DEEPSEEK_ENABLED":"on","ARK_ENABLED":"on","COMMENT_ASR":"paraformer","COMMENT_VIDEO_STORAGE":"local",
            "COMMENT_DAILY_CALLS":"100","COMMENT_MONTHLY_CALLS":"1500","COMMENT_DAILY_ASR_SECONDS":"3600",
            "COMMENT_MONTHLY_ASR_SECONDS":"36000","COMMENT_ASR_CNY_PER_SECOND":"0.00008"}
lock = threading.RLock()
path = None
original = {}
stored = {}


def configure(data_dir):
    global path, original, stored
    with lock:
        path = Path(data_dir) / "admin-settings.json"
        original = {key:os.environ[key] for key in FIELDS if key in os.environ}
        stored = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        for key, value in stored.items():
            if key in FIELDS:
                os.environ[key] = value


def view():
    with lock:
        groups = []
        for name, rows in GROUPS:
            fields = []
            for key,label,typ in rows:
                effective = os.getenv(key,DEFAULTS.get(key,""))
                fields.append(dict(key=key,label=label,type=typ,configured=bool(effective),
                                   value="" if typ=="secret" else effective))
            groups.append(dict(title=name,fields=fields))
        return {"groups":groups}


def update(body):
    if path is None:
        raise ValueError("请先初始化设置目录。")
    values = body.get("values")
    if not isinstance(values,dict) or not set(values).issubset(FIELDS):
        raise ValueError("配置字段无效。")
    with lock:
        pending = dict(stored)
        for key,val in values.items():
            if not isinstance(val,str) or len(val)>4000 or any(ord(c)<32 for c in val):
                raise ValueError("请检查配置内容。")
            val = val.strip()
            typ = FIELDS[key]
            if not val and typ == "secret":
                continue
            if val and typ in ("int","number"):
                try:
                    parsed = float(val)
                    if parsed<0 or not math.isfinite(parsed) or (typ=="int" and not val.isdecimal()):
                        raise ValueError()
                except ValueError:
                    raise ValueError("请输入非负数。")
            if val and "|" in typ and val not in typ.split("|"):
                raise ValueError("选项无效。")
            if val and typ=="url":
                u = urlsplit(val)
                if u.scheme not in ("http","https") or not u.hostname or u.username or u.password or u.query or u.fragment:
                    raise ValueError("请输入有效的服务地址。")
                if key != "COMMENT_PARSER_URL":
                    host = u.hostname.lower()
                    if u.scheme != "https" or not (host == "dashscope.aliyuncs.com" or host.endswith(".maas.aliyuncs.com") or (key=="OSS_ENDPOINT" and host.endswith(".aliyuncs.com"))):
                        raise ValueError("该云服务地址须使用对应阿里云 HTTPS 域名。")
            if val:
                pending[key]=val
            else:
                pending.pop(key,None)
        with tempfile.NamedTemporaryFile("w",dir=path.parent,prefix=".admin-",encoding="utf-8",delete=False) as f:
            json.dump(pending,f,ensure_ascii=False)
            tmp = f.name
        try:
            os.chmod(tmp,0o600)
            os.replace(tmp,path)
        finally:
            Path(tmp).unlink(missing_ok=True)
        for key in values:
            if key in pending or key in original:
                os.environ[key] = pending.get(key,original.get(key,""))
            else:
                os.environ.pop(key,None)
        stored.clear()
        stored.update(pending)
        return view()
