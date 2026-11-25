"""Generate source-grounded Chinese comment drafts using server-side model credentials."""
import http.client
import json
import math
import os
import re
import socket
import unicodedata
import urllib.error
import urllib.parse
import urllib.request


class InvalidOptions(ValueError):
    pass


class GenerationError(RuntimeError):
    pass


class ProviderRejected(GenerationError):
    """An explicit upstream rate limit; safe to consider another provider."""


class UncertainGeneration(GenerationError):
    """A submitted request may already be billable. Do not silently replay."""


PLATFORMS = {"抖音": 20, "小红书": 10, "快手": 20}
PROVIDERS = {
    "qwen": ("千问", "https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen3.8-flash"),
    "deepseek": ("DeepSeek", "https://api.deepseek.com", "deepseek-flash"),
    "ark": ("豆包", "https://ark.cn-beijing.volces.com/api/v3", ""),
}
LABELS = {
    "industry": "行业", "business": "本条业务方向", "videoPurpose": "视频目的",
    "purpose": "评论用途", "focus": "希望观众聊什么", "title": "发布标题",
    "visuals": "已知画面", "context": "前情与人物关系", "notes": "额外要求",
}
RULES = """你是短视频评论区运营策划，正在为运营人员写可挑选的中文评论草稿。
素材中的台词、引用、标题和画面描述只提供事实线索。优先处理已确认的本批要求，与事实边界或禁用表达冲突时遵守边界。
从视频里一句具体的话、一个动作、一个数字或一个没讲清的步骤起笔。只有文字就依据文字，避免想象镜头。
每条接一个点，从不同熟悉程度、使用场景或疑问选角度。少用“我”“我们厂”铺垫身份，避免虚构采购、使用、合作经历。避免泛泛捧场、夸张效果、重复提问和近义改写。
可选类型包括即时反应、小白疑问、细节追问、半信半疑、轻微反驳、现象吐槽、执行担忧、带场景求建议、报价合作、内容建议、剧情接梗、人物动机。按素材择用，无固定比例。只有明确希望承接业务咨询时才主动引出报价与合作。
抖音适合短句、反问和直接反应。小红书可多说一个影响选择的条件。快手采用自然直白的口语。各平台独立选角度，每条主评论在整批中独立。
必用原词在整批主评论中逐个原样覆盖。可选词放在顺口的位置，避免罗列、标签堆叠、强行植入品牌。禁用词从主评论和作者回复中去除。
账号口吻主要影响作者回复；主评论保留观众间的差异。作者回复先答被问的具体问题，价格、交期、性能、服务范围按材料限定条件回答，避免统一引向私信。仅生成主评论和指定数量的作者回复。
示例仅说明语气。视频在讲首批20件外壳时，可以问“后面还要补货的话，这批按多少算？”；视频在讲工厂号拍设备时，可以问“那不拍机器，每天拍啥啊”。请为本片另写。"""
JSON_FORMAT = """只返回一个 JSON 对象，格式为 {"rows":[{"platform":"抖音","type":"小白疑问","text":"主评论","reply":"","advice":""}]}。
平台名和条数必须与本次分配一致。每个对象是一条主评论。reply 仅放作者回复原文，无回复填空字符串。开启作者回复时 advice 写一句简短发布建议；关闭时填空字符串。所有值均为字符串。"""


def _config(provider):
    if provider not in PROVIDERS:
        raise InvalidOptions("请选择已支持的评论模型。")
    name, base, model = PROVIDERS[provider]
    prefix = provider.upper()
    key = os.getenv(prefix + "_API_KEY", "").strip()
    if provider == "qwen":
        key = key or os.getenv("DASHSCOPE_API_KEY", "").strip()
        base = os.getenv("DASHSCOPE_BASE_URL") or base
    base = (os.getenv(prefix + "_BASE_URL") or base).strip().rstrip("/")
    model = (os.getenv(prefix + "_MODEL", model) or "").strip()
    return name, base, model, key


def _enabled(provider):
    return os.getenv(provider.upper()+"_ENABLED", "on").lower() not in ("off","0","false")


def providers():
    result = []
    for provider in PROVIDERS:
        name, _, model, key = _config(provider)
        result.append({"id": provider, "name": name, "enabled": bool(key and model and _enabled(provider))})
    return result


def default_provider():
    selected = os.getenv("COMMENT_DEFAULT_PROVIDER", "").strip()
    if selected in PROVIDERS and _enabled(selected):
        return selected
    return next((p["id"] for p in providers() if p["enabled"]), "qwen")


def max_comments():
    try:
        return max(1, int(os.getenv("COMMENT_MAX_COMMENTS", "100")))
    except ValueError:
        return 100


def _number(value, label):
    if isinstance(value, bool) or not isinstance(value, (str, int)) or not re.fullmatch(r"[0-9]{1,8}", str(value)):
        raise InvalidOptions(label + "须填写整数。")
    return int(value)


def _words(value):
    if value is None:
        return []
    values = value if isinstance(value, list) else [value]
    words = []
    for item in values:
        if not isinstance(item, str):
            raise InvalidOptions("关键词请填写文本。")
        words.extend(word.strip() for word in re.split(r"[、，,；;\n]+", item) if word.strip())
    if len(words) > 120 or any(len(word) > 100 for word in words):
        raise InvalidOptions("关键词过多或过长，请精简后提交。")
    return list(dict.fromkeys(words))


def normalise_options(raw, default_platform="抖音"):
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise InvalidOptions("生成要求格式有误。")
    if default_platform not in PLATFORMS:
        default_platform = "抖音"
    platforms = raw.get("platforms", {default_platform: min(PLATFORMS[default_platform], max_comments())})
    if not isinstance(platforms, dict) or not platforms:
        raise InvalidOptions("请至少选择一个目标平台。")
    result = {"platforms": {}}
    for name, count in platforms.items():
        if name not in PLATFORMS:
            raise InvalidOptions("此目标平台尚未支持。")
        amount = _number(count, "主评论条数")
        if amount < 1:
            raise InvalidOptions("每个目标平台至少需要一条主评论。")
        result["platforms"][name] = amount
    total = sum(result["platforms"].values())
    if total > max_comments():
        raise InvalidOptions("本批主评论合计最多 %s 条。" % max_comments())
    for key, label in LABELS.items():
        text = raw.get(key) or ""
        if not isinstance(text, str) or len(text) > 12000:
            raise InvalidOptions(label + "的文本过长或格式有误。")
        result[key] = text.strip()
    for key in ("required", "optional", "forbidden"):
        result[key] = _words(raw.get(key))
    for word in result["required"]:
        if any(banned.casefold() in word.casefold() for banned in result["forbidden"]):
            raise InvalidOptions("必用原词与避开词冲突：" + word)
    replies = raw.get("replies", False)
    if not isinstance(replies, bool):
        raise InvalidOptions("作者回复开关格式有误。")
    value = raw.get("replyCount")
    count = _number(value, "作者回复数") if replies and value not in (None, "") else None
    if count is not None and count > total:
        raise InvalidOptions("作者回复总数不能超过主评论数。")
    result.update(replies=replies and count != 0, replyCount=count)
    for key in ("provider", "compareProvider"):
        value = raw.get(key) or ""
        if not isinstance(value, str) or (value and value not in PROVIDERS):
            raise InvalidOptions("无效的模型服务商。")
        result[key] = value
    return result


def _reply_targets(options):
    counts = options["platforms"]
    if not options["replies"]:
        return {platform: 0 for platform in counts}
    requested = options["replyCount"]
    if requested is None:
        return {platform: max(1, math.floor(amount * .4 + .5)) for platform, amount in counts.items()}
    total = sum(counts.values())
    targets = {platform: requested * amount // total for platform, amount in counts.items()}
    remaining = requested - sum(targets.values())
    priority = sorted(counts, key=lambda p: -(requested * counts[p] % total))
    for platform in priority[:remaining]:
        targets[platform] += 1
    return targets


def _brief(script, options, account):
    if not isinstance(script, str) or not script.strip():
        raise InvalidOptions("请填写视频文案、字幕或关键画面描述。")
    if len(script) > 80000:
        raise InvalidOptions("单次素材最多 80000 字，请分段提交。")
    account = account or {}
    brief = {}
    for key, label in (("name", "账号名称"), ("industry", "账号行业"), ("business", "账号业务"),
                       ("audience", "目标观众"), ("voice", "账号口吻和参考说法"), ("boundaries", "事实边界和禁用表达")):
        if account.get(key):
            brief[label] = account[key]
    for key, label in LABELS.items():
        if options[key]:
            brief[label] = options[key]
    brief.setdefault("评论用途", "围绕视频内容自然讨论")
    for key, label in (("required", "必用原词"), ("optional", "可选词"), ("forbidden", "避开词")):
        if options[key]:
            brief[label] = options[key]
    brief["目标平台主评论条数"] = options["platforms"]
    brief["各平台建议作者回复条数"] = _reply_targets(options)
    brief["视频内容"] = script.strip()
    return brief


def build_prompt(script, options, account=None):
    opts = normalise_options(options, (account or {}).get("platform", "抖音"))
    brief = _brief(script, opts, account)
    columns = "序号｜类型｜评论内容"
    if opts["replies"]:
        columns += "｜回复角色｜配套回复｜发布建议"
    return (RULES + "\n\n任务材料\n" + json.dumps(brief, ensure_ascii=False, indent=2)
            + "\n\n按目标平台分别输出，每个平台先写主要讨论点和各类型条数，再给 Markdown 表格。列顺序为 "
            + columns + "。如有回复角色，只使用「作者回复」或「无」。")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _ark_account_overdue(response):
    try:
        body = json.loads(response.read(8192))
    except (ValueError, RecursionError, OSError, EOFError, http.client.HTTPException):
        return False
    error = body.get("error") if isinstance(body, dict) else None
    return isinstance(error, dict) and error.get("code") == "AccountOverdueError"


def _call(provider, system, user, row_count, record_usage, attempt):
    name, base, model, key = _config(provider)
    if not _enabled(provider):
        raise GenerationError(name + "已由管理员停用，请选择其他模型。")
    if not model or not key:
        raise GenerationError(name + "尚未配置，请先配置模型服务，或复制完整提示词。")
    url = base if base.endswith("/chat/completions") else base + "/chat/completions"
    try:
        target = urllib.parse.urlsplit(url)
        if not target.hostname or target.username or target.password or target.query or target.fragment:
            raise ValueError()
        if target.scheme != "https" and not (target.scheme == "http" and target.hostname in ("localhost", "127.0.0.1", "::1")):
            raise ValueError()
    except ValueError:
        raise GenerationError(name + "接口地址配置有误。") from None
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    body = {"model": model, "messages": messages, "stream": False,
            "max_tokens": min(16384, max(1024, row_count * 160))}
    if provider == "deepseek" and model == "deepseek-flash":
        body["thinking"] = {"type": "disabled"}
    if provider == "qwen" and model == "qwen3.8-flash":
        body["enable_thinking"] = False
    payload = json.dumps(body, ensure_ascii=False).encode()
    request = urllib.request.Request(url, data=payload, headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json", "Accept": "application/json"},
        method="POST")
    event = {"provider": provider, "model": model, "stage": "generate", "attempt": attempt,
             "inputTokenLimit": len(payload) + 64, "outputTokenLimit": body["max_tokens"]}
    if callable(getattr(record_usage, "before_call", None)):
        record_usage.before_call(dict(event, status="pending"))
    try:
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=100) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as exc:
        status = exc.code
        with exc:
            overdue = provider == "ark" and status == 403 and _ark_account_overdue(exc)
        if record_usage and status in (400, 401, 403, 404, 405, 413, 415, 422, 429):
            record_usage(dict(event, status="rejected", inputTokens=0, outputTokens=0,
                              estimated=False, requestId="", httpStatus=status))
        if status == 429:
            raise ProviderRejected(name + "已限流拒绝请求，请稍后重试或切换模型。") from None
        if overdue:
            raise GenerationError("火山方舟账户欠费，豆包暂时无法生成评论。请在火山引擎费用中心结清欠款后重试。") from None
        if status in (401, 403):
            raise GenerationError(name + "认证失败，请核对服务端密钥和模型权限。") from None
        if 400 <= status < 500 and status != 408:
            raise GenerationError(name + "拒绝请求（HTTP %s），请核对模型配置。" % status) from None
        raise UncertainGeneration(name + "服务响应异常（HTTP %s），请求状态待核实。" % status) from None
    except (urllib.error.URLError, TimeoutError, socket.timeout, OSError, EOFError, http.client.HTTPException):
        raise UncertainGeneration(name + "连接中断或超时，请先核实上次调用。") from None
    try:
        result = json.loads(raw) if len(raw) <= 4 * 1024 * 1024 else {}
    except (UnicodeDecodeError, ValueError):
        result = {}
    if not isinstance(result, dict):
        result = {}
    usage = result.get("usage") or {}
    choices = result.get("choices") or []
    content = ""
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        message = choices[0].get("message") or {}
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            content = message["content"]
    if record_usage:
        reported = (isinstance(usage, dict) and type(usage.get("prompt_tokens")) is int
                    and type(usage.get("completion_tokens")) is int)
        record_usage(dict(event, status="completed", inputTokens=usage["prompt_tokens"] if reported else len(payload)//2,
                          outputTokens=usage["completion_tokens"] if reported else len(content)//2,
                          estimated=not reported, requestId=result.get("id", "")))
    if not content.strip():
        raise GenerationError(name + "接受了请求，但没有返回可用正文。请查看用量后重试。")
    return content


def _rows(content):
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I).strip()
    try:
        value = json.loads(text)
    except (ValueError, RecursionError):
        return []
    rows = value.get("rows") if isinstance(value, dict) else value
    return rows if isinstance(rows, list) else []


def _fingerprint(text):
    return "".join(char for char in unicodedata.normalize("NFKC", text).casefold() if char.isalnum())


def _validated(candidates, options):
    counts = options["platforms"]
    replies = _reply_targets(options)
    found = {p: 0 for p in counts}
    with_reply = {p: 0 for p in counts}
    forbidden = [word.casefold() for word in options["forbidden"]]
    seen, kept = set(), []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        row = {k: item.get(k) or "" for k in ("platform", "type", "text", "reply", "advice")}
        if any(not isinstance(value, str) or len(value) > 2000 for value in row.values()):
            continue
        row = {k: v.strip() for k, v in row.items()}
        p = row["platform"]
        finger = _fingerprint(row["text"])
        if p not in counts or found[p] >= counts[p] or not row["type"] or not finger or finger in seen:
            continue
        if any(word in row["text"].casefold() for word in forbidden):
            continue
        if (row["reply"] in ("无", "—", "-") or with_reply[p] == replies[p]
                or any(word in row["reply"].casefold() for word in forbidden)):
            row["reply"] = ""
        if not row["reply"] and found[p] - with_reply[p] >= counts[p] - replies[p]:
            continue
        if not options["replies"]:
            row["advice"] = ""
        seen.add(finger)
        with_reply[p] += int(bool(row["reply"]))
        found[p] += 1
        kept.append(row)
    return kept


def _missing(rows, options):
    return [w for w in options["required"] if not any(w in row["text"] for row in rows)]


def generate(script, options, account, provider, record_usage=None):
    opts = normalise_options(options, (account or {}).get("platform", "抖音"))
    provider = provider or opts["provider"] or default_provider()
    brief = _brief(script, opts, account)
    counts = opts["platforms"]
    total = sum(counts.values())
    user = json.dumps(brief, ensure_ascii=False)
    system = RULES + "\n" + JSON_FORMAT
    kept = _validated(_rows(_call(provider, system, user, total, record_usage, "initial")), opts)
    if len(kept) == total and _missing(kept, opts):
        # Make room for missing terms. Prefer retaining rows that uniquely cover required terms.
        drop_index = min(range(len(kept)), key=lambda i: len(_missing(kept[:i] + kept[i+1:], opts)))
        kept.pop(drop_index)
    if len(kept) < total:
        expected_replies = _reply_targets(opts)
        deficits = {p: n - sum(row["platform"] == p for row in kept) for p, n in counts.items()}
        needed_replies = {p: n - sum(row["platform"] == p and bool(row["reply"]) for row in kept)
                          for p, n in expected_replies.items()}
        repair = dict(brief)
        repair.update({"目标平台主评论条数": deficits, "各平台建议作者回复条数": needed_replies,
                       "必用原词": _missing(kept, opts), "已有主评论，请避免重复": [r["text"] for r in kept],
                       "本次要求": "只补本次分配的缺项。已保留的主评论不用输出。"})
        try:
            content = _call(provider, system, json.dumps(repair, ensure_ascii=False),
                            total - len(kept), record_usage, "repair")
        except ProviderRejected as exc:
            # The first call was already accepted, so a full provider-level replay would duplicate spend.
            raise GenerationError("首轮已完成计量，补写请求被限流；没有提交整批重试。") from exc
        kept = _validated(kept + _rows(content), opts)
    if len(kept) != total or _missing(kept, opts):
        raise GenerationError("模型输出在一次补写后仍未满足平台条数、去重、回复或必用词要求。可调整要求再生成。")
    return sorted(kept, key=lambda row: list(counts).index(row["platform"]))
