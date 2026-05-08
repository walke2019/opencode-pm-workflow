# Researcher Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 pm-workflow 的 analyzer 增加 `researcher` 独立语义路由，让中等触发的调研/资料搜索类请求能稳定命中正确角色，同时不抢占实现、文档、测试与规划类任务。

**Architecture:** 这次改动保持最小增量：先扩展核心类型与默认 agent 映射，再用红灯测试锁定 analyzer 的 `researcher` 识别边界，最后补最小 production code 和文档回归。运行时 registry / dispatch 主链路不改，只让 analyzer 产出新的语义角色并沿用现有 resolved-agent 机制。

**Tech Stack:** TypeScript、Node.js、现有 `.mjs` 回归测试、OpenCode pm-workflow runtime

---

## File Map

- Modify: `src/core/types.ts`
  - 扩展 `DispatchAgent` 与 `TaskDomain`，让 `researcher` 成为一等类型。
- Modify: `src/core/config.ts`
  - 把 `researcher` 加入默认 agent 顺序与默认 dispatch/fallback 映射。
- Modify: `src/orchestrator/prompts.ts`
  - 为 `researcher` 提供默认可执行 agent 映射与 handoff prompt 角色文案。
- Modify: `src/orchestrator/analyzer.ts`
  - 增加 `researcher` 的中等触发规则与边界保护。
- Modify: `src/orchestrator/handoff.ts`
  - 若该文件按 agent 生成差异化 handoff 内容，则补 `researcher` 分支；若当前逻辑已可安全 fallback，则仅确认无需改动并在测试体现。
- Modify: `test/workflow-redesign.test.mjs`
  - 补 analyzer / dispatch 级回归：`researcher` 能命中且不破坏已有路由。
- Modify: `test/model-inventory.test.mjs`
  - 若测试内断言角色集合或 registry 结果包含固定 agent 集合，则同步补 `researcher`。
- Modify: `README.md`
  - 补一小段角色说明，明确 `researcher` 用于资料搜索/调研，不是实现角色。

> 注意：执行前先确认全局 `~/.config/opencode/agents/researcher.md` 是否已存在。如果不存在，本次实现仍可依赖内部 fallback 跑通，但必须在验证结论中明确记录“registry 侧由 fallback 提供 researcher 定义”。

### Task 1: 扩展核心类型与默认 agent 映射

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/config.ts`
- Modify: `src/orchestrator/prompts.ts`
- Test: `test/workflow-redesign.test.mjs`

- [ ] **Step 1: 写一个失败测试，先定义 `researcher` 必须被基础类型/默认映射支持**

在 `test/workflow-redesign.test.mjs` 的 `testDefaults()` 后追加一个新测试函数，直接验证默认配置和 prompt 层都认识 `researcher`：

```js
async function testResearcherDefaults() {
  console.log('\nTesting researcher defaults...');
  const config = defaultWorkflowConfig();

  assert.strictEqual(
    config.fallback.agent_map.researcher,
    'researcher',
    'researcher fallback should preserve semantic agent id by default',
  );

  assert.strictEqual(
    config.agents.dispatch_map.researcher,
    'researcher',
    'researcher dispatch map should preserve semantic agent id by default',
  );

  const prompt = buildExecutablePrompt('researcher', '帮我调研一下官方鉴权方案');
  assert.ok(prompt.includes('资料'), 'researcher prompt should mention research context');
  assert.ok(prompt.includes('调研') || prompt.includes('搜索'));
  console.log('✓ Researcher defaults are configured');
}
```

- [ ] **Step 2: 运行单测，确认它先红灯失败**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/workflow-redesign.test.mjs
```

Expected:

- `test/workflow-redesign.test.mjs` 失败
- 报错类似 `Property 'researcher' does not exist`、`buildExecutablePrompt('researcher', ...)` 类型/分支未覆盖，或默认映射缺失

- [ ] **Step 3: 最小修改类型定义，让 `researcher` 成为一等 agent/domain**

在 `src/core/types.ts` 中做最小增量修改：

```ts
export type DispatchAgent =
  | "pm"
  | "plan"
  | "build"
  | "qa_engineer"
  | "writer"
  | "frontend"
  | "commander"
  | "backend"
  | "researcher";

export type TaskDomain =
  | "pm"
  | "backend"
  | "frontend"
  | "writer"
  | "qa_engineer"
  | "researcher"
  | "orchestration";
```

不要在这一步引入 `tech-lead`，严格保持 spec 范围。

- [ ] **Step 4: 最小补齐默认配置与 prompt 映射**

在 `src/core/config.ts` 的 agent 顺序和默认映射里加入 `researcher`：

```ts
const WORKFLOW_AGENT_ORDER: DispatchAgent[] = [
  "pm",
  "plan",
  "build",
  "commander",
  "qa_engineer",
  "writer",
  "frontend",
  "backend",
  "researcher",
];
```

并在 `fallback.agent_map`、`agents.dispatch_map` 的默认值里补上：

```ts
researcher: "researcher",
```

在 `src/orchestrator/prompts.ts` 中给 `DEFAULT_DISPATCH_AGENT_MAP` 加上：

```ts
researcher: "researcher",
```

同时给 `buildExecutablePrompt(...)` 增加一个最小 `researcher` 分支：

```ts
    case "researcher":
      roleTitle = "【资料斥候·研究员】";
      roleContext =
        "你现在是一名资料搜索与调研研究员。请优先搜集外部资料、核验事实、对比方案，并输出可信来源、关键信息摘要、风险与建议；除非明确要求，不直接承担实现工作。";
      break;
```

要求：文案必须明确“资料搜索/调研”定位，并明确“不替代实现角色”。

- [ ] **Step 5: 重新运行测试，确认默认映射层转绿**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/workflow-redesign.test.mjs
```

Expected:

- 新增 `testResearcherDefaults()` 通过
- 如果 analyzer 相关断言尚未补齐，当前文件其余测试仍可能保持绿灯

- [ ] **Step 6: 提交这一层改动**

```bash
git add src/core/types.ts src/core/config.ts src/orchestrator/prompts.ts test/workflow-redesign.test.mjs
git commit -m "feat: add researcher agent defaults"
```

### Task 2: 用红灯测试锁定 `researcher` 中等触发规则

**Files:**
- Modify: `test/workflow-redesign.test.mjs`
- Modify: `src/orchestrator/analyzer.ts`

- [ ] **Step 1: 先补 analyzer 路由红灯测试**

在 `test/workflow-redesign.test.mjs` 里的 `testDispatchRouting()` 之后追加一个新测试函数，覆盖正反样例：

```js
async function testResearcherRouting() {
  console.log('\nTesting researcher routing...');

  const researcherDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
  }, (projectDir) =>
    buildDispatchCommand(
      projectDir,
      '帮我调研一下 React Native 埋点方案，并对比几种实现路线',
    ),
  );

  assert.strictEqual(researcherDispatch.recommendedAgent, 'researcher');
  assert.strictEqual(researcherDispatch.analysis.domain, 'researcher');
  assert.strictEqual(researcherDispatch.analysis.executionMode, 'serial_handoff');

  const backendDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
  }, (projectDir) =>
    buildDispatchCommand(projectDir, '帮我实现一个鉴权中间件，并补测试'),
  );

  assert.strictEqual(backendDispatch.recommendedAgent, 'backend');

  const writerDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
  }, (projectDir) =>
    buildDispatchCommand(projectDir, '把这段说明整理成文档，并更新 README'),
  );

  assert.strictEqual(writerDispatch.recommendedAgent, 'writer');
  console.log('✓ Researcher routing respects implementation and writer boundaries');
}
```

此时先不要改 production code。

- [ ] **Step 2: 运行测试，确认 analyzer 规则先红灯**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/workflow-redesign.test.mjs
```

Expected:

- `researcherDispatch.recommendedAgent` 当前不是 `researcher`
- 失败信息类似 `Expected values to be strictly equal: 'backend' !== 'researcher'` 或回落到 `pm`

- [ ] **Step 3: 最小实现 `researcher` 领域识别，不引入评分系统**

在 `src/orchestrator/analyzer.ts` 中按下面结构增量修改：

```ts
  if (preferredAgent === "researcher") return "researcher";
```

在 `inferDomain(...)` 内新增研究型匹配：

```ts
  const researcherMatched =
    normalized.includes("调研") ||
    normalized.includes("搜索") ||
    normalized.includes("查资料") ||
    normalized.includes("查文档") ||
    normalized.includes("官方文档") ||
    normalized.includes("官方推荐") ||
    normalized.includes("对比方案") ||
    normalized.includes("对比一下") ||
    normalized.includes("搜集资料") ||
    normalized.includes("收集资料") ||
    normalized.includes("业内怎么做") ||
    normalized.includes("有哪些方案") ||
    (normalized.includes("查一下") &&
      (normalized.includes("官方") || normalized.includes("推荐") || normalized.includes("文档"))) ||
    (normalized.includes("看看") &&
      (normalized.includes("怎么做") || normalized.includes("业内") || normalized.includes("资料")));
```

并更新判定顺序，遵守以下规则：

1. orchestration 复合信号优先
2. writer / qa / frontend / backend 这些明确主目标强信号优先
3. `researcherMatched` 放在默认回落之前

推荐形态：

```ts
  if (orchestrationMatched) {
    return "orchestration";
  }

  if (backendMatched) {
    return "backend";
  }
  if (frontendMatched) {
    return "frontend";
  }
  if (writerMatched) {
    return "writer";
  }
  if (qaMatched) {
    return "qa_engineer";
  }
  if (researcherMatched) {
    return "researcher";
  }
```

同时更新 `mapDomainToAgent(...)`：

```ts
    case "researcher":
      return "researcher";
```

以及 `inferExpectedNextAgents(...)` 的最小支持：

```ts
  if (domain === "researcher") {
    return ["researcher"];
  }
```

不要在这一步引入新的复杂 `rationale` 结构，保持增量修改。

- [ ] **Step 4: 如 handoff 逻辑对 agent 做 switch，则补 `researcher` 分支**

检查 `src/orchestrator/handoff.ts` 是否像 `prompts.ts` 一样按 agent 做 `switch`。如果存在必须穷举的分支，就补一个最小 `researcher` 描述，例如：

```ts
    case "researcher":
      return {
        taskType: "资料搜索 / 调研 / 方案对比",
        // 其余字段沿用该文件现有 researcher 风格最小落地
      };
```

如果该文件已有默认 fallback 足够安全，则不要为了“看起来完整”而强行改动。

- [ ] **Step 5: 重新运行测试，确认 `researcher` 命中且边界不被破坏**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/workflow-redesign.test.mjs
```

Expected:

- `researcherDispatch.recommendedAgent === 'researcher'`
- “实现鉴权中间件”仍走 `backend`
- “整理文档”仍走 `writer`
- 输出包含 `All verification tests passed successfully!`

- [ ] **Step 6: 提交 analyzer 路由改动**

```bash
git add src/orchestrator/analyzer.ts src/orchestrator/handoff.ts test/workflow-redesign.test.mjs
git commit -m "feat: route research tasks to researcher"
```

> 如果 `src/orchestrator/handoff.ts` 最终无需改动，提交命令里不要硬加该文件。

### Task 3: 做全量回归并补最小文档同步

**Files:**
- Modify: `README.md`
- Modify: `test/model-inventory.test.mjs`（仅当固定角色集合断言需要同步时）
- Modify: `package.json`（仅当 test 脚本需要新增专门测试文件时；若继续复用现有测试文件，则不改）

- [ ] **Step 1: 更新 README 的角色说明，明确 researcher 职责边界**

在 `README.md` 的 agent 指派、routing 或角色介绍附近补一小段说明，文案保持最小：

```md
- `researcher`：负责资料搜索、调研、官方文档查询、方案对比与外部事实核验；默认不替代前后端实现、文档整理或测试执行角色。
```

不要在 README 里展开大段设计细节，避免文档膨胀。

- [ ] **Step 2: 如果角色集合测试受影响，则补 researcher 断言**

检查 `test/model-inventory.test.mjs` 是否存在这类断言：

- 固定角色数量
- 固定 dispatch map 键集合
- 固定 resolved agent 样例集合

如果存在，再增量补 `researcher`。如果没有，就不要为了“保险”而创建无价值测试。

- [ ] **Step 3: 跑完整验证，确保没有回归**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" npm test
```

Expected:

- 所有测试通过
- 输出继续包含：
  - `All verification tests passed successfully!`
  - `dispatch quality loop public exports ready`
  - `global OpenCode model inventory tests passed`

- [ ] **Step 4: 检查工作区，仅保留应提交改动**

Run:

```bash
git status --short
```

Expected:

- 只看到本任务实际修改的源码/测试/README 文件
- 不应包含 `node_modules/.package-lock.json` 之类副产物

若出现副产物，先恢复再继续：

```bash
git restore -- "node_modules/.package-lock.json"
```

- [ ] **Step 5: 提交文档与回归收尾改动**

```bash
git add README.md test/model-inventory.test.mjs
git commit -m "docs: describe researcher routing behavior"
```

> 如果 `test/model-inventory.test.mjs` 没改，就不要把它放进 `git add`。

## Self-Review Checklist

### Spec coverage

- `researcher` 独立语义识别：由 Task 2 实现
- 中等触发：由 Task 2 的关键词 + 任务形态规则实现
- 不抢占实现/文档/测试/规划：由 Task 2 的反例测试约束
- 最小增量、不改 runtime/registry：由 Task 1/2 的修改边界控制
- 最小文档同步：由 Task 3 实现

### Placeholder scan

- 本计划没有使用 `TODO` / `TBD` / “类似 Task N” 之类占位语
- 所有代码步骤都提供了明确代码片段或命令

### Type consistency

- 新增角色名统一使用 `researcher`
- 新增领域名统一使用 `researcher`
- 默认映射统一保持 `researcher: "researcher"`

## Verification Notes

- 如果本机 shell 默认没有 `node` / `npm`，所有命令都必须带：

```bash
PATH="/opt/homebrew/bin:$PATH"
```

- 如果全局 `~/.config/opencode/agents/researcher.md` 不存在，但测试仍通过，应在最终总结中明确说明：
  - analyzer 与 fallback 路由已支持 `researcher`
  - registry 真实 project/global agent 定义是否存在，仍需单独核验

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-researcher-routing-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
