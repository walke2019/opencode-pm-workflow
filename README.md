# @walke/opencode-pm-workflow

`@walke/opencode-pm-workflow` 是一个可发布的 OpenCode 插件包，用于把项目任务从"长期停留在需求层"推进到可验证的开发执行闭环。

当前发布版本：`0.11.2`。

## 项目定位

`pm-workflow` 不只是一个提示词 Skill，而是一个 OpenCode 扩展运行时。它提供：

- **状态与阶段机**：自动判断项目当前所处阶段（idea/spec/plan/dev/review/release）
- **Gate 系统**：约束不安全推进，确保必要的 spec/plan/review 不被跳过
- **智能调度**：按任务特征自动分派到合适的专业 agent
- **执行编排**：PM 主协调，handoff 压缩，结果评估，受控自动续跑
- **诊断与工具**：状态查询、健康检查、执行回执、权限管理

## Command Lanes

插件提供 4 条 Command Lane 入口，用于不同审慎级别的调度预览：

| Lane | 用途 |
| --- | --- |
| `pm-quick` | 低风险快速推进 |
| `pm-medium` | 标准实现建议 |
| `pm-full` | 高审慎完整执行 |
| `pm-debug` | 排障优先建议 |

## 核心工作流原则

`pm-workflow` 采用**"稳定任务域 + 外部 agent 定义绑定"**的双层模型：

- `pm_lead` 是统一主协调入口
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

推荐使用 OpenCode 官方 npm plugin 配置方式：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@walke/opencode-pm-workflow"]
}
```

OpenCode 会在启动时自动安装并缓存 npm plugin。仅在需要本地调试包入口时，再使用本地插件文件引用 server / TUI 子路径：

```ts
// plugins/pm-workflow-plugin.ts
export { default } from "@walke/opencode-pm-workflow/server";
```

```ts
// plugins/pm-workflow-plugin-tui.ts
export { default } from "@walke/opencode-pm-workflow/tui";
```

> 注意：不要同时加载源码入口、dist 入口和兼容壳，避免插件重复注册。

## 初次模型配置

推荐让用户和 AI 通过模板完成配置：复制 `pm-workflow.models.example.json` 的内容，参考其中 `agent_profiles` 段对每个 agent 的 role / model_traits / fallback_traits 说明，填好 `default_model`、`default_fallback_model` 或各 agent 的模型映射。每个字段同时支持**完整模型 ID** 和**关键词**（含数组形式），例如 `["claude-opus", "gpt-5.5", "gpt-5.4"]`。然后让 AI 读取该模板：AI 会按 `_resolve_strategy` 把关键词解析为全局清单中存在的完整模型 ID（数组按顺序，第一个命中的关键词就停；多源命中时按 `provider_priority` tiebreak），并在写入前把展开结果展示给你确认，再合并到 `~/.config/opencode/pm-workflow.config.json` 或当前项目 `.pm-workflow/config.json`。

模板会指导 AI 只从 OpenCode 全局 `provider.*.models` 清单校验模型，并同步写入 agent `model`、`fallback_models` 与 `fallback.chains`。

## 当前文档结构

本项目的现行文档已收敛为 README + 4 篇主文档：

| 文档 | 内容 |
| --- | --- |
| [`README.md`](README.md) | 项目入口、安装接入、发布验证 |
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

## Change Log

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-05-23 | 0.11.4 | 模型配置模板支持关键词数组与 provider 优先级；用户填关键词，AI 解析展开后用户确认再写入 |
| 2026-05-23 | 0.11.3 | 模型配置模板补全 agent 角色画像（agent_profiles），AI 校验时按 traits 给候选不静默替换 |
| 2026-05-23 | 0.11.2 | 新增模型配置模板，推荐用户填模板后由 AI 读取并自动合并配置 |
| 2026-05-23 | 0.11.1 | 新增 `pmw models init`，初次使用时可一次性配置 agent 主模型与回退模型 |
| 2026-05-23 | 0.11.0 | 新增 `pmw docs check` 文档治理检查，自动校验版本同步、主文档数量、Change Log 与旧路径引用 |
| 2026-05-22 | 0.10.1 | README 对齐当前版本、5 篇文档结构与 OpenCode npm plugin 接入方式 |
| 2026-05-09 | 0.2.0 | Agent 命名简化：弃用三国角色名，统一为通用短名称；合并 QA+Writer 为 pm_reviewer；移除硬编码模型 ID |
| 2026-05-09 | 0.1.18 | 文档收敛：将 30+ 篇分散文档合并为 5 篇主文档，删除历史 spec/plan/migration 文档，统一流程图到主文档正文 |
| 2026-05-08 | 0.1.17 | 新增 researcher 路由、Agent Definition Registry、compact handoff、mode-aware dispatch |
