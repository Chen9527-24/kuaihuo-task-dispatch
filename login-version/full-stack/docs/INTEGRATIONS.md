# 登录完整版部署与外部服务准备

先确定要交付哪一段业务。管理员审核某位成员的任务并输入实际奖励金额后，系统把这笔钱记入**成员钱包**。只有成员申请提现、通过相应的审核流程、微信返回成功状态后，才能记为**微信零钱到账**。日常发布和审核可以先独立运行。准备真实打款前，还需获得本项目商业用途所需的许可（如适用），并由商户确认自己的转账场景获批。

在 `login-version` 目录运行 `python3 run.py --configure` 会生成统一的私有配置文件 `.local/deploy.env`。按下表填写需要启用的服务，再运行 `python3 run.py`。不填写真实外部服务的凭据也可以在本机体验任务与钱包记账。容器的域名和回调地址由 `ADMIN_ORIGIN`、`H5_BASE_URL`、`APP_BASE_URL` 自动映射；单独部署各端时使用下文列出的各端字段。[部署步骤](DEPLOYMENT.md) · [统一配置模板](../deploy.example.env)

## 按使用目的准备

| 要做的事 | 部署者要准备什么 | 在哪里配置 | 如何确认成功 |
| --- | --- | --- | --- |
| 在本机演练 | 完整登录版的管理端、成员 H5、API、PostgreSQL 和 Redis。准备自己的管理员、任务租户、媒体账号、团队邀请码与练习材料。 | 按[完整登录版启动指南](../README.md)启动；本机验证码使用 mock，提现保持 MOCK。 | 登录管理台，发布一项带评论池的任务；在成员 H5 领任务、领评论、交两类证明；审核后核对钱包和订单的实际金额。无需购买域名、短信或微信商户号。 |
| 让其他手机访问 | 服务器、可管理 DNS 的域名、有效 HTTPS 证书、可持续保存数据库和证明图片的磁盘或私有对象存储。 | 配置入口域名、反向代理、后台生成的分享链接及 API 公开地址。 | 用另一台手机打开发布链接、刷新子页面、上传并查看证明。复制到手机的链接和图片地址均应使用公网域名。 |
| 真实手机号验证码 | 自己的腾讯云短信服务、审核通过的签名、验证码模板和有发送权限的 API 密钥。 | 后端切到 `SMS_PROVIDER=tencent`，填写短信专属字段。 | 用自己的测试手机号触发一条验证码，确认手机收到、能验证，错误及过期码被拒绝。 |
| 公众号网页授权、微信分享 | 具备网页授权权限的自有公众号、AppID、AppSecret，配置网页授权回调域名。分享还需要 JS 接口安全域名。 | 公众号后台、后端 OAuth 设置、成员 H5 的微信入口开关。按公众号要求验证域名所有权并配置服务器出口 IP。 | 真机微信打开任务、完成回跳、后端保存本服务号下的用户 OpenID。分享卡片要单独检查。 |
| 将奖励发到微信零钱 | 微信支付普通商户号、**另行开通**的商家转账产品及与业务相符的场景、商户与 AppID 关联、运营资金、证书/密钥、固定出口 IP 和公网通知地址。 | 后端切到 `WECHAT_PAY_TRANSFER_MODE=WECHAT`，配置审核、商户、证书与回调。 | 用获准的业务和收款人在微信中验收，核对实际提现单、微信确认、异步通报/查单结果与商户账单。 |

## 1. 域名、证书和图片

下表是一种容易维护的部署方式。示例域名须替换成自己的。管理员端和成员端都使用各自域名的站点根路径，两个站点的 `/api/` 均转发给同一个后端。

| 示例地址 | 应连接到哪里 |
| --- | --- |
| `https://ops.example.com/` | 管理端生产静态文件，支持前端路由刷新。设置 PC 的 `VITE_DISPATCH_BASE_URL=https://tasks.example.com`，便于从后台复制正确的成员入口。 |
| `https://tasks.example.com/` | 成员 H5 生产静态文件，前端路由回退到 `index.html`。站点根目录提供 `runtime-config.js` 和公众号要求的域名验证文件。 |
| `https://tasks.example.com/api/v1/` | Nest API。把 `/api/` 完整转发，避免被 H5 首页接管。后台 API 也可有独立域名，此时微信网页授权域名要与实际 OAuth 回调地址的域名一致。 |
| `https://tasks.example.com/uploads/` | 使用 `UPLOAD_DRIVER=local` 和默认 `LOCAL_UPLOAD_DIR=uploads` 时的文件读取入口。数据目录需要持久化。图片请求不得回退到 H5 首页。使用私有云存储时改走对应的服务端签名访问。 |

后端设置 `API_BASE_URL`、`APP_BASE_URL`、`H5_BASE_URL` 和 `APP_ORIGIN`。例如前两项填 `https://tasks.example.com`，H5 填同一地址，允许来源精确列出管理端与 H5 的 HTTPS 来源。默认本地文件通过静态 URL 提供，知晓链接者可以访问；处理真实成员证明时，应结合部署访问控制，或采用代码已支持的私有腾讯云 COS，设置桶、地域、服务端凭据及签名有效期。定期备份数据库和文件；只有数据库备份无法恢复图片内容。[后端配置模板](../backend/.env.example)

DNS 记录指向实际服务器或入口代理，证书需覆盖所有使用的域名。中国内地服务器对外提供网站前，向实际接入商核实适用的 ICP 备案或接入备案手续。微信公众号验证文件由自己账号后台下载并部署到要求的位置。验收时直接访问验证文件，响应应为该文件内容。[接入商备案说明](https://cloud.tencent.com/document/faq/243/43878)

## 2. 短信登录与资料绑定

项目实现了 `mock` 和 `tencent` 两种短信通道。腾讯云国内短信需先完成适用的实名资质、签名和模板审核及运营商报备，准备有余额或套餐的短信应用。验证码模板当前只传一个参数，即验证码本身。审核驳回、结算或提现等业务通知若启用，需为相应通知另准备模板。[腾讯云国内短信接入](https://cloud.tencent.com/document/product/382/37745) · [腾讯云发送短信 API](https://cloud.tencent.com/document/api/382/55981)

- 后端必填 `SMS_ENABLED=true`、`SMS_PROVIDER=tencent`、`TENCENT_SMS_SECRET_ID`、`TENCENT_SMS_SECRET_KEY`、`TENCENT_SMS_SDK_APP_ID`、`TENCENT_SMS_SIGN_NAME`、`TENCENT_SMS_CODE_TEMPLATE_ID`。签名名称须与审核通过的名称相符。
- 验证码有效期、重发间隔、单手机号及 IP 限制由后端和 Redis 执行。后端在 `NODE_ENV=production` 时拒绝 mock 验证码请求，成员 H5 用 `VITE_APP_ENV=production` 构建。只改页面提示不会让后端真实发送短信。
- 单独启用手机号验证时，H5 可以在普通浏览器登录。开启微信网页授权后，微信身份用于取得服务号 OpenID，绑定或变更手机号仍可能要求短信验证码。手机号和 OpenID 分别用于两种身份核验。
- 腾讯云 API 密钥只写在后端。浏览器的 `VITE_*` 和 `runtime-config.js` 只允许公开的配置值。发布时保留 `.env.example`，真实环境文件、日志和运行数据归部署者单独保存。

## 3. 公众号网页授权与分享

1. 使用具备网页授权权限的公众号，通常是已认证服务号。微信另列有部分已认证政府、事业单位和媒体账号的权限说明，应核对自己账号的接口权限。准备 AppID 和 AppSecret，在公众号后台配置**网页授权域名**，按平台指引验证所有权。公众号的服务器调用若启用 IP 白名单，添加后端实际公网出口 IP。[微信网页授权](https://developers.weixin.qq.com/doc/service/guide/h5/auth.html)
2. 后端设置 `WECHAT_MP_APPID`、`WECHAT_MP_SECRET`、`WECHAT_MP_OAUTH_CALLBACK_PATH=/api/v1/wechat/oauth/callback`、`WECHAT_MP_OAUTH_SCOPE=snsapi_base` 和 `WECHAT_MP_OAUTH_ALLOWED_RETURN_ORIGINS=https://tasks.example.com`。`API_BASE_URL` 决定发给微信的回调完整地址；`H5_BASE_URL` 决定回到哪个成员站点。
3. 整套部署把 `H5_WECHAT_OAUTH` 设为 `true`。单独部署成员 H5 时开启 `wechatOAuth` 运行时开关，或在构建配置中设置 `VITE_ENABLE_WECHAT_OAUTH=true`。成员由微信授权页返回后，后端用授权码换取该公众号下的 OpenID，再回到 H5 的 `/auth/wechat-callback`。测试时用手机微信真实走这一圈，并核对成员身份、租户、资料和邀请码。开关开启时，普通浏览器会显示微信打开提示。[成员端配置](../member/docs/CONFIGURATION.md)
4. 使用自定义分享时，还需在公众号后台设置 **JS 接口安全域名**；后端用服务号凭据获取 JSAPI ticket 并签名，H5 可配置有权使用的公开 HTTPS 分享图。需要公众号模板消息通知时，另外准备适用且已获准的模板，将模板 ID 填入 `WECHAT_MP_TASK_TEMPLATE_ID`。关注状态查询依赖公众号相应接口权限。能成功授权登录后，仍需在真实微信内分别测试关注、分享或通知。[微信 JS-SDK 文档](https://developers.weixin.qq.com/doc/service/guide/h5/jssdk.html)

## 4. 微信商户转账与提现

本项目对接普通商户 API v3 的**商家转账 · 用户确认收款**流程。请使用与自己真实奖励业务相符、已获准的场景及报备材料，向商户平台确认是否支持该类任务。官方目前列有商户资质、场景审核等要求，并注明暂不支持小微商户。公众号主体资格、商户号注册和商家转账产品权限须分别核对。[微信支付开发接入准备](https://pay.wechatpay.cn/doc/v3/merchant/4013740645)

| 准备项 | 本项目后端配置和用途 |
| --- | --- |
| 商户和用户身份 | `WECHAT_PAY_MCH_ID` 填普通商户号，`WECHAT_PAY_APP_ID` 使用与商户号完成关联、且产生该成员服务号 OpenID 的 AppID。确认收款时使用同一商户和 AppID。 |
| 签名、验签与解密 | 商户 API 证书序列号 `WECHAT_PAY_MERCHANT_SERIAL_NO`，商户签名私钥文件 `WECHAT_PAY_PRIVATE_KEY_PATH`，微信支付公钥 ID 和文件 `WECHAT_PAY_PUBLIC_KEY_ID`、`WECHAT_PAY_PUBLIC_KEY_PATH`，以及 32 字节的 `WECHAT_PAY_API_V3_KEY`。将证书和私钥放在 `login-version/.local/certs/`，整套容器内的文件路径填写 `/run/task-certs/文件名`。 |
| 场景和资金 | 按审批结果设置 `WECHAT_PAY_TRANSFER_SCENE_ID`、`WECHAT_PAY_USER_RECV_PERCEPTION` 及 `WECHAT_PAY_TRANSFER_SCENE_REPORT_INFOS`。报备内容应符合实际活动和当前场景要求。准备商户运营账户资金及足够额度，在商户平台设置 API 安全 IP。 |
| 收款与通知 | `WECHAT_PAY_NOTIFY_URL=https://tasks.example.com/api/v1/wechatpay/transfer/notify`。外部微信支付通知需能到达 API；代理应保留原始请求体和微信支付签名请求头，交由后端验签、解密并更新单据。 |
| 发放规则 | `WECHAT_PAY_TRANSFER_MODE=WECHAT` 启用真实渠道；`WECHAT_WITHDRAW_REVIEW_REQUIRED=true` 让审核员把关提现申请。关闭提现审核后，符合条件的申请会直接发起商户请求。前端目前限制单笔 0.10–200.00 元，后端另读 `WECHAT_WITHDRAW_MIN_AMOUNT_FEN` 和 `WECHAT_WITHDRAW_MAX_AMOUNT_FEN`，应与产品及商户获批额度对齐。 |

**一笔真实款项的顺序**：结算订单给成员钱包入账 → 成员在微信内申请提现，冻结该笔金额 → 若启用审核，管理员审核提现 → 后端发起商家转账 → 成员在手机微信确认收款 → 后端接收签名回调或按原商户单号主动查单，核对终态。收到 `WAIT_USER_CONFIRM`、页面提示「已确认」或接口 HTTP 200 均不能据以认定已到账。出现结果未知时，先查原单，再核对微信商户账单。[发起转账](https://pay.wechatpay.cn/doc/v3/merchant/4012716434) · [调起用户确认收款](https://pay.wechatpay.cn/doc/v3/merchant/4012716430) · [转账开发指引](https://pay.wechatpay.cn/doc/v3/merchant/4012715211)

**本地边界。** `MOCK` 模拟内部状态，`MANUAL` 供人工另行处理。当前正式成员 H5 在发起提现前检查微信环境，服务端还要求成员具备服务号 OpenID，这两项检查也适用于模拟申请。因此普通浏览器可用来演练到钱包结算；真实微信授权、短信送达、手机收款和商户账单均由部署者在自己的环境分别验收。项目未随附商户、资金、可用密钥或实际付款记录。

## 5. 上线前看哪几个结果

| 具体验证 | 通过时应该看到什么 |
| --- | --- |
| 业务闭环 | 管理员发布、成员领取、交证明、驳回补交、审核结算后，订单金额和成员钱包流水一致。重启后任务和图片仍可读。 |
| 手机号与微信 | 本人手机收到的验证码可验证；微信授权后回到同一业务租户；有关注要求时能得到正确状态；分享链接在另一台手机正常打开。 |
| 资金链路 | 获准的真实测试单从钱包冻结走到微信确认、终态与商户对账；重复回调、查单、关闭和失败退款均可核对到原订单。 |
| 权限和隐私 | 普通成员只能查看自己可见的数据。管理员按角色操作结算、导出和提现。备份与分享源码分别存放，备份和截图凭证只有授权人员可读取。 |
