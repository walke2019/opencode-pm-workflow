# PM 唯一主路由入口与低风险自动续跑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以最小改动完成两阶段演进：先把 `pm` 扶正为唯一主路由入口，再在低风险链路上增加有限步数的自动续跑能力。

**Architecture:** 继续复用现有 `analysis -> handoff -> evaluation -> dispatch tools` 闭环，不重写底层 runtime、不引入复杂权限系统。Phase 1 只修正默认路由与角色叙事；Phase 2 在 evaluator 中增加明确的自动续跑信号，并让 `pm-execute-dispatch` / loop 路径在既有 gate、permission、confirm 约束下有限自动推进。

**Tech Stack:** TypeScript、Node.js ESM、OpenCode Plugin SDK（`@opencode-ai/plugin`）、现有 `npm run build` / `npm run typecheck` / `node test/*.mjs` 验证链路。

---

## 一、目标文件结构与职责

### 主要修改文件

- `src/orchestrator/plan.ts`
  - Phase 1：移除 `plan_ready` / `development` 默认回落到 `commander` 的逻辑
  - Phase 2：在自动续跑需要重新构造下一步 dispatch 时，继续复用现有 plan/gate 逻辑
- `src/orchestrator/analyzer.ts`
  - Phase 1：把复杂 orchestration 任务的默认 `recommendedAgent` 从 `commander` 改为 `pm`
  - 保留 `advisor_then_dispatch` 模式与 `expectedNextAgents` 中的 `commander`
- `src/orchestrator/prompts.ts`
  - Phase 1：统一 prompt 叙事，明确 `pm` 是主协调者，`commander` 仅是顾问
- `src/orchestrator/evaluator.ts`
  - Phase 2：新增 `canAutoContinue` / `autoContinueReason` 等保守自动续跑信号
- `src/server/tools/dispatch-tools.ts`
  - Phase 1：增强输出层次，显式区分 routing owner / execution target / advisor
  - Phase 2：让执行路径在低风险条件下最多自动续跑 2 到 3 步
- `src/core/types.ts`
  - Phase 2：扩展 `EvaluationResult` 类型，补充自动续跑相关字段
- `test/workflow-redesign.test.mjs`
  - Phase 1：补足“阶段默认主路由必须是 pm”的回归断言
- `test/dispatch-quality-loop.test.mjs`
  - Phase 1：把复杂 orchestration 任务的预期从 `commander` 调整为 `pm`
  - Phase 2：增加 evaluator 自动续跑与 stop 条件测试

### 只在必要时触及的文件

- `src/server/runtime.ts`
  - 仅在 `dispatch-tools.ts` 无法在现有返回结构上实现有限自动续跑时再改
- `src/core/gates.ts`
  - 本轮不主动修改；只复用其既有拦截结果

### 本轮不改动范围

- 不新增复杂 trust domain / 路径级权限系统
- 不重做 `pm-workflow` 状态机
- 不引入并行调度器、DAG 编排器或长期学习派单系统
- 不更新依赖版本，不修改 `package.json` 版本号

---

## 二、实施原则

1. **先纯化主路由，再谈自动化。** Phase 1 没完成前，不进入 Phase 2 实现。
2. **保持保守自动化。** 自动续跑只能覆盖低风险、下一步明确、已有 gate 可复用的路径。
3. **不绕过既有安全边界。** 自动推进也必须经过现有 `gate`、`permission`、`confirm` 判断。
4. **优先补回归，再补行为。** 每个阶段先改测试，再改最小实现，再做完整验证。
5. **只做最小正确改动。** 不顺手重构大文件，不新增没有即时收益的抽象层。

---

## 三、Phase 1 实施计划

### Task 1: 修正阶段默认主路由

**Files:**
- Modify: `src/orchestrator/plan.ts`
- Test: `test/workflow-redesign.test.mjs`

- [ ] **Step 1: 先在回归测试中锁定阶段默认路由行为**

在 `test/workflow-redesign.test.mjs` 新增一个专门测试函数，校验通过真实 `buildDispatchPlan()` 或 `buildDispatchCommand()` 产生的阶段默认推荐中，`plan_ready` 与 `development` 不再默认返回 `commander`。如果当前测试环境难以稳定构造阶段，可直接对 `buildDispatchPlan()` 所依赖的最小状态目录夹具做复用，不要伪造不存在的函数签名。

- [ ] **Step 2: 运行单测并确认当前红灯**

运行：

```bash
npm run build && node test/workflow-redesign.test.mjs
```

预期：新增断言失败，暴露 `plan.ts` 里 `plan_ready` / `development` 仍推荐 `commander`。

- [ ] **Step 3: 最小修改 `src/orchestrator/plan.ts`**

把以下两段默认推荐逻辑中的 `recommendedAgent = "commander"` 改为 `recommendedAgent = "pm"`：

```ts
} else if (state.stage === "plan_ready") {
  recommendedAgent = "pm";
  recommendedAction = "start-development";
  reason = "计划已就绪，应先由 PM 判断下一步执行策略并分派给相应专业 agent。";
} else if (state.stage === "development") {
  recommendedAgent = "pm";
  recommendedAction = "continue-development";
  reason = "当前处于开发阶段，应继续由 PM 协调实现、修复或完善当前 phase。";
}
```

- [ ] **Step 4: 重新运行回归测试确认转绿**

运行：

```bash
npm run build && node test/workflow-redesign.test.mjs
```

预期：新增阶段路由断言通过，原有默认配置与人物映射断言不受影响。

- [ ] **Step 5: 提交本任务**

```bash
git add src/orchestrator/plan.ts test/workflow-redesign.test.mjs
git commit -m "Align stage routing to PM by default"
```

### Task 2: 修正 analyzer 对复杂 orchestration 的默认推荐

**Files:**
- Modify: `src/orchestrator/analyzer.ts`
- Modify: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 先改测试预期，锁定 commander 只做 advisor**

把 `test/dispatch-quality-loop.test.mjs` 里复杂任务：

```js
const orchestrationTask = analyzeDispatchTask({
  prompt: '把 onboarding 流程的前端实现、说明文档和拆解方案一起补齐',
  stage: 'plan_ready',
  blockedReasons: [],
});
```

对应断言从：

```js
assert.strictEqual(orchestrationTask.recommendedAgent, 'commander');
```

改成：

```js
assert.strictEqual(orchestrationTask.recommendedAgent, 'pm');
assert.strictEqual(orchestrationTask.executionMode, 'advisor_then_dispatch');
assert.ok(orchestrationTask.expectedNextAgents.includes('commander'));
```

- [ ] **Step 2: 运行测试并确认当前红灯**

运行：

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

预期：复杂任务仍返回 `commander`，因此断言失败。

- [ ] **Step 3: 最小修改 `inferRecommendedAgent()` 与 `inferExpectedNextAgents()`**

在 `src/orchestrator/analyzer.ts` 中：

```ts
function inferRecommendedAgent(
  domain: TaskDomain,
  complexity: TaskComplexity,
  preferredAgent?: DispatchAgent | null,
): DispatchAgent {
  if (preferredAgent) {
    return preferredAgent;
  }

  if (domain === "orchestration" && complexity === "composite") {
    return "pm";
  }

  return mapDomainToAgent(domain);
}
```

同时保留：

```ts
executionMode === "advisor_then_dispatch"
```

并让 `inferExpectedNextAgents()` 在该场景下返回包含 `commander` 的下一步候选，例如：

```ts
if (domain === "orchestration" && complexity === "composite") {
  return ["commander", "frontend", "writer", "qa_engineer"];
}
```

是否包含 `backend` 由当前 prompt/domain 规则决定；不要无差别扩成所有 agent。

- [ ] **Step 4: 运行局部测试确认转绿**

运行：

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

预期：复杂 orchestration 任务默认由 `pm` 推荐，但仍保留 `advisor_then_dispatch` 与 `commander` 候选。

- [ ] **Step 5: 提交本任务**

```bash
git add src/orchestrator/analyzer.ts test/dispatch-quality-loop.test.mjs
git commit -m "Keep commander as advisor in orchestration analysis"
```

### Task 3: 统一 prompt 与工具输出叙事

**Files:**
- Modify: `src/orchestrator/prompts.ts`
- Modify: `src/server/tools/dispatch-tools.ts`
- Test: `test/workflow-redesign.test.mjs`

- [ ] **Step 1: 先补文本层回归断言**

在 `test/workflow-redesign.test.mjs` 现有 `testDispatchRouting()` 基础上继续增强断言：

```js
assert.ok(
  !simpleWriterDispatch.executablePrompt.includes('总指挥 commander 协调分发'),
  'Executable prompt should not describe commander as the default routing owner',
);
```

如工具格式化函数已有独立导出，可再补一条输出断言，确认 `formatTaskAnalysisLines()` 能反映 routing owner / execution target 的区分。

- [ ] **Step 2: 运行测试确认当前红灯或覆盖不足**

运行：

```bash
npm run build && node test/workflow-redesign.test.mjs
```

若当前没有红灯，但无法覆盖 prompt 叙事问题，先补足断言再继续，不跳过本步。

- [ ] **Step 3: 最小修改 `src/orchestrator/prompts.ts`**

确保任何涉及 `commander` 的文案只表达“拆解建议”或“策略顾问”，不要再出现“默认主 agent”“总指挥入口”一类描述。目标是：

- `pm`：主协调者 / 决策入口
- `backend` / `frontend` / `writer` / `qa_engineer`：执行者
- `commander`：可选顾问

如果当前已有 `renderCommanderAdvisorPrompt()` 或同等结构，优先在现有函数内改文案，不新增第二套模板。

- [ ] **Step 4: 最小修改 `src/server/tools/dispatch-tools.ts` 输出层次**

在 `formatTaskAnalysisLines()` 或 `formatHandoffPacketLines()` 中增加显式层次，例如：

```ts
`- routing owner: ${analysis.recommendedAgent}`
`- execution target: ${packet.targetAgent}`
`- advisor: commander (optional)`
```

仅在 `analysis.executionMode === "advisor_then_dispatch"` 或 `expectedNextAgents` 包含 `commander` 时显示 advisor 行，不要所有任务都打印。

- [ ] **Step 5: 跑两组回归测试**

运行：

```bash
npm run build && node test/workflow-redesign.test.mjs && node test/dispatch-quality-loop.test.mjs
```

预期：prompt 文案与工具输出都不再把 `commander` 视为默认主入口。

- [ ] **Step 6: 提交本任务**

```bash
git add src/orchestrator/prompts.ts src/server/tools/dispatch-tools.ts test/workflow-redesign.test.mjs
git commit -m "Clarify PM routing ownership and commander advisory role"
```

### Phase 1 完成标准

- `plan_ready` 默认推荐 agent 为 `pm`
- `development` 默认推荐 agent 为 `pm`
- 简单 backend/frontend/writer/qa 任务不再默认派给 `commander`
- 复杂 orchestration 任务默认由 `pm` 决策，`commander` 仅作为 advisor 候选出现
- prompt 与工具输出都清楚表达角色层级
- `npm run build`
- `npm run typecheck`
- `node test/workflow-redesign.test.mjs`
- `node test/dispatch-quality-loop.test.mjs`

---

## 四、Phase 2 实施计划

### Task 4: 为 evaluator 扩展自动续跑信号

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/orchestrator/evaluator.ts`
- Modify: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 先补类型与 evaluator 测试断言**

在 `test/dispatch-quality-loop.test.mjs` 现有 `testEvaluator()` 中新增以下断言：

1. `backend` 缺少验证证据时：

```js
assert.strictEqual(needsVerification.canAutoContinue, true);
assert.ok(needsVerification.autoContinueReason.includes('qa_engineer'));
```

2. `commander` 建议返回 `partial` 时：

```js
assert.strictEqual(commanderResult.canAutoContinue, false);
```

3. 非 0 `exitCode` 时：

```js
assert.strictEqual(partial.canAutoContinue, false);
```

4. 已验证通过且没有下一步建议时：

```js
assert.strictEqual(done.canAutoContinue, false);
```

- [ ] **Step 2: 运行测试确认当前红灯**

运行：

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

预期：`EvaluationResult` 还没有 `canAutoContinue` / `autoContinueReason` 字段，断言失败。

- [ ] **Step 3: 扩展 `EvaluationResult` 类型**

在 `src/core/types.ts` 的 `EvaluationResult` 中新增：

```ts
canAutoContinue: boolean;
autoContinueReason?: string;
```

不要把这个字段做成可选，避免调用方忘记处理。

- [ ] **Step 4: 在 `src/orchestrator/evaluator.ts` 实现保守判断**

新增一个局部纯函数，例如：

```ts
function inferAutoContinue(
  result: Omit<EvaluationResult, "canAutoContinue" | "autoContinueReason">,
): Pick<EvaluationResult, "canAutoContinue" | "autoContinueReason"> {
  if (result.status === "needs_verification" && result.recommendedNextAgent === "qa_engineer") {
    return {
      canAutoContinue: true,
      autoContinueReason: "backend 已完成但缺少验证证据，可低风险转交 QA 继续验证。",
    };
  }

  if (result.status === "done") {
    return {
      canAutoContinue: false,
      autoContinueReason: "当前环节已完成，但没有明确且低风险的下一步自动续跑目标。",
    };
  }

  return {
    canAutoContinue: false,
    autoContinueReason: "当前结果存在不确定性或风险，自动续跑已停止。",
  };
}
```

当前阶段只放开最明确的一条低风险链路：

- `backend` 成功完成
- 结果缺少验证证据
- evaluator 已明确推荐 `qa_engineer/run-code-review`

不要在第一版就把 `writer -> pm`、`qa -> pm`、`frontend -> qa` 全部放开，先做最小闭环。

- [ ] **Step 5: 运行局部测试确认转绿**

运行：

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

预期：自动续跑信号只在低风险验证缺口场景为 `true`，其他场景为 `false`。

- [ ] **Step 6: 提交本任务**

```bash
git add src/core/types.ts src/orchestrator/evaluator.ts test/dispatch-quality-loop.test.mjs
git commit -m "Add conservative auto-continue signals to evaluator"
```

### Task 5: 让执行路径支持有限自动续跑

**Files:**
- Modify: `src/server/tools/dispatch-tools.ts`
- Optional Modify: `src/server/runtime.ts`
- Test: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 先补 dry-run 或格式化层的自动续跑断言**

优先从纯函数或 dry-run 输出入手，避免一开始就依赖真实子 agent 执行。建议为 `dispatch-tools.ts` 新增一个纯辅助函数，例如：

```ts
buildNextAutoDispatchHint(evaluation?: EvaluationResult): {
  canContinue: boolean;
  nextAgent?: string;
  nextAction?: string;
  reason: string;
}
```

测试中先断言：

- `needsVerification` 时返回 `qa_engineer/run-code-review`
- `partial` / `done` / 非 0 `exitCode` 时返回 `canContinue: false`

- [ ] **Step 2: 运行测试确认当前红灯**

运行：

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

预期：辅助函数或 loop 输出尚未实现，断言失败。

- [ ] **Step 3: 在 `src/server/tools/dispatch-tools.ts` 增加有限步数自动续跑逻辑**

优先放在 `pm-run-loop` 或 `pm-execute-dispatch` 的现有执行路径中，保持规则如下：

1. 先执行当前 dispatch
2. 生成 evaluator 结果
3. 若 `evaluation.canAutoContinue !== true`，立即停住并返回原因
4. 若为 `true`，基于 `recommendedNextAgent` 与 `recommendedNextAction` 生成下一步 dispatch hint
5. 重新经过 `buildPermissionGate()`、`buildConfirmGate()`、`buildExecutionGate()`
6. 通过后再执行下一步
7. 单次最多推进 `2` 步，必要时允许配置到 `3`，但默认不超过 `2`

推荐实现方式：

- 保持 `pm-execute-dispatch` 单步语义不变，只增加“本可以继续但当前停住”的摘要；或
- 在 `pm-run-loop` 中接入真正的有限自动续跑

两者选其一即可，但不要同时做两套逻辑。

如果选 `pm-run-loop`，输出中要清楚记录每一步：

```text
step 1 -> backend/continue-development
evaluation -> needs_verification
auto-continue -> qa_engineer/run-code-review
step 2 -> qa_engineer/run-code-review
stop -> reached max auto-continue steps
```

- [ ] **Step 4: 如有必要，再最小触及 `src/server/runtime.ts`**

只有当 `dispatch-tools.ts` 无法在现有 `executeDispatchCommand()` 返回结构上拿到后续判断所需信息时，才修改 `runtime.ts`。如当前 `status/stdout/stderr` 已足够，则不要改。

- [ ] **Step 5: 增加 stop 条件测试**

在 `test/dispatch-quality-loop.test.mjs` 中补三类测试：

1. 低风险 backend 缺少验证证据时，自动续跑 hint 存在
2. `commander` 顾问建议返回 `partial` 时，不自动续跑
3. 非 0 `exitCode` 或高风险动作时，不自动续跑

如果本步接入了 `pm-run-loop` 的真实执行逻辑，再补一个“最多 2 步”的输出断言，但不要依赖外部网络或真实远端 agent。

- [ ] **Step 6: 运行完整测试并确认转绿**

运行：

```bash
npm run build && npm run typecheck && node test/workflow-redesign.test.mjs && node test/dispatch-quality-loop.test.mjs
```

预期：Phase 1 与 Phase 2 的所有回归均通过。

- [ ] **Step 7: 提交本任务**

```bash
git add src/server/tools/dispatch-tools.ts src/server/runtime.ts test/dispatch-quality-loop.test.mjs
git commit -m "Add bounded low-risk auto-continue dispatch flow"
```

如本任务未修改 `src/server/runtime.ts`，提交命令里去掉该文件。

### Phase 2 完成标准

- `EvaluationResult` 包含非可选的 `canAutoContinue`
- 至少支持一条低风险自动续跑链路：`backend -> qa_engineer`
- 自动续跑不会绕过现有 `gate` / `permission` / `confirm`
- `commander` 顾问结果不会自动续跑
- 失败、阻塞、结果不明确时会停住并返回原因
- 默认最多自动推进 2 步
- `npm run build`
- `npm run typecheck`
- `node test/workflow-redesign.test.mjs`
- `node test/dispatch-quality-loop.test.mjs`

---

## 五、最终联调与验收

### 全量验证命令

```bash
npm run build && npm run typecheck && node test/workflow-redesign.test.mjs && node test/dispatch-quality-loop.test.mjs
```

### 手动核查项

1. 运行 `pm-run-dispatch` 或对应纯函数输出时，`plan_ready` / `development` 不再默认显示 `commander`
2. 复杂 orchestration 任务输出中，`routing owner` 为 `pm`，而不是 `commander`
3. 复杂 orchestration 任务仍可显示 `advisor: commander (optional)`
4. evaluator 对 backend 缺少验证证据的结果会给出 `qa_engineer/run-code-review` 下一步建议
5. 自动续跑只在低风险链路触发，且不会无限循环

### 发布前不做的事

- 不 bump 版本号
- 不创建 release notes
- 不推送远端
- 不合并到 `main`

这些动作等实现完成、测试稳定、用户确认后再单独处理。

---

## 六、建议执行顺序

1. 先完成 Phase 1 的 Task 1 到 Task 3
2. 跑一遍完整验证，确认“主路由彻底以 pm 为中心”已成立
3. 再开始 Phase 2 的 Task 4 到 Task 5
4. Phase 2 完成后再跑一次完整验证
5. 通过后再决定是继续在当前 session 执行，还是切换到 worktree / 子代理模式实施

---

## 七、变更记录

### 2026-04-30

- 新增本文档，作为《PM 唯一主路由入口与低风险自动续跑两阶段演进设计》的实现计划
- 将本轮实现拆分为 Phase 1 与 Phase 2 两个顺序阶段
- 明确文件边界、测试入口、提交建议与最终验收标准
