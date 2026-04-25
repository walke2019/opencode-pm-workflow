# Changelog

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
