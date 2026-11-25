# 登录版任务分发后端

这个服务为任务管理后台和成员 H5 提供同一份任务、订单与钱包数据。发布者在业务租户内选择作品账号，录入视频链接、评论、领取范围和每单金额，再发布任务。已加入团队的成员领取视频和评论，提交主页截图和执行截图。管理员审核订单后，系统用人民币分记入成员余额。提现另有申请、审核和到账状态。

## 在本机启动

同时体验管理后台、H5 和后端，使用[登录版一键启动说明](../../README.md)。单独开发后端需要 Node.js 22.17.1 或更高的 22.x、pnpm 9.15.0、PostgreSQL 16 和 Redis 7。以下命令在本目录执行。

1. 复制配置模板并在本机编辑。

   ```sh
   cp .env.example .env
   ```

   填写数据库密码和对应的 `DATABASE_URL`。连接串中的特殊字符需 URL 编码。填写两个不同的随机 JWT 密钥，每个至少 32 个字符。自行设置 `SEED_ADMIN_USERNAME` 和至少 12 字符的 `SEED_ADMIN_PASSWORD`。本机的 PC 与 H5 地址加入 `APP_ORIGIN`，成员站点填入 `H5_BASE_URL`，API 对外地址填入 `API_BASE_URL` 和 `APP_BASE_URL`。

2. 启动数据库和 Redis。如果已有相应服务，可以直接使用自己的连接地址。当改变本地映射端口时，同步调整 `DATABASE_URL` 或 `REDIS_URL`。

   ```sh
   docker compose up -d --wait
   ```

3. 安装依赖、初始化空数据库、编译并启动。

   ```sh
   corepack enable
   pnpm install --frozen-lockfile
   pnpm db:deploy
   pnpm prisma:seed
   pnpm build
   pnpm start
   ```

4. 默认健康检查位于 `http://127.0.0.1:3000/api/v1/health`，本机接口文档位于 `http://127.0.0.1:3000/docs`。服务默认监听本机，容器通过 `HOST=0.0.0.0` 监听容器网络。新建的管理员首次登录进入业务租户 `DEMO-TENANT`，可直接使用预置的“演示作品账号”发布任务。重新运行初始化时保留该用户已有的密码和默认租户。

本版为独立数据库提供两步初始化迁移。第一步建立业务和权限表，第二步为会员上传的截图建立归属关系。已有其他版本数据库时，应使用新的数据库名；上游综合系统的数据迁移需要单独设计。日常开发可执行 `pnpm start:dev`。正式环境首建管理员需要在该次初始化中显式设置 `ALLOW_PRODUCTION_SEED=true`。

## 功能与数据流

| 业务环节 | 主要接口（共同前缀 `/api/v1`） | 谁使用 |
| --- | --- | --- |
| 管理员登录及权限 | `/auth`、`/users`、`/roles`、`/permissions`、`/tenants` | PC 管理员按角色和租户管理任务 |
| 发布任务 | `/media-accounts`、`/daily-tasks`、`/daily-tasks/:id/dispatch` | 发布者准备视频、评论和金额，正式发布后成员可见 |
| 团队与身份 | `/distribution-groups`、`/app/distribution/auth/login`、`/app/distribution/bind-invite` | 管理员建组，成员短信登录后绑定团队；授权公众号可识别微信用户 |
| 领取与交付 | `/app/distribution/tasks`、`/app/distribution/tasks/claim`、`/app/distribution/tasks/current/claim-comment`、`/app/files/upload` | 成员按可见范围领视频、领评论，保留主页证明并提交当次执行截图 |
| 审核与结算 | `/daily-tasks/:id/orders`、订单的 `settle` 和 `reject` 操作 | 管理员核对截图和金额；结算写入钱包流水，符合配置的订单生成团长佣金记录 |
| 提现 | 成员提现接口、管理员提现审核、`/wechatpay/transfer/notify` | 申请时冻结余额，真实微信转账依据商户单号和验签后的支付结果确认 |

成员会话由 Redis 管理。成员证据上传须核验当前会话和启用状态，提交和保留图片时校验图片归属。管理后台对任务和订单按角色与租户授权；H5 有效派发链接仍须通过当前成员的任务范围校验。

## 上线要准备的资料

- **站点**。准备 PC、H5 和 API 的公网 HTTPS 入口，可以共用一个域名按路径分流。配置前端服务地址、跨域允许来源和反向代理。持久化数据库、Redis 与上传目录，并准备备份和恢复方式。
- **短信**。本机默认为模拟短信，开发时验证码会返回页面。生产启用短信须将 `SMS_PROVIDER=tencent`，填写腾讯云 SecretId、SecretKey、短信 SDK AppID、审核通过的签名和验证码模板 ID。通知短信另配各业务模板。生产禁止启用模拟短信。关闭 `SMS_ENABLED` 后，依赖验证码的登录和绑定无法完成。
- **公众号**。需要微信内网页授权或微信收款身份时，准备支持对应能力的服务号 AppID 和 AppSecret，在平台登记网页授权域名，配置 `WECHAT_MP_OAUTH_ALLOWED_RETURN_ORIGINS`、H5 地址和回调路径 `/api/v1/wechat/oauth/callback`。服务端根据微信授权结果识别收款人。
- **微信商家转账**。准备已开通并获准相应转账场景的商户、与收款身份相符的 AppID、商户号、商户证书序列号、商户私钥、微信支付公钥及公钥 ID、32 字节 APIv3 密钥和公网 HTTPS 通知地址。按商户获批场景配置转账场景 ID、收款感知与报备字段。私钥通过部署环境或只读文件提供。默认 `WECHAT_PAY_TRANSFER_MODE=MOCK`，本机能验证任务结算与余额流水。需要真实发款时配置 `WECHAT`，再由具备权限的商户验收申请、确认收款、成功、失败和对账。微信请求状态不明时保持冻结并按原商户单号查单。
- **截图**。本地磁盘将图片写到 `LOCAL_UPLOAD_DIR`，知道文件地址的人可以直接访问。成员实拍截图上线应使用私有桶；项目提供腾讯云 COS 私有读取和短时签名 URL。开启 `TENCENT_COS_ENABLED`，设置地域、私有桶和最小权限密钥，将 `TASK_CLAIM_PROOF,TASK_SETTLEMENT_PROOF` 保留在私有场景配置中。管理员审核及成员回看时应验证访问和过期效果。
- **可选能力**。人工录入评论可运行完整任务流程。需要 AI 生成时再填 DeepSeek 或自己的 Coze 工作流凭据，主页 OCR 则使用腾讯云 OCR。云端工作流及第三方账户均由部署者准备。

[完整部署指南](../docs/DEPLOYMENT.md) · [第三方开通与验收](../docs/INTEGRATIONS.md) · [非商业使用许可](LICENSE) · [中文许可说明](LICENSE.zh-CN.md)
