# GitHub 构建与发布

本目录是本 Fork 构建操作说明，不代表流水线已通过或服务器已迁移。

- `quality.yml`：main/PR 的源码质量检查，也供发布工作流复用；不发布镜像、不部署。
- `docker-image.yml`：只允许在自有仓库 main 手动输入完整 `source_sha`。候选必须位于该次工作流允许的 main 历史，并包含本版发布工具；首次迁移不能直接输入未包含工具的旧业务提交。
- `docs-docker-image.yml`：保留退役提示，手动调用明确失败；没有 tag 自动发布入口。

发布顺序：版本核验 -> Web/文档/安全检查 -> linux/amd64 镜像构建 -> 隔离成品验证 -> GHCR 上传 -> registry/config 映射复核 -> 成功清单。仅 publish job 有 packages 写权限；不配置生产 SSH、业务密钥或 self-hosted runner。失败不自动重跑。

本轮是固定业务基线 `61a5c2f6bee5fa6c4e66f662d143ea01bbab2e65` 的构建迁移试点；validate 会拒绝构建材料允许范围外的代码变化。后续业务升级须重新审查并调整这道试点限制，不能静默放开或宣称带业务变更的候选无需迁移。

镜像仓库为 `ghcr.io/cserror/vozeb-pro`，使用带完整 SHA、run 和 attempt 的唯一标签；生产固定 `image@sha256:...`，不使用 latest。Web/Worker 使用同一成品。基础镜像在每次运行时解析并固定 digest，清单记录实际解析结果；应用 Dockerfile 的本地默认仍保留原 Node 22。

成品测试使用独立临时 PostgreSQL、随机测试凭据及禁止外网的 Docker 网络，覆盖初始化、管理员鉴权、静态资源、Sharp、FFmpeg、Worker 心跳和应用重启后的数据保持。它不替代生产旧数据迁移、付费模型/计费和完整生产浏览器验收。测试只清理该次创建且标签匹配的资源。

报告保留 7 天，仅上传小型 JSON；运维必须下载并长期归档实际部署版本证据。`release-manifest.json` 字段语义由运维交接 Playbook 拥有，项目生成器不替代运维独立核验 GitHub run/attempt、整体 conclusion、镜像和配套材料。

GitHub 标准 runner、权限/包可见性、费用预算及最多两次试构建范围须在首次运行前确认。当前工作流没有签名/SBOM 发布链路，不冒充具备消费者签名验签；来源核验依赖明确仓库、工作流 SHA、run 和 registry digest。

运维部署时，在现有基础 Compose 和生产覆盖之后最后追加 `deploy/docker-compose.image.yml`，清除原 build 字段，仅替换应用镜像。先在服务器实际 Compose 版本上验证合并结果，保留原 env、卷、端口、网络和资源限制；使用 `up --no-build`，不得执行 `down -v` 或全局清理。文件不会自动应用到生产。

本地针对性检查：`node --test scripts/release/*.test.mjs`，以及 Web 的 `scripts/release-workflow-contract.test.mjs`。完整镜像测试在获准云构建中运行；缺少成功证据时不得正式交接为通过。
