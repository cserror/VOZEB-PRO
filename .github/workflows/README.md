# GitHub 构建与发布

本目录是本 Fork 构建操作说明；实际部署版本与启用模式以运维台账 `server-admin/projects/vozeb-pro.md` 为准，不能由本文件推断当前运行状态。

- `quality.yml`：测试阶段 main/PR 默认执行轻量版本核对和密钥扫描，也供镜像工作流复用；不发布镜像、不部署。需要全量源码质量检查时，手动填写与待发布镜像相同的完整 `source_sha` 并勾选 `full_checks`。版本必须属于所选分支或 tag 的历史；Web/docs 只使用核验后的提交，不随主线后续变化漂移。Push/PR 仍默认检查各自事件版本。
- `docker-image.yml`：只允许在自有仓库 main 手动输入完整 `source_sha`。候选必须位于该次工作流允许的 main 历史，并包含发布工具；允许后续正常业务修改，不再固定迁移期业务基线。
- `docs-docker-image.yml`：保留退役提示，手动调用明确失败；没有 tag 自动发布入口。

测试镜像顺序：版本核验 -> 密钥扫描 -> linux/amd64 镜像构建（锁定依赖安装、类型检查、生产编译）-> 隔离成品验证 -> GHCR 上传 -> registry/config 映射复核 -> 成功清单。仅 publish job 有 packages 写权限；不配置生产 SSH、业务密钥或 self-hosted runner。失败不自动重跑。GitHub 构建正式产物，本地不为本次配置调整重复跑应用构建。

日常更新：本地开发或合并指定上游版本并做针对性验证 -> 确定发布 commit -> 获准推送自有 GitHub main -> 手动按完整 SHA 构建 -> 成功镜像与清单交接 -> 运维审查 -> 用户确认 -> 服务器按固定 digest 拉取、备份与切换 -> 验收。推送不会自动构建发布镜像或上线。提交、推送、构建和生产操作须有对应授权；本地无关未提交内容不纳入候选，不需要每次把线上源码拉回本地合并。

“上线交接”可在明确批准范围内连续完成提交、推送、云构建与投递，不要求用户手工先构建。缺授权先列组合方案，缺成功证据只生成草稿。上游合并属于此前的开发任务，按 Git Playbook 审查二开行为及发布配置；不在交接阶段默认补合并。

云构建触发前先核有无匹配的在跑任务或可复用成功证据；触发后把仓库、源码/工作流 SHA、run ID/attempt、链接和状态写入本次项目产物记录。中断后恢复该 run，不把连接超时当成构建失败，不自动重新 dispatch。未拿到 run ID 时先按来源和触发信息查询；多个匹配无法区分时先报告，不能拿“最新一次”猜测。此处为项目操作说明，跨项目规则以交接 Playbook 为准。

2026-09-09 用户批准收窄为测试阶段构建验证：默认不跑 ESLint、全量单测、全仓格式、浏览器/手机 E2E、PostgreSQL 集成套件、文档站构建、依赖 audit 和 CodeQL；完整检查仍保留在 `full_checks=true`，没有将失败伪装为通过。类型和编译仅在 Docker 构建中执行一次。密钥扫描与最终镜像 smoke 失败仍阻断上传。清单标记 `validation_profile=closed-test-build`，并明确全量质量套件未覆盖；该结果不代表生产就绪，上线仍需独立审查和确认。

镜像仓库为 `ghcr.io/cserror/vozeb-pro`，使用带完整 SHA、run 和 attempt 的唯一标签；生产固定 `image@sha256:...`，不使用 latest。Web/Worker 使用同一成品。基础镜像在每次运行时解析并固定 digest，清单记录实际解析结果；应用 Dockerfile 的本地默认仍保留原 Node 22。

成品测试使用独立临时 PostgreSQL、随机测试凭据及禁止外网的 Docker 网络，覆盖初始化、管理员鉴权、静态资源、Sharp、FFmpeg、Worker 心跳和应用重启后的数据保持。它不替代生产旧数据迁移、付费模型/计费和完整生产浏览器验收。测试只清理该次创建且标签匹配的资源。

HTTP 检查通过 `docker exec` 在应用容器内访问 `127.0.0.1:3000`，不发布或查询宿主机端口；保持 `--internal` 网络、禁止跳转及 10 秒请求超时。请求参数通过临时 exec 环境变量传入，不拼进命令；响应保留独立 Cookie 和二进制内容。

报告保留 7 天，仅上传小型 JSON；运维必须下载并长期归档实际部署版本证据。`release-manifest.json` 字段语义由运维交接 Playbook 拥有，项目生成器不替代运维独立核验 GitHub run/attempt、整体 conclusion、镜像和配套材料。

CI 不知道实际生产数据状态，清单用 `impact.migration_required=null`、`assessment_status=pending_ops_review` 明确表示尚未评估，不代表无需迁移，也不是可直接上线的完整影响结论。正式交接前，项目侧须对比本次源码与已部署版本，在交接单补齐是否迁移、配置名称、服务及数据影响，运维独立确认；原始 CI 证据保持不变。清单列出的服务和 `VOZEB_PRO_IMAGE` 仅表示镜像切换范围，不冒充全部业务影响。基础 `docker-compose.yml` 也纳入来源材料摘要，变更迁移脚本等额外部署材料时须按交接契约补齐。

GitHub 标准 runner、权限/包可见性、费用预算和本次允许运行次数须在获准构建前核对；迁移期试构建授权不自动延续到后续版本。当前工作流没有签名/SBOM 发布链路，不冒充具备消费者签名验签；来源核验依赖明确仓库、工作流 SHA、run 和 registry digest。

运维部署时，在现有基础 Compose 和生产覆盖之后最后追加 `deploy/docker-compose.image.yml`，清除原 build 字段，仅替换应用镜像。先在服务器实际 Compose 版本上验证合并结果，保留原 env、卷、端口、网络和资源限制；使用 `up --no-build`，不得执行 `down -v` 或全局清理。文件不会自动应用到生产。

本地针对性检查：`node --test scripts/release/*.test.mjs`，以及 Web 的 `scripts/release-workflow-contract.test.mjs`。完整镜像测试在获准云构建中运行；缺少成功证据时不得正式交接为通过。

本地端口问题回归：指定已缓存的 Node 镜像 `VOZEB_SMOKE_TEST_IMAGE=<image-id>` 和本机 Unix-socket context `VOZEB_SMOKE_TEST_CONTEXT=<context>`，执行 `node --test scripts/release/smoke-container.test.mjs`。仅创建带标签、无宿主机端口、无数据挂载的临时 HTTP 容器与隔离网络，结束自动清理；不指定镜像时跳过，不下载镜像，也不代表真实 VOZEB 成品验收。
