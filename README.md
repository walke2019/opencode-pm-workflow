# @walke/opencode-pm-workflow

`@walke/opencode-pm-workflow` 是一个可发布的 OpenCode 插件包，用于把项目任务从“长期停留在需求层”推进到可验证的开发执行闭环。

它提供：

- OpenCode server 插件：状态同步、agent 注入、调度工具、执行工具、诊断工具。
- OpenCode TUI 插件：阶段提示、状态/权限/执行入口。
- PM 工作流核心：state / gate / dispatch / execution plan / evaluation / auto-continue。
- 开发导向 agent 编排：PM 主协调，按任务特征分派 backend、frontend、QA、writer 等专业 agent。
- Agent/模型初始化 Skill：基于全局 OpenCode provider model 列表配置 Claude Code 与 OpenCode agents。

当前发布版本：`0.1.13`。

## 安装

```bash
npm install @walke/opencode-pm-workflow
```

如果要先确认 npm 包内容：

```bash
npm pack @walke/opencode-pm-workflow --dry-run
```

## OpenCode 接入

在 OpenCode 项目的插件入口中引用 server / TUI 包入口。具体项目可以继续保留已有兼容壳，但最终应转发到本包：

```ts
// plugins/pm-workflow-plugin.ts
export { default } from "@walke/opencode-pm-workflow/server";
```

```ts
// plugins/pm-workflow-plugin-tui.ts
export { default } from "@walke/opencode-pm-workflow/tui";
```

然后在 OpenCode 配置中加载对应插件入口。

> 注意：不要同时加载源码入口、dist 入口和兼容壳，避免插件重复注册。

## 工作流定位

`pm-workflow` 不只是一个提示词 Skill，而是一个 OpenCode 扩展运行时：

1. `state` 判断项目当前阶段。
2. `gate` 判断当前动作是否允许。
3. `dispatch` 选择下一步 action 与 agent。
4. `handoff` 把任务整理为可执行交接包。
5. 专业 agent 执行。
6. `evaluator` 判断结果是否完成、是否需要验证、是否可自动续跑。
7. `permission / confirm / gate` 再次约束自动推进。

核心原则：

```text
需求压缩 → 开发实现 → 测试验证 → 发布摘要
```

Todo 是过程终结标准：每个 todo 必须完成，或标注 blocked 并说明原因。

## Agent 角色

默认注入的 OpenCode workflow agents：

| 角色 | OpenCode agent | 模型设置方式 | 职责 |
| --- | --- | --- | --- |
| PM 主协调 | `pm_workflow_caocao` | 从全局 OpenCode 模型清单中对话确认 | 需求压缩、决策、分派、验收收敛 |
| 拆解顾问 | `pm_workflow_zhuge` | 从全局 OpenCode 模型清单中对话确认 | 复杂任务拆解与风险建议，不取代 PM |
| 后端执行 | `pm_workflow_lvbu` | 从全局 OpenCode 模型清单中对话确认 | API、插件、服务、状态机、后端逻辑 |
| 前端执行 | `pm_workflow_diaochan` / `pm_workflow_frontend` | 从全局 OpenCode 模型清单中对话确认 | UI、交互、组件、可访问性 |
| QA / Review | `pm_workflow_qa` | 从全局 OpenCode 模型清单中对话确认 | 测试、回归、代码审查、风险控制 |
| 文档 / Release | `pm_workflow_writer` | 从全局 OpenCode 模型清单中对话确认 | README、发布说明、交付摘要 |

模型 ID 不应在 README 中假设所有用户一致。实际配置时，应从用户自己的全局 OpenCode 配置 `~/.config/opencode/opencode.json` 读取 `provider.*.models`，列出可用 model key，再通过对话确认每个角色使用哪个模型；不要臆造模型，也不要把 provider key 额外拼进模型 ID。

## 调度规则

PM 是唯一主协调入口，但不会把所有工作都堆在需求层。

- `collect-spec`：仍由 PM 做需求压缩，不能因为 prompt 命中 backend 关键词就跳过 spec gate。
- `create-dev-plan`：仍由 plan/commander 路径生成开发计划。
- `start-development` / `continue-development`：进入开发动作后，才按 prompt 自动路由到 backend、frontend、writer、QA。
- `run-code-review`：由 QA/review 路径处理。
- `prepare-release`：由 writer/release 路径处理。

这保证了两个目标同时成立：

1. 不在需求层长时间堆积。
2. 不绕过必要的 workflow gate。

## 常用工具

插件注册的工具包括：

- 状态：`pm-get-state`、`pm-check-project-state`、`pm-get-next-step`
- Gate：`pm-check-gates`、`pm-check-review-gate`
- 调度：`pm-get-dispatch-plan`、`pm-dry-run-dispatch`、`pm-run-dispatch`
- 执行：`pm-execute-dispatch`、`pm-run-loop`
- 回执：`pm-get-last-execution`、`pm-get-execution-receipt`、`pm-get-execution-summary`
- 配置：`pm-get-config`、`pm-check-permissions`、`pm-set-permission`、`pm-set-mode`
- 诊断：`pm-doctor`、`pm-doctor-repair`、`pm-safety-report`

建议先 dry-run，再执行：

```text
pm-check-gates
pm-dry-run-dispatch
pm-execute-dispatch confirm=YES
```

## Skill：agent-model-config

包内包含：

```text
skills/agent-model-config/SKILL.md
```

用途：新项目启动时，自动识别项目类型并生成/更新 Claude Code 与 OpenCode agent/model 配置。

硬性规则：

- 模型清单只从当前用户的全局 OpenCode 配置读取，默认路径为 `~/.config/opencode/opencode.json`。
- 只从 `provider.*.models` 提取可用的 model key。
- 不同用户的模型 ID 不一样，Skill 应先列出可用模型，再通过对话确认 PM、后端、前端、QA、文档等角色分别使用哪个 model key。
- 写入 Claude Code / OpenCode agent 配置时只写确认后的 model key，不臆造模型，也不额外拼接 provider key。
- 自动识别 `opencode-extension`、`opencode`、`claude-code`、`mixed`、`plain`。

## 配置

项目配置位于：

```text
.pm-workflow/config.json
```

全局默认配置位于：

```text
~/.config/opencode/pm-workflow.config.json
```

示例配置见：

```text
pm-workflow.config.example.json
```

## 文档

- 使用手册：`docs/runbooks/pm-workflow-usage-flow.md`
- 路由与自动续跑：`docs/dev/pm-workflow-routing-and-auto-continue.md`
- 流程图设计：`docs/specs/2026-04-30-pm-workflow-diagrams-design.md`
- 发布检查：`docs/dev/pm-workflow-plugin-publish-checklist.md`

## 发布前验证

```bash
npm run verify-release
```

等价于：

```bash
npm run typecheck
npm run build
npm run smoke
npm run pack-dry-run
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
