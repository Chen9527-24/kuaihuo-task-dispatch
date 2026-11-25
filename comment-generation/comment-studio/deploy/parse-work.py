"""Parse one platform share URL with the pinned library in the child process."""
import asyncio
import dataclasses
import json
import re
import sys
from urllib.parse import urlsplit

from parse_video_py import parse_video_share_url
from parse_video_py.parser.douyin import DouYin


class StudioDouYin(DouYin):
    async def get_video_redirect_url(self, video_url):
        parts = urlsplit(video_url)
        # The official play_addr may already point directly to a media file.
        # The studio downloader validates and streams that URL and its redirects.
        if parts.scheme in ('https', 'http') and re.fullmatch(
                r'v[0-9]{1,3}-default\.365yg\.com', parts.netloc, re.ASCII):
            return parts._replace(scheme='https').geturl()
        return await super().get_video_redirect_url(video_url)


async def parse(url):
    if urlsplit(url).hostname in ('v.douyin.com', 'www.iesdouyin.com', 'www.douyin.com'):
        return await StudioDouYin().parse_share_url(url)
    return await parse_video_share_url(url)

if __name__ == "__main__":
    try:
        info = asyncio.run(parse(sys.argv[1]))
        print(json.dumps(dataclasses.asdict(info), ensure_ascii=False))
    except Exception:
        sys.exit(1)
