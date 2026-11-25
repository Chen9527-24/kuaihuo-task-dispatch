# 登录完整版部署

## 选一条运行路线

| 场景 | 准备 | 能验收的内容 |
| --- | --- | --- |
| 本机完整业务 | Docker Engine、Compose v2、Python 3.9+、浏览器，首次构建需联网 | 专用后台、成员 H5、任务与评论、团队、双组截图、驳回、结算入账 |
| 自己维护运行环境 | Node.js 22.17.1、pnpm 9.15.0、PostgreSQL 16、Redis 7，三个独立应用目录 | 和上面同一套源码，可修改、独立构建及调试 |
| 给其他人线上使用 | 服务器、公网域名、DNS、HTTPS、备份、图片存储、使用者自有的身份和消息服务 | 成员用自己的设备登录、领任务，管理员远程审核 |
| 需要发放真实微信零钱 | 在上一行基础上开通微信商户的商家转账、关联 AppID，准备验签和回调材料 | 从成员提现申请到用户确认收款、微信终态查单与资金对账 |

## 使用 Compose 在本机启动

1. 单独下载登录版，打开含有 `run.py` 和 `full-stack` 的目录。
2. 运行 `python3 run.py`，Windows 可用 `py -3 run.py`。首次自动创建私有文件 `.local/deploy.env`、证书目录、数据库卷和初始管理员；已有配置会继续使用。需要先编辑配置时可用 `python3 run.py --configure`。
3. 等脚本报告就绪，打开后台 `http://127.0.0.1:8781/task-management`。使用私有配置的 `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`。成员用 `http://127.0.0.1:8782/`，首次选择手机号登录。默认模拟短信，验证码随开发响应返回，无需购买短信。
4. 首次空库保留 `H5_TENANT_CODE=DEMO-TENANT`。登录后台后，在业务租户下准备媒体账号、团队及成员邀请码。新建任务时填作品、任务要求、目标数、评论池和单笔金额。发布后，成员按 H5 提示补资料、绑定团队、选择任务账号，领取任务并再领评论。要改用自己的租户，先在后台创建并启用它，再修改私有配置中的租户代码并重新启动。
5. 成员提交主页截图和本次执行证明。后台核实后可驳回补交，或输入实际金额结算。先核对成员钱包流水；微信提现单独验收。

查看状态使用 `python3 run.py --status`；停止使用 `python3 run.py --stop`，数据卷保留。后台或 H5 端口冲突时，调整 `.local/deploy.env` 的 `ADMIN_PORT`、`MEMBER_PORT`，以及对应的 `ADMIN_ORIGIN`、`H5_BASE_URL`、`APP_BASE_URL`，再启动。修改初始密码字段不会重置已建的数据库用户或后台账号。

## 配置手机操作弹窗的教学图

打开作品和领取评论分别有一个操作指引。两个弹窗默认使用随包示意图。想换成自己拍摄的教学图时，可以在 `python3 run.py --configure` 生成的 `.local/task-guides/` 目录放入图片，并在同一目录新建 `guide-images.json`。例如：

```json
{
  "douyin": {
    "start": {
      "ios": "/task-guides/open-ios.png",
      "android": "/task-guides/open-android.jpg"
    },
    "claim": "/task-guides/copy-comment.png"
  }
}
```

这里的三个文件名应与放入目录的图片一致。图片名称使用英文字母、数字、下划线、短横线或点号，扩展名使用小写 png、jpg、jpeg 或 webp。也可以填写自己的公开 HTTPS 图片地址。首次运行 `python3 run.py` 会写入站点配置。此后修改清单时，在登录版根目录执行 `docker compose --env-file .local/deploy.env -f full-stack/compose.yaml run --rm initialize`，再刷新成员页面。图片缺失时页面仍可展示随包示意图。单独运行 H5 可直接编辑站点的 `runtime-config.js`。[各平台与设备的教学图配置](../member/docs/CONFIGURATION.md)

## 原生启动

以下操作用于新的专用数据库，勿将迁移或种子命令指向原套件数据库。此版本使用任务专用的数据模型和初始迁移。既有业务数据的迁入需另做字段映射和备份恢复演练。

1. 创建空 PostgreSQL 数据库、应用用户和可访问的 Redis 实例。在 `full-stack/backend` 将 `.env.example` 复制为 `.env`。填写 `DATABASE_URL`、`REDIS_URL`、两份不同的随机 JWT 密钥、首次管理员名和密码，以及 PC、H5 和 API 地址。开发机可用 API 端口 8783，设置 `HOST=127.0.0.1`、`APP_ORIGIN=http://127.0.0.1:8781,http://127.0.0.1:8782`，`APP_BASE_URL` 和 `API_BASE_URL` 指向 API，`H5_BASE_URL` 指向 H5。
2. 在 `backend` 顺序执行下列命令。查看 `/api/v1/health` 回应，确认服务和 Redis 已连通。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm prisma:deploy
pnpm prisma:seed
pnpm start
```

3. 在 `full-stack/admin` 将 `.env.example` 复制为 `.env.development`。配置 `VITE_API_PROXY_TARGET=http://127.0.0.1:8783`、`VITE_DISPATCH_BASE_URL=http://127.0.0.1:8782`；执行 `pnpm install --frozen-lockfile` 和 `pnpm exec vite --host 127.0.0.1 --port 8781 --strictPort`。
4. 在 `full-stack/member` 做相同的安装和 API 代理配置；在 `.env.development` 中填写 `VITE_DEFAULT_TENANTS_ID=DEMO-TENANT`、`VITE_ENABLE_WECHAT_OAUTH=false`。执行 `pnpm exec vite --host 127.0.0.1 --port 8782 --strictPort`。两个前端都从自己的站点请求 `/api/v1`。
5. 两个前端分别运行 `pnpm build` 可生成各自 `dist`。正式构建使用 `.env.production` 或明确的构建环境变量。成员端也支持在 `runtime-config.js` 中填公开的租户与微信授权开关。

## 上线前需要落实的地址

下面的域名仅说明对应关系。一个注册域名可以配置多个子域名，不要求购买三个不同的域名。

| 用途 | 示例 | 配置位置 |
| --- | --- | --- |
| 管理后台 | `https://admin.example.com` | DNS、证书、反向代理到本机管理端口、`ADMIN_ORIGIN` |
| 手机任务页 | `https://tasks.example.com` | 代理到成员端口、`H5_BASE_URL`；后台复制的任务链接应落在此域名 |
| API 与文件 | 同一 H5 域名下的 `/api/v1`；管理域名下也要代理同一路径 | `APP_BASE_URL` 为对外基础地址，Compose 的站点网关负责转发。公网反代保持原始请求体、支持 HTTPS 与图片上传 |
| 公众号网页授权 | H5 使用的域名及服务端的 `/api/v1/wechat/oauth/callback` | 微信公众平台网页授权域名、后端允许的 H5 返回来源，按所用能力配置 JS 接口安全域名与服务器 IP 白名单 |
| 微信支付结果通知 | `https://tasks.example.com/api/v1/wechatpay/transfer/notify` | `WECHAT_PAY_NOTIFY_URL`，从公网可达，允许微信回调原始 POST 请求；服务端验签并解密 |

在微信公众平台下载自己账号的 `MP_verify_….txt` 验证文件。使用 Compose 时将原文件放进登录版的 `.local/wechat-domain/`，保持文件名及正文，确保容器中的站点进程可读。通过 H5 域名的同名根路径打开，看到文件正文后再在公众平台提交验证。原生部署把文件放入 H5 静态站点根目录。

境内托管、对外使用域名时，根据所在服务器接入商办理适用的备案。后台、成员站点和支付回调均应使用有效证书。Compose 仅将两个站点绑定至宿主机回环地址，可在同一主机用 HTTPS 网关转发，数据库和 Redis 不需要公网端口。启用基于访问者 IP 的短信限流时，要让网关覆盖来自公网客户端的转发头，在后端填写实际受控代理层数 `APP_TRUST_PROXY_HOPS`，并检查多个测试手机的请求能正确区分来源。[备案说明](https://cloud.tencent.com/document/faq/243/19630)

## 正式配置与验收

- 在 `.local/deploy.env` 填自己的线上地址，配置 `NODE_ENV=production`、腾讯短信、正式文件存储，以及实际启用的微信服务。公网服务须退出本地模拟短信设置。服务端使用的证书放在 `.local/certs/`，配置填写容器内的 `/run/task-certs/文件名`。线上浏览器只能看到公开地址与开关。接入字段、公众号和商户条件见[接入说明](INTEGRATIONS.md)。
- 先从另一台设备访问 HTTPS 页面，用自有手机号收验证码、进入正确租户、领取任务、上传图片，分别以成员和管理员身份核对证明访问权限。公开多人环境准备私有 COS 桶及访问配置。本机 local 存储用于开发，原始静态文件地址持有者可能直接读取文件。
- 正式使用微信登录时，在真实手机微信中测试授权、返回任务页和成员绑定。仅设置转账为 MOCK 仍受 H5 微信环境与服务号 openid 检查影响。
- 微信实付由商户自行开通、授权并验收。使用商户允许的场景和限额，先完成钱包结算，再单独核对提现单、微信确认、验签回调或主动查单与最终商户账单。API 受理、待确认与到账是不同状态。
- PostgreSQL 保存业务记录；本地上传卷或私有对象存储保存证明；Redis 保存会话、验证码等短期数据。维护方还需备份和保护私有配置、支付私钥及数据库，定期验证可恢复性。

排错时在登录版根目录运行 `docker compose --env-file .local/deploy.env -f full-stack/compose.yaml logs --tail=80 initialize backend`。若 H5 提示站点未配置，核查所选租户以及 `/runtime-config.js`。若任务列表为空，核查任务所属租户、团队/邀请码、任务账号、发布状态和剩余评论。不需要启动原五项目套件。
