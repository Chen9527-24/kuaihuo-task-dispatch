"""Persistent, owner-scoped workspaces and staged video/comment jobs."""
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import shutil
import sqlite3
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timezone

import generator
import media
from budget import Budget, number
import studio_database


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def uid():
    return uuid.uuid4().hex


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def clean(value, limit=4000):
    if value is None:
        return ""
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError("字段类型或长度超出限制。")
    return value.strip()


class Studio:
    def __init__(self, data_dir):
        self.root = Path(data_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.files = self.root / "media"
        self.files.mkdir(exist_ok=True, mode=0o700)
        shared_path = os.environ.get("COMMENT_SHARED_DB")
        legacy_database = self.root / "studio.sqlite3"
        self.shared_database = bool(shared_path)
        self.database = Path(shared_path).resolve() if shared_path else legacy_database
        self.process_lock = studio_database.acquire_lock(self.root / "service.lock")
        self.database_lock = None
        try:
            if shared_path:
                self.database_lock = studio_database.acquire_lock(self.database.with_name(self.database.name + ".studio.lock"))
            studio_database.initialize(self.database, legacy_database if shared_path else None)
        except BaseException:
            if self.database_lock:
                self.database_lock.close()
            self.process_lock.close()
            raise
        self.mutex = threading.RLock()
        self.source_locks = [threading.RLock() for _ in range(31)]
        self.asset_locks = [threading.RLock() for _ in range(37)]
        self.pool = ThreadPoolExecutor(max_workers=max(1, min(12, int(os.getenv("COMMENT_WORKERS", "2")))))
        self.stop = threading.Event()
        with self.db() as conn:
            for tid, raw in conn.execute("SELECT id,data FROM studio_tasks").fetchall():
                t = json.loads(raw)
                if t["status"] in ("queued", "running"):
                    t.update(status="failed", error="服务已重启，请检查已完成的内容后再继续。")
                    conn.execute("UPDATE studio_tasks SET data=? WHERE id=?", (dump(t), tid))
        self.janitor = threading.Thread(target=self._cleanup_loop, daemon=True)
        self.janitor.start()

    @contextmanager
    def db(self):
        conn = sqlite3.connect(str(self.database), timeout=30)
        try:
            if self.shared_database:
                studio_database.bound_shared_database(conn)
            with conn:
                yield conn
        finally:
            conn.close()

    def close(self):
        self.stop.set()
        self.pool.shutdown(wait=True)
        self.janitor.join(timeout=2)
        self.process_lock.close()
        if self.database_lock:
            self.database_lock.close()

    def owner(self, token=None):
        with self.db() as c:
            if token and isinstance(token, str) and len(token) <= 256:
                row = c.execute("SELECT owner FROM studio_sessions WHERE token=?", (digest(token),)).fetchone()
                if row:
                    return row[0], None
            token, owner = secrets.token_urlsafe(32), uid()
            c.execute("INSERT INTO studio_sessions VALUES (?,?)", (digest(token), owner))
            return owner, token

    def legacy_summary(self, token, publisher_id):
        with self.db() as conn:
            return studio_database.legacy_workspace(conn, token, publisher_id, claim=False)

    def claim_legacy(self, token, publisher_id):
        with self.mutex, self.db() as conn:
            return studio_database.legacy_workspace(conn, token, publisher_id, claim=True)

    def status(self):
        return dict(media.status(), providers=generator.providers(), defaultProvider=generator.default_provider(),
                    maxComments=int(os.getenv("COMMENT_MAX_COMMENTS", "100")), maxMinutes=number("COMMENT_MAX_MINUTES", 10))

    def guides(self):
        return [{"title": p.stem, "text": p.read_text(encoding="utf-8")}
                for p in sorted((Path(__file__).parent / "resources").glob("*.md"))]

    def accounts(self, owner):
        with self.db() as c:
            return [json.loads(row[0]) for row in c.execute("SELECT data FROM studio_accounts WHERE owner=? ORDER BY rowid DESC", (owner,))]

    def _account(self, owner, account_id):
        if not account_id:
            return {}
        with self.db() as c:
            row = c.execute("SELECT data FROM studio_accounts WHERE owner=? AND id=?", (owner, account_id)).fetchone()
        if not row:
            raise KeyError("找不到该账号。")
        return json.loads(row[0])

    def save_account(self, owner, account_id, body):
        with self.mutex, self.db() as c:
            profile = self._account(owner, account_id)
            for key in ("name", "platform", "industry", "business", "audience", "voice", "boundaries", "handle"):
                if key in body or not account_id:
                    profile[key] = clean(body.get(key), 3000)
            if not profile["name"]:
                raise ValueError("请填写账号名称。")
            profile.update(id=account_id or uid(), updatedAt=stamp())
            c.execute("INSERT INTO studio_accounts VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
                      (profile["id"], owner, dump(profile)))
            return profile

    def _load(self, owner, task_id):
        with self.db() as c:
            row = c.execute("SELECT data FROM studio_tasks WHERE owner=? AND id=?", (owner, task_id)).fetchone()
        if not row:
            raise KeyError("找不到该任务。")
        return json.loads(row[0])

    def _save(self, t):
        with self.db() as c:
            c.execute("UPDATE studio_tasks SET data=? WHERE id=? AND owner=?", (dump(t), t["id"], t["_owner"]))

    def _asset(self, key):
        with self.db() as c:
            row = c.execute("SELECT data FROM studio_assets WHERE id=?", (key,)).fetchone()
        return json.loads(row[0]) if row else {}

    def _set_asset(self, key, asset):
        with self.db() as c:
            c.execute("INSERT INTO studio_assets VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data", (key, dump(asset)))

    def _public(self, t, brief=False):
        public = {k: v for k, v in t.items() if not k.startswith("_")}
        asset = self._asset(t.get("_asset", ""))
        until = asset.get("until", 0)
        available = until > time.time() and (asset.get("objectKey") or (self.files / t.get("_asset","-")).is_file())
        public["mediaUrl"] = "/api/tasks/"+t["id"]+"/media" if available else ""
        public["expiresAt"] = datetime.fromtimestamp(until, timezone.utc).isoformat() if until else ""
        segments = (asset.get("checkpoint") or {}).get("asrSegments")
        public["subtitlesUrl"] = "/api/tasks/"+t["id"]+"/subtitles.srt" if segments else ""
        if brief:
            return {k: public[k] for k in ("id","mode","title","platform","accountId","status","stage","createdAt","source","error")}
        return public

    def task(self, owner, task_id):
        return self._public(self._load(owner, task_id))

    def tasks(self, owner):
        with self.db() as c:
            rows = c.execute("SELECT data FROM studio_tasks WHERE owner=? ORDER BY rowid DESC", (owner,)).fetchall()
        return [self._public(json.loads(row[0]), True) for row in rows]

    def _save_request(self, c, owner, body, action, task_id):
        key = clean(body.get("requestId"), 160)
        if key:
            found = c.execute("SELECT action,task FROM studio_requests WHERE owner=? AND key=?", (owner, key)).fetchone()
            if found:
                if found[0] != action or (action != "create" and found[1] != task_id):
                    raise ValueError("请求编号已用于其他操作，请重新提交。")
                return found[1]
            c.execute("INSERT INTO studio_requests VALUES(?,?,?,?)", (owner, key, action, task_id))
        return None

    def prompt(self, owner, body):
        account = self._account(owner, clean(body.get("accountId")))
        options = generator.normalise_options(body.get("options", {}), account.get("platform") or "抖音")
        script = clean(body.get("script"), 80000)
        if not script:
            raise ValueError("请先填写稿件，或等视频转写完成后再预览。")
        return generator.build_prompt(script, options, account)

    @staticmethod
    def _kind(body, options):
        kind = body.get("kind", "normal")
        if kind not in ("compare","normal"):
            raise ValueError("生成模式无效。")
        if kind == "compare":
            other = options.get("compareProvider")
            first = options.get("provider") or generator.default_provider()
            enabled = {p["id"] for p in generator.providers() if p["enabled"]}
            if other == first or first not in enabled or other not in enabled:
                raise ValueError("对比样稿需要两家不同且已配置的模型。")
        return kind

    def create(self, owner, body):
        mode, source = body.get("mode"), clean(body.get("source"), 8000)
        if mode not in ("manual", "link"):
            raise ValueError("请选择链接或手动模式。")
        account_id = clean(body.get("accountId"))
        account = self._account(owner, account_id)
        script = clean(body.get("script"), 80000) if mode=="manual" else ""
        platform, url, key = ("", "", "")
        if mode == "link":
            platform, url, key = media.inspect_source(source)
        elif not script:
            raise ValueError("请填写视频文案。")
        options = generator.normalise_options(body.get("options", {}), platform or account.get("platform") or "抖音")
        task_id = uid()
        t = dict(id=task_id, _owner=owner, mode=mode, source=source, platform=platform, accountId=account_id,
                 _account=account, _url=url, _key=key, _kind=self._kind(body,options), _run=uid(), _asset="",
                 createdAt=stamp(), script=script, originalScript=script, options=options, batches=[],
                 title=options.get("title", "") or (script[:35] if script else ""), error="", status="queued", stage="queued")
        with self.mutex, self.db() as c:
            c.execute("BEGIN IMMEDIATE")
            old = self._save_request(c, owner, body, "create", task_id)
            if old:
                return self.task(owner, old)
            c.execute("INSERT INTO studio_tasks VALUES(?,?,?)", (task_id, owner, dump(t)))
        self.pool.submit(self._run, owner, task_id)
        return self._public(t)

    def generate(self, owner, task_id, body):
        return self._continue(owner, task_id, body, "generate")

    def retry(self, owner, task_id, body):
        return self._continue(owner, task_id, body, "retry")

    def _continue(self, owner, task_id, body, action):
        with self.mutex, self.db() as c:
            c.execute("BEGIN IMMEDIATE")
            t = self._load(owner, task_id)
            if self._save_request(c, owner, body, action, task_id):
                return self._public(t)
            if t["status"] in ("queued", "running"):
                raise ValueError("这条任务正在执行。")
            if action == "generate":
                t["script"] = clean(body.get("script", t["script"]), 80000)
                if not t["script"]:
                    raise ValueError("请先提供可用文案。")
                if "accountId" in body:
                    t["accountId"] = clean(body.get("accountId"))
                t["_account"] = self._account(owner, t["accountId"])
                t["options"] = generator.normalise_options(body.get("options", t["options"]), t["platform"] or "抖音")
                t["_kind"] = self._kind(body,t["options"])
                t["_run"] = uid()
            elif t["status"] == "ready":
                return self._public(t)
            t.update(status="queued", stage="queued", error="")
            c.execute("UPDATE studio_tasks SET data=? WHERE id=? AND owner=?", (dump(t), task_id, owner))
        self.pool.submit(self._run, owner, task_id)
        return self._public(t)

    def upload(self, owner, task_id, path):
        path = Path(path)
        self._load(owner, task_id)
        media.inspect_media(path)
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda:f.read(256*1024), b""):
                h.update(chunk)
        key = digest(owner+"/upload/"+h.hexdigest())
        with self.mutex, self._asset_lock(key):
            t = self._load(owner, task_id)
            if t.get("_uploaded") and t["_asset"] == key and self._asset(key).get("until",0) > time.time():
                return self._public(t)
            if t["status"] in ("running","queued"):
                raise ValueError("请等待当前步骤结束。")
            dest = self.files / key
            temp = self.files / (uid()+".part")
            try:
                shutil.copyfile(path, temp)
                os.replace(temp, dest)
            finally:
                temp.unlink(missing_ok=True)
            a = self._asset(key)
            a.update(until=self._until(), title=t["title"] or "上传的视频", platform=t["platform"], original=True)
            self._set_asset(key, a)
            t.update(_asset=key, _key=key, _kind="normal", _run=uid(), _uploaded=True, script="", originalScript="",
                     status="queued", stage="queued", error="")
            self._save(t)
        self.pool.submit(self._run, owner, task_id)
        return self._public(t)

    def _until(self):
        return time.time() + number("COMMENT_MEDIA_HOURS", 24)*3600

    def _asset_lock(self, key):
        return self.asset_locks[int(key[:8],16) % len(self.asset_locks)]

    def _stage(self,t,stage):
        t.update(status="running",stage=stage,error="")
        self._save(t)

    def _resolve(self,t):
        owner = t["_owner"]
        src = digest(owner+"/"+t["_key"])
        with self.source_locks[int(src[:8],16) % len(self.source_locks)]:
            with self.db() as c:
                entry = c.execute("SELECT asset FROM studio_aliases WHERE id=?", (src,)).fetchone()
            key = t["_asset"] or (entry[0] if entry else "")
            a = self._asset(key)
            if key and (self.files/key).is_file() and a.get("until", 0)>time.time():
                return key
            if t.get("_uploaded"):
                raise ValueError("上传的视频已过期，请重新上传或补贴文案。")
            self._stage(t,"fetch")
            temp = self.files/(uid()+".part")
            try:
                info = media.fetch_video(t["_url"], temp)
                # Hash actual bytes so edits to the same work never reuse a stale transcript.
                h = hashlib.sha256()
                with temp.open("rb") as f:
                    for chunk in iter(lambda:f.read(256*1024), b""):
                        h.update(chunk)
                key = digest(owner+"/"+str(info.get("platform") or t["platform"])+"/"+str(info.get("workId") or src)+"/"+h.hexdigest())
                with self._asset_lock(key):
                    os.replace(temp, self.files/key)
                    a = self._asset(key)
                    a.update(info, until=self._until())
                    self._set_asset(key,a)
                    with self.db() as c:
                        c.execute("INSERT INTO studio_aliases VALUES(?,?) ON CONFLICT(id) DO UPDATE SET asset=excluded.asset", (src,key))
                return key
            finally:
                temp.unlink(missing_ok=True)

    def _prepare(self,t):
        key = self._resolve(t)
        with self._asset_lock(key):
            a = self._asset(key)
            t["_asset"] = key
            t["title"] = a.get("title") or t["title"]
            t["author"] = a.get("author") or ""
            if not t["accountId"] and a.get("authorId"):
                matches = [p for p in self.accounts(t["_owner"]) if p.get("platform")==t["platform"] and p.get("handle")==a["authorId"]]
                if len(matches)==1:
                    t["accountId"], t["_account"] = matches[0]["id"], matches[0]
            self._stage(t,"transcribe")
            if os.getenv("COMMENT_VIDEO_STORAGE","local") == "oss" and not a.get("objectKey"):
                a["objectKey"] = media.publish_video(self.files/key)
                self._set_asset(key,a)
            if not a.get("script"):
                checkpoint = a.setdefault("checkpoint",{})
                def save(cp):
                    a["checkpoint"] = dict(cp)
                    self._set_asset(key,a)
                if not a.get("reservation"):
                    availability = media.status()
                    if availability.get("asrReady") is False:
                        raise ValueError("语音识别尚未配置，请补贴文案，或配置后重试。")
                    details = media.inspect_media(self.files/key)
                    duration = math.ceil(details["duration"] if isinstance(details,dict) else details)
                    engine = os.getenv("COMMENT_ASR","paraformer")
                    charge = 0 if engine=="local" else number("COMMENT_ASR_CNY_PER_SECOND",0.00008)
                    a["reservation"] = Budget(self.db,t["_owner"],t["id"]).reserve("asr",engine,duration,duration*charge,{"estimatedSeconds":duration,"priced":True})
                    self._set_asset(key,a)
                try:
                    deadline = time.monotonic() + 3600
                    while True:
                        try:
                            value = media.transcribe(self.files/key, checkpoint, save)
                            break
                        except media.MediaError as exc:
                            checkpoint = a.get("checkpoint", {})
                            if (exc.code != "pending" or not checkpoint.get("asrTaskId")
                                    or self.stop.is_set() or time.monotonic() >= deadline):
                                raise
                            # The vendor already owns this job; only query its existing ID.
                            self.stop.wait(1)
                except media.MediaError as exc:
                    cp = a.get("checkpoint", {})
                    phase = cp.get("asrState")
                    never_submitted = not cp.get("asrTaskId") and phase not in ("pending","submitting","complete")
                    if phase in ("failed","rejected") or (never_submitted and exc.code in ("config","invalid","limit","media","upstream")):
                        status = "estimated" if phase=="failed" else "rejected"
                        with self.db() as c:
                            c.execute("UPDATE studio_usage SET status=? WHERE id=?", (status,a.pop("reservation")))
                        # A future submission requires its own reservation.
                        self._set_asset(key,a)
                    elif phase == "complete" and exc.code == "no_speech":
                        with self.db() as c:
                            c.execute("UPDATE studio_usage SET status='estimated' WHERE id=?", (a["reservation"],))
                    raise
                if not value or not value.strip():
                    raise ValueError("未识别到可用的人声，请补充文案或画面描述。")
                a["script"] = value
                with self.db() as c:
                    c.execute("UPDATE studio_usage SET status='estimated' WHERE id=?", (a["reservation"],))
                self._set_asset(key,a)
            t["originalScript"] = t["script"] = a["script"]
            self._save(t)

    def _write(self,t):
        self._stage(t,"generate")
        options = dict(t["options"])
        if t["title"] and not options.get("title"):
            options["title"] = t["title"]
        primary = options.get("provider") or generator.default_provider()
        compare = t["_kind"] == "compare"
        names = [primary, options.get("compareProvider")] if compare else [primary]
        if compare:
            # Five samples in total from each model, ensuring at least one per target.
            targets = list(options["platforms"])
            options["platforms"] = {name:5//len(targets)+(i<5%len(targets)) for i,name in enumerate(targets)}
            if options.get("replyCount") is not None:
                options["replyCount"] = min(5, options["replyCount"])
        for provider in names:
            if any(b.get("runId")==t["_run"] and b.get("requestedProvider")==provider for b in t["batches"]):
                continue
            used = provider
            usage = Budget(self.db,t["_owner"],t["id"])
            start = time.monotonic()
            try:
                rows = generator.generate(t["script"],options,t["_account"],provider,record_usage=usage)
            except generator.ProviderRejected:
                usage.reject()
                fallback = os.getenv("COMMENT_FALLBACK_PROVIDER","")
                if compare or not fallback or fallback == provider:
                    raise
                used = fallback
                rows = generator.generate(t["script"],options,t["_account"],used,record_usage=usage)
            batch = dict(id=uid(),runId=t["_run"],requestedProvider=provider,provider=used,kind=t["_kind"],createdAt=stamp(),
                         durationMs=int((time.monotonic()-start)*1000),rows=rows,script=t["script"],options=options,
                         account=dict(t["_account"]),promptVersion="1.1")
            t["batches"].append(batch)
            self._save(t)

    def _run(self,owner,tid):
        t = self._load(owner,tid)
        try:
            if not t["script"]:
                self._prepare(t)
            self._write(t)
            t.update(status="ready",stage="done",error="")
        except (ValueError,RuntimeError,OSError,media.MediaError) as exc:
            t.update(status="needs_input" if not t["script"] else "failed",error=str(exc)[:1000])
        except Exception:
            import logging
            logging.exception("Task %s failed", tid)
            t.update(status="failed",error="处理时发生异常；已完成的内容仍然可用。")
        self._save(t)

    def _media_asset(self,owner,tid):
        t = self._load(owner,tid)
        key = t["_asset"]
        a = self._asset(key)
        if not a or a.get("until",0)<=time.time():
            raise KeyError("视频不存在或已过期。")
        return key,a

    def media(self,owner,tid):
        key,a = self._media_asset(owner,tid)
        if not (self.files/key).is_file():
            raise KeyError("视频文件不可用。")
        return self.files/key, a.get("title") or "视频"

    def media_redirect(self,owner,tid,download=False):
        _,a = self._media_asset(owner,tid)
        if a.get("objectKey"):
            ttl = min(600,max(1,int(a["until"]-time.time())))
            return media.signed_video_url(a["objectKey"],ttl,download)
        return ""

    def subtitles(self, owner, tid):
        t = self._load(owner, tid)
        a = self._asset(t.get("_asset",""))
        segments = (a.get("checkpoint") or {}).get("asrSegments", [])
        if not segments:
            raise KeyError("这条任务还没有带时间轴的识别结果。")

        def timecode(seconds):
            minutes, ms = divmod(round(max(0, float(seconds)) * 1000), 60000)
            hours, minutes = divmod(minutes, 60)
            sec, ms = divmod(ms, 1000)
            return f"{hours:02d}:{minutes:02d}:{sec:02d},{ms:03d}"

        blocks = []
        for sequence, segment in enumerate(segments, 1):
            start = timecode(segment["start"])
            end = timecode(segment["end"])
            blocks.append(f"{sequence}\n{start} --> {end}\n{segment['text']}")
        return "\n\n".join(blocks)+"\n"

    def usage(self, owner):
        query = "SELECT owner,task,stage,provider,units,amount,status,at,detail FROM studio_usage"
        parameters = ()
        if owner is not None:
            query += " WHERE owner=?"
            parameters = (owner,)
        with self.db() as conn:
            rows = conn.execute(query + " ORDER BY id DESC LIMIT 200", parameters).fetchall()
        entries = []
        for record_owner, *fields, raw in rows:
            entry = dict(zip(("task","stage","provider","units","estimatedCny","status","at"), fields))
            if owner is None:
                prefix, _, account_id = (record_owner or "").partition(":")
                entry["publisherId"] = int(account_id) if prefix == "publisher" and account_id.isdecimal() else None
            detail = json.loads(raw)
            entry.update({key:detail.get(key) for key in ("model","priced","inputTokens","outputTokens","attempt")})
            entries.append(entry)
        return entries

    def _cleanup_loop(self):
        while not self.stop.wait(60):
            try:
                with self.db() as c:
                    rows = c.execute("SELECT id,data FROM studio_assets").fetchall()
                for key,raw in rows:
                    candidate=json.loads(raw)
                    if not candidate.get("until") or candidate["until"]>time.time():
                        continue
                    with self._asset_lock(key):
                        a = self._asset(key)
                        if a.get("until",0)>time.time():
                            continue
                        (self.files/key).unlink(missing_ok=True)
                        if a.get("objectKey"):
                            media.delete_video(a["objectKey"])
                            a.pop("objectKey")
                        a["until"]=0
                        self._set_asset(key,a)
            except Exception:
                import logging
                logging.exception("Media retention cleanup could not finish.")
