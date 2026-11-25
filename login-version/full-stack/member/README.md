# 快火任务分发 · 成员 H5

成员在手机浏览器领任务和评论、上传主页和执行证明，查看驳回原因、结算流水和提现结果。团长可以使用邀请码组织成员，查看团队数据。任务、租户、金额和账号状态由同一套任务后端保存。

## 启动

整套本地环境从[完整登录版项目首页](../../README.md)启动。单独调试页面时，先启动同目录层级的 backend 服务，创建任务租户，再在本目录执行以下命令。

```sh
cp .env.example .env.development
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm dev
```

使用 Node.js 22 和 pnpm 9.15.0。Windows PowerShell 第一条命令可写成 `Copy-Item .env.example .env.development`。把自己的租户标识填入 `VITE_DEFAULT_TENANTS_ID` 后重新启动开发服务。默认地址为 http://localhost:5174，Vite 将 `/api` 和 `/uploads` 代理到本地 3000 端口的后端。按整套部署指南使用 8783 等其他 API 端口时，填写 `VITE_API_PROXY_TARGET`。

生产构建使用 `.env.production`。以下命令会执行 TypeScript 检查并生成 `dist/`。

```sh
corepack pnpm typecheck
corepack pnpm build:prod
```

## 走完第一单

1. 管理员在任务后台准备租户、已启用的媒体账号、团长团队与成员邀请码，创建带作品链接、评论池、名额和金额的任务并发布。
2. 成员打开该租户的 H5，用手机号和验证码登录。启用公众号授权的站点从手机微信进入。按页面提示补齐资料、加入团队，选定任务账号。
3. 领取一条任务，再领取一条评论。由成员自行查看作品并执行要求，回到当前任务上传主页截图和本次执行证明，提交审核。
4. 审核员在专用管理后台查看证明。驳回后，成员可以根据原因更换本次证明再提交。审核员确认结算后，成员在收益记录看到实际结算金额。
5. 成员有余额且具备收款条件时，才继续走提现。微信提现涉及服务号身份、商户产品、真实回调和资金，与订单审核分别处理。[正式接入与部署材料](../docs/INTEGRATIONS.md)

## 代码入口

| 目录或文件 | 用途 |
| --- | --- |
| `src/pages/`、`src/router/` | 登录、微信回跳、关注提示、成员资料、邀请码、当前任务、订单、团长中心及提现。 |
| `src/components/TaskSteps.vue`、`TaskProofUploadGroups.vue` | 分步领取、提交、退回后补交，两类证明的上传。 |
| `src/services/`、`src/api/` | 登录状态、租户请求、公众号授权、分享签名、微信收款确认及后端接口。 |
| `public/runtime-config.js`、`.env.example` | 部署站点的公开配置。填写方式见[成员端配置](docs/CONFIGURATION.md)。 |

本项目采用 [PolyForm Noncommercial 1.0.0](LICENSE)，商用须另行取得授权。分发时保留 [NOTICE](NOTICE) 和[中文说明](LICENSE.zh-CN.md)。
