# Command Lanes + Mode-Aware Orchestration Design

## Background

`@walke/opencode-pm-workflow` 已经具备较完整的 PM workflow runtime：state、gate、dispatch、execution plan、evaluation、auto-continue，以及可发布的 OpenCode server / TUI 插件表面。

当前需要解决的不是“是否已经有调度能力”，而是如何把这些能力组织成更好用、更自动化、更符合 OpenCode 最新 agent 语义的产品入口。

本次设计的触发背景有三点：

1. 希望借鉴 `grojeda/opencode-config` 的 `commands/` lane UX 优势，但不能重造第二套 runtime。
2. 当前 specialist agent 中至少一部分是 subagent，却仍存在按 primary agent 路径误调用的风险，导致 `is a subagent, not a primary agent. Falling back to default agent` 这类错误。
3. 目标体验应更自动化：由主 agent 统一分析和委派，子 agent 按能力执行并反馈，尽可能减少非必要的人工确认与人工审核。

## Goals

本次设计目标如下：

1. 为 workflow 提供 `commands/` lane 风格的用户入口。
2. 保持 `pm_workflow_caocao` 作为唯一主协调入口。
3. 让 runtime 正确区分 primary agent 与 subagent 的调用路径。
4. 强化“主 agent 分析决策 → 子 agent 执行 → 回流主 agent → 自动推进”的 orchestration 闭环。
5. 将 todo 纳入编排可视面，但不把 todo 演变成第二套 workflow engine。
6. 默认提升自动化程度，仅在真正必要时请求用户确认。

## Non-Goals

本次不做以下事情：

- 不把 specialist subagent 直接暴露成 lane 主入口。
- 不在 commands 层复刻 state / gate / dispatch / evaluator 逻辑。
- 不在第一阶段实现真正的并行执行引擎。
- 不引入复杂的 capability matrix、跨 session 恢复系统或动态 provider fallback 编排。
- 不把人工 review 设计成每一步默认必需。

## Chosen Scope

选定范围为“推荐基础版（B）”：

- 增加 `pm-quick`、`pm-medium`、`pm-full`、`pm-debug` 四个 lane command。
- 增加显式 lane policy contract，并映射到 runtime。
- 修复 primary / subagent 调度路径。
- 增加结构化 topology summary，而非直接上真并行执行。
- 增加 TUI command 注册与配套测试。

## Design Principles

### 1. Commands are UX facades, not a second runtime

`commands/*.md` 只提供用户入口、风险分级、交互姿态与结构化上下文注入。

所有真实判断仍由现有 runtime 承担，包括：

- state 判断
- gate 判断
- dispatch 分析
- specialist 选择
- execution / loop
- evaluator / review / receipt

### 2. PM remains the only primary orchestrator

`pm_workflow_caocao` 是唯一主协调入口。

它负责：

- 分析用户任务
- 判断是否需要拆解
- 按子 agent 能力进行委派
- 维护全局 todo 视图
- 汇总 specialist 结果
- 判断是否自动推进下一步

specialist agent 不作为 commands 的直接入口，只作为被 PM 委派的执行者。

### 3. Automation-first by default

系统默认策略应是：

- 能自动分析，不问
- 能自动委派，不问
- 能自动继续下一步，不问
- 只在高风险、权限不足、gate 冲突、破坏性操作或多条高影响路径并存时请求用户确认

### 4. Todo is orchestration-visible state, not an alternate workflow engine

todo 的职责是显性化拆解与推进状态，帮助主 agent 编排和帮助用户理解进度。

todo 不负责：

- 决定 specialist 路由
- 替代 gate/state/runtime
- 让各个 specialist 各自维护分叉逻辑

## Architecture

本次方案采用四层结构：

### 1. Command layer

新增：

- `commands/pm-quick.md`
- `commands/pm-medium.md`
- `commands/pm-full.md`
- `commands/pm-debug.md`

这些文件只负责：

- 作为用户可见入口
- 提供 lane 语义
- 统一把任务送往 PM workflow 路径
- 注入结构化 lane context

### 2. Lane policy layer

新增 `src/commands/` 下的轻量类型与 registry：

- `types.ts`
- `registry.ts`
- `lane-policy.ts`
- `analysis.ts`
- `topology.ts`
- `result.ts`

该层负责：

- 定义 lane 的显式 contract
- 为 runtime 提供稳定、可测试、可展示的结构化输入
- 生成结构化 summary，而不接管真实 dispatch 决策

### 3. Runtime dispatch layer

继续以现有 `pm-*` tools 为 backend，重点改造：

- `src/server/runtime.ts`
- `src/server/tools/dispatch-tools.ts`
- 必要时调整 `src/orchestrator/prompts.ts` 中的调度命令构造逻辑

该层负责：

- 解析 lane context
- 进行 state / gate / review / permission 判断
- 进行 mode-aware agent dispatch
- 执行 loop
- 产生 execution receipt

### 4. Presentation layer

通过以下位置展示结果：

- `src/tui/commands.ts`
- `src/tui/plugin.ts`
- dispatch / execution tool outputs

该层负责：

- 展示当前 lane
- 展示选择的 specialist
- 展示 topology summary
- 展示 todo 相关变化
- 向自动化消费者提供结构化字段

## Lane Policy Contract

lane context 采用显式、轻量、可序列化对象，而不是只编码在 prompt 文本里。

建议结构：

```ts
type PmLaneContext = {
  lane: "quick" | "medium" | "full" | "debug"
  risk: "low" | "moderate" | "high" | "debug"
  automation: "guided" | "assisted" | "elevated"
  topologyVerbosity: "minimal" | "structured"
  reviewExpectation: "light" | "standard" | "strict"
}
```

建议默认值：

- `quick`
  - `risk: low`
  - `automation: guided`
  - `topologyVerbosity: minimal`
  - `reviewExpectation: light`
- `medium`
  - `risk: moderate`
  - `automation: assisted`
  - `topologyVerbosity: structured`
  - `reviewExpectation: standard`
- `full`
  - `risk: high`
  - `automation: elevated`
  - `topologyVerbosity: structured`
  - `reviewExpectation: strict`
- `debug`
  - `risk: debug`
  - `automation: assisted`
  - `topologyVerbosity: structured`
  - `reviewExpectation: standard`

### Boundary rule

lane context 只表达策略偏好，不直接决定具体 specialist 或最终执行命令。

lane context 可以影响：

- 输出详细度
- dry-run / safety report 建议强度
- auto-continue 的默认姿态
- review / approval 提示强弱
- todo 的创建积极程度

lane context 不能替代：

- `analyzeDispatchTask(...)`
- `buildDispatchPlan(...)`
- mode-aware 路由
- gate/state/runtime 的真实判定

## Mode-Aware Dispatch

### Problem

当前关键问题不是 specialist 不存在，而是 specialist 中的 subagent 可能被误走 primary agent invocation path，导致 fallback 到默认 agent。

因此正确方向不是把 specialist 改成 primary，而是让 runtime 根据 agent mode 选择正确的调用路径。

### Proposed runtime split

建议将 dispatch 执行逻辑拆为四层：

1. `resolveAgentInvocationSemantics(agentName)`
   - 判断 agent 为 `primary` / `subagent` / `all`
   - 返回调用语义，而不是直接拼命令
   - 给出 `invocationMode`、`requiresTaskPermission`、`supportsDirectRun` 等信息

2. `executePrimaryDispatch(...)`
   - 专门处理可 direct-run 的 primary / all agent
   - 走现有 primary path

3. `executeSubagentDispatch(...)`
   - 专门处理 subagent
   - 走 child session / subtask / task permission 对应路径
   - 不再复用 primary 的 `opencode run --agent ...` 直跑逻辑

4. `executeDispatchByMode(...)`
   - 统一入口
   - 先 resolve，再按 mode 分流到 primary 或 subagent 执行器

### Expected behavior

- `pm_workflow_caocao` 作为 primary 统一入口，可 direct-run。
- specialist subagent 只能通过 subagent-safe path 被调用。
- 上层 lane / loop / topology 不再需要理解 agent mode 细节，只依赖统一 executor。

## Todo-Aware Orchestration

### Design intent

todo 是主 agent 编排闭环的一部分，而不是“顺手补的进度条”。

todo 需要服务于：

- 主 agent 的任务拆解与推进
- 用户对自动化推进状态的理解
- lane / dispatch / loop / receipt 的一致输出
- 后续多任务 orchestration 的最小状态骨架

### Ownership model

`pm_workflow_caocao` 负责 todo planning、normalization 和全局状态更新。

specialist subagent 默认不直接重写全局 todo 策略，只返回状态信号或更新建议。

也就是说：

- PM primary agent 负责：
  - 创建 todo 框架
  - 维护 `pending / in_progress / completed / cancelled`
  - 控制主节奏，尽量保持同一时间只有一个主 in-progress item
- specialist subagent 负责：
  - 执行本地任务
  - 返回 completion / blocked / next-step signals
  - 提供 `todoUpdateSuggestion`

### Todo participation points

todo 建议参与四个环节：

1. **lane entry**
   - 对 medium / full / debug，若识别为多步骤任务，则主动建立规范化 todo 框架。
   - quick 只在明确多步骤时创建。

2. **dispatch planning**
   - dispatch summary 除 specialist / topology 外，还输出：
     - 是否建议创建 todo
     - todo 粒度建议
     - 是否先分析型 todo、后执行型 todo

3. **loop execution**
   - 每次 loop step 附带 todo transition 建议。
   - 例如完成分析任务后自动切换到 specialist 执行阶段。

4. **receipts / TUI feedback**
   - 输出中明确显示本次是否更新了 todo，以及更新了哪些项。

### Lane-based todo posture

- `quick`：todo 可选，明确多步骤才创建
- `medium`：todo 推荐，3+ steps 默认创建
- `full`：todo 强推荐，默认阶段化
- `debug`：todo 推荐，偏向“复现 / 定位 / 修复 / 验证”四段式

## Automation-First Orchestration Model

### Core loop

主流程应明确为：

1. 主 agent 分析任务
2. 主 agent 生成任务拆解 / todo
3. 主 agent 选择 specialist
4. specialist 执行
5. specialist 返回结构化结果
6. 主 agent 汇总结果并判断是否自动推进下一步

这避免把“选 agent、拼结果、决定下一步”重新压回给用户。

### Role boundaries

#### `pm_workflow_caocao` 负责

- 理解用户任务
- 判断单任务 / 多任务
- 根据子 agent 能力做委派决策
- 生成和维护全局 todo
- 汇总 specialist 输出
- 判断是否继续自动推进下一步
- 仅在必要节点请求用户确认

#### specialist subagents 负责

- 执行单一、边界清晰的任务
- 返回结构化结果
- 不接管全局流程
- 不要求用户手工协调多个 specialist

### Human confirmation policy

默认不在每一步停下来问用户。

只有以下情形才请求用户确认：

- 风险升级
- gate 不通过
- 破坏性操作
- 权限不足
- 存在多个同样合理但影响较大的路径

### Review policy

应区分：

- **system review / runtime gate**：自动检查 state、gates、review、权限、风险
- **human review**：仅在确实需要人工判断时触发

换言之，审核能力应尽可能自动化、工具化，而不是默认人工化。

## PM ↔ Specialist Contract

要支持自动循环推进，主 agent 与子 agent 之间需要稳定的输入/输出 contract。

### Dispatch envelope to specialist

主 agent 发给 specialist 的任务信封至少应包含：

- `goal`
- `scope`
- `laneContext`
- `constraints`
- `todoContext`
- `expectedOutput`

这样可以确保 specialist：

- 明白目标
- 不越界接管全局
- 知道当前 lane 的自动化与风险语义
- 按预期格式返回结果

### Structured response from specialist

specialist 至少返回以下结构：

- `status`
  - `completed | blocked | needs_decision | failed`
- `summary`
- `artifacts`
- `todoUpdateSuggestion`
- `nextStepSuggestion`
- `escalationReason`

### Why structure matters

如果 specialist 只返回自由文本：

- 主 agent 很难稳定判断是否完成
- 很难自动更新 todo
- 很难自动决定是否进入下一步
- 很难支持 topology summary、receipt 与后续自动化增强

因此本次虽然不必上很重的 schema engine，但至少需要“稳定字段 + 可读摘要”的 contract。

### Auto-continue rules

主 agent 可基于 `status` 应用简单推进规则：

- `completed`
  - 更新 todo
  - 判断是否进入下一步
- `blocked`
  - 标记 blocked 或保留 in-progress，并解释阻塞点
- `needs_decision`
  - 请求用户决策
- `failed`
  - 记录 receipt，决定是否重试、切换 specialist 或暂停

## Execution Topology

为支持未来多任务 orchestration，但避免现在过度建设，本次只引入结构化 topology summary，而不是完整并行执行器。

建议建立以下抽象：

- `single`
- `sequential`
- `parallel`
- `hybrid`

第一阶段只要求：

- 能分析任务属于哪类 topology
- 能在 dispatch summary / execution receipt 中展示该结论
- 能为后续真正并行执行保留扩展位

第一阶段不要求：

- 真正并行调度多个 specialist
- 并行冲突恢复
- 并发 todo 合并

## Files to Add or Update

### New command files

- `commands/pm-quick.md`
- `commands/pm-medium.md`
- `commands/pm-full.md`
- `commands/pm-debug.md`

### New source files

- `src/commands/types.ts`
- `src/commands/registry.ts`
- `src/commands/lane-policy.ts`
- `src/commands/analysis.ts`
- `src/commands/topology.ts`
- `src/commands/result.ts`

### Key runtime updates

- `src/server/runtime.ts`
- `src/server/tools/dispatch-tools.ts`
- `src/orchestrator/prompts.ts`（如当前仍承担 primary-path 命令拼接）

### TUI updates

- `src/tui/commands.ts`
- `src/tui/plugin.ts`

### Docs

- `README.md`
- `docs/dev/command-lane-mapping.md`
- `docs/dev/subagent-dispatch-migration.md`

### Tests

- `test/command-lane-analysis.test.mjs`
- `test/mode-aware-dispatch.test.mjs`
- `test/topology-summary.test.mjs`

## Implementation Notes

### Command behavior

每个 lane command 统一进入 PM orchestration，不允许绕过 `pm_workflow_caocao` 直接命中 specialist。

### Dispatch tool behavior

建议增强以下工具输出：

- `pm-dry-run-dispatch`
- `pm-run-dispatch`
- `pm-execute-dispatch`
- `pm-run-loop`

需要输出的结构包括：

- `laneContext`
- `selectedAgent`
- `agentMode`
- `topologySummary`
- `todoPlan` 或 `todoUpdate`
- `automationDecision`
- `needsConfirmation`

### Packaging

需要确认 `package.json` 的 `files` 中包含 `commands/`，以确保这些 UX 入口随 npm 包一起发布。

## Risks and Mitigations

### Risk 1: commands layer drifts into a second runtime

**Mitigation**

- 所有 specialist 选择、gate 判断、mode 路由都留在 runtime
- commands 层只传 lane context 和 UX 语义

### Risk 2: todo becomes overbearing or noisy

**Mitigation**

- lane 差异化控制 todo 激活强度
- 由 PM 统一维护 todo，specialist 只返回建议

### Risk 3: automation becomes unsafe

**Mitigation**

- 默认自动推进，但在高风险、权限不足、破坏性操作、gate 冲突时停下
- 将 system review 作为默认 gate，而不是默认人工审批

### Risk 4: topology abstraction overbuilds too early

**Mitigation**

- 第一阶段只做 summary 和结构字段
- 不实现真并发 executor

## Success Criteria

本次设计落地后，应达到以下结果：

1. 用户可以通过 `pm-quick / medium / full / debug` 进入统一 workflow。
2. `pm_workflow_caocao` 仍是唯一主协调入口。
3. specialist subagent 不再被误走 primary path。
4. dispatch / loop 输出能体现 lane、topology、todo、automation 决策。
5. 主 agent 能自动分析、委派、汇总 specialist 结果，并在多数场景自动推进下一步。
6. 用户只在真正需要的时候才被要求确认或审核。

## Recommended Next Step

下一步应基于本 spec 进入 implementation planning：

1. 把新增文件与改动文件整理成逐文件实现计划。
2. 明确测试覆盖顺序。
3. 定义最小可交付切片的实施顺序：lane contract → mode-aware dispatch → command files → TUI → tests → docs。
