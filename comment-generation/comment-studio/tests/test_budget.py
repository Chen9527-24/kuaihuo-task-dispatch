import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from budget import Budget
from workflow import Studio


class CostControls(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.app = Studio(Path(folder.name))
        self.addCleanup(self.app.close)
        self.owner, _ = self.app.owner(None)
        self.event = {"stage":"generate", "provider":"qwen", "model":"test", "attempt":"initial",
                      "inputTokenLimit":100000, "outputTokenLimit":100000}

    def test_budget_reservation_unknown_outcome_and_settlement(self):
        config = {"COMMENT_DAILY_CNY":"1", "COMMENT_QWEN_INPUT_CNY_PER_M":"2", "COMMENT_QWEN_OUTPUT_CNY_PER_M":"5"}
        with patch.dict(os.environ, config, clear=True):
            first = Budget(self.app.db, self.owner, "one")
            second = Budget(self.app.db, self.owner, "two")
            first.before_call(self.event)
            with self.assertRaisesRegex(ValueError, "预算"):
                second.before_call(self.event)
            first(dict(self.event,inputTokens=100,outputTokens=200,estimated=False))
            second.before_call(self.event)
            result = self.app.usage(self.owner)
            self.assertEqual([x["status"] for x in result], ["reserved","measured"])
            self.assertAlmostEqual(result[1]["estimatedCny"],0.0012)
            second.reject()
            self.assertEqual(self.app.usage(self.owner)[0]["status"],"rejected")

    def test_price_cap_requires_configured_rate(self):
        with patch.dict(os.environ, {"COMMENT_DAILY_CNY":"1"},clear=True):
            with self.assertRaisesRegex(ValueError,"单价"):
                Budget(self.app.db,self.owner,"one").before_call(self.event)
            self.assertEqual(self.app.usage(self.owner),[])

    def test_two_processes_cannot_share_db_queue(self):
        with self.assertRaisesRegex(ValueError,"已有一个工作台"):
            Studio(self.app.root)
