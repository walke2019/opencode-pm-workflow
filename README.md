# @walke/opencode-pm-workflow

`@walke/opencode-pm-workflow` 是一个可发布的 OpenCode 插件包，用于把项目任务从"长期停留在需求层"推进到可验证的开发执行闭环。

当前发布版本：`0.1.17`。

## 项目定位

`pm-workflow` 不只是一个提示词 Skill，而是一个 OpenCode 扩展运行时。它提供：

- **状态与阶段机**：自动判断项目当前所处阶段（idea/spec/plan/dev/review/release）
- **Gate 系统**：约束不安全推进，确保必要的 spec/plan/review 不被跳过
- **智能调度**：按任务特征自动分派到合适的专业 agent
- **执行编排**：PM 主协调，handoff 压缩，结果评估，受控自动续跑
- **诊断与工具**：状态查询、健康检查、执行回执、权限管理

## 核心工作流原则

`pm-workflow` 采用**"稳定任务域 + 外部 agent 定义绑定"**的双层模型：

- `pm_workflow_caocao` 是统一主协调入口
- command lanes 是 UX facade，不是第二套 runtime
- Analyzer 负责语义判断，Registry 负责 agent 定义绑定，Runtime 负责执行编排
- 新增 agent 不等于新增语义角色

核心流转：

```text
需求压缩 → 开发实现 → 测试验证 → 发布摘要
```

## 安装

```bash
npm install @walke/opencode-pm-workflow
```

## OpenCode 接入

在 OpenCode 项目的插件入口中引用 server / TUI 包入口：

```ts
// plugins/pm-workflow-plugin.ts
export { default } from "@walke/opencode-pm-workflow/server";
```

```ts
// plugins/pm-workflow-plugin-tui.ts
export { default } from "@walke/opencode-pm-workflow/tui";
```

> 注意：不要同时加载源码入口、dist 入口和兼容壳，避免插件重复注册。

## 当前文档结构

本项目的现行文档已收敛为以下 4 篇主文档：

| 文档 | 内容 |
| --- | --- |
| [`docs/01-技术架构.md`](docs/01-技术架构.md) | 核心任务域、分层职责、调度语义、agent 定义来源、架构图 |
| [`docs/02-业务功能与任务流转.md`](docs/02-业务功能与任务流转.md) | 阶段模型、dispatch、lane 业务语义、auto-continue、业务流程图 |
| [`docs/03-使用与运维手册.md`](docs/03-使用与运维手册.md) | 安装接入、配置、常用工具、诊断、发布、FAQ |
| [`docs/04-待办与演进清单.md`](docs/04-待办与演进清单.md) | 当前状态、已完成能力、边界约束、后续演进方向 |

## 发布前验证

```bash
npm run verify-release
```

## 发布

```bash
npm version patch --no-git-tag-version
npm run verify-release
npm publish --access public
```

发布后确认：

```bash
npm view @walke/opencode-pm-workflow version
```
