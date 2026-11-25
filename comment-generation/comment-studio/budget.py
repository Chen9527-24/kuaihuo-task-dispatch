"""Reserve budget before external calls and keep ambiguous calls visible."""
import json
import math
import os
import time
from datetime import datetime, timedelta, timezone


def number(name, default):
    value = float(os.getenv(name, default))
    if value < 0 or not math.isfinite(value):
        raise ValueError(f"配置 {name} 必须是非负数")
    return value


class Budget:
    def __init__(self, db, owner, task):
        self.db, self.owner, self.task = db, owner, task
        self.current = None

    def reserve(self, stage, provider, units, amount, detail):
        now = datetime.now(timezone(timedelta(hours=8)))
        day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        with self.db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            for start, window, calls, seconds in [(day, "DAILY", 100, 3600), (day.replace(day=1), "MONTHLY", 1500, 36000)]:
                calls_used, asr_used, money = conn.execute(
                    "SELECT coalesce(sum(CASE WHEN stage='generation' THEN 1 ELSE 0 END),0), "
                    "coalesce(sum(CASE WHEN stage='asr' THEN units ELSE 0 END),0),coalesce(sum(amount),0) "
                    "FROM studio_usage WHERE at>=? AND status!='rejected'", (start.timestamp(),)).fetchone()
                if stage == "generation" and calls_used + 1 > number("COMMENT_"+window+"_CALLS", calls):
                    raise ValueError("模型调用额度已用完。已完成的素材可继续使用。")
                if stage == "asr" and asr_used + units > number("COMMENT_"+window+"_ASR_SECONDS", seconds):
                    raise ValueError("语音转写时长额度不足，可手动填写视频文案。")
                money_limit = os.getenv("COMMENT_"+window+"_CNY", "").strip()
                if money_limit and money + amount > number("COMMENT_"+window+"_CNY", 0):
                    raise ValueError("已达到平台费用预算，当前任务保留已完成的内容。")
            cur = conn.execute("INSERT INTO studio_usage(owner,task,stage,provider,at,units,amount,status,detail) VALUES (?,?,?,?,?,?,?,'reserved',?)",
                               (self.owner, self.task, stage, provider, time.time(), units, amount, json.dumps(detail)))
            return cur.lastrowid

    def rates(self, provider):
        name = provider.upper()
        capped = any(os.getenv(k, '').strip() for k in ("COMMENT_DAILY_CNY", "COMMENT_MONTHLY_CNY"))
        fields = ["COMMENT_"+name+"_INPUT_CNY_PER_M", "COMMENT_"+name+"_OUTPUT_CNY_PER_M"]
        if capped and any(os.getenv(k, "").strip() == "" for k in fields):
            raise ValueError("已设置金额上限，请先配置所选模型的输入和输出单价。")
        return [number(k, 0) for k in fields]

    @staticmethod
    def price_set(provider):
        return all(os.getenv("COMMENT_"+provider.upper()+"_"+direction+"_CNY_PER_M","").strip()
                   for direction in ("INPUT","OUTPUT"))

    def before_call(self, event):
        provider = event["provider"]
        inp, out = self.rates(provider)
        cost = (event.get("inputTokenLimit", 0)*inp + event.get("outputTokenLimit", 0)*out)/1000000
        detail = dict(event, priced=self.price_set(provider))
        self.current = self.reserve("generation", provider, 1, cost, detail)

    def __call__(self, event):
        provider = event["provider"]
        if self.current is None:
            self.before_call(event)
        if event.get("status") == "rejected":
            self.reject()
            return
        inp, out = self.rates(provider)
        event = dict(event, priced=self.price_set(provider))
        actual = (event.get("inputTokens", 0)*inp + event.get("outputTokens", 0)*out)/1000000
        with self.db() as conn:
            if event.get("estimated"):
                conn.execute("UPDATE studio_usage SET status='estimated',detail=? WHERE id=?", (json.dumps(event), self.current))
            else:
                conn.execute("UPDATE studio_usage SET status='measured',amount=?,detail=? WHERE id=?", (actual, json.dumps(event), self.current))
        self.current = None

    def reject(self):
        if self.current:
            with self.db() as conn:
                conn.execute("UPDATE studio_usage SET status='rejected',amount=0 WHERE id=?", (self.current,))
        self.current = None
