# 自媒体视频评论生成

把一段口播、字幕或作品分享链接整理成抖音、小红书、快手的评论草稿。可以按平台指定条数，设置必用词、可选词、避开词和作者回复数量。接入文本模型后可直接生成，也可以只预览、复制完整提示词。

| 想做什么 | 运行方式 | 需要准备 |
| --- | --- | --- |
| 用自己的文案预览提示词 | 独立工作台 | Python 3.9+ 和浏览器 |
| 直接生成、修改文案后再生成、比较模型样稿 | 独立或统一工作台 | 至少一家文本服务的 API Key 与可用模型 ID，对比样稿需两家 |
| 生成后创建热启动，或从 Excel 导入已有评论供访客领取 | 统一工作台 | 两个本地 Python 服务，共用一个 SQLite 数据库 |
| 从公开视频链接取得逐字稿 | 任一工作台 | 视频解析服务、FFmpeg、FFprobe，以及本地或云端转写服务 |

## 先试一次评论生成

在热启动仓库首页点「Code」→「Download ZIP」，下载并解压。进入 `comment-generation/`，在这个目录打开终端，运行下面的命令。后文的启动和测试命令也从这个目录执行。

```sh
python3 comment-studio/server.py
```

Windows 可用 `py -3 comment-studio/server.py`。在浏览器打开本机工作台，点「手动写文案」，例如输入“这批外壳先打 20 件样，确定卡扣尺寸后再开模”。给抖音选 5 条，把“卡扣”填入「必用原词」，再点「预览与复制提示词」。这一步无需模型密钥。[打开本机工作台](http://127.0.0.1:8766/)

要在页面直接生成，打开「服务状态」，给一家服务商填写 API Key、模型 ID 和所需地址，保存后回到工作台生成。也可按下表通过环境变量配置。独立模式按当前浏览器会话保存任务。可在「视频账号」保存行业、业务方向、创作者口吻和表达边界，下次写新作品时复用。

| 文本服务 | 服务端凭据 | 模型与地址 |
| --- | --- | --- |
| 阿里云千问 | `QWEN_API_KEY` 或 `DASHSCOPE_API_KEY` | `QWEN_MODEL`、`QWEN_BASE_URL`，填写对应百炼业务空间的兼容 API 基础地址 |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL` |
| 火山方舟 | `ARK_API_KEY` | `ARK_MODEL` 填模型或接入点 ID，可配置 `ARK_BASE_URL` |

本机 Python 进程读取已导出的环境变量。macOS 或 Linux 可将 `comment-studio/.env.example` 复制为 `comment-studio/.env`，在本地填写配置，再在启动服务的终端执行以下命令。可通过 `COMMENT_DEFAULT_PROVIDER` 指定 `qwen`、`deepseek` 或 `ark`。[全部配置示例](comment-studio/.env.example)

```sh
set -a
. ./comment-studio/.env
set +a
python3 comment-studio/server.py
```

## 一套账号管理生成和分发

先停止独立工作台，以便统一工作台使用 8766 端口。在两个终端分别进入本目录。以下为 macOS 或 Linux 的本机命令。

**终端一**启动访客领取服务。

```sh
mkdir -p .dev-data
export COMMENT_SHARED_DB="$PWD/.dev-data/shared.sqlite3"
python3 dispatch/run.py --port 8780 --data-dir "$PWD/.dev-data/dispatch"
```

**终端二**启动发布者工作台。两个终端的 `COMMENT_SHARED_DB` 必须指向同一文件。使用环境变量配置模型时，在本终端先载入上面的 `.env`。

```sh
export COMMENT_SHARED_DB="$PWD/.dev-data/shared.sqlite3"
export COMMENT_DATA_DIR="$PWD/.dev-data/studio"
export COMMENT_PUBLIC_ORIGIN=http://127.0.0.1:8766
export COMMENT_DISPATCH_PUBLIC_ORIGIN=http://127.0.0.1:8780
python3 comment-studio/server.py
```

打开工作台即可注册发布者账号。需要在页面管理所有发布者、模型与预算时，在第三个终端进入本目录，运行下列命令，按提示为预留的 `admin` 账号设置初始密码，再从同一工作台登录。[本机登录入口](http://127.0.0.1:8766/)

```sh
export COMMENT_SHARED_DB="$PWD/.dev-data/shared.sqlite3"
python3 dispatch/init_admin.py
```

1. 生成一批评论后，在目标平台的结果中点「管理评论」。可以逐条修改、按行粘贴、导入或导出 Excel。导入表格第一张工作表中的列名为「评论内容」，每行一条。
2. 点「创建热启动」生成分发草稿，带入标题、目标平台和该平台的主评论。同平台链接任务会沿用原始分享内容。手填文案或跨平台分发时，在草稿里补上对应作品链接。
3. 确认内容并发布草稿，复制任务领取链接。同一台电脑用另一个浏览器打开链接，填写昵称后按页面指引领取。发布者回到工作台可查看已领数和余量。
4. 手头已有评论时，在「任务管理」点「导入评论创建热启动」，直接建分发草稿。

上述地址仅供本机体验。让其他设备使用时，为两个服务配置可访问的 HTTPS 来源，分别将 `COMMENT_PUBLIC_ORIGIN` 和 `COMMENT_DISPATCH_PUBLIC_ORIGIN` 设为发布者与领取站地址，并为领取服务传入匹配的 `--public-origin`。

## 视频链接、转写和用量

- **从链接提取。** 粘贴抖音、小红书或快手的公开作品分享内容。在工作台配置 `COMMENT_PARSER_URL` 指向自建解析器，并在运行环境安装 FFmpeg、FFprobe。链接受平台限制或素材没有可转写的音轨时，可补传原视频或手填文案。[解析器项目](https://github.com/wujunwei928/parse-video-py)
- **云端转写。** 设置 `COMMENT_ASR=paraformer`、`DASHSCOPE_API_KEY` 和对应的 `COMMENT_ASR_BASE_URL`。配置私有 OSS 的端点、存储桶与临时音频所需凭据，并在运行工作台的 Python 环境执行 `python3 -m pip install -r comment-studio/requirements-oss.txt`。音频经 OSS 交给转写服务。取得时间轴后可下载 SRT 字幕。
- **本机转写。** 在工作台的 Python 环境安装 `faster-whisper`，设置 `COMMENT_ASR=local` 和 `COMMENT_WHISPER_MODEL`。首次使用需下载或预置模型。只用文字时可以设置 `COMMENT_ASR=off`。
- **限制与预算。** 默认每批最多 100 条主评论，单个视频上限为 10 分钟、100 MB。可调整文本调用次数、转写时长及人民币预算。启用金额预算时，按使用的模型填写每百万输入、输出 Token 的单价。对比样稿和补写缺项均可能产生额外调用，账单以服务商为准。
- **数据备份。** 独立模式默认写入 `comment-studio/data/`。按上述统一模式启动时，数据库、配置和媒体保存在 `.dev-data/`。备份时先停止两个服务，再复制整个数据目录。使用云端转写时，临时音频会上传至 OSS。若同时启用原视频的 OSS 存储，相应云端对象需单独备份并设置保留期限。

独立工作台也提供 Docker Compose 配置，包含工作台、解析器、FFmpeg、FFprobe 和云端转写所需的 OSS SDK。在本地准备好 `comment-studio/.env` 后运行下面的命令。工作台默认通过本机 8766 端口访问，数据保存在命名卷 `studio-data`。

```sh
cd comment-studio
docker compose up -d --build
```

## 源码与测试

| 位置 | 内容 |
| --- | --- |
| [生成规则与模型调用](comment-studio/generator.py) · [提示词和写作指南](comment-studio/resources/) | 按平台分配评论、拼装提示词、去重、检查关键词和作者回复数量 |
| [任务流程](comment-studio/workflow.py) · [媒体处理](comment-studio/media.py) | 素材提取、转写、批次记录、重试和模型用量 |
| [工作台页面](comment-studio/web/) | 素材输入、提示词预览、任务管理和服务设置 |
| [统一账号接入](comment-studio/unified.py) · [生成转分发](comment-studio/heatbridge.py) | 共享发布者身份、平台评论集与热启动草稿 |
| [分发服务](dispatch/) | 账号、任务发布、评论导入与访客领取页 |

从本目录运行两组测试。测试使用临时数据和离线样例，模型、解析器及真实平台链接需使用自己的环境另行验证。

```sh
(cd comment-studio && python3 -m unittest discover -s tests)
(cd dispatch && python3 -m unittest discover -s tests)
```

## 许可与署名

本目录沿用源码原发布仓库的 PolyForm Noncommercial License 1.0.0 和署名。商业使用需另行取得授权。[许可全文](LICENSE) · [中文说明](LICENSE.zh-CN.md) · [署名声明](NOTICE)

随附分发组件和 ExcelJS 的原有声明保存在各自目录。[分发组件许可](dispatch/LICENSE) · [分发组件署名](dispatch/NOTICE) · [ExcelJS 许可](dispatch/static/exceljs.LICENSE.txt)
