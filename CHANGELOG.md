# Changelog

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
