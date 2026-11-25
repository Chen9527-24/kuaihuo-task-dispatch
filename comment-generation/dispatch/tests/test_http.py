"""Verify anonymous comment links against a real server in a blank directory."""
import http.cookiejar
import json
import os
import queue
import re
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, ProxyHandler, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]


class LocalService:
    def __init__(self, folder, port=0):
        self.process = subprocess.Popen(
            [sys.executable, "-B", str(ROOT / "run.py"), "--data-dir", str(folder), "--port", str(port)],
            cwd=folder, env={**os.environ, "PYTHONIOENCODING": "utf-8"}, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, encoding="utf-8",
        )
        output = queue.Queue()
        def read_addresses():
            output.put((self.process.stdout.readline(), self.process.stdout.readline()))
        threading.Thread(target=read_addresses, daemon=True).start()
        try:
            first, second = output.get(timeout=15)
            base = re.search(r"http://127\.0\.0\.1:([0-9]+)", first)
            key = re.search(r"/manage#key=([A-Za-z0-9_-]+)", second)
            if not base or not key:
                raise AssertionError("未获得本机入口与发布者入口")
            self.url, self.port, self.key = base[0], int(base[1]), key[1]
        except BaseException:
            self.stop()
            raise

    def stop(self):
        if self.process.poll() is None:
            self.process.terminate()
        try:
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)
        self.process.stdout.close()


class Browser:
    def __init__(self, url):
        self.url = url
        self.opener = build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, route, body=None, expected=200, media_type=None):
        data = json.dumps(body).encode() if body is not None else None
        request = Request(self.url + route, data=data, headers={"Content-Type": "application/json"})
        try:
            response = self.opener.open(request, timeout=8)
        except HTTPError as error:
            response = error
        with response:
            raw = response.read()
            if response.status != expected:
                raise AssertionError(f"{route}: HTTP {response.status}, expected {expected}")
            if media_type and response.headers["Content-Type"] != media_type:
                raise AssertionError("响应的媒体类型与预期不符")
            return json.loads(raw) if response.headers.get_content_type() == "application/json" else raw


class HttpAcceptanceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def start(self, port=0):
        server = LocalService(self.temp.name, port)
        self.addCleanup(server.stop)
        return server

    def test_optional_guides_follow_the_claimed_video_platform(self):
        site = self.start()
        publisher, visitor = Browser(site.url), Browser(site.url)
        publisher.request("/api/manage-session", {"key": site.key})
        guides = Path(self.temp.name) / "task-guides"
        guides.mkdir()
        (guides / "dy-ios.png").write_bytes(b"sample image bytes")
        (guides / "private.txt").write_text("local only", encoding="utf-8")

        def receive_video(url, **options):
            task = publisher.request("/api/tasks", {
                "title": "教学图测试", "target_url": url, "comments": ["体验文案"], **options
            })["task"]
            publisher.request(f"/api/tasks/{task['id']}/publish", {})
            path = f"/api/public/{task['id']}"
            self.assertNotIn("guide_images", visitor.request(path))
            receipt = visitor.request(path + "/video", {"name": "体验者"})
            self.assertEqual(receipt.get("guide_images"), visitor.request(path).get("guide_images"))
            self.assertIsNone(visitor.request(path)["claim"])
            return receipt

        guide = "/static/task-guides/dy-ios.png"
        self.assertEqual({"video": {"ios": guide}},
                         receive_video("https://v.douyin.com/example")["guide_images"])
        copy = "  [作品] 复制到抖音看视频\nhttps://v.douyin.com/example/  "
        receipt = receive_video(copy, target_platform="douyin")
        self.assertEqual((copy, "douyin", {"video": {"ios": guide}}),
                         (receipt["video_url"], receipt["video_platform"], receipt["guide_images"]))
        self.assertNotIn("guide_images", receive_video("https://v.douyin.com/example", target_platform="other"))
        self.assertNotIn("guide_images", receive_video("https://douyin.com.example.org/sample"))
        self.assertEqual(b"sample image bytes", visitor.request(guide, media_type="image/png"))
        visitor.request("/static/task-guides/private.txt", expected=404)

    def test_publish_anonymous_claim_and_reopen(self):
        site = self.start()
        publisher, alice, bob, late = [Browser(site.url) for _ in range(4)]
        self.assertIn(b"<!doctype html", publisher.request("/manage").lower())
        publisher.request("/api/tasks", expected=401)
        publisher.request("/api/manage-session", {"key": "无效入口"}, expected=403)
        publisher.request("/api/manage-session", {"key": site.key})
        target = site.url + "/static/example-video.mp4"
        created = publisher.request("/api/tasks", {"title": "样例任务", "instructions": "领取一条样例",
                                                    "target_url": target, "comments": ["样例一", "样例二"]})["task"]
        task_id = created["id"]
        admin, public = f"/api/tasks/{task_id}", f"/api/public/{task_id}"
        alice.request(public, expected=404)
        publisher.request(admin + "/publish", {})
        self.assertIn(b"<!doctype html", alice.request(f"/?task={task_id}").lower())
        alice.request("/api/tasks", expected=401)
        alice.request(admin + "/pause", {}, expected=401)
        initial = alice.request(public)
        self.assertIsNone(initial["visit"])
        self.assertIsNone(initial["claim"])
        self.assertNotIn(target, json.dumps(initial, ensure_ascii=False))
        alice.request(public + "/claim", {}, expected=409)
        alice.request(public + "/video", {"name": " "}, expected=400)
        got_video = alice.request(public + "/video", {"name": "  访客甲  "})
        self.assertEqual({"name": "访客甲", "video_url": target, "video_platform": "other"}, got_video)
        video = alice.request(got_video["video_url"][len(site.url):], media_type="video/mp4")
        self.assertEqual(b"ftyp", video[4:8])
        self.assertIn(b"mdat", video)
        self.assertEqual(got_video, alice.request(public + "/video", {"name": "另一个名字"}))
        self.assertIsNone(alice.request(public)["claim"])
        self.assertNotIn("comments", initial["task"])
        comment = alice.request(public + "/claim", {})
        self.assertEqual({"comment": "样例一"}, comment)
        self.assertEqual(comment, alice.request(public + "/claim", {}))
        self.assertEqual(comment, alice.request(public)["claim"])
        publisher.request(admin + "/pause", {})
        bob.request(public)
        bob.request(public + "/video", {"name": "访客乙"}, expected=409)
        bob.request(public + "/claim", {}, expected=409)
        publisher.request(admin + "/resume", {})
        self.assertEqual(target, bob.request(public + "/video", {"name": "访客乙"})["video_url"])
        self.assertEqual({"comment": "样例二"}, bob.request(public + "/claim", {}))
        late.request(public)
        late.request(public + "/video", {"name": "迟到的访客"}, expected=409)
        late.request(public + "/claim", {}, expected=409)
        publisher.request(admin + "/close", {})
        site.stop()
        again = self.start(site.port)
        self.assertTrue(site.key == again.key)
        self.assertEqual(comment, alice.request(public)["claim"])
        self.assertEqual(comment, alice.request(public + "/claim", {}))
        self.assertEqual(got_video, alice.request(public)["visit"])
        final = publisher.request(admin)["task"]
        self.assertEqual(["访客甲", "访客乙"], [v["name"] for v in final["visitors"]])
        self.assertTrue(all(v["has_comment"] for v in final["visitors"]))
        self.assertEqual((2, 2, 0, "closed"),
                         (final["total"], final["claimed"], final["remaining"], final["status"]))
        bob.request(admin, expected=401)
