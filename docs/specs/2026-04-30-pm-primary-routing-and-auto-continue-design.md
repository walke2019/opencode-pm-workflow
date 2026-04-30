# PM 唯一主路由入口与低风险自动续跑两阶段演进设计

> 日期：2026-04-30  
> 状态：已确认，可进入 implementation plan  
> 范围：`opencode-pm-workflow` 主协调路由与自动化推进能力

---

## Purpose

本文档定义 `opencode-pm-workflow` 的下一轮优化方向：在不引入复杂权限系统、不做大规模重构的前提下，进一步提升系统与用户目标的一致性。

本轮设计直接响应以下已确认诉求：

- `pm / 曹操` 必须是唯一主协调入口
- `commander` 不是默认主 agent，只能作为可选顾问
- 工作流要更偏自动化，尽量减少无意义停顿与重复确认
- 高风险动作仍然要停住，不能盲目自动推进

因此，本设计采用“两阶段最小演进方案”：

1. **Phase 1：扶正主路由**  
   彻底移除 `plan_ready` / `development` 阶段对 `commander` 的默认主路由依赖，统一由 `pm` 作为主入口。
2. **Phase 2：增强自动化续跑**  
   在低风险链路上允许自动继续下一步，但对 `release` / `repair` / `gate blocked` / 连续失败等场景保持停住。

本设计不追求一次性把插件升级成重型调度引擎，而是优先解决“主路由不纯”和“自动推进不足”这两个最影响实际体验的问题。

---

## Prerequisites

### 当前实现基础

当前项目已经具备以下能力：

- 阶段驱动的工作流状态总结与 gate 判断
- `pm-run-dispatch` / `pm-dry-run-dispatch` / `pm-execute-dispatch` 等工具入口
- `analysis -> handoff -> evaluation -> next-step` 的基础闭环
- 默认自动执行能力：

```text
allow_execute_tools = true
require_confirm_for_execute = false
```

- 已有测试：

```text
test/workflow-redesign.test.mjs
test/dispatch-quality-loop.test.mjs
```

### 当前主要问题

虽然前一轮已经把方向转向 `pm` 主协调，但当前实现仍有两个明显偏差：

1. **阶段级主路由仍残留 `commander`**  
   在 `src/orchestrator/plan.ts` 中，`plan_ready` 与 `development` 仍默认推荐 `commander`。

2. **evaluation 只能建议下一步，不能在低风险条件下自动续跑**  
   系统能给出 `recommendedNextAgent` / `recommendedNextAction`，但不会在边界明确时自动推进。

### 本轮涉及文件

本设计预计主要涉及：

```text
src/orchestrator/plan.ts
src/orchestrator/analyzer.ts
src/orchestrator/prompts.ts
src/server/tools/dispatch-tools.ts
src/orchestrator/evaluator.ts
test/workflow-redesign.test.mjs
test/dispatch-quality-loop.test.mjs
```

必要时可少量触及：

```text
src/core/types.ts
src/server/runtime.ts
```

---

## Steps

### Phase 1：扶正 `pm` 为唯一主路由入口

#### 1. 目标

统一主路由原则：

```text
任何阶段的默认决策入口都先回到 pm
```

这不意味着每个任务都由 `pm` 亲自执行，而是意味着：

- `pm` 负责判断谁来做
- 专业 agent 负责产出
- `commander` 仅在需要拆解建议时被 `pm` 主动调用

#### 2. 核心改动

##### 2.1 `src/orchestrator/plan.ts`

当前存在的核心偏差示意：

```ts
if (state.stage === "plan_ready") {
  recommendedAgent = "commander";
  recommendedAction = "start-development";
}

if (state.stage === "development") {
  recommendedAgent = "commander";
  recommendedAction = "continue-development";
}
```

本阶段应改为：

- `plan_ready` 默认推荐 `pm`
- `development` 默认推荐 `pm`
- 推荐理由文案不再描述为“由 commander 协调开始/继续开发”
- 后续执行对象由 `pm + analyzer` 再决定是 `backend`、`frontend`、`writer`、`qa_engineer`，还是进入顾问建议模式

##### 2.2 `src/orchestrator/analyzer.ts`

当前分析器已经能识别 domain / complexity / executionMode，但仍有一条旧倾向：

```ts
if (domain === "orchestration" && complexity === "composite") {
  return "commander";
}
```

本阶段建议改为：

- 默认 `recommendedAgent` 优先返回 `pm`
- `commander` 不再作为默认 `recommendedAgent`
- 当任务满足“复杂跨角色且明确需要拆解建议”时，输出中标记：
  - `recommendedAgent = pm`
  - `executionMode = advisor_then_dispatch`
  - `expectedNextAgents` 中可包含 `commander`

这样可以保留顾问价值，但不再把顾问变成主入口。

##### 2.3 `src/orchestrator/prompts.ts`

需要统一 prompt 叙事，确保最终生成的上下文始终表达：

- `pm` 是主协调者
- `backend/frontend/writer/qa_engineer` 是执行者
- `commander` 若出现，只表示“提供拆解建议或策略意见”

这一步的重点不是大改 prompt 模板，而是防止已有提示中继续暗示 `commander` 为“总指挥入口”。

##### 2.4 `src/server/tools/dispatch-tools.ts`

当前工具输出已经包含：

- task analysis
- handoff packet
- evaluation
- next dispatch hint

但下一阶段建议把角色层级显示得更清楚，例如：

```text
- routing owner: pm
- execution target: backend
- advisor: commander (optional)
```

目的：让用户一眼看清谁负责决策、谁负责执行、谁只是顾问。

#### 3. Phase 1 验收标准

完成后必须满足：

1. `plan_ready` 阶段默认推荐 agent 为 `pm`
2. `development` 阶段默认推荐 agent 为 `pm`
3. 简单 backend/frontend/writer/qa 任务不再默认派给 `commander`
4. `commander` 只能作为 advisor/fallback 出现，不能再是默认主 agent
5. 对应回归测试更新并通过

---

### Phase 2：增加低风险自动续跑

#### 1. 目标

在不引入复杂权限系统的前提下，把工作流从：

```text
执行一步 -> 给出建议 -> 等待下一次手动触发
```

升级为：

```text
执行一步 -> 评估结果 -> 若低风险可继续，则自动推进下一步
```

#### 2. 自动续跑边界

本阶段不追求“任何情况都自动跑完”，而是只定义简单、可解释的边界。

##### 2.1 允许自动推进的典型场景

- `backend` 完成但缺少验证证据：自动转 `qa_engineer`
- `frontend` 完成但缺少验证证据：自动转 `qa_engineer`
- `writer` 完成文档整理：自动回到 `pm` 做收尾判断
- `qa_engineer` 给出通过结论：自动更新为下一阶段建议或结束当前闭环

##### 2.2 必须停住的场景

- `release`
- `repair`
- 任一 gate blocked
- evaluator 判断缺失关键信息，无法继续
- 命令失败且达到重试上限
- 返回结果明显冲突或含糊，无法安全判断下一步

#### 3. 核心改动

##### 3.1 `src/orchestrator/evaluator.ts`

当前 evaluator 已能给出：

```text
status
recommendedNextAgent
recommendedNextAction
```

本阶段建议补充一个更直接的自动推进信号，例如：

```ts
canAutoContinue: boolean
autoContinueReason?: string
```

判断原则应保持保守：

- 只有当 `exitCode = 0` 且下一步明确、风险低、缺口可控时才允许 `true`
- 一旦涉及高风险动作或不确定判断则返回 `false`

##### 3.2 `src/server/tools/dispatch-tools.ts`

重点增强 `pm-execute-dispatch` 或 loop 相关执行路径：

1. 执行当前 dispatch
2. 评估结果
3. 若 `canAutoContinue = true`，构建下一步 dispatch
4. 继续执行下一步
5. 遇到 stop 条件立即停住并汇报

这里建议控制为有限步数，避免无限循环，例如：

```text
单次自动续跑最多推进 2~3 步
```

##### 3.3 `src/orchestrator/plan.ts`

在 Phase 2 中，`plan.ts` 还需要承担一个额外职责：

- 把 evaluator 给出的下一步建议重新映射成新的 dispatch command
- 确保自动推进仍然经过现有 gate / permission / confirm 检查

即：

```text
自动推进不是绕过 gate，而是重复利用现有 gate
```

#### 4. Phase 2 验收标准

完成后必须满足：

1. 低风险链路可自动推进 1~2 个后续动作
2. 高风险动作不会自动续跑
3. 自动续跑始终经过现有 gate / permission / confirm 判断
4. 连续失败或结果不明确时，系统会停住并返回原因
5. 增加针对自动续跑的测试并通过

---

## Examples

### 示例 1：后端修复后自动转 QA

输入任务：

```text
修复认证接口 401，并确认不影响现有登录流程
```

期望链路：

```text
pm
-> backend 执行修复
-> evaluator 发现缺少验证证据
-> 自动转 qa_engineer
-> qa_engineer 返回验证结果
-> pm 总结并结束当前闭环
```

### 示例 2：复杂多角色任务先由 PM 决定是否咨询 commander

输入任务：

```text
把设置页改版，同时补齐文档和验收清单
```

期望链路：

```text
pm 分析为 composite / orchestration
-> 选择 advisor_then_dispatch
-> commander 提供拆解建议（可选）
-> pm 决定先派 frontend，再派 writer，再派 qa_engineer
```

注意：此时 `commander` 仍然不是主入口，只是顾问。

### 示例 3：高风险场景停住

输入任务：

```text
直接准备 release 并发布
```

期望行为：

```text
pm 识别为高风险动作
-> gate / permission / confirm 检查
-> 不自动续跑
-> 返回阻塞原因或人工确认需求
```

---

## FAQ

### Q1：为什么不直接把 `commander` 删除？

不建议。本项目已经证明 `commander` 在复杂任务拆解上仍有价值。问题不在于它存在，而在于它不应继续承担默认主路由职责。

### Q2：为什么不一步做到完全自治？

因为当前用户要求的是“更自动化，但不要复杂”。如果一上来引入复杂 DAG、并行执行、自治长链路，风险和维护成本都会明显上升，不符合本轮目标。

### Q3：为什么自动续跑只做低风险？

因为 `release`、`repair`、gate blocked 等动作天然具有更高破坏性或更高决策成本。自动化应优先覆盖高确定性、低风险、可验证的部分。

### Q4：Phase 1 与 Phase 2 必须一起做吗？

不必须。建议顺序是先做 Phase 1，再做 Phase 2。因为如果主路由仍不纯，自动续跑只会把错误路径更快地自动化。

---

## Troubleshooting

### 问题 1：改完后仍看到 `commander` 成为默认推荐 agent

排查顺序：

1. 检查 `src/orchestrator/plan.ts` 是否仍在 `plan_ready` / `development` 中写死 `commander`
2. 检查 `src/orchestrator/analyzer.ts` 是否仍把 composite orchestration 直接返回 `commander`
3. 检查测试是否只覆盖简单任务，未覆盖阶段默认路由

### 问题 2：自动续跑没有触发

排查顺序：

1. 检查 evaluator 是否产出了 `recommendedNextAgent` / `recommendedNextAction`
2. 检查是否被判定为高风险动作
3. 检查 loop / execute 路径是否真正读取了 `canAutoContinue`
4. 检查 gate / permission / confirm 是否拦截了后续动作

### 问题 3：自动续跑进入错误链路

排查顺序：

1. 检查 evaluator 对输出的判断是否过于乐观
2. 检查 stop 条件是否过弱
3. 检查是否缺少“缺失关键信息则停住”的保护分支

---

## Change Log

### 2026-04-30

- 新增本文档，定义“PM 唯一主路由入口 + 低风险自动续跑”的两阶段最小演进方案
- 明确 `pm` 为唯一主协调入口
- 明确 `commander` 降级为 advisor / 可选顾问
- 明确 Phase 1 与 Phase 2 的目标、边界、涉及文件与验收标准
