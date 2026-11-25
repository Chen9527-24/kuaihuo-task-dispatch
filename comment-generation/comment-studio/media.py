"""Share links, bounded media downloads, and resumable speech transcription."""
import base64
import http.client
import ipaddress
import json
import math
import os
import re
import shutil
import socket
import ssl
import sys
import subprocess
import tempfile
import threading
import time
import uuid
from contextlib import closing, contextmanager
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class MediaError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _int_env(key, default, minimum=1, maximum=10000):
    try:
        value = int(os.getenv(key, str(default)))
    except ValueError:
        value = default
    return min(max(value, minimum), maximum)


def max_bytes():
    return _int_env('COMMENT_MAX_MEDIA_MB', 100, 1, 2048) * 1024 * 1024


def max_minutes():
    return _int_env('COMMENT_MAX_MINUTES', 10, 1, 240)


# Only supported work pages enter the self-hosted parser. App share text can contain
# emoji and Chinese punctuation adjacent to the URL.
_URL = re.compile(r'''https?://[^\s<>"'“”‘’「」《》【】。，、！？；（）]+''', re.IGNORECASE)
_ROUTES = {
    'v.douyin.com': ('抖音', r'/[\w-]+(?:/[\w-]+)?/?'),
    'douyin.com': ('抖音', r'/(?:video|note)/(\d+)/?'),
    'www.douyin.com': ('抖音', r'/(?:video|note)/(\d+)/?'),
    'www.iesdouyin.com': ('抖音', r'/share/(?:video|note)/(\d+)/?'),
    'v.kuaishou.com': ('快手', r'/[\w-]+(?:/[\w-]+)?/?'),
    'www.xiaohongshu.com': ('小红书', r'/(?:explore|discovery/item)/([a-zA-Z0-9_-]+)/?'),
    'xiaohongshu.com': ('小红书', r'/(?:explore|discovery/item)/([a-zA-Z0-9_-]+)/?'),
    'xhslink.com': ('小红书', r'/(?:[\w-]+/)?[\w-]+/?'),
    'xhslink.cn': ('小红书', r'/(?:[\w-]+/)?[\w-]+/?'),
}


def inspect_source(text):
    if not isinstance(text, str) or len(text) > 8192:
        raise MediaError('invalid', '请粘贴一条作品链接或一段分享文字。')
    matches = {url.rstrip('.,;:!?)]}…') for url in _URL.findall(text)}
    if len(matches) != 1:
        raise MediaError('invalid', '每次请粘贴一个视频作品的链接。')
    raw = matches.pop()
    try:
        u = urlsplit(raw)
        host = (u.hostname or '').lower()
        if u.port not in (None, 80 if u.scheme.lower() == 'http' else 443) or u.username is not None or '\\' in raw:
            raise ValueError()
        platform, pattern = _ROUTES[host]
        match = re.fullmatch(pattern, u.path, re.ASCII)
        if not match:
            raise ValueError()
        # The parser registers the canonical www hosts for desktop URLs.
        if host in ('douyin.com', 'xiaohongshu.com'):
            host = 'www.' + host
    except (ValueError, KeyError):
        raise MediaError('invalid', '请使用抖音、快手或小红书 App 的单条作品分享链接。') from None
    normalized = urlunsplit(('https', host, u.path, u.query, ''))
    identity = match.group(1) if match.lastindex else host + u.path.rstrip('/')
    return platform, normalized, platform + ':' + identity


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class _ServiceStatus(MediaError):
    def __init__(self, status_code):
        super().__init__('upstream', '服务返回 HTTP %d，请检查服务配置或稍后再试。' % status_code)
        self.status_code = status_code


def _json_service(url, headers=None, body=None, timeout=30):
    # Only administrator-defined service endpoints use this path. Never send
    # credentials on redirects, and never include URLs or upstream payloads in errors.
    req = Request(url, data=json.dumps(body).encode() if body is not None else None,
                  headers=headers or {})
    try:
        with build_opener(_NoRedirect()).open(req, timeout=timeout) as res:
            data = res.read(2 * 1024 * 1024 + 1)
        if len(data) > 2 * 1024 * 1024:
            raise ValueError()
        value = json.loads(data)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except HTTPError as exc:
        raise _ServiceStatus(exc.code) from None
    except (URLError, OSError, ValueError, http.client.HTTPException):
        raise MediaError('upstream', '服务未返回有效结果，请检查服务地址、网络与凭据。') from None


def _public_host(host, port):
    try:
        addresses = [entry[4][0] for entry in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)]
        if not addresses:
            raise ValueError()
        for candidate in addresses:
            addr = ipaddress.ip_address(candidate)
            if not addr.is_global or addr.is_multicast or addr.is_reserved or addr.is_unspecified:
                raise ValueError()
            # Avoid IPv4-embedding transition addresses with a different effective target.
            if addr.version == 6 and (addr.ipv4_mapped or addr.sixtofour or addr.teredo or addr in ipaddress.ip_network('64:ff9b::/96')):
                raise ValueError()
        return addresses[0]
    except (OSError, ValueError):
        raise MediaError('media', '媒体来源无法访问，或地址不属于公共网络。') from None


@contextmanager
def _public_stream(url, referer=None):
    """Resolve and pin each redirect target, retaining TLS hostname verification."""
    try:
        for _ in range(6):
            parsed = urlsplit(url)
            port = parsed.port or (443 if parsed.scheme == 'https' else 80)
            host = parsed.hostname
            if (parsed.scheme not in ('http', 'https') or port not in (80, 443) or not host
                    or parsed.username is not None or '\\' in url or any(ord(c) < 33 for c in url)):
                raise MediaError('media', '媒体下载地址无效。')
            address = _public_host(host, port)
            headers = {'Accept': '*/*', 'User-Agent': 'CommentStudio/1.0'}
            if referer:
                headers['Referer'] = referer
            conn = http.client.HTTPConnection(host, port, timeout=20)
            try:
                conn.sock = socket.create_connection((address, port), timeout=20)
                if parsed.scheme == 'https':
                    conn.sock = ssl.create_default_context().wrap_socket(conn.sock, server_hostname=host)
                path = urlunsplit(('', '', parsed.path or '/', parsed.query, ''))
                conn.request('GET', path, headers=headers)
                with closing(conn.getresponse()) as response:
                    if response.status in (301, 302, 303, 307, 308) and response.getheader('Location'):
                        url = urljoin(url, response.getheader('Location'))
                        continue
                    if response.status != 200:
                        raise MediaError('media', '媒体服务返回 HTTP %d，原链接可能已经失效。' % response.status)
                    yield response
                    return
            finally:
                conn.close()
        raise MediaError('media', '媒体地址跳转过多。')
    except MediaError:
        raise
    except (OSError, ValueError, http.client.HTTPException, UnicodeError):
        raise MediaError('media', '媒体下载未完成，请重试或上传已有视频。') from None


def file_mime(path):
    with open(path, 'rb') as stream:
        head = stream.read(32)
    if len(head) >= 12 and head[4:8] == b'ftyp':
        return 'video/quicktime' if head[8:12] == b'qt  ' else 'video/mp4'
    if head.startswith(b'\x1aE\xdf\xa3'):
        return 'video/webm'
    if head.startswith(b'RIFF') and head[8:12] == b'AVI ':
        return 'video/x-msvideo'
    if head.startswith(b'FLV\x01'):
        return 'video/x-flv'
    raise MediaError('invalid', '文件格式无法识别，请上传 MP4、MOV 或 WebM 视频。')


def _download(url, destination, platform):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    referer = {'抖音': 'https://www.douyin.com/', '小红书': 'https://www.xiaohongshu.com/', '快手': 'https://www.kuaishou.com/'}[platform]
    partial = None
    limit = max_bytes()
    try:
        with _public_stream(url, referer) as res:
            declared = res.getheader('Content-Length')
            if declared and (not declared.isdigit() or int(declared) > limit):
                raise MediaError('limit', '视频超过允许的文件大小。')
            media_type = (res.getheader('Content-Type') or '').lower().split(';', 1)[0].strip()
            if media_type.startswith(('text/', 'image/', 'audio/')) or 'json' in media_type or 'mpegurl' in media_type:
                raise MediaError('media', '解析结果没有可直接下载的视频文件。')
            size = 0
            deadline = time.monotonic() + 120
            with tempfile.NamedTemporaryFile(dir=destination.parent, prefix='.download-', delete=False) as out:
                partial = Path(out.name)
                while True:
                    chunk = res.read(65536)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > limit or time.monotonic() > deadline:
                        raise MediaError('limit', '视频过大或下载超时。')
                    out.write(chunk)
            if declared and size != int(declared):
                raise MediaError('media', '视频下载不完整。')
            file_mime(partial)
            os.replace(partial, destination)
    finally:
        if partial is not None:
            partial.unlink(missing_ok=True)


def fetch_video(source, destination):
    platform, url, key = inspect_source(source)
    share_hint = ('未能从这条小红书链接取得视频。请在小红书 App 中打开公开的视频笔记，'
                  '点“分享”重新复制链接，或直接上传原片。') if platform == '小红书' else ''
    base = os.getenv('COMMENT_PARSER_URL', '').strip().rstrip('/')
    if not base and os.getenv('COMMENT_BUNDLED_PARSER') == '1' and _has_module('parse_video_py'):
        env = {k: os.environ[k] for k in ('PATH','LANG','PYTHONPATH','TMPDIR','PYTHONDONTWRITEBYTECODE') if k in os.environ}
        try:
            worker = Path(__file__).parent/'deploy'/'parse-work.py'
            result = subprocess.run([sys.executable, '-B', str(worker), url], env=env, timeout=45,
                                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True)
            payload = {'code':200, 'data':json.loads(result.stdout)}
        except (subprocess.SubprocessError, OSError, ValueError):
            raise MediaError('parse', share_hint or '平台暂未返回可用视频，可以上传原片或补充文案。') from None
    elif base:
        headers = {'Accept': 'application/json'}
        user = os.getenv('COMMENT_PARSER_USERNAME', '')
        if user:
            token = (user + ':' + os.getenv('COMMENT_PARSER_PASSWORD', '')).encode()
            headers['Authorization'] = 'Basic ' + base64.b64encode(token).decode()
        payload = _json_service(base + '/video/share/url/parse?' + urlencode({'url': url}), headers, timeout=45)
    else:
        raise MediaError('config', '尚未配置链接解析服务，可以补贴文案或上传原片。')
    info = payload.get('data', payload)
    if payload.get('code', 200) not in (200, '200') or not isinstance(info, dict):
        raise MediaError('parse', share_hint or '链接解析失败，可以重新分享作品或手动填写文案。')
    video = info.get('video_url')
    if not isinstance(video, str) or not video:
        if info.get('images'):
            raise MediaError('unsupported', '这是一条图文作品，可补充图片内容描述后生成评论。')
        raise MediaError('parse', share_hint or '没有取得原视频，请补充文案或上传视频。')
    _download(video, destination, platform)
    author = info.get('author') or {}
    author = author if isinstance(author, dict) else {}
    return {'title': str(info.get('title') or '')[:400], 'platform': platform,
            'workId': str(info.get('id') or info.get('video_id') or key.split(':', 1)[1])[:200],
            'author': str(author.get('name') or '')[:150], 'authorId': str(author.get('uid') or '')[:150]}


def _bin(name):
    return shutil.which(os.getenv(name.upper() + '_BIN', name))


def inspect_media(path):
    path = Path(path)
    if not path.is_file() or not 0 < path.stat().st_size <= max_bytes():
        raise MediaError('limit', '视频为空、已过期或超过大小限制。')
    mime = file_mime(path)
    probe = _bin('ffprobe')
    if not probe and not _has_module('av'):
        raise MediaError('config', '缺少 FFprobe，配置 FFmpeg 工具后即可转写。')
    try:
        cmd = [probe, '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm,avi,flv',
               '-show_entries', 'format=duration:stream=codec_type,duration', '-of', 'json', str(path.resolve())]
        if not probe:
            cmd = [sys.executable, '-B', str(Path(__file__).parent/'deploy'/'av-tools.py'), 'probe', str(path.resolve())]
        raw = subprocess.run(cmd, capture_output=True, timeout=20, check=True)
        info = json.loads(raw.stdout)
        streams = info.get('streams', [])
        if not any(s.get('codec_type') == 'video' for s in streams):
            raise MediaError('invalid', '文件中没有视频画面。')
        available = [s.get('duration') for s in streams] + [(info.get('format') or {}).get('duration')]
        durations = [float(x) for x in available if x and x != 'N/A']
        duration = max(durations, default=0)
        if not math.isfinite(duration) or duration <= 0:
            raise ValueError()
        if duration > max_minutes() * 60:
            raise MediaError('limit', '视频时长超过当前上限（%d 分钟）。' % max_minutes())
        if not any(s.get('codec_type') == 'audio' for s in streams):
            raise MediaError('no_speech', '视频没有音轨，请补充画面描述或文案。')
        return {'duration': duration, 'mime': mime}
    except MediaError:
        raise
    except (OSError, ValueError, subprocess.SubprocessError):
        raise MediaError('invalid', '视频损坏或无法读取时长，请上传可播放的视频。') from None


def _extract_audio(path, output):
    ffmpeg = _bin('ffmpeg')
    if not ffmpeg:
        raise MediaError('config', '缺少 FFmpeg，安装后可以重新转写。')
    command = [ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file,pipe',
               '-format_whitelist', 'mov,matroska,webm,avi,flv', '-i', str(Path(path).resolve()), '-map', '0:a:0',
               '-vn', '-ac', '1', '-ar', '16000', '-t', str(max_minutes()*60), '-c:a', 'flac', str(output)]
    try:
        subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180, check=True)
    except (OSError, subprocess.SubprocessError):
        raise MediaError('media', '音轨读取失败，请检查视频或补贴文案。') from None


_OSS_KEYS = ('OSS_ENDPOINT', 'OSS_BUCKET', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET')

def _has_module(name):
    from importlib.util import find_spec
    try:
        return find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def _asr_mode():
    return (os.getenv('COMMENT_ASR', 'paraformer') or 'off').lower().strip()


def _asr_key():
    return os.getenv('DASHSCOPE_API_KEY', '').strip()


def status():
    parser = bool(os.getenv('COMMENT_PARSER_URL', '').strip()) or (os.getenv('COMMENT_BUNDLED_PARSER') == '1' and _has_module('parse_video_py'))
    mode = _asr_mode()
    tools_ready = bool(_bin('ffmpeg') and _bin('ffprobe'))
    oss_ready = all(os.getenv(k) for k in _OSS_KEYS) and _has_module('oss2')
    if mode == 'local':
        if os.getenv('COMMENT_VOSK_HOME'):
            ready = _has_module('av') and (Path(os.environ['COMMENT_VOSK_HOME'])/'.plsc-vosk-0.3.45').is_file()
            asr = '服务器中文语音识别（Vosk）' if ready else '服务器中文语音识别待配置'
        else:
            ready = tools_ready and _has_module('faster_whisper')
            asr = '本机 faster-whisper' if ready else '本机转写待配置（faster-whisper / FFmpeg）'
    elif mode == 'paraformer':
        ready = tools_ready and oss_ready and bool(_asr_key())
        asr = '百炼 Paraformer' if ready else '云转写待配置（百炼 / OSS / FFmpeg）'
    else:
        ready, asr = False, '未启用语音转写'
    oss_mode = os.getenv('COMMENT_VIDEO_STORAGE', 'local').lower() == 'oss'
    return {'parser': '已配置解析服务' if parser else '未配置解析服务', 'parserReady': parser,
            'asr': asr, 'asrReady': ready, 'asrMode': mode,
            'storage': ('私有 OSS' if oss_ready else '私有 OSS 待配置') if oss_mode else '本地私有存储',
            'storageReady': oss_ready if oss_mode else True, 'maxMinutes': max_minutes(),
            'maxMediaBytes': max_bytes()}


def _bucket():
    if not all(os.getenv(k) for k in _OSS_KEYS):
        raise MediaError('config', '请先配置私有 OSS 存储桶、地域地址及服务端凭据。')
    try:
        import oss2
    except ImportError:
        raise MediaError('config', '云存储需要安装 oss2。') from None
    endpoint, name, access_id, secret = (os.environ[k].strip() for k in _OSS_KEYS)
    if not endpoint.startswith('https://'):
        raise MediaError('config', 'OSS_ENDPOINT 需要使用 HTTPS 地域地址。')
    token = os.getenv('OSS_SECURITY_TOKEN')
    auth = oss2.StsAuth(access_id, secret, token) if token else oss2.Auth(access_id, secret)
    return oss2.Bucket(auth, endpoint, name, connect_timeout=20)


def _put_file(key, path, content_type):
    try:
        _bucket().put_object_from_file(key, str(path), headers={'Content-Type': content_type})
    except MediaError:
        raise
    except Exception:
        raise MediaError('upstream', 'OSS 上传失败，请检查存储权限或稍后重试。') from None


def _delete_object(key):
    try:
        _bucket().delete_object(key)
    except MediaError:
        raise
    except Exception:
        raise MediaError('upstream', 'OSS 清理失败，待下次清理或存储桶生命周期规则回收。') from None


def _sign(key, ttl, params=None):
    try:
        return _bucket().sign_url('GET', key, ttl, params=params, slash_safe=True)
    except MediaError:
        raise
    except Exception:
        raise MediaError('upstream', '无法生成临时读取地址，请检查 OSS 配置。') from None


def publish_video(path):
    if os.getenv('COMMENT_VIDEO_STORAGE', 'local').lower() != 'oss':
        return ''
    mime = file_mime(path)
    suffix = {'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-msvideo': 'avi', 'video/x-flv': 'flv'}[mime]
    key = 'comment-studio/video/' + uuid.uuid4().hex + '.' + suffix
    _put_file(key, path, mime)
    return key


def _video_key(key):
    if not isinstance(key, str) or not re.fullmatch(r'comment-studio/video/[a-f0-9]{32}\.(mp4|mov|webm|avi|flv)', key):
        raise MediaError('invalid', '无效的视频文件。')


def signed_video_url(key, ttl=600, download=False):
    _video_key(key)
    if ttl < 1:
        raise MediaError('invalid', '视频保留期已结束。')
    params = {'response-content-disposition': 'attachment; filename="video.' + key.rsplit('.', 1)[1] + '"'} if download else None
    return _sign(key, min(int(ttl), 3600), params)


def delete_video(key):
    if key:
        _video_key(key)
        _delete_object(key)


_local_lock = threading.Lock()
_local_models = {}


def _local_transcript(audio, state, record):
    model_name = os.getenv('COMMENT_WHISPER_MODEL', 'small')
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise MediaError('config', '请安装 faster-whisper 或选择云转写。') from None
    try:
        with _local_lock:
            if model_name not in _local_models:
                _local_models.clear()
                _local_models[model_name] = WhisperModel(model_name, device='cpu', compute_type='int8')
            segments, _ = _local_models[model_name].transcribe(str(audio), vad_filter=True, condition_on_previous_text=False)
            pieces = [{'start': s.start, 'end': s.end, 'text': s.text.strip()} for s in segments if s.text.strip()]
    except Exception:
        raise MediaError('upstream', '本机识别失败，请检查模型文件及可用内存。') from None
    text = '\n'.join(s['text'] for s in pieces)
    if not text.strip():
        raise MediaError('no_speech', '没有识别到清晰人声，请补充画面描述或文案。')
    state.update(asrSegments=pieces, asrState='complete', asrText=text)
    record(dict(state))
    return text


def _api_base():
    base = os.getenv('COMMENT_ASR_BASE_URL', 'https://dashscope.aliyuncs.com').strip().rstrip('/')
    u = urlsplit(base)
    if (u.scheme != 'https' or not u.hostname or u.username or u.query or u.fragment or u.path not in ('', '/api/v1')):
        raise MediaError('config', '请配置百炼 HTTPS 根地址。')
    return base if u.path == '/api/v1' else base + '/api/v1'


def _clear_audio(state, record):
    key = state.get('asrAudioKey')
    if key and re.fullmatch(r'comment-studio/audio/[a-f0-9]{32}\.flac', key):
        try:
            _delete_object(key)
        except MediaError:
            return  # A bucket lifecycle rule covers interrupted or unavailable cleanup.
        state.pop('asrAudioKey', None)
        record(dict(state))


def _submit(audio, state, record):
    key = 'comment-studio/audio/' + uuid.uuid4().hex + '.flac'
    _put_file(key, audio, 'audio/flac')
    state['asrAudioKey'] = key
    try:
        signed = _sign(key, 86400)
        service = _api_base() + '/services/audio/asr/transcription'
    except MediaError:
        _clear_audio(state, record)
        raise
    # Persist the intent first. A lost response after submission must never
    # silently dispatch a second billable request.
    state['asrState'] = 'submitting'
    record(dict(state))
    headers = {'Authorization': 'Bearer ' + _asr_key(), 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable'}
    try:
        result = _json_service(service, headers, {'model': 'paraformer-v2', 'input': {'file_urls': [signed]}, 'parameters': {'channel_id': [0]}})
        task_id = (result.get('output') or {}).get('task_id')
        if not isinstance(task_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', task_id):
            raise MediaError('unknown', '转写提交结果不明确，已暂停以避免重复计费。')
    except _ServiceStatus as exc:
        if 400 <= exc.status_code < 500 and exc.status_code != 408:
            state['asrState'] = 'rejected'
            record(dict(state))
            _clear_audio(state, record)
            raise
        raise MediaError('unknown', '转写提交结果不明确，已暂停以避免重复计费。') from None
    except MediaError:
        raise MediaError('unknown', '转写提交结果不明确，已暂停以避免重复计费。') from None
    state.update(asrTaskId=task_id, asrState='pending')
    record(dict(state))


def _read_transcript(result_url):
    with _public_stream(result_url) as resp:
        data = resp.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise MediaError('upstream', '转写结果过大。')
    try:
        transcripts = json.loads(data)['transcripts']
        lines, segments = [], []
        for track in transcripts:
            sentences = track.get('sentences') or []
            texts = []
            for sentence in sentences:
                text = str(sentence.get('text') or '').strip()
                if text:
                    texts.append(text)
                    segments.append({'start': float(sentence.get('begin_time') or 0)/1000,
                                     'end': float(sentence.get('end_time') or 0)/1000, 'text': text})
            lines.append('\n'.join(texts) or str(track.get('text') or '').strip())
    except (TypeError, ValueError, KeyError, AttributeError):
        raise MediaError('upstream', '转写结果的格式无法读取。') from None
    return '\n'.join(line for line in lines if line), segments


def _poll(state, record):
    headers = {'Authorization': 'Bearer ' + _asr_key()}
    url = _api_base() + '/tasks/' + quote(state['asrTaskId'], safe='')
    deadline = time.monotonic() + _int_env('COMMENT_ASR_POLL_SECONDS', 120, 1, 900)
    while True:
        result = _json_service(url, headers)
        out = result.get('output') or {}
        phase = out.get('task_status')
        if phase == 'SUCCEEDED':
            files = [item for item in out.get('results', []) if isinstance(item, dict) and item.get('subtask_status') == 'SUCCEEDED' and item.get('transcription_url')]
            if not files:
                state['asrState'] = 'failed'
                record(dict(state))
                _clear_audio(state, record)
                raise MediaError('upstream', '语音识别未取得音频结果，可重试或补贴文案。')
            text, segments = _read_transcript(files[0]['transcription_url'])
            state.update(asrState='complete', asrText=text, asrSegments=segments)
            record(dict(state))
            _clear_audio(state, record)
            if not text:
                raise MediaError('no_speech', '没有识别到清晰人声，请补充画面描述或文案。')
            return text
        if phase in ('FAILED', 'CANCELED', 'CANCELLED'):
            state['asrState'] = 'failed'
            record(dict(state))
            _clear_audio(state, record)
            raise MediaError('upstream', '云识别任务已失败，请检查音频和配置后重试。')
        if phase not in ('PENDING', 'RUNNING'):
            raise MediaError('unknown', '暂时无法确认云任务状态，已保留任务号。')
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise MediaError('pending', '云转写仍在处理，再次查询会沿用原任务。')
        time.sleep(min(4, remaining))


def transcribe(path, checkpoint, save_checkpoint):
    state = checkpoint if isinstance(checkpoint, dict) else {}
    mode = state.get('asrVendor') or _asr_mode()
    if state.get('asrState') == 'complete':
        _clear_audio(state, save_checkpoint)
        if state.get('asrText'):
            return state['asrText']
        raise MediaError('no_speech', '没有识别到清晰人声，请补充文案。')
    if mode == 'paraformer':
        if not _asr_key():
            raise MediaError('config', '云转写尚未配置百炼密钥，可以先补贴文案。')
        if state.get('asrState') == 'submitting' and not state.get('asrTaskId'):
            raise MediaError('unknown', '上次提交结果不明确，已暂停自动重提，请核对供应商记录或手填。')
        if state.get('asrTaskId') and state.get('asrState') != 'failed':
            return _poll(state, save_checkpoint)
        _api_base()
        _bucket()
    elif mode != 'local':
        raise MediaError('config', '语音转写尚未启用，可以先补贴文案。')
    state.pop('asrTaskId', None)
    state.update(asrVendor=mode, asrDuration=inspect_media(path)['duration'])
    save_checkpoint(dict(state))
    with tempfile.TemporaryDirectory(prefix='comment-audio-') as temp:
        if mode == 'local' and os.getenv('COMMENT_VOSK_HOME'):
            audio = Path(temp) / 'speech.pcm'
            deploy = Path(__file__).parent/'deploy'
            with _local_lock:
                try:
                    subprocess.run([sys.executable, '-B', str(deploy/'av-tools.py'), 'pcm', str(path), str(audio), str(max_minutes()*60)], check=True, timeout=180, stderr=subprocess.DEVNULL)
                    raw = subprocess.run([sys.executable, '-I', str(deploy/'asr'/'recognize.py'),
                                          os.environ['COMMENT_VOSK_HOME'], str(audio)], check=True, timeout=300,
                                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                    pieces = json.loads(raw.stdout)
                except (OSError, ValueError, subprocess.SubprocessError):
                    raise MediaError('media', '服务器识别失败，可重新上传视频或补充文案。') from None
            text = '\n'.join(s['text'] for s in pieces)
            if not text.strip():
                raise MediaError('no_speech', '没有识别到清晰人声，请补充画面描述或文案。')
            state.update(asrSegments=pieces, asrState='complete', asrText=text)
            save_checkpoint(dict(state))
            return text
        audio = Path(temp) / 'speech.flac'
        _extract_audio(path, audio)
        if mode == 'local':
            return _local_transcript(audio, state, save_checkpoint)
        _submit(audio, state, save_checkpoint)
    return _poll(state, save_checkpoint)
