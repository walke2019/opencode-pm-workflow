# Changelog

## 0.2.0

- **Agent 命名简化**：弃用三国角色名（pm_workflow_caocao/zhuge/lvbu/diaochan/qa/writer），统一为通用短名称（pm_lead/pm_advisor/pm_backend/pm_frontend/pm_reviewer/pm_researcher）。
- **角色合并**：QA + Writer 合并为 `pm_reviewer`（审查与文档），前端双角色合并为 `pm_frontend`。
- **移除硬编码模型 ID**：所有内置 agent 定义不再携带具体模型 ID，改为从全局 OpenCode 配置读取。
- **向后兼容**：新增 `LEGACY_AGENT_MAP` 自动映射机制，旧名称自动转换为新名称，保留 2 个版本兼容期。
- `DispatchAgent` 类型扩展为新旧名称联合类型，确保旧配置仍可正常工作。
- 更新 analyzer 路由、prompts 分支、evaluator 判断、plan 默认值、dispatch-tools 格式化输出，全面适配新名称。
- 同步更新 AGENTS.md、README、全部 7 个测试文件。

## 0.1.18

- 文档收敛：将 30+ 篇分散文档（dev/runbooks/specs/superpowers）合并为 5 篇主文档（README + 01-技术架构 + 02-业务功能 + 03-使用运维 + 04-待办演进）。
- 所有 Mermaid 流程图统一并入主文档正文，不再散落维护。
- 新增 `AGENTS.md` 开发指南，固化"变更后必须同步现有文档、禁止新建文档"与"每次变更必须更新 CHANGELOG"规则。
- 每篇主文档底部增加 Change Log 表格，便于追踪文档版本与代码版本对应关系。
- 删除历史 spec/plan/migration/audit/draft 类文档 29 篇，仅保留当前 documentation consolidation 的 spec/plan 作为最小历史集合。

## 0.1.17

- 新增 `researcher` 一等语义角色，补齐默认类型、dispatch/fallback 映射、内置 agent 定义与专属执行 prompt。
- 为调研/资料搜索类请求增加 `researcher` 中等触发路由，避免“调研 + 后端关键词”场景被误分派到 `backend`，同时保持实现、文档与 QA 任务边界不被抢占。
- README 补充 `researcher` 角色职责说明，并新增 researcher routing implementation plan 文档以便后续追踪实现过程。

## 0.1.16

- 新增 Agent Definition Registry，按 `project/.opencode/agents` → `global ~/.config/opencode/agents` → legacy `agent` 目录 → 内部 fallback 的优先级解析 agent 定义。
- 将 auto-continue runtime dispatch 接入 registry，按外部 agent frontmatter 的 `model / mode / description` 生成实际 executable agent 与 invocation 语义。
- 为 dispatch 输出补充 `resolvedAgent` 诊断摘要，并新增 runtime/registry 级测试覆盖项目级优先、全局优先、字段级 fallback 与展示路径。

## 0.1.15

- 将 handoff packet 压缩为 `mission / context / scope / acceptance / artifacts / responseFormat` 结构，减少重复 prompt 与无关长文本注入。
- 更新 subagent handoff prompt 中文模板，并按 agent 职责裁剪上下文，统一回传 `summary / verification / risk` 结构化结果。
- 收紧 evaluator 对成功结果的判定：缺少结构化字段时不再直接视为完成，降低“有输出但不可评估”被误判成功的风险。

## 0.1.14

- 新增 `pm-quick`、`pm-medium`、`pm-full`、`pm-debug` 四条 Command Lane 入口，并将其注册到 TUI commands 与发布包 `commands/` 中。
- 引入 lane-aware orchestration：补充 `PmLaneContext`、`TopologySummary`、`TodoPolicySummary`，让调度摘要、toast 与 loop 输出携带更明确的策略信息。
- 修复 primary / subagent 调用语义：primary 继续走 `opencode run --agent`，subagent 改走 `opencode task`，避免专业 agent 被错误按 primary 路径调用并 fallback。
- 更新 README、runbook、架构/迁移文档与流程图，统一补充 0.1.14 的 command lane、mode-aware dispatch 与 topology summary 说明。

## 0.1.13

- 修复开发导向路由在 `collect-spec` / `create-dev-plan` gate 阶段过早切换到专业 agent 的问题，确保只有 `start-development` / `continue-development` 才根据 prompt 自动分派 backend/frontend/writer/QA。
- 新增 gate 路由回归测试，确保需求压缩和开发计划不会被 backend/plugin 关键词绕过。
- 补齐 README、配置示例与 schema，使发布包文档匹配当前 OpenCode 插件、agent、模型与 Skill 行为。

## 0.1.12

- 新增全局 OpenCode provider model inventory 读取能力，并按 `provider.*.models` 的 model key 校验 agent 模型。
- 为默认 workflow agents 配置开发导向模型：主协调、后端、前端、QA、文档分别使用对应模型。
- 新增 `agent-model-config` Skill，用于新项目自动识别 Claude/OpenCode 项目类型并配置 agents/models。
- 将 PM 默认调度改为开发阶段按任务内容分派专业 subagent，并在 prompt 中固化 Workflow/Todo 终结标准。

## 0.1.9

- 新增对 workflow agent `mode: "all"` 的配置支持，兼容可同时作为 primary 与 subagent 的 OpenCode agent 模式
- 对 `pm_workflow_qa`、`pm_workflow_writer`、`pm_workflow_frontend` 增加 legacy `subagent -> all` 归一化兼容，避免现有全局/项目配置继续把它们锁死为 subagent
- 修复当前 CLI `opencode run --agent ...` 直调链路下，上述 workflow agents 被错误识别为 subagent 并 fallback 到默认 `build` agent 的问题

## 0.1.8

- 自动生成的 fallback agents 默认带 `hidden: true`，减少 agent 切换列表噪音

## 0.1.7

- 将默认 agent 模式收紧为 `subagent`，并显式声明 `pm_workflow_caocao` 为唯一 primary workflow agent
- 新增 `pm_workflow_frontend` 前端/UI subagent，默认 `hidden: true`
- QA、writer、frontend 默认都作为隐藏 subagent 注入，避免被 OpenCode 当成常用主 agent
- 配置 schema 与示例新增 `hidden` 和 `frontend` dispatch 支持

## 0.1.6

- 迁移并忽略旧项目配置中的 `pm`、`qa_engineer`、`writer` agent 定义，避免再次覆盖用户本地同名 subagent
- `buildOpenCodeAgentConfig` 防御性跳过 legacy semantic agent keys，只注入 namespaced workflow agents

## 0.1.5

- 新增全局配置文件支持：`~/.config/opencode/pm-workflow.config.json`
- 插件加载时会自动创建全局配置文件，并按“默认值 -> 全局配置 -> 插件 options -> 项目配置”的顺序合并
- 项目旧配置中 `pm_workflow_pm` 会自动迁移到 `pm_workflow_caocao`

## 0.1.4

- 将默认主协调 agent 改为 `pm_workflow_caocao`，以曹操（Cao Cao）作为 pm-workflow primary coordinator 人设
- 更新默认 `agents.dispatch_map`、配置示例与 schema，使内部 `pm` 角色映射到 `pm_workflow_caocao`

## 0.1.3

- 将默认 workflow agents 改为 `pm_workflow_pm`、`pm_workflow_qa`、`pm_workflow_writer`，避免覆盖用户已有的 `pm` / `qa_engineer` / `writer` agent
- 新增 `agents.dispatch_map`，内部调度仍可使用 `pm`、`qa_engineer`、`writer` 语义角色，并映射到实际 OpenCode agent 名称
- 修正配置 schema 与示例，支持自定义 namespaced agent 与 fallback model

## 0.1.2

- 移除运行时对 `~/.config/opencode/skills/pm-workflow/scripts` 的依赖，review gate、pre-commit check 与 feedback signal 检测改为包内实现
- 补齐 workflow agents 的模型与 fallback model 配置，并由 OpenCode config hook 注入 `pm`、`qa_engineer`、`writer` 等 agent
- 切换发布包名与文档引用到 `@walke/opencode-pm-workflow`
- 修复 OpenCode 新版 `tool.execute.before` hook 参数读取、TUI workspace 路径、跨平台构建与类型声明发布

## 0.1.1

- 补齐 `admin-tools` 与 `state-tools`，修复 `server/plugin.ts` 装配链中的缺失模块
- 暴露 `pm-get-execution-plan` 只读工具，并完善 `ExecutionPlan v2` 的动作分支预览
- 修正 `plugins/*` 兼容壳的导出契约，避免自动加载目录中的非标准 server 插件报错
- 清理 `pm-workflow` 的重复加载配置，恢复为通过 `plugins/*` 兼容壳自动接入
- 同步修复启动期可用性问题并通过当前插件契约测试与发布前校验

## 0.1.0

- 完成 `pm-workflow` 的 package-first 改造
- 将 `server`、`tui`、`shared` 运行逻辑迁入 `packages/opencode-pm-workflow/src/*`
- 将 `server` 拆分为 `plugin`、`runtime`、`hooks` 与 `tools/*` 模块
- 将 `tui` 拆分为 `plugin`、`toasts` 与 `commands` 模块
- 将 `shared` 收敛为纯 `re-export` 入口，核心逻辑下沉到 `core/*` 与 `orchestrator/*`
- 提供 `dist/*` 构建产物作为统一发布入口
- 保留 `plugins/*` 兼容壳，并转发到 `@walke/opencode-pm-workflow` 子路径入口
- 补齐 `typecheck`、`build`、`verify-release`、`check-auth`、`prepublishOnly` 等发布前检查链路
- 增加迁移总结、发布就绪报告、发布清单与发布说明草稿文档
- 同步契约测试到当前真实 package-first 结构，`npm test` 已达到 `13/13` 全绿
- 引入 `ExecutionPlan v2` 只读预览能力，并通过 `pm-get-execution-plan`、`pm-dry-run-dispatch`、`pm-dry-run-loop` 对外可见
