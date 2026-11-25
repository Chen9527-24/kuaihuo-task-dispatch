# 快火任务分发

这里提供两套可独立运行的中文任务分发源码。发布者准备作品链接和评论，参与者在手机页面领取。选择下面任意一个版本，就可以单独下载、启动和修改。

**自媒体视频评论生成**支持按平台生成评论草稿，配置关键词和作者回复。审核后可将评论、作品标题和同平台链接带入热启动草稿，也可以从 Excel 直接导入已有评论。[查看源码和本地运行说明](comment-generation/README.md)

| | [免登录评论版](no-login-version/README.md) | [登录完整版](login-version/README.md) |
| --- | --- | --- |
| 适合的业务 | 把准备好的评论逐条分给访客 | 管理团队任务、执行证明、审核、结算与提现 |
| 参与者怎么用 | 打开分享链接 → 填名称领视频 → 领一条评论并复制 | 登录并加入团队 → 领视频和评论 → 交证明 → 查审核结果和钱包 |
| 发布者怎么用 | 填作品链接及评论池、发布、复制领取链接、看领取明细 | 在专用 PC 后台建任务、维护评论池、限定团队、审核订单及提现 |
| 本地运行环境 | Python 3.9+，数据保存在 SQLite | Python 3.9+、Docker Engine 和 Compose v2，或自行运行 Node.js、PostgreSQL 和 Redis |
| 默认本机地址 | 访客和管理端均使用 8780，终端给出发布者入口 | 管理台 8781，成员 H5 8782 |

**独立下载**　[免登录评论版 ZIP](https://github.com/Chen9527-24/kuaihuo-task-dispatch/releases/latest/download/kuaihuo-task-dispatch-no-login.zip) · [登录完整版 ZIP](https://github.com/Chen9527-24/kuaihuo-task-dispatch/releases/latest/download/kuaihuo-task-dispatch-login.zip)

## 登录版需要自行准备什么

| 你想怎么用 | 需要自己准备的东西 |
| --- | --- |
| 在电脑上试用 | 一台能运行 Docker Engine 和 Compose v2 的电脑、Python 3.9+、浏览器，首次安装要联网。可以用模拟验证码体验发布、领取、交截图、审核和钱包入账，无需购买域名、短信套餐或微信商户服务。 |
| 发布第一条任务 | 作品所属的媒体账号、视频链接、逐条写好的评论、领取名额、每份奖励，以及参与团队的邀请码。团队和邀请码可以在后台创建。 |
| 让成员在手机上正式使用 | 可持续运行的服务器、可管理 DNS 的域名和 HTTPS 证书、管理台与手机 H5 的访问地址，以及数据库和成员截图的持久化存储与备份。一个主域名可分配两个子域名。 |
| 验证成员手机号 | 自有腾讯云短信应用、发送额度、已审核的短信签名和验证码模板，以及服务端发送凭据。正式环境里的新成员绑定手机号时也需要能收到验证码。 |
| 开启微信内授权或分享 | 具备网页授权权限的公众号、AppID、AppSecret 和网页授权域名。自定义分享卡片还要配置 JS 接口安全域名。 |
| 把奖励发到微信零钱 | 自有微信支付商户号、已开通且适用于该业务的「商家转账」场景、关联的公众号 AppID、商户资金、签名与验签材料，以及公网通知地址。只做到站内钱包记账可先不接微信支付。 |

下载后先看[登录版准备清单与填写位置](login-version/README.md#登录版需要自行准备什么)。真实凭据仅填写在部署者自己的服务器上。

## 在本机开始

下载本仓库后进入所选版本目录，在有 `run.py` 的位置执行 `python3 run.py`，Windows 使用 `py -3 run.py`。两个版本有各自的启动入口、配置、数据和许可文件。免登录版的链接在当前电脑演示。登录版默认使用模拟短信，可走通到任务审核与钱包入账。

- [免登录版启动与第一份任务](no-login-version/README.md)
- [登录版启动与第一笔结算](login-version/README.md)
- [登录版正式部署清单](login-version/full-stack/docs/DEPLOYMENT.md) · [公众号、短信、私有图片存储和微信商户资料](login-version/full-stack/docs/INTEGRATIONS.md)

## 界面截图

**免登录版访客**从填写名称开始，领取视频后再领评论。可在原浏览器回看和复制。[发布者工作台与各步骤大图](no-login-version/README.md#界面截图)

![免登录版填写名称、打开视频、领取与复制评论](no-login-version/docs/screenshots/guest-workflow.png)

**登录版管理台**集中展示任务、团队成员和待审核提现。从这里进入任务发布、订单审核及结算。成员端另有任务大厅、操作指引和两类证明上传。[管理台及成员 H5 截图图集](login-version/docs/screenshots/README.md)

![登录版专用任务工作台](login-version/docs/screenshots/admin-dashboard.png)

## 许可

两套源码均采用 PolyForm Noncommercial License 1.0.0。使用和再分发须遵守非商业许可并保留署名，商业用途需另行取得授权。项目源自[快火运营套件](https://github.com/Chen9527-24/kuaihuo-operations-suite)。[许可全文](LICENSE) · [中文说明](LICENSE.zh-CN.md) · [署名](NOTICE)
