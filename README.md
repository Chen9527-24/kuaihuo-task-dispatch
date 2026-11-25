# 快火任务分发

这里提供两套可独立运行的中文任务分发源码。发布者准备作品链接和评论，参与者在手机页面领取。选择下面任意一个版本，就可以单独下载、启动和修改。

| | [免登录评论版](no-login-version/README.md) | [登录完整版](login-version/README.md) |
| --- | --- | --- |
| 适合的业务 | 把准备好的评论逐条分给访客 | 管理团队任务、执行证明、审核、结算与提现 |
| 参与者怎么用 | 打开分享链接 → 填名称领视频 → 领一条评论并复制 | 登录并加入团队 → 领视频和评论 → 交证明 → 查审核结果和钱包 |
| 发布者怎么用 | 填作品链接及评论池、发布、复制领取链接、看领取明细 | 在专用 PC 后台建任务、维护评论池、限定团队、审核订单及提现 |
| 本地运行环境 | Python 3.9+，数据保存在 SQLite | Python 3.9+、Docker Engine 和 Compose v2，或自行运行 Node.js、PostgreSQL 和 Redis |
| 默认本机地址 | 访客和管理端均使用 8780，终端给出发布者入口 | 管理台 8781，成员 H5 8782 |

**独立下载**　[免登录评论版 ZIP](https://github.com/Chen9527-24/kuaihuo-task-dispatch/releases/latest/download/kuaihuo-task-dispatch-no-login.zip) · [登录完整版 ZIP](https://github.com/Chen9527-24/kuaihuo-task-dispatch/releases/latest/download/kuaihuo-task-dispatch-login.zip)

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
