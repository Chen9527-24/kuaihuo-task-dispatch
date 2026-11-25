#!/bin/zsh
set -eu
cd "${0:A:h}"
if ! command -v python3 >/dev/null; then
  echo "请安装 Python 3.9 或更高版本，再打开工作台。"
  read -r "?按回车关闭"
  exit 1
fi
exec python3 launch.py
