# PROJECT_CONTEXT.md

本文件是 VOZEB-PRO 二开工作区的当前事实入口，不是产品规格、开发规则或历史流水。长期规则由 `AGENTS.override.md` 管理，功能、配置、数据库和部署细节以现有代码、测试、README 与 `docs/content/docs/` 为准。

## 当前状态

- 项目内部名称：暂用 `Vozeb` / `VOZEB-PRO`，正式品牌名尚未确定。
- 当前阶段：官方 `v0.0.7` 原版已完成本地安装和基础验收，尚未开始业务代码二开，尚未部署生产服务器。
- 最近核验时间：2026-08-23，Asia/Shanghai。
- 核验范围：本地 Git、远程分支、依赖安装、类型检查、PostgreSQL、Web、生成 Worker、安装向导和管理员后台。

## 代码来源与许可

- 当前分支：`main`，跟踪 `origin/main`。
- 当前版本：`v0.0.7`。
- 当前上游业务代码基线 commit：`04b32d31ca00272e3866c85e9a8329036c63af72`；本 Fork 在其上仅增加二开治理文档，当前工作区 commit 以 Git 为准。
- `origin`：`https://github.com/cserror/VOZEB-PRO.git`，我们的公开 Fork。
- `upstream`：`https://github.com/csyqlz/VOZEB-PRO.git`，官方仓库。
- 最近核验时 `origin/main` 与 `upstream/main` 均指向上述业务代码基线；本地 `main` 的治理文档提交在 push 前会领先 `origin/main`。
- 当前许可证：AGPL-3.0。项目用于自运营，不做 OEM；未来闭源或其他商业分发必须以取得明确商业授权为前提，当前不能视为已经授权。

## 本地开发环境

- Node.js：`v24.16.0`，已完成依赖安装、类型检查和开发运行验证；官方源码开发文档基线仍是 Node.js 22。
- pnpm：`11.9.0`，由仓库 `packageManager` 锁定。
- Web：源码开发模式运行在 `http://127.0.0.1:3100`；使用 `3100` 是因为本机 `3000` 已被其他项目占用。
- PostgreSQL：Docker 容器 `vozeb-dev-postgres`，镜像 `postgres:16-alpine`，绑定 `127.0.0.1:55435`，数据卷 `vozeb-dev-postgres-data`。
- 生成 Worker：本地源码进程，使用与 Web 分离的 Worker Token，当前心跳健康。
- 本地配置：`web/.env.local`，权限 `600`，被 Git 忽略；不得记录或输出其中的真实值。
- 数据库：表结构已初始化，已创建一个本地管理员；本地账号和数据不会自动进入生产环境。
- FFmpeg：本机未安装，因此短剧合成和本地转码尚未验证。
- 本地 Web 与 Worker 是开发进程，不保证重启电脑或结束开发任务后自动恢复；PostgreSQL 容器配置为 `unless-stopped`。

## 已验证范围

- `corepack pnpm --dir web install --frozen-lockfile` 成功。
- `corepack pnpm --dir web typecheck` 通过。
- `GET /api/health/live` 返回 `200`。
- 创建管理员后，`GET /api/health/ready` 返回 `200`。
- PostgreSQL 状态为 `running/healthy`，核验时重启次数为 `0`。
- 生成 Worker 心跳健康。
- 真实浏览器完成安装页、首个管理员创建和管理后台经营看板验收，浏览器控制台未发现错误。
- 本地原版运行验收不等于真实模型、支付、邮件、对象存储、备份恢复或生产部署已经通过。

## 已确认工作方式

- 本地采用混合开发拓扑：Web 与 Worker 使用源码运行，PostgreSQL 使用 Docker，便于热更新和调试。
- 服务器采用项目 Docker 部署材料，并在服务器从明确 commit 的脱敏源码包构建镜像；服务器镜像继续沿用 Dockerfile 的 Node.js 版本。
- 发布链路：本地开发验证 -> commit -> 上线交接 -> 运维审查 -> 用户确认 -> commit 源码包 -> 服务器构建 -> 备份/迁移判断 -> 容器切换 -> 生产验收。
- 后台已经支持的站点名称、Logo、图标和运营参数优先在生产后台配置，不提前做重复的代码级品牌替换。
- 生产数据库、密钥、管理员、媒体和后台配置与本地环境完全隔离。
- 文档按事实 owner 管理，不再要求所有事项机械经过 `todo -> pending-test -> features`。自动化或浏览器证据充分的已实现变更可直接更新对应 owner；只有确实依赖人工、供应商、付费调用或生产验收的事项才进入 `pending-test.mdx`。

## 文档 Owner

- 当前生效项目规则：`AGENTS.override.md`。
- 上游详细规则参考：`AGENTS.md`。
- 当前事实入口：`PROJECT_CONTEXT.md`。
- 人类项目说明与快速开始：`README.md`。
- AI 文档导航：`docs/index.md`。
- 功能、配置、数据库和部署说明：`docs/content/docs/` 对应文档。
- 已确认未实现事项：`docs/content/docs/progress/todo.mdx`。
- 已实现但仍需外部或人工验收的事项：`docs/content/docs/progress/pending-test.mdx`。
- 生产准备门和生产缺口：`docs/content/docs/overview/production-readiness.mdx`。
- 版本历史：`CHANGELOG.md`。
- 生产服务器事实、审查与部署记录：外部运维工作区，不在本仓库复制服务器台账。

## 当前未知项与风险

- 正式产品名称、域名和品牌资产尚未确定。
- 生产服务器目标、端口、反向代理、证书和资源容量尚未在本项目侧确认。
- 模型渠道尚未配置，文本、图片、视频和音频真实生成未验收。
- FFmpeg 相关功能未验收。
- 支付、邮件、对象存储、备份恢复和数据库迁移未做生产级验收。
- 上游原 `AGENTS.md` 超过 Codex 默认项目指导大小；本 Fork 使用精简 override，并按任务定向读取原文件相关章节。
- 上游遗留的 `todo.mdx` 和 `pending-test.mdx` 内容较大，尚未逐项按当前代码、测试和运行证据重新分类；它们不能整体视为当前事实，也不能在未核对前直接清空。

## 下一道门

1. 运维窗口读取正式 pending 交接单，对首次部署执行完整审查；未经用户生产操作确认不得部署。
2. 审查时确定目标服务器、域名、端口、反向代理、证书、资源容量、生产环境变量、备份和回滚方案。
3. 生产部署后初始化独立数据库和管理员，再通过后台配置品牌与模型渠道。
4. 完成生产健康、登录、后台、持久化和至少一个真实业务流程验收后，才更新本文件的部署状态。
5. 后续按实际开发需要分批核对旧 `todo.mdx` 和 `pending-test.mdx`，按 owner 归位或删除失效、重复内容，不做一次性大改。

## 维护规则

- 版本、分支、远程来源、运行方式、端口、数据边界、已验证范围、部署状态、长期未知项或下一道门变化时更新本文件。
- 小型实现、临时调试、普通文案和样式调整不写入本文件。
- 每次更新必须以当前 Git、代码、配置或运行证据为依据；旧聊天、旧交接和旧截图只能作为线索。
