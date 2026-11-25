import contextlib
import io
import json
import os
import socket
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import media


class MediaTests(unittest.TestCase):
    def test_share_text_and_platform_keys(self):
        out = media.inspect_source('复制此条  https://xhslink.com/a/Ab12。 打开小红书')
        self.assertEqual(out, ('小红书', 'https://xhslink.com/a/Ab12', '小红书:xhslink.com/a/Ab12'))
        token_url = 'https://www.xiaohongshu.com/explore/abc123?xsec_token=a%2Fb%3D'
        self.assertEqual(media.inspect_source(token_url)[1], token_url)
        self.assertEqual(media.inspect_source('https://www.douyin.com/video/123?a=2')[2], media.inspect_source('https://douyin.com/video/123?b=3')[2])
        self.assertEqual(media.inspect_source('https://v.kuaishou.com/abc')[0], '快手')

    def test_reject_invalid_or_ambiguous_shares(self):
        for text in ('https://www.douyin.com/user/a', 'https://v.douyin.com/a https://v.kuaishou.com/b', 'https://v.douyin.com:999/a', 'https://v.kuaishou.com@evil.example/abc', 'https://v.douyin.com.evil.test/123'):
            with self.subTest(text=text), self.assertRaises(media.MediaError):
                media.inspect_source(text)

    def test_redirect_resolutions_must_be_public(self):
        mixed = [(0,0,0,'',('1.1.1.1',443)), (0,0,0,'',('127.0.0.1',443))]
        with patch.object(socket, 'getaddrinfo', return_value=mixed), self.assertRaises(media.MediaError):
            media._public_host('cdn.test', 443)

    def test_parse_gets_video_only_and_handles_gallery(self):
        row = {'code':200, 'data':{'title':'示例', 'video_url':'https://cdn.test/video', 'music_url':'https://cdn.test/music'}}
        with patch.dict(os.environ, {'COMMENT_PARSER_URL':'http://localhost:8000'}), patch.object(media, '_json_service', return_value=row), patch.object(media, '_download') as download:
            self.assertEqual(media.fetch_video('https://v.douyin.com/abc','dest')['title'],'示例')
            download.assert_called_once_with(row['data']['video_url'],'dest','抖音')
            row['data']={'images':[{'url':'https://cdn.test/poster'}]}
            with self.assertRaises(media.MediaError) as caught:
                media.fetch_video('https://v.douyin.com/abc','dest')
            self.assertEqual(caught.exception.code,'unsupported')

    def test_completed_and_indeterminate_submissions_are_never_resent(self):
        with patch.dict(os.environ, {'DASHSCOPE_API_KEY':'test'}), patch.object(media, '_submit') as submit:
            self.assertEqual(media.transcribe(None, {'asrState':'complete','asrText':'原话'}, lambda x:None),'原话')
            with self.assertRaises(media.MediaError) as error:
                media.transcribe(None, {'asrVendor':'paraformer','asrState':'submitting'},lambda x:None)
            self.assertEqual(error.exception.code,'unknown')
            submit.assert_not_called()

    def test_poll_recovers_original_task_and_saves_timestamps(self):
        status = {'output':{'task_status':'SUCCEEDED','results':[{'subtask_status':'SUCCEEDED','transcription_url':'https://cdn.test/out'}]}}
        result = {'transcripts':[{'sentences':[{'text':'开始打样。','begin_time':500,'end_time':1400}]}]}
        state = {'asrVendor':'paraformer','asrState':'pending','asrTaskId':'aa12'}
        data = io.BytesIO(json.dumps(result).encode())
        checkpoints = []
        with patch.dict(os.environ,{'DASHSCOPE_API_KEY':'test'}), patch.object(media,'_json_service',return_value=status) as poll, patch.object(media,'_public_stream',return_value=contextlib.nullcontext(data)), patch.object(media,'_submit') as submit:
            self.assertEqual(media.transcribe(None,state,checkpoints.append),'开始打样。')
            self.assertIn('/tasks/aa12',poll.call_args.args[0])
            self.assertEqual(checkpoints[-1]['asrSegments'][0]['start'],0.5)
            self.assertEqual(checkpoints[-1]['asrState'],'complete')
            submit.assert_not_called()

    def test_submit_records_intent_before_cloud_and_preserves_unknown(self):
        checkpoints = []
        def post(*args):
            self.assertEqual(checkpoints[-1]['asrState'],'submitting')
            raise media.MediaError('upstream','lost')
        with patch.object(media,'_put_file'),patch.object(media,'_sign',return_value='https://cdn.test/a'),patch.object(media,'_json_service',side_effect=post):
            with self.assertRaises(media.MediaError) as error:
                media._submit('dummy',{},checkpoints.append)
            self.assertEqual(error.exception.code,'unknown')
            self.assertNotIn('asrTaskId',checkpoints[-1])

    def test_real_video_probe_and_audio_extraction(self):
        ffmpeg,ffprobe = media._bin('ffmpeg'),media._bin('ffprobe')
        if not ffmpeg or not ffprobe:
            self.skipTest('FFmpeg/FFprobe not installed')
        with tempfile.TemporaryDirectory() as temp:
            video, audio = Path(temp)/'sample.mp4', Path(temp)/'sample.flac'
            subprocess.run([ffmpeg,'-v','error','-f','lavfi','-i','color=red:s=32x32:r=10:d=1','-f','lavfi','-i','sine=duration=1','-c:v','mpeg4','-c:a','aac','-shortest',str(video)],capture_output=True,check=True)
            self.assertAlmostEqual(media.inspect_media(video)['duration'],1,delta=0.1)
            media._extract_audio(video,audio)
            self.assertEqual(audio.read_bytes()[:4],b'fLaC')
            raw = subprocess.check_output([ffprobe,'-v','error','-show_entries','stream=sample_rate,channels','-of','json',str(audio)])
            self.assertEqual(json.loads(raw)['streams'],[{'sample_rate':'16000','channels':1}])


if __name__ == '__main__':
    unittest.main()
