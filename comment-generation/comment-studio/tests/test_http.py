"""HTTP transport regressions using local connected sockets, without a listening port."""
import json
import os
import socket
import sys
import tempfile
import threading
import unittest
from http.client import HTTPResponse
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Handler


class StubStudio:
    def __init__(self, path):
        self.path = path
        self.remote = ""
        self.uploaded = b""

    def status(self):
        return {"providers": []}

    def owner(self, token):
        return (token, None) if token in ("one", "two") else ("one", "one")

    def create(self, owner, body):
        return dict(body, id="task1", owner=owner)

    def task(self, owner, task_id):
        if owner != "one" or task_id != "task1":
            raise KeyError(task_id)
        return {"id": task_id}

    def media(self, owner, task_id):
        self.task(owner, task_id)
        return self.path, "视频示例"

    def subtitles(self, owner, task_id):
        self.task(owner, task_id)
        return "1\n00:00:00,000 --> 00:00:01,000\n开模。\n"

    def media_redirect(self, owner, task_id, download):
        self.task(owner, task_id)
        return self.remote

    def upload(self, owner, task_id, path):
        self.task(owner, task_id)
        self.uploaded = path.read_bytes()
        return {"id": task_id}


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        directory = Path(self.temp.name).resolve()
        self.video = b"\x00\x00\x00\x18ftypisom00001234567890"
        video_path = directory / "media_file_with_no_suffix"
        video_path.write_bytes(self.video)
        self.studio = StubStudio(video_path)
        self.server = SimpleNamespace(studio=self.studio, web_root=directory, data_dir=directory,
                                      local_only=True, public_origin=None, server_port=8766,
                                      max_upload=128, upload_slots=threading.BoundedSemaphore(1))
        (directory / "index.html").write_text("<title>Studio</title>")
        self.addCleanup(self.temp.cleanup)

    def request(self, method, path, headers=None, body=b"", peer="127.0.0.1"):
        values = {"Host": "localhost:8766", "Connection": "close", **(headers or {})}
        if body:
            values.setdefault("Content-Length", str(len(body)))
        message = "%s %s HTTP/1.1\r\n%s\r\n\r\n" % (
            method, path, "\r\n".join("%s: %s" % item for item in values.items()))
        left, right = socket.socketpair()
        with left, right:
            left.sendall(message.encode("ascii") + body)
            left.shutdown(socket.SHUT_WR)
            Handler(right, (peer, 50000), self.server)
            right.shutdown(socket.SHUT_WR)
            response = HTTPResponse(left, method=method)
            response.begin()
            with response:
                return response.status, dict(response.getheaders()), response.read()

    def test_home_session_and_status(self):
        code, headers, data = self.request("GET", "/?task=task1")
        self.assertEqual(code, 200)
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("Studio", data.decode())
        self.assertTrue(json.loads(self.request("GET", "/api/status")[2])["localAdmin"])

    def test_local_media_range_download_and_owner(self):
        code, headers, data = self.request("GET", "/api/tasks/task1/media?download=1",
                                           {"Cookie": "comment_studio_session=one", "Range": "bytes=-5"})
        self.assertEqual(code, 206)
        self.assertEqual(data, self.video[-5:])
        self.assertEqual(headers["Content-Type"], "video/mp4")
        self.assertIn("attachment;", headers["Content-Disposition"])
        self.assertIn("bytes ", headers["Content-Range"])
        self.assertEqual(self.request("HEAD", "/api/tasks/task1/media")[2], b"")
        code, headers, _ = self.request("GET", "/api/tasks/task1/media", {"Range": "bytes=20000-"})
        self.assertEqual(code, 416)
        self.assertEqual(headers["Content-Range"], "bytes */%d" % len(self.video))
        self.assertEqual(self.request("GET", "/api/tasks/task1/media",
                                      {"Cookie": "comment_studio_session=two"})[0], 404)

    def test_signed_redirect_only_for_owner_and_csp(self):
        self.studio.remote = "https://bucket.oss-cn-test.aliyuncs.com/o.mp4?signature=example"
        code, headers, data = self.request("GET", "/api/tasks/task1/media")
        self.assertEqual((code, data), (302, b""))
        self.assertEqual(headers["Location"], self.studio.remote)
        self.assertIn("no-store", headers["Cache-Control"])
        self.assertEqual(self.request("GET", "/api/tasks/task1/media",
                                      {"Cookie": "comment_studio_session=two"})[0], 404)
        with patch.dict(os.environ, OSS_ENDPOINT="https://oss-cn-test.aliyuncs.com", OSS_BUCKET="bucket"):
            _, headers, _ = self.request("GET", "/")
        self.assertIn("https://bucket.oss-cn-test.aliyuncs.com", headers["Content-Security-Policy"])

    def test_subtitles_unicode_head_and_owner(self):
        route = "/api/tasks/task1/subtitles.srt"
        code, headers, data = self.request("GET", route)
        self.assertEqual(code, 200)
        self.assertIn("开模。", data.decode("utf-8"))
        self.assertEqual(headers["Content-Type"], "application/x-subrip; charset=utf-8")
        self.assertIn("attachment;", headers["Content-Disposition"])
        self.assertEqual(self.request("HEAD", route)[2], b"")
        self.assertEqual(self.request("GET", route, {"Cookie": "comment_studio_session=two"})[0], 404)

    def test_local_admin_scope_and_writes(self):
        url = "/api/admin/settings"
        with patch("settings.view", return_value={"groups": []}), patch("settings.update", return_value={"groups": []}) as update:
            self.assertEqual(self.request("GET", url)[0], 200)
            self.assertEqual(self.request("GET", url, {"X-Forwarded-For": "127.0.0.1"})[0], 404)
            self.assertFalse(json.loads(self.request("GET", "/api/status", {"Via": "test"})[2])["localAdmin"])
            self.assertEqual(self.request("GET", url, peer="10.0.0.5")[0], 404)
            self.assertEqual(self.request("GET", url, {"Host": "localhost:9001"})[0], 404)
            headers = {"Content-Type": "application/json", "Origin": "http://localhost:8766"}
            self.assertEqual(self.request("PUT", url, headers, b'{"values":{}}')[0], 200)
            update.assert_called_once_with({"values": {}})
            self.server.local_only = False
            self.assertEqual(self.request("GET", url)[0], 404)
            self.assertEqual(self.request("PUT", url, headers, b'{"values":{}}')[0], 404)

    def test_write_origin_and_body_validation(self):
        route = "/api/tasks"
        h = {"Content-Type": "application/json"}
        self.assertEqual(self.request("POST", route, {**h, "Origin": "https://elsewhere.example"}, b"{}")[0], 403)
        self.assertEqual(self.request("POST", route, {**h, "Sec-Fetch-Site": "cross-site"}, b"{}")[0], 403)
        self.assertEqual(self.request("POST", route, h, b"{}")[0], 202)
        self.assertEqual(self.request("POST", route, h, b"[1]")[0], 400)
        self.assertEqual(self.request("POST", route, {"Content-Type": "text/plain"}, b"{}")[0], 415)
        self.assertEqual(self.request("GET", "/settings.py")[0], 404)

    def test_raw_upload_cap_and_ownership(self):
        route = "/api/tasks/task1/upload"
        mime = {"Content-Type": "video/mp4"}
        self.assertEqual(self.request("POST", route, mime, self.video)[0], 202)
        self.assertEqual(self.studio.uploaded, self.video)
        self.assertEqual(list((self.server.data_dir / "incoming").iterdir()), [])
        self.assertEqual(self.request("POST", route, mime, b"x" * 129)[0], 413)
        self.assertEqual(self.request("POST", route, {**mime, "Cookie": "comment_studio_session=two"}, self.video)[0], 404)


if __name__ == "__main__":
    unittest.main()
