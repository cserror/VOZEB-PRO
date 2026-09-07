# PROJECT_CONTEXT.md

本文件是 VOZEB-PRO 二开工作区的当前事实入口，不是产品规格、开发规则或历史流水。长期规则由 `AGENTS.override.md` 管理，功能、配置、数据库和部署细节以现有代码、测试、README 与 `docs/content/docs/` 为准。

## 当前状态

- 项目内部名称：暂用 `Vozeb` / `VOZEB-PRO`，正式品牌名尚未确定。
- 当前阶段：运维台账记录法国封闭测试环境已部署 `9fcb1aa`（自定义任务 ID 字段）；本地在此基线上完成视频结果获取兼容修改，准备提交并交接，尚未部署。
- 最近核验时间：2026-09-07，Asia/Shanghai。
- 核验范围：本地 Git、视频结果获取代码与测试，以及 `server-admin/projects/vozeb-pro.md`、`SERVICES.md` 和部署记录；本轮未连接服务器，线上版本为台账记录，实际现场由运维审查复核。下方本地运行、浏览器和全量验证条目为历史证据，不代表本次提交已重新执行。

### 2026-09-07 本地视频结果兼容修改

- 本地新增：OpenAI/New API 视频预设 `resultField=video_url`；已完成 JSON 无直链时，按指定协议走带认证的 content 下载；真正保存视频时补全模型头；明确失败不被残留 URL 覆盖。契约见 `docs/content/docs/backend/api-response.mdx` 的视频结果章节。
- 本次只交接 VOZEB 代码，不包含 New API 插件升级。此前实现记录提到 `newapi-chajian` 插件 `0.2.6`，本轮未核对该工作区；运维台账记录网关已激活 `0.2.5`。原工作区的 `new-api-binghuo/` 旧插件和 `web/next-env.d.ts` 开发生成改动不纳入提交，发布源使用目标 commit 的干净工作树与 `git archive`。不写入渠道配置、不恢复已有任务、不调整账务，不自动 push 或部署。
- 验证：五份相关 Vitest（video-task-runtime、generation-task-recovery-service、channel-protocol-registry、system-ai-proxy-policy、系统代理 route）共 103 项通过；`tsc --noEmit --incremental false` 通过。仅 mock / 本机 fixture，无真实数据库或上游调用；没有本轮浏览器成片验收。
- 下一步由运维核对目标 commit、插件结果契约、真实渠道配置和回滚点，再走确认门；已有失败且已退款任务另行确认恢复，不重新创建视频。源码预设不会批量覆盖已保存的渠道配置或任务快照。

## 代码来源与许可

- 当前分支：`main`，跟踪 `origin/main`。
- 当前版本：`v0.0.7`。
- 当前上游业务代码基线 commit：`04b32d31ca00272e3866c85e9a8329036c63af72`；本 Fork 在该基线上包含二开治理文档和首个业务二开切片，当前提交以 Git 为准。
- `origin`：`https://github.com/cserror/VOZEB-PRO.git`，我们的公开 Fork。
- `upstream`：`https://github.com/csyqlz/VOZEB-PRO.git`，官方仓库。
- 本地远程跟踪引用 `origin/main` 为 `13ee2308ef8ce10b5d029fe99b68b78cc53c49a2`；本轮未 fetch，不把该引用当作 GitHub 实时状态。上游业务基线仍沿用上述记录。
- 运维台账记录线上为 `9fcb1aaf6375696272a9810f3de998449a4d62f7`；本次视频结果修复将以该版本的后继 `main` commit 交接，精确 SHA 和源码包 hash 由正式交接单记录，不把本地提交当作已推送或已部署。
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
- 生成记录与提示词合并完成桌面、390px 和 430px 浏览器回归；覆盖结果瀑布流、预览、详情、添加素材、批量选择/删除、筛选、提示词视图切换和旧路径重定向。
- R2/Cloudflare 媒体改造已在代码中完成：对象存储只上传原件，生成记录以 `storageKey` 保存媒体身份，永久媒体按当前后台配置动态解析公开展示 URL，Cloudflare 图片使用 640/1280 两档动态图片；下载、引用、删除、模型输入、导出和临时参考媒体继续使用站内受控地址。
- 本地真实 Agent 图片任务已验证对象身份贯穿生成结果与创作资产：`creative_assets` 保存 `storage_kind=object` 和非空 `storage_key`，当前结果与 Canvas 编辑节点使用 1280px Cloudflare 地址，再次引用、素材面板和 Canvas Agent 参考缩略图使用 640px Cloudflare 地址；加入素材库与插入 Canvas 继续复用同一 `storageKey`，项目刷新后仍按当前后台配置解析 CDN 展示地址，没有新增媒体登记，测试 Canvas 已恢复为 0 个节点和 0 条连线。对应动态图片请求从首次 `MISS` 进入后续 `HIT`。
- 新媒体对象 Key 按 `images|videos|audio/{generation|reference}/{permanent|temporary}/...` 分类；生成日志删除、用户媒体级联删除和全站引用保护统一按真实 `storageKey` 判断，不再依赖历史 URL 列。新生成媒体只以非空 `storageKey` 作为身份；数据库虽然仍保留旧 URL 列，但 URL-only 历史记录不兼容且不会展示，本轮没有自动删除这些旧记录。
- 受管媒体删除已使用持久 `active/pending` 生命周期：删除认领在同一 PostgreSQL 事务中锁定登记、复查全站引用并标记待删除；素材库、生成记录、图片编辑任务、视频参考任务、头像、Canvas、短剧、Agent 创作资产和作品新增引用使用同一媒体行锁。视频任务只持久化稳定 `referenceStorageKeys`，不保存临时签名 URL。本地媒体迁移在该锁内完成 R2 上传、Provider 登记切换和本地源清理；已有对象登记时禁止直接修改 Endpoint、Region、Bucket、Prefix 或 path-style，公开域名、交付方式和凭据仍可更新。R2 或本地文件删除成功才移除登记。首次失败后维护任务只自动补一次，仍失败的登记保留次数与最近错误供后台查看和手动重试。待删除媒体不会再由站内用户、Provider 签名、头像或公开作品接口返回，后台外部存储页仍可检查实际残留的 R2 对象。
- 素材库、生成记录、后台日志、统一创作、Canvas、短剧和作品高密度资源列表复用共享懒加载组件；视口外图片和视频不立即设置媒体源，当前结果、详情弹窗、选中播放器及 Canvas 编辑节点保持立即加载。
- 当前提交通过 Web 全量 Vitest（565 个测试文件通过、4 个跳过；2763 项通过、9 项跳过）、TypeScript、ESLint、生产构建和 `git diff --check`。新生产构建上的生成记录 Playwright 在桌面、390px、430px 共 9 项通过，覆盖预览关闭、详情、素材操作、删除、响应式和视口外懒加载；Chrome 真实后台验收覆盖本地媒体和外部存储桌面/390px 页面、R2 对象预览、原件下载入口、删除确认与移动端无横向溢出，未为制造待删除样本而删除真实对象。本地 Chrome 还复核了 `/create`、`/generations` 和 `/assets` 的 CDN 直连、视口外延迟挂载及 390px 无横向溢出，并验证 Canvas 素材插入、节点/Agent CDN 展示、刷新恢复与测试节点清理。后台调用记录在桌面和 390px 下验证了结果缩略图小眼睛、1280px CDN 大图、1.5 倍缩放、详情二次预览和无横向溢出，站点自身控制台无错误。
- PostgreSQL 真实查询验证旧日志按媒体结果展开；事务内新格式 fixture 验证一个日志的两个 JSONB 结果槽分别关联两个媒体并完整回滚。
- 运维台账记录生成记录、提示词入口与 R2/CDN 媒体改造已于 `13ee230` 部署，任务 ID 字段改造已于 `9fcb1aa` 部署；本次视频结果获取修改尚未部署。
- 自定义异步协议现可显式配置 `taskIdField`；本地回归覆盖 AutoDL 形状的 `data.task_id`、顶层 `request_id` 追踪字段、`data.status` 和 `data.results[0].url`，未配置该字段的既有渠道继续使用原自动识别逻辑。后台渠道编辑器已在桌面和 390px 视口确认字段可编辑且无横向溢出。
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
- 本次更新的目标是法国新服现有 VOZEB 封闭测试服务；服务器、端口、反向代理、证书、资源、备份和回滚事实由 `server-admin` 台账拥有，部署前必须由运维窗口重新核验。
- 本地已配置模型渠道并完成 `gpt-image-2` 真实成功生成；曾出现上游 `HTTP 429` 后恢复，渠道限流、并发和长期稳定性仍需继续观察。文本、视频和音频真实生成未完整验收。
- 本次没有执行真实 AutoDL 付费视频调用；创建返回的 `data.task_id`、查询状态、成片 URL、任务归属、单次扣费和失败退款仍需在部署后使用有限额度验收。
- FFmpeg 相关功能未验收。
- 支付、邮件、对象存储、备份恢复和数据库迁移未做生产级验收。
- 当前没有真实 Cloudflare R2 的生产读取、动态图片权限/额度、缓存 HIT、视频/音频 Range、CORS 或中国大陆网络时延证据；公开单桶 URL 泄露后和作品下架后的持续可访问风险也尚未做生产处置验证。当前不配置 Cloudflare 主动 Purge，R2 原件删除成功后已缓存对象按一小时边缘 TTL 自然失效；删除失败时公开对象地址可能继续可访问，需依赖维护或后台重试。
- 本轮没有执行生产数据库迁移、服务器配置、Cloudflare 后台变更或生产域名切换。独立页面 E2E 复用了既有测试数据，其 Worker 凭据告警不影响 fixture 页面验收，但也不能证明 Worker E2E 已通过。
- 上游原 `AGENTS.md` 超过 Codex 默认项目指导大小；本 Fork 使用精简 override，并按任务定向读取原文件相关章节。
- 上游遗留的 `todo.mdx` 和 `pending-test.mdx` 内容较大，尚未逐项按当前代码、测试和运行证据重新分类；它们不能整体视为当前事实，也不能在未核对前直接清空。

## 下一道门

1. 本次以明确本地 commit 和 `git archive` 源码包完成上线交接；该 commit 在明确执行 `git push origin main` 前不得视为远端已有能力。
2. 运维窗口需按交接单核验法国封闭测试服务的实际版本和回滚点；本次仅更新 Web/Worker 应用镜像及 release 指向，不修改数据库、环境变量、Compose 拓扑、端口、域名、渠道配置或历史持久化数据。
3. 生产操作需单独确认；部署后验证健康、Web/Worker 版本和现有渠道结果获取契约，真实视频成片、下载保存与计费仍需独立授权验收。已有失败且已退款任务不得随部署自动恢复或补账，由运维台账更新实际部署版本。
4. 后续按实际开发需要分批核对旧 `todo.mdx` 和 `pending-test.mdx`，按 owner 归位或删除失效、重复内容，不做一次性大改。

## 维护规则

- 版本、分支、远程来源、运行方式、端口、数据边界、已验证范围、部署状态、长期未知项或下一道门变化时更新本文件。
- 小型实现、临时调试、普通文案和样式调整不写入本文件。
- 每次更新必须以当前 Git、代码、配置或运行证据为依据；旧聊天、旧交接和旧截图只能作为线索。
