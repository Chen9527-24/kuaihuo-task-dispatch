"""Integration checks for the persisted workflow. External services are test doubles."""

import concurrent.futures
import os
import tempfile
import threading
import time
import unittest
import uuid
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

import generator
import media
import workflow


SCRIPT = "首批做二十个外壳，先打样，再决定是否开模。"
LINK = "https://v.douyin.com/TestLinkA/"


def request_id():
    return uuid.uuid4().hex


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.patches = ExitStack()
        self.addCleanup(self.patches.close)
        environment = {k: v for k, v in os.environ.items()
                       if not k.startswith(("COMMENT_", "QWEN_", "DEEPSEEK_", "ARK_"))}
        environment.update({
            "QWEN_API_KEY": "offline-test-only",
            "COMMENT_DEFAULT_PROVIDER": "qwen",
            "DEEPSEEK_API_KEY": "offline-test-only",
        })
        self.patches.enter_context(mock.patch.dict(os.environ, environment, clear=True))
        self.downloads = []
        self.transcriptions = []
        self.generations = []
        self.model_error = None
        self.model_errors = {}
        self.model_gate = None
        self.asr_error = None
        self.entered = threading.Event()
        self.patches.enter_context(mock.patch.object(generator, "generate", self.make_comments))
        self.patches.enter_context(mock.patch.object(media, "fetch_video", self.fetch_video))
        self.patches.enter_context(mock.patch.object(media, "transcribe", self.transcribe))
        self.patches.enter_context(mock.patch.object(media, "inspect_media", return_value=2))
        self.patches.enter_context(mock.patch.object(media, "status", return_value={"asrReady": True}))
        self.data_dir = Path(self.temporary.name)
        self.app = workflow.Studio(self.data_dir)
        self.addCleanup(self.app.close)
        self.owner, self.cookie = self.app.owner("")

    def make_comments(self, script, options, account, provider, record_usage=None):
        event = {"provider": provider, "model": "fixture", "stage": "generate", "attempt": "initial",
                 "inputTokenLimit": 100, "outputTokenLimit": 500}
        record_usage.before_call(dict(event, status="pending"))
        self.generations.append((script, dict(options), provider))
        self.entered.set()
        if self.model_gate is not None and not self.model_gate.wait(4):
            raise RuntimeError("Test did not release the model call")
        error = self.model_errors.get(provider, self.model_error)
        if error:
            if isinstance(error, generator.ProviderRejected):
                record_usage(dict(event, status="rejected", httpStatus=429))
            raise error
        record_usage(dict(event, status="completed", inputTokens=45, outputTokens=78,
                          estimated=False, requestId=request_id()))
        return [
            {"platform": platform, "type": "细节追问", "text": f"{platform}试样问题 {n}",
             "reply": "", "advice": ""}
            for platform, count in options["platforms"].items()
            for n in range(count)
        ]

    def fetch_video(self, source, destination):
        self.downloads.append(source)
        Path(destination).write_bytes(b"fixture for the simulated downloader")
        return {"title": "首批试样", "platform": "抖音", "workId": "7350000000",
                "author": "示例工厂", "authorId": "sample-author"}

    def transcribe(self, path, checkpoint, save_checkpoint):
        self.transcriptions.append(Path(path))
        if self.asr_error:
            raise self.asr_error
        return SCRIPT

    def create(self, mode="manual", **values):
        body = {"requestId": request_id(), "mode": mode,
                "options": {"platforms": {"抖音": 3}, "provider": "qwen"}}
        body.update({"source": LINK} if mode == "link" else {"script": SCRIPT})
        body.update(values)
        return self.app.create(self.owner, body)

    def wait_for_task(self, task_id, **expected):
        deadline = time.monotonic() + 6
        while True:
            current = self.app.task(self.owner, task_id)
            if all(current.get(k) == v for k, v in expected.items()):
                return current
            if time.monotonic() >= deadline:
                self.fail(f"Task did not reach {expected}. Last state: {current}")
            time.sleep(0.015)

    def wait_for_failure(self, task_id):
        deadline = time.monotonic() + 6
        while time.monotonic() < deadline:
            task = self.app.task(self.owner, task_id)
            if task.get("status") in {"failed", "needs_input"}:
                return task
            time.sleep(0.015)
        self.fail(f"Job should report a recoverable failure: {task}")

    def test_preview_constructs_prompt_without_creating_a_task_or_charging(self):
        body = {"mode": "manual", "script": SCRIPT, "options": {
            "platforms": {"小红书": 2}, "required": "开模", "focus": "成本"}}
        result = self.app.prompt(self.owner, body)
        prompt = result["prompt"] if isinstance(result, dict) else result
        self.assertIn(SCRIPT, prompt)
        self.assertIn("小红书", prompt)
        self.assertIn("成本", prompt)
        self.assertEqual(self.app.tasks(self.owner), [])
        self.assertEqual(self.generations, [])

    def test_manual_text_is_sufficient_and_requires_no_media_services(self):
        task = self.create()
        ready = self.wait_for_task(task["id"], status="ready")
        self.assertEqual(ready["script"], SCRIPT)
        self.assertEqual(len(ready["batches"][0]["rows"]), 3)
        self.assertEqual(len(self.generations), 1)
        self.assertEqual(self.downloads, [])
        self.assertEqual(self.transcriptions, [])

    def test_other_visitor_cannot_read_or_reuse_content_and_account(self):
        other, other_cookie = self.app.owner("")
        self.assertNotEqual(self.cookie, other_cookie)
        self.assertEqual(self.app.owner(self.cookie)[0], self.owner)
        account = self.app.save_account(self.owner, None, {"name": "模具制造", "voice": "用短句"})
        task = self.create(accountId=account["id"])
        self.wait_for_task(task["id"], status="ready")
        self.assertEqual(self.app.tasks(other), [])
        self.assertEqual(self.app.accounts(other), [])
        with self.assertRaises((PermissionError, KeyError, ValueError)):
            self.app.task(other, task["id"])
        with self.assertRaises((PermissionError, KeyError, ValueError)):
            self.app.create(other, {"mode": "manual", "script": SCRIPT,
                                    "accountId": account["id"], "requestId": request_id()})

    def test_concurrent_repeats_share_job_but_new_request_has_independent_id(self):
        body = {"mode": "manual", "script": SCRIPT, "requestId": request_id(),
                "options": {"platforms": {"抖音": 3}, "provider": "qwen"}}
        self.model_gate = threading.Event()
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                calls = [pool.submit(self.app.create, self.owner, body.copy()) for _ in range(4)]
                results = [f.result(4) for f in calls]
            self.assertEqual(len({t["id"] for t in results}), 1)
            self.assertTrue(self.entered.wait(2))
        finally:
            self.model_gate.set()
        self.wait_for_task(results[0]["id"], status="ready")
        self.assertEqual(len(self.generations), 1)
        other = self.create()
        self.assertNotEqual(other["id"], results[0]["id"])
        self.wait_for_task(other["id"], status="ready")

    def test_link_revisions_keep_original_media_and_previous_comment_batch(self):
        task = self.create("link")
        ready = self.wait_for_task(task["id"], status="ready")
        original = ready["batches"][0]["id"]
        self.assertEqual(ready["title"], "首批试样")
        self.assertEqual(ready["script"], SCRIPT)
        self.assertTrue(ready["mediaUrl"])
        path, _ = self.app.media(self.owner, task["id"])
        self.assertTrue(Path(path).is_file())
        other, _ = self.app.owner("")
        with self.assertRaises((PermissionError, KeyError, ValueError)):
            self.app.media(other, task["id"])
        edited = SCRIPT + "第二批改成五十个。"
        body = {"requestId": request_id(), "kind": "normal", "script": edited,
                "options": {"platforms": {"抖音": 2}, "provider": "qwen"}}
        self.app.generate(self.owner, task["id"], body)
        revised = self.wait_for_task(task["id"], status="ready", script=edited)
        self.assertEqual(len(self.downloads), 1)
        self.assertEqual(len(self.transcriptions), 1)
        self.assertEqual([g[0] for g in self.generations], [SCRIPT, edited])
        self.assertIn(original, [b["id"] for b in revised["batches"]])
        self.assertEqual(len(revised["batches"]), 2)

    def test_model_failure_preserves_transcript_and_retries_only_generation(self):
        self.model_error = RuntimeError("service rejected the test request")
        task = self.create("link")
        failed = self.wait_for_task(task["id"], status="failed")
        self.assertEqual(failed["script"], SCRIPT)
        self.assertTrue(failed["mediaUrl"])
        self.assertTrue(failed["error"])
        self.model_error = None
        self.app.retry(self.owner, task["id"], {"requestId": request_id()})
        self.wait_for_task(task["id"], status="ready")
        self.assertEqual(len(self.downloads), 1)
        self.assertEqual(len(self.transcriptions), 1)
        self.assertEqual(len(self.generations), 2)

    def test_transcription_failure_keeps_download_and_accepts_manual_script(self):
        self.asr_error = RuntimeError("unavailable test recognition service")
        task = self.create("link")
        failed = self.wait_for_failure(task["id"])
        self.assertTrue(failed["mediaUrl"])
        self.assertFalse(failed["script"])
        self.assertEqual(self.generations, [])
        self.app.generate(self.owner, task["id"], {
            "requestId": request_id(), "kind": "normal", "script": SCRIPT,
            "options": {"platforms": {"小红书": 1}, "provider": "qwen"}})
        ready = self.wait_for_task(task["id"], status="ready")
        self.assertEqual(ready["script"], SCRIPT)
        self.assertEqual(len(self.downloads), 1)
        self.assertEqual(len(self.transcriptions), 1)
        self.assertEqual(len(self.generations), 1)

    def test_comparison_persists_two_small_batches_and_reuses_transcript(self):
        task = self.create("link")
        self.wait_for_task(task["id"], status="ready")
        self.app.generate(self.owner, task["id"], {
            "requestId": request_id(), "kind": "compare", "script": SCRIPT,
            "options": {"platforms": {"抖音": 20, "小红书": 10}, "provider": "qwen",
                        "compareProvider": "deepseek"}})
        ready = self.wait_for_task(task["id"], status="ready")
        samples = [b for b in ready["batches"] if b["kind"] == "compare"]
        self.assertEqual({b["provider"] for b in samples}, {"qwen", "deepseek"})
        self.assertEqual([len(b["rows"]) for b in samples], [5, 5])
        self.assertEqual(len(self.downloads), 1)
        self.assertEqual(len(self.transcriptions), 1)
        self.assertEqual(len(self.generations), 3)

    def test_same_source_processed_concurrently_reuses_download_and_recognition(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self.create, "link") for _ in range(2)]
            tasks = [future.result(3) for future in futures]
        ready = [self.wait_for_task(task["id"], status="ready") for task in tasks]
        self.assertNotEqual(ready[0]["id"], ready[1]["id"])
        self.assertNotEqual(ready[0]["batches"][0]["id"], ready[1]["batches"][0]["id"])
        self.assertEqual(len(self.downloads), 1)
        self.assertEqual(len(self.transcriptions), 1)
        self.assertEqual(len(self.generations), 2)

    def test_missing_second_comparison_batch_can_be_retried_independently(self):
        task = self.create()
        self.wait_for_task(task["id"], status="ready")
        self.model_errors["deepseek"] = generator.ProviderRejected("simulated refusal")
        self.app.generate(self.owner, task["id"], {
            "kind": "compare", "requestId": request_id(),
            "options": {"provider": "qwen", "compareProvider": "deepseek", "platforms": {"抖音": 10}},
        })
        self.wait_for_task(task["id"], status="failed")
        self.model_errors.clear()
        self.app.retry(self.owner, task["id"], {"requestId": request_id()})
        ready = self.wait_for_task(task["id"], status="ready")
        self.assertEqual([g[2] for g in self.generations], ["qwen", "qwen", "deepseek", "deepseek"])
        self.assertEqual([b["provider"] for b in ready["batches"] if b["kind"] == "compare"],
                         ["qwen", "deepseek"])

    def test_replacement_upload_recovers_in_same_task(self):
        with mock.patch.object(media, "fetch_video", side_effect=ValueError("expired share link")):
            task = self.create("link")
            failed = self.wait_for_failure(task["id"])
        self.assertFalse(failed["mediaUrl"])
        upload = self.data_dir / "my-source.mp4"
        upload.write_bytes(b"simulated local video")
        self.app.upload(self.owner, task["id"], upload)
        ready = self.wait_for_task(task["id"], status="ready")
        self.assertEqual(ready["id"], task["id"])
        self.assertEqual(ready["script"], SCRIPT)
        self.assertTrue(ready["mediaUrl"])
        self.assertEqual(len(self.transcriptions), 1)

    def test_budget_limits_stop_calls_before_provider_submission(self):
        with mock.patch.dict("os.environ", {"COMMENT_DAILY_CALLS": "1"}):
            first = self.create()
            self.wait_for_task(first["id"], status="ready")
            second = self.create()
            limited = self.wait_for_task(second["id"], status="failed")
        self.assertEqual(len(self.generations), 1)
        self.assertIn("额度", limited["error"])
        self.assertEqual(limited["script"], SCRIPT)
        with mock.patch.dict("os.environ", {
            "COMMENT_DAILY_CNY": "0.01", "COMMENT_QWEN_INPUT_CNY_PER_M": "1000",
            "COMMENT_QWEN_OUTPUT_CNY_PER_M": "1000"}):
            third = self.create()
            capped = self.wait_for_task(third["id"], status="failed")
        self.assertIn("预算", capped["error"])
        self.assertEqual(len(self.generations), 1)

    def test_unknown_charge_stays_reserved_and_does_not_switch_model(self):
        self.model_errors["qwen"] = generator.UncertainGeneration("test connection timed out")
        with mock.patch.dict("os.environ", {"COMMENT_FALLBACK_PROVIDER": "deepseek"}):
            task = self.create()
            self.wait_for_task(task["id"], status="failed")
        self.assertEqual([g[2] for g in self.generations], ["qwen"])
        entries = self.app.usage(self.owner)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["status"], "reserved")

    def test_confirmed_rejection_can_use_one_configured_fallback(self):
        self.model_errors["qwen"] = generator.ProviderRejected("fixture rate limit")
        with mock.patch.dict("os.environ", {"COMMENT_FALLBACK_PROVIDER": "deepseek"}):
            task = self.create()
            ready = self.wait_for_task(task["id"], status="ready")
        self.assertEqual([g[2] for g in self.generations], ["qwen", "deepseek"])
        self.assertEqual(ready["batches"][0]["provider"], "deepseek")
        self.assertEqual({e["status"] for e in self.app.usage(self.owner)}, {"measured", "rejected"})

    def test_first_submission_can_compare_before_a_full_batch(self):
        task = self.create(kind="compare",options={
            "provider":"qwen","compareProvider":"deepseek","platforms":{"抖音":50}})
        ready = self.wait_for_task(task["id"],status="ready")
        self.assertEqual([len(b["rows"]) for b in ready["batches"]],[5,5])
        self.assertEqual([b["provider"] for b in ready["batches"]],["qwen","deepseek"])
        self.assertTrue(all(b["kind"]=="compare" for b in ready["batches"]))

    def test_original_timestamp_export_survives_manual_edits(self):
        def timestamped(path,checkpoint,save):
            save({"asrState":"complete","asrText":SCRIPT,"asrSegments":[{"start":0.125,"end":2.25,"text":SCRIPT}]})
            return SCRIPT
        with mock.patch.object(media,"transcribe",timestamped):
            task=self.create("link")
            ready=self.wait_for_task(task["id"],status="ready")
        self.assertTrue(ready["subtitlesUrl"].endswith("/subtitles.srt"))
        subs=self.app.subtitles(self.owner,task["id"])
        self.assertIn("00:00:00,125 --> 00:00:02,250",subs)
        other,_=self.app.owner(None)
        with self.assertRaises(KeyError):
            self.app.subtitles(other,task["id"])
        self.app.generate(self.owner,task["id"],{"script":"手工修订内容","requestId":request_id()})
        self.wait_for_task(task["id"],status="ready")
        self.assertEqual(self.app.subtitles(self.owner,task["id"]),subs)


if __name__ == "__main__":
    unittest.main()
