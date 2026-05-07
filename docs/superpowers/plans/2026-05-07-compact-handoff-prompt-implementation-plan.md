# Compact Handoff Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前冗长、重复的 subagent handoff packet 改造成“结构化压缩层”，减少 token 膨胀，同时让 evaluator 能按 `summary / verification / risk` 更稳定地评估结果。

**Architecture:** 本次改造分两段落地。第一段先重构 `HandoffPacket` 类型与构建逻辑，把 `goal/why/inputs/doneDefinition` 迁移到 `mission/context/scope/acceptance/artifacts/responseFormat`；第二段再对 `renderAgentHandoffPrompt(...)` 与 `evaluateDispatchResult(...)` 收紧结构要求，确保 prompt 与回传评估成对演进。保持现有 primary/subagent invocation 语义不变，不引入额外模型调用，不做 commands/runtime 的大范围重构。

**Tech Stack:** TypeScript、Node.js、现有 `test/*.test.mjs` 回归测试、`npm run build`、`npm test`

---

## File Structure

### Existing files to modify

- `src/core/types.ts`
  - 更新 `HandoffPacket` 类型，定义新的 compact handoff 结构。
- `src/orchestrator/handoff.ts`
  - 实现新的 packet 构建逻辑、字段压缩与上限控制。
- `src/orchestrator/prompts.ts`
  - 渲染新的 executable prompt 模板，移除旧字段段落。
- `src/orchestrator/evaluator.ts`
  - 增加对 `summary:` / `verification:` / `risk:` 的结构化检查。
- `test/dispatch-quality-loop.test.mjs`
  - 为 handoff packet、prompt 输出和 evaluator 行为增加/更新回归测试。

### Files to inspect during implementation

- `docs/superpowers/specs/2026-05-07-compact-handoff-prompt-design.md`
  - 本次实现的设计依据，尤其是字段映射、上限、agent-specific 裁剪和 evaluator 联动要求。
- `src/orchestrator/plan.ts`
  - 确认 `buildDispatchCommand(...)` 对 handoff packet 的消费点没有遗漏。
- `src/server/tools/dispatch-tools.ts`
  - 如果 handoff packet 行格式化依赖旧字段命名，需要同步调整断言或展示逻辑。

### No new runtime subsystem

- 不新增独立压缩服务。
- 不新增模型调用。
- 不新增第二套 commands/runtime 编排。

---

### Task 1: 重构 HandoffPacket 类型为 compact 结构

**Files:**
- Modify: `src/core/types.ts`
- Test: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 先写一个失败测试，锁定新的 handoff 字段结构**

在 `test/dispatch-quality-loop.test.mjs` 的 `testHandoffPacket()` 中，把旧字段断言替换成对新字段的断言，新增以下检查：

```js
  assert.strictEqual(backendPacket.targetAgent, 'backend');
  assert.ok(backendPacket.mission.includes('修复认证接口 401'));
  assert.ok(Array.isArray(backendPacket.context));
  assert.ok(Array.isArray(backendPacket.scope.do));
  assert.ok(Array.isArray(backendPacket.scope.dont));
  assert.ok(Array.isArray(backendPacket.acceptance));
  assert.ok(Array.isArray(backendPacket.artifacts));
  assert.deepStrictEqual(backendPacket.responseFormat, [
    'summary: 做了什么',
    'verification: 如何验证 / 未验证原因',
    'risk: 剩余风险或 blocked 原因',
  ]);
  assert.ok(backendPacket.acceptance.length <= 3);
  assert.ok(backendPacket.context.length <= 4);
  assert.ok(backendPacket.artifacts.length <= 6);
```

- [ ] **Step 2: 运行单测，确认它因为旧类型/旧字段失败**

Run:

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
TypeError / AssertionError
```

失败原因应体现旧 `goal/why/inputs/doneDefinition/returnFormat` 结构仍存在，说明测试有效。

- [ ] **Step 3: 在类型文件中把 HandoffPacket 改成 compact 结构**

将 `src/core/types.ts` 中现有接口：

```ts
export interface HandoffPacket {
  goal: string;
  why: string;
  taskType: string;
  targetAgent: DispatchAgent;
  scope: string[];
  inputs: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  deliverables: string[];
  doneDefinition: string[];
  returnFormat: string[];
  nextStepHint?: string;
}
```

替换为：

```ts
export interface HandoffPacket {
  mission: string;
  context: string[];
  taskType: string;
  targetAgent: DispatchAgent;
  scope: {
    do: string[];
    dont: string[];
  };
  artifacts: string[];
  constraints: string[];
  acceptance: string[];
  deliverables: string[];
  responseFormat: string[];
  nextStepHint?: string;
}
```

- [ ] **Step 4: 重新构建，查看类型报错落点**

Run:

```bash
npm run build
```

Expected:

```text
TS2339 / TS2741
```

报错应集中在 `handoff.ts`、`prompts.ts`、`evaluator.ts`、测试文件，这正是下一步要改的消费方。

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts test/dispatch-quality-loop.test.mjs
git commit -m "refactor: redefine compact handoff packet shape"
```

---

### Task 2: 在 handoff builder 中实现最小可落地压缩规则

**Files:**
- Modify: `src/orchestrator/handoff.ts`
- Test: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 先补失败测试，锁定“原始 prompt 不重复展开”与字段上限**

在 `test/dispatch-quality-loop.test.mjs` 新增一个测试函数，例如 `testCompactHandoffCompression()`：

```js
async function testCompactHandoffCompression() {
  const prompt = [
    '请修复设置页保存失败问题，并补充 UI 验证说明。',
    '日志片段：Error: request timeout at settings-save.ts:42',
    '代码片段：const payload = buildSettingsPayload(formState)',
    '补充说明：不要扩展到其他页面，也不要做大规模重构。',
  ].join('\n');

  const packet = buildHandoffPacket({
    prompt,
    targetAgent: 'frontend',
    analysis: analyzeDispatchTask({
      prompt,
      stage: 'development',
      blockedReasons: [],
    }),
  });

  assert.ok(packet.mission.includes('设置页'));
  assert.ok(!packet.mission.includes('日志片段'));
  assert.ok(packet.context.length <= 4);
  assert.ok(packet.scope.do.length <= 3);
  assert.ok(packet.scope.dont.length <= 3);
  assert.ok(packet.acceptance.length <= 3);
  assert.ok(packet.artifacts.length <= 6);
  assert.ok(packet.artifacts.some((item) => item.includes('settings-save.ts')));
  assert.ok(packet.scope.dont.some((item) => item.includes('不要扩展到其他页面')));
}
```

- [ ] **Step 2: 运行测试，确认它失败**

Run:

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
AssertionError
```

应体现当前 `buildHandoffPacket(...)` 仍在原样塞入 `input.prompt` 或没有 `scope.do/scope.dont/artifacts`。

- [ ] **Step 3: 在 `src/orchestrator/handoff.ts` 增加小型压缩辅助函数**

先在文件顶部加入这些小函数，避免把逻辑直接堆进 `buildBasePacket(...)`：

```ts
function uniqueNonEmpty(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function limitItems(items: string[], limit: number): string[] {
  return uniqueNonEmpty(items).slice(0, limit);
}

function compactMission(prompt: string): string {
  return prompt
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) || '请完成当前分派任务';
}

function extractArtifactHints(prompt: string): string[] {
  const matches = prompt.match(/[\w./-]+\.(ts|tsx|js|jsx|md|json)/g) || [];
  return limitItems(matches.map((item) => `相关文件：${item}`), 6);
}
```

- [ ] **Step 4: 把 `buildBasePacket(...)` 改成新结构，并先实现最小规则**

将 `buildBasePacket(...)` 改成下面这种结构：

```ts
function buildBasePacket(
  input: BuildHandoffPacketInput,
  targetAgent: DispatchAgent,
): HandoffPacket {
  const mission = compactMission(input.prompt);
  const context = limitItems(
    [
      ...input.analysis.rationale,
      '根据当前任务分析生成结构化压缩交接包。',
    ],
    4,
  );

  return {
    mission,
    context,
    taskType: `${input.analysis.domain}:${input.analysis.complexity}`,
    targetAgent,
    scope: {
      do: limitItems(['只处理当前任务直接相关内容'], 3),
      dont: limitItems(
        [
          '不要擅自扩大范围',
          '不要做大规模无关重构',
          '不要在需求层停留过久',
        ],
        3,
      ),
    },
    artifacts: extractArtifactHints(input.prompt),
    constraints: limitItems(['遵循现有项目结构'], 3),
    acceptance: limitItems(
      ['输出结果与任务目标直接对应', '输出必须可验证', '明确说明完成项与未完成项'],
      3,
    ),
    deliverables: ['执行结果摘要', 'todo 完成/blocked 状态'],
    responseFormat: [
      'summary: 做了什么',
      'verification: 如何验证 / 未验证原因',
      'risk: 剩余风险或 blocked 原因',
    ],
    nextStepHint: input.analysis.expectedNextAgents[0],
  };
}
```

- [ ] **Step 5: 把 agent-specific 分支迁移到新字段命名**

把这几类旧逻辑：

```ts
packet.acceptanceCriteria.push(...)
packet.returnFormat.push(...)
```

改为：

```ts
packet.acceptance = limitItems([...packet.acceptance, '说明接口或逻辑影响范围'], 3);
packet.scope.do = limitItems([...packet.scope.do, '补充必要验证说明'], 3);
packet.artifacts = limitItems([...packet.artifacts, '相关模块：认证接口 / 登录流程'], 6);
```

并保持以下职责差异：

- `backend`：偏接口/逻辑影响范围
- `frontend`：偏页面/组件/交互范围
- `writer`：偏文档目标读者/章节
- `qa_engineer`：偏验证范围/未覆盖项
- `commander`：偏任务拆解/角色顺序/风险排序

- [ ] **Step 6: 收紧 packet 校验函数，保证新字段不为空**

把 `validatePacket(...)` 改成：

```ts
function validatePacket(packet: HandoffPacket): void {
  if (
    !packet.mission ||
    packet.context.length === 0 ||
    packet.acceptance.length === 0 ||
    packet.responseFormat.length !== 3
  ) {
    throw new Error('handoff packet missing required compact fields');
  }
}
```

- [ ] **Step 7: 运行测试，确认 handoff builder 通过新增断言**

Run:

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
dispatch-quality-loop tests pass
```

如果还有旧字段断言失败，继续修测试中的字段命名，不要在实现里保留兼容旧字段的双写结构。

- [ ] **Step 8: Commit**

```bash
git add src/orchestrator/handoff.ts test/dispatch-quality-loop.test.mjs
git commit -m "feat: compact handoff packet content"
```

---

### Task 3: 用新模板渲染 executable prompt

**Files:**
- Modify: `src/orchestrator/prompts.ts`
- Test: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 先改测试，锁定新的 prompt 段落标题**

把 `testHandoffPacket()` 中的 prompt 断言：

```js
  assert.ok(structuredPrompt.includes('【任务目标】'));
  assert.ok(structuredPrompt.includes('【任务背景】'));
  assert.ok(structuredPrompt.includes('【验收标准】'));
  assert.ok(structuredPrompt.includes('【回传格式】'));
```

改成：

```js
  assert.ok(structuredPrompt.includes('【任务目标】'));
  assert.ok(structuredPrompt.includes('【关键背景】'));
  assert.ok(structuredPrompt.includes('【处理范围】'));
  assert.ok(structuredPrompt.includes('【相关对象】'));
  assert.ok(structuredPrompt.includes('【验收标准】'));
  assert.ok(structuredPrompt.includes('【回传格式】'));
  assert.ok(!structuredPrompt.includes('【输入材料】'));
  assert.ok(!structuredPrompt.includes('【完成定义】'));
```

- [ ] **Step 2: 运行测试，确认 prompt 渲染逻辑仍是旧模板并失败**

Run:

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: 在 `src/orchestrator/prompts.ts` 新增 scope 渲染函数**

加入一个专用函数，而不是把 `scope.do/dont` 展开逻辑塞到模板字符串里：

```ts
function renderScopeSection(scope: HandoffPacket['scope']) {
  const lines: string[] = [];

  if (scope.do.length > 0) {
    lines.push(`应做：${scope.do.join('；')}`);
  }

  if (scope.dont.length > 0) {
    lines.push(`不做：${scope.dont.join('；')}`);
  }

  return lines.length > 0 ? `【处理范围】\n${lines.join('\n')}` : '';
}
```

- [ ] **Step 4: 用 compact 模板重写 `renderAgentHandoffPrompt(...)`**

把旧 sections：

```ts
`【任务背景】\n${packet.why}`,
renderListSection('【输入材料】', packet.inputs),
renderListSection('【完成定义】', packet.doneDefinition),
```

替换为：

```ts
const sections = [
  `【任务目标】\n${packet.mission}`,
  renderListSection('【关键背景】', packet.context),
  `【任务类型】\n${packet.taskType}`,
  renderScopeSection(packet.scope),
  renderListSection('【相关对象】', packet.artifacts),
  renderListSection('【约束条件】', packet.constraints),
  renderListSection('【验收标准】', packet.acceptance),
  renderListSection('【交付物】', packet.deliverables),
  renderListSection('【回传格式】', packet.responseFormat),
].filter(Boolean);
```

- [ ] **Step 5: 运行测试，确认 prompt 模板和 dispatch 输出仍然通过**

Run:

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
All verification tests passed successfully!
```

如果 `formatHandoffPacketLines(...)` 断言失败，优先改测试断言；只有在展示工具真的依赖旧字段时才去同步工具实现。

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator/prompts.ts test/dispatch-quality-loop.test.mjs
git commit -m "feat: render compact handoff prompts"
```

---

### Task 4: 为不同 agent 添加最小职责裁剪

**Files:**
- Modify: `src/orchestrator/handoff.ts`
- Test: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 先写失败测试，锁定 frontend / qa / writer / commander 的差异化上下文**

在 `test/dispatch-quality-loop.test.mjs` 新增：

```js
async function testAgentSpecificCompactContext() {
  const prompt = '把 onboarding 流程的前端实现、说明文档和拆解方案一起补齐';
  const analysis = analyzeDispatchTask({
    prompt,
    stage: 'plan_ready',
    blockedReasons: [],
  });

  const frontendPacket = buildHandoffPacket({ prompt, targetAgent: 'frontend', analysis });
  const qaPacket = buildHandoffPacket({ prompt, targetAgent: 'qa_engineer', analysis });
  const writerPacket = buildHandoffPacket({ prompt, targetAgent: 'writer', analysis });
  const commanderPacket = buildHandoffPacket({ prompt, targetAgent: 'commander', analysis });

  assert.ok(frontendPacket.scope.do.some((item) => item.includes('页面') || item.includes('组件') || item.includes('交互')));
  assert.ok(qaPacket.acceptance.some((item) => item.includes('验证') || item.includes('未覆盖')));
  assert.ok(writerPacket.artifacts.some((item) => item.includes('文档') || item.includes('章节')));
  assert.ok(commanderPacket.deliverables.some((item) => item.includes('任务拆解建议')));
}
```

- [ ] **Step 2: 运行测试，确认当前 agent-specific 分支还不满足这些新断言**

Run:

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: 在 `src/orchestrator/handoff.ts` 提取一个职责裁剪函数**

新增一个小函数，而不是继续堆 `if (targetAgent === ...)`：

```ts
function applyAgentSpecificContext(packet: HandoffPacket): HandoffPacket {
  switch (packet.targetAgent) {
    case 'frontend':
      packet.scope.do = limitItems([...packet.scope.do, '只处理相关页面、组件与交互边界'], 3);
      packet.acceptance = limitItems([...packet.acceptance, '说明 UI/交互影响范围'], 3);
      break;
    case 'qa_engineer':
      packet.scope.do = limitItems([...packet.scope.do, '聚焦验证范围、未覆盖项与回归风险'], 3);
      packet.acceptance = limitItems([...packet.acceptance, '明确列出验证范围与未覆盖项'], 3);
      break;
    case 'writer':
      packet.scope.do = limitItems([...packet.scope.do, '聚焦目标读者、章节结构与一致性'], 3);
      packet.artifacts = limitItems([...packet.artifacts, '相关文档：README / CHANGELOG / 发布说明'], 6);
      break;
    case 'commander':
      packet.scope.do = limitItems([...packet.scope.do, '只做任务拆解、角色顺序与风险排序建议'], 3);
      packet.scope.dont = limitItems([...packet.scope.dont, '不要直接取代 PM 做最终决策'], 3);
      break;
    case 'backend':
      packet.acceptance = limitItems([...packet.acceptance, '说明接口或逻辑影响范围'], 3);
      break;
  }

  return packet;
}
```

- [ ] **Step 4: 在 `buildHandoffPacket(...)` 中调用职责裁剪函数**

把：

```ts
  const packet = buildBasePacket(input, targetAgent);
```

改成：

```ts
  const packet = applyAgentSpecificContext(buildBasePacket(input, targetAgent));
```

并删除旧的大段按 agent 分支直接操作旧字段的代码。

- [ ] **Step 5: 运行测试，确认不同 agent 已收到差异化 compact 上下文**

Run:

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
All verification tests passed successfully!
```

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator/handoff.ts test/dispatch-quality-loop.test.mjs
git commit -m "feat: tailor compact handoff context by agent"
```

---

### Task 5: 收紧 evaluator，对结构化输出做显式检查

**Files:**
- Modify: `src/orchestrator/evaluator.ts`
- Test: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 先写失败测试，锁定缺少结构字段时不能轻易 done**

在 `testEvaluator()` 中追加两个场景：

```js
  const naturalLanguageOnly = evaluateDispatchResult({
    packet,
    exitCode: 0,
    stdout: '已经完成修复，看起来没有问题。',
    stderr: '',
  });
  assert.notStrictEqual(naturalLanguageOnly.status, 'done');

  const structuredDone = evaluateDispatchResult({
    packet,
    exitCode: 0,
    stdout: [
      'summary: 已修复 401 并更新认证逻辑。',
      'verification: 已执行 npm run build 与 node test/workflow-redesign.test.mjs，结果通过。',
      'risk: 暂无新增阻塞风险。',
    ].join('\n'),
    stderr: '',
  });
  assert.strictEqual(structuredDone.status, 'done');
```

- [ ] **Step 2: 运行测试，确认 evaluator 现在仍可能把自然语言输出判成 done**

Run:

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: 在 evaluator 中增加结构字段识别函数**

在 `src/orchestrator/evaluator.ts` 增加：

```ts
function hasStructuredSection(text: string, section: 'summary' | 'verification' | 'risk'): boolean {
  return text.includes(`${section}:`);
}

function hasStructuredResponse(text: string): boolean {
  return (
    hasStructuredSection(text, 'summary') &&
    hasStructuredSection(text, 'verification') &&
    hasStructuredSection(text, 'risk')
  );
}
```

- [ ] **Step 4: 在主判断流程中插入“结构不完整”的保护分支**

在空输出判断和 blocked 判断之后、`backend` 特例之前插入：

```ts
  if (!hasStructuredResponse(text)) {
    return {
      status: 'partial',
      summary: '执行结果有文本，但未按要求返回 summary/verification/risk 结构。',
      matchedDeliverables: [],
      missingDeliverables: input.packet.deliverables,
      gaps: ['缺少结构化回传字段：summary / verification / risk'],
      recommendedNextAgent: input.packet.targetAgent,
      recommendedNextAction: 'continue-development',
      canAutoContinue: false,
      autoContinueSafe: false,
    };
  }
```

注意：不要破坏现有这两个保护逻辑：

- `exitCode !== 0` 时返回 `partial`
- 空输出时返回 `partial + blocked`

- [ ] **Step 5: 保留 backend “缺少验证证据”的特例，但改为基于结构字段内容判断**

保留：

```ts
if (input.packet.targetAgent === 'backend' && !mentionsVerification(text)) {
```

但确保这个分支只在 `hasStructuredResponse(text)` 为真之后才会进入。这样既要求有 `verification:` 字段，也保留“verification 文本是未验证”的识别能力。

- [ ] **Step 6: 运行测试，确认 evaluator 收紧后既不过宽也不破坏旧保护逻辑**

Run:

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
All verification tests passed successfully!
```

- [ ] **Step 7: Commit**

```bash
git add src/orchestrator/evaluator.ts test/dispatch-quality-loop.test.mjs
git commit -m "feat: require structured compact handoff responses"
```

---

### Task 6: 跑全量验证并清理受影响断言

**Files:**
- Modify: `test/dispatch-quality-loop.test.mjs`
- Inspect: `src/server/tools/dispatch-tools.ts`
- Inspect: `src/orchestrator/plan.ts`

- [ ] **Step 1: 运行全量验证，找出所有受旧字段命名影响的断言**

Run:

```bash
npm run build && npm test
```

Expected:

```text
可能先失败在 dispatch-quality-loop 或 handoff packet lines 相关断言
```

这里的目标不是“一次过”，而是定位是否还有地方硬编码旧 `goal/why/inputs/doneDefinition/returnFormat`。

- [ ] **Step 2: 如果展示工具断言受影响，最小化调整测试或展示逻辑**

优先改测试断言，例如把：

```js
  assert.ok(handoffLines.some((line) => line.includes('handoff acceptance:')));
```

扩展为兼容新文案，例如：

```js
  assert.ok(
    handoffLines.some((line) =>
      line.includes('handoff acceptance:') || line.includes('response format:'),
    ),
  );
```

只有在 `src/server/tools/dispatch-tools.ts` 的展示确实错误或信息缺失时，才修改展示工具；不要为了测试通过重建旧字段映射。

- [ ] **Step 3: 再跑一次全量验证，确认 build/test 全绿**

Run:

```bash
npm run build && npm test
```

Expected:

```text
All verification tests passed successfully!
dispatch quality loop public exports ready
global OpenCode model inventory tests passed
```

- [ ] **Step 4: Commit**

```bash
git add test/dispatch-quality-loop.test.mjs src/server/tools/dispatch-tools.ts src/orchestrator/plan.ts
git commit -m "test: align dispatch verification with compact handoff prompts"
```

如果 `src/server/tools/dispatch-tools.ts` 或 `src/orchestrator/plan.ts` 没有改动，不要强行加入 commit。

---

## Self-Review

### 1. Spec coverage

- **字段映射**：Task 1 + Task 2 覆盖 `goal -> mission`、`why -> context[]`、删除 `inputs`、`doneDefinition -> acceptance`、`returnFormat -> responseFormat`。
- **长度上限**：Task 2 覆盖 `context/scope/acceptance/artifacts` 上限。
- **长文本摘要 + 引用**：Task 2 用最小规则实现“首句 mission + 文件引用 artifacts”。
- **agent-specific 裁剪**：Task 4 覆盖 frontend / qa / writer / commander 差异化裁剪。
- **evaluator 联动**：Task 5 覆盖 `summary / verification / risk` 结构校验。
- **空输出保护逻辑保留**：Task 5 明确要求不得破坏现有空输出/blocked 保护。

无遗漏项。

### 2. Placeholder scan

- 已避免 `TODO`、`TBD`、`implement later`、`write tests for the above` 等占位词。
- 每个代码步骤都给出了明确代码片段。
- 每个验证步骤都给出了明确命令与预期结果。

### 3. Type consistency

- 统一使用 `mission/context/scope/acceptance/artifacts/responseFormat`。
- evaluator 中统一使用 `summary / verification / risk`。
- 没有在后续任务中继续引用旧 `inputs`、`doneDefinition`、`returnFormat` 字段作为实现目标。

---

Plan complete and saved to `docs/superpowers/plans/2026-05-07-compact-handoff-prompt-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
