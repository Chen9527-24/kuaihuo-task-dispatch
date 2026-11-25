import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import settings


class LocalSettingsTests(unittest.TestCase):
    def test_secret_write_only_update_and_permissions(self):
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ, {}, clear=True):
            settings.configure(root)
            visible = settings.update({"values":{"DASHSCOPE_API_KEY":"test-admin-secret","COMMENT_DAILY_CALLS":"8"}})
            self.assertNotIn("test-admin-secret",json.dumps(visible))
            self.assertEqual(os.getenv("COMMENT_DAILY_CALLS"),"8")
            settings.update({"values":{"DASHSCOPE_API_KEY":""}})
            self.assertEqual(os.getenv("DASHSCOPE_API_KEY"),"test-admin-secret")
            self.assertEqual((Path(root)/"admin-settings.json").stat().st_mode & 0o777,0o600)
            with self.assertRaises(ValueError):
                settings.update({"values":{"QWEN_BASE_URL":"https://example.com/wrong","COMMENT_DAILY_CALLS":"2"}})
            self.assertEqual(os.getenv("COMMENT_DAILY_CALLS"),"8")
