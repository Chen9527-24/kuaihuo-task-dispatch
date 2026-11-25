import io
import json
import os
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

import generator


def row(text, platform="抖音", reply="", advice=""):
    return {"text": text, "platform": platform, "type": "细节追问", "reply": reply, "advice": advice}


def encoded(rows, request_id="request-1"):
    content = json.dumps({"rows": rows}, ensure_ascii=False)
    return io.BytesIO(json.dumps({"choices": [{"message": {"content": content}}], "id": request_id,
                                  "usage": {"prompt_tokens": 210, "completion_tokens": 46}}).encode())


class GeneratorTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"QWEN_API_KEY": "local-test-key",
                                           "QWEN_BASE_URL": "http://localhost:9999/v1",
                                           "COMMENT_MAX_COMMENTS": "100"}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.connection = Mock()
        self.opener = patch("generator.urllib.request.build_opener", return_value=self.connection)
        self.opener.start()
        self.addCleanup(self.opener.stop)
        self.usage = Mock()

    def test_success_and_usage_bounds(self):
        self.connection.open.return_value = encoded([row("第一批开模算哪批？")])
        comments = generator.generate("第一批做二十个外壳", {"platforms": {"抖音": 1}, "required": "开模"},
                                      {}, "qwen", self.usage)
        self.assertEqual(comments[0]["text"], "第一批开模算哪批？")
        request = self.connection.open.call_args.args[0]
        request_json = json.loads(request.data)
        self.assertEqual(request.full_url, "http://localhost:9999/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer local-test-key")
        self.assertEqual(self.usage.before_call.call_args.args[0]["outputTokenLimit"], request_json["max_tokens"])
        self.assertGreaterEqual(self.usage.before_call.call_args.args[0]["inputTokenLimit"], len(request.data))
        event = self.usage.call_args.args[0]
        self.assertEqual((event["status"], event["outputTokens"], event["estimated"]), ("completed", 46, False))
        self.assertNotIn("local-test-key", str(event))
        self.assertNotIn("local-test-key", str(generator.providers()))

    def test_only_missing_rows_repaired_across_platforms(self):
        original = row("壳的厚度是多少？", reply="图纸上有标")
        self.connection.open.side_effect = [encoded([original, row("壳的厚度是多少!"), row("包过质检", "小红书")]),
                                           encoded([row("先开模还是改卡扣？"), row("补单需要原来的图纸吗？", "小红书")])]
        options = {"platforms": {"抖音": 2, "小红书": 1}, "required": "开模",
                   "forbidden": "包过", "replies": True, "replyCount": 1}
        actual = generator.generate("打样需要图纸", options, {}, "qwen", self.usage)
        repair_call = self.connection.open.call_args_list[1].args[0]
        repair_brief = json.loads(json.loads(repair_call.data)["messages"][1]["content"])
        self.assertEqual(repair_brief["目标平台主评论条数"], {"抖音": 1, "小红书": 1})
        self.assertEqual(repair_brief["已有主评论，请避免重复"], ["壳的厚度是多少？"])
        self.assertEqual(len(actual), 3)
        self.assertEqual(sum(bool(r["reply"]) for r in actual), 1)
        self.assertEqual(self.usage.before_call.call_count, 2)

    def test_missing_keyword_replaces_one_row(self):
        self.connection.open.side_effect = [encoded([row("壳壁多厚？"), row("孔开在哪里？")]),
                                           encoded([row("开模时能把孔留出来吗？")])]
        result = generator.generate("先试装再开模", {"platforms": {"抖音": 2}, "required": "开模"},
                                    {}, "qwen", self.usage)
        self.assertEqual(len(result), 2)
        self.assertTrue(any(r["text"] == "孔开在哪里？" for r in result))

    def test_validation_precedes_spending(self):
        with self.assertRaises(generator.InvalidOptions):
            generator.generate("开模", {"required": "开模费用", "forbidden": "费用"}, {}, "qwen", self.usage)
        self.connection.open.assert_not_called()
        self.usage.before_call.assert_not_called()

    def test_fallback_only_for_explicit_initial_rejection(self):
        self.connection.open.side_effect = HTTPError("https://example.test", 429, "busy", {}, io.BytesIO())
        with self.assertRaises(generator.ProviderRejected):
            generator.generate("开模", {}, {}, "qwen", self.usage)
        self.assertEqual(self.usage.call_args.args[0]["status"], "rejected")
        self.connection.open.side_effect = URLError("timeout")
        self.usage.reset_mock()
        with self.assertRaises(generator.UncertainGeneration):
            generator.generate("开模", {}, {}, "qwen", self.usage)
        self.usage.assert_not_called()
        self.usage.before_call.assert_called_once()

    @patch.dict(os.environ, {"ARK_API_KEY": "test-key", "ARK_MODEL": "test-model"})
    def test_ark_forbidden_distinguishes_overdue_from_auth(self):
        for body, expected in (
            (b'{"error":{"code":"AccountOverdueError","message":"private details"}}', "火山方舟账户欠费"),
            (b'{"error":{"code":"AccessDenied","message":"AccountOverdueError"}}', "认证失败"),
            (b"Gateway error", "认证失败"),
        ):
            with self.subTest(expected=expected, body=body):
                self.connection.reset_mock()
                self.usage.reset_mock()
                self.connection.open.side_effect = HTTPError("https://example.test", 403, "", {}, io.BytesIO(body))
                with self.assertRaisesRegex(generator.GenerationError, expected) as failed:
                    generator.generate("开模", {}, {}, "ark", self.usage)
                self.assertNotIsInstance(failed.exception, generator.ProviderRejected)
                self.assertNotIn("private details", str(failed.exception))
                self.connection.open.assert_called_once()
                event = self.usage.call_args.args[0]
                self.assertEqual((event["status"], event["httpStatus"], event["inputTokens"], event["outputTokens"]),
                                 ("rejected", 403, 0, 0))

    def test_repair_limit_and_rejected_repair_no_full_replay(self):
        self.connection.open.side_effect = [encoded([]), HTTPError("https://example.test", 429, "busy", {}, io.BytesIO())]
        with self.assertRaises(generator.GenerationError) as failed:
            generator.generate("开模", {"platforms": {"抖音": 1}}, {}, "qwen", self.usage)
        self.assertNotIsInstance(failed.exception, generator.ProviderRejected)
        self.assertEqual(self.connection.open.call_count, 2)

    def test_prompt_and_defaults(self):
        prompt = generator.build_prompt("机台空转", {"required": ["打样"], "optional": "开模、装配", "notes": "多留一些细节追问"},
                                        {"platform": "小红书", "industry": "制造业", "voice": "短句"})
        self.assertIn('"小红书": 10', prompt)
        self.assertIn("制造业", prompt)
        self.assertIn("开模", prompt)
        self.assertNotIn("配套回复｜发布建议", prompt)
        with self.assertRaises(generator.InvalidOptions):
            generator.normalise_options({"platforms": {"抖音": 101}})


if __name__ == "__main__":
    unittest.main()
