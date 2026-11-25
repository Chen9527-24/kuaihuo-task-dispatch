"""Install a small Mandarin ASR under a new single directory, with no system packages."""
import argparse
import hashlib
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
from urllib.request import urlopen
from zipfile import ZipFile

MIB = 1024 * 1024
MODEL_NAME = "vosk-model-small-cn-0.22"
MODEL = MODEL_NAME + ".zip"
WHEEL = "vosk-0.3.45-py3-none-manylinux_2_12_x86_64.manylinux2010_x86_64.whl"
WHEEL_PATH = "packages/fc/ca/83398cfcd557360a3d7b2d732aee1c5f6999f68618d1645f38d53e14c9ff/" + WHEEL
WHEEL_SHA = "25e025093c4399d7278f543568ed8cc5460ac3a4bf48c23673ace1e25d26619f"
MODEL_SHA = "3af8b0e7e0f835ae9d414ce5df580237a3cfb08d586c9fbbb0f7ff29ad5b14ba"


def fetch(target, urls, digest, max_bytes):
    for url in urls:
        try:
            hashed = hashlib.sha256()
            size = 0
            with urlopen(url, timeout=20) as source, target.open("wb") as dest:
                while data := source.read(256 * 1024):
                    size += len(data)
                    if size > max_bytes:
                        raise ValueError("下载尺寸超过限制")
                    hashed.update(data)
                    dest.write(data)
            if hashed.hexdigest() != digest:
                raise ValueError("下载文件的 SHA-256 不匹配")
            return
        except (OSError, ValueError) as exc:
            print(f"{target.name}: {exc}", file=sys.stderr, flush=True)
    raise SystemExit(f"获取 {target.name} 失败，保留已有服务。")


def unpack(archive, target, size_limit):
    with ZipFile(archive) as z:
        if sum(item.file_size for item in z.infolist()) > size_limit:
            raise ValueError("解压尺寸超过限制")
        for item in z.infolist():
            path = Path(item.filename)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError("无效压缩包目录")
        z.extractall(target)
    archive.unlink()


def test(home):
    worker = Path(__file__).with_name("recognize.py")
    env = dict(os.environ, OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="1")
    subprocess.run([sys.executable, "-I", str(worker), str(home), os.devnull],
                   stdout=subprocess.DEVNULL, check=True, timeout=90, env=env)


def install(dest):
    if (platform.system(), platform.machine()) != ("Linux", "x86_64"):
        raise SystemExit("本安装包适用 Linux x86_64。")
    if not dest.is_absolute() or not dest.parent.is_dir() or dest.is_symlink():
        raise SystemExit("请指定已有父目录中的独立绝对路径。")
    if dest.exists():
        if not (dest / ".plsc-vosk-0.3.45").is_file():
            raise SystemExit("目标目录已经存在，未进行修改。")
        test(dest)
        print(f"已有中文转写引擎通过检查：{dest}")
        return
    if shutil.disk_usage(dest.parent).free < 1224 * MIB:
        raise SystemExit("可用磁盘空间不足，请预留 1224 MiB 后重新安装。")
    with tempfile.TemporaryDirectory(prefix=".plsc-asr-", dir=dest.parent) as temp:
        staging = Path(temp)
        home = staging / "installation"
        home.mkdir(mode=0o755)
        wheel = staging / WHEEL
        fetch(wheel, ["https://files.pythonhosted.org/" + WHEEL_PATH,
                      "https://pypi.tuna.tsinghua.edu.cn/" + WHEEL_PATH],
              WHEEL_SHA, 8 * MIB)
        unpack(wheel, home / "engine", 64 * MIB)
        model = staging / MODEL
        fetch(model, ["https://alphacephei.com/vosk/models/" + MODEL,
                      "https://hf-mirror.com/rhasspy/vosk-models/resolve/main/zh/" + MODEL],
              MODEL_SHA, 43 * MIB)
        unpack(model, home, 136 * MIB)
        test(home)
        (home / ".plsc-vosk-0.3.45").touch()
        # Only publish a verified and world-readable engine; all contents are public dependencies.
        for path in home.rglob("*"):
            path.chmod(0o755 if path.is_dir() else 0o644)
        home.chmod(0o755)
        home.rename(dest)
    print(f"中文转写就绪：{dest}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="独立安装目录的绝对路径")
    install(parser.parse_args().destination)
