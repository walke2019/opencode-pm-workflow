# PM 主协调分派闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有 pm-workflow 使用方式的前提下，为 `opencode-pm-workflow` 增加以 `pm / 曹操` 为主协调者的分派分析、结构化交接与结果回收闭环。

**Architecture:** 采用“规则优先、渐进迁移、兼容旧链路”的方案：先在 `src/orchestrator/` 下新增 `analyzer.ts`、`handoff.ts`、`evaluator.ts` 三个轻量模块，再把 `plan.ts`、`prompts.ts`、`dispatch-tools.ts` 从“阶段推荐 + 裸 prompt”升级为“分析结果 + handoff packet + evaluator 摘要”。所有高风险 gate、旧 `dispatch_map`、旧状态文件与旧命令入口继续保留，避免一次性重写运行时。

**Tech Stack:** TypeScript、OpenCode Plugin SDK（`@opencode-ai/plugin`）、Node.js ESM、现有 `npm run build` / `npm run typecheck` / `node test/*.mjs` 验证链路。

---

## 一、目标文件结构与职责

### 新增文件

- `src/orchestrator/analyzer.ts`
  - 负责把用户 prompt、stage、gate、state 摘要转换成 `TaskAnalysis`
  - 只做规则分析，不做真实执行
- `src/orchestrator/handoff.ts`
  - 负责生成 `HandoffPacket`
  - 校验 packet 最低字段完整性
- `src/orchestrator/evaluator.ts`
  - 负责把 handoff packet 与 agent 执行结果做轻量规则比对，输出 `EvaluationResult`
- `test/dispatch-quality-loop.test.mjs`
  - 覆盖 analyzer / handoff / evaluator 以及“pm 仍是主协调”回归

### 修改文件

- `src/core/types.ts`
  - 新增 `TaskDomain`、`TaskComplexity`、闭环专用 `DispatchExecutionMode`、`TaskAnalysis`、`HandoffPacket`、`EvaluationStatus`、`EvaluationResult`
  - 扩展 `DispatchPlan` / `DispatchCommand` 以承载 `analysis`、`handoffPacket`、`evaluation`、`nextAgentHint`
- `src/orchestrator/plan.ts`
  - 继续保留 stage/gate 默认逻辑
  - 新增基于 analyzer 的最终推荐覆盖层
  - 让 `buildDispatchCommand()` 产出 handoff packet
- `src/orchestrator/prompts.ts`
  - 保留现有人物化角色文案
  - 新增 `renderAgentHandoffPrompt()` 和 `renderCommanderAdvisorPrompt()`
  - 让 prompt 从“自由文本任务”升级为“角色文案 + 结构化 packet”
- `src/server/tools/dispatch-tools.ts`
  - 在 dry-run / execute 输出中展示 `TaskAnalysis` 与 `HandoffPacket`
  - 在执行后基于 stdout/stderr 生成 `EvaluationResult`
  - 返回下一步建议，而不是只打印 exitCode
- `test/workflow-redesign.test.mjs`
  - 保留既有自动化默认值与人物映射回归
  - 增补“commander 不是默认主 agent”的基础断言

### 本轮不改动文件

- `src/core/gates.ts`
  - 本轮不重写 gate 机制，只复用其结果作为 analyzer 输入
- `src/server/runtime.ts`
  - 本轮不重写底层执行器，只消费它的 stdout/stderr 做 evaluator 判断
- `package.json`
  - 除非新增验证脚本确有必要，否则不调整依赖与版本号

---

## 二、实施原则

1. **PM 主协调不动摇**：所有默认推荐都应落回 `pm` 分析后决定；`commander` 只在复杂拆解场景下被显式推荐。
2. **规则优先，避免过度智能化**：第一阶段只用确定性规则，不引入模型判别器。
3. **兼容优先**：旧 dispatch command、旧配置字段、旧 state 文件保持可用。
4. **小步可验证**：每个任务先补测试，再补最小实现，再跑局部验证，再提交。
5. **不做无关重构**：不顺手改动大文件结构，不趁机引入并行编排器。

---

## 三、任务分解

### Task 1: 扩展核心类型，给闭环留出稳定接口

**Files:**
- Modify: `src/core/types.ts`
- Create: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 先写失败测试，锁定新类型导出的运行时消费入口**

```js
import assert from 'node:assert';
import {
  analyzeDispatchTask,
  buildHandoffPacket,
  evaluateDispatchResult,
} from '../dist/index.js';

async function testPublicLoopExports() {
  assert.strictEqual(typeof analyzeDispatchTask, 'function');
  assert.strictEqual(typeof buildHandoffPacket, 'function');
  assert.strictEqual(typeof evaluateDispatchResult, 'function');
}
```

- [ ] **Step 2: 运行测试，确认当前实现必然失败**

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
FAIL，提示 dist/index.js 中不存在 analyzeDispatchTask / buildHandoffPacket / evaluateDispatchResult 导出
```

- [ ] **Step 3: 在 `src/core/types.ts` 新增闭环类型定义**

```ts
export type TaskDomain =
  | 'pm'
  | 'backend'
  | 'frontend'
  | 'writer'
  | 'qa_engineer'
  | 'orchestration';

export type TaskComplexity = 'simple' | 'multi_step' | 'composite';

export type DispatchExecutionMode =
  | 'pm_direct'
  | 'single_agent'
  | 'serial_handoff'
  | 'advisor_then_dispatch';

export interface TaskAnalysis {
  domain: TaskDomain;
  complexity: TaskComplexity;
  recommendedAgent: DispatchAgent;
  fallbackAgents: DispatchAgent[];
  executionMode: DispatchExecutionMode;
  needsDecomposition: boolean;
  rationale: string[];
  risks: string[];
  expectedNextAgents: DispatchAgent[];
}

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

export type EvaluationStatus =
  | 'done'
  | 'partial'
  | 'misaligned'
  | 'needs_verification';

export interface EvaluationResult {
  status: EvaluationStatus;
  summary: string;
  matchedDeliverables: string[];
  missingDeliverables: string[];
  gaps: string[];
  recommendedNextAgent?: DispatchAgent;
  recommendedNextAction?: DispatchAction;
}
```

- [ ] **Step 4: 扩展 `DispatchPlan` / `DispatchCommand` 的结构化字段**

```ts
export type DispatchPlan = {
  stage: WorkflowStage;
  stageLabel: string;
  recommendedAgent: DispatchAgent;
  recommendedAction: DispatchAction;
  reason: string;
  blocked: boolean;
  blockedReasons: string[];
  preferredSession: string | null;
  nextStep: string;
  analysis?: TaskAnalysis;
};

export type DispatchCommand = DispatchPlan & {
  executableAgent: ExecutableAgent;
  executablePrompt: string;
  command: string;
  commandArgs: string[];
  handoffPacket?: HandoffPacket;
};
```

- [ ] **Step 5: 暂时在公共导出入口补出符号占位实现所需导出**

```ts
export {
  analyzeDispatchTask,
  buildHandoffPacket,
  evaluateDispatchResult,
} from './orchestrator/index.js';
```

- [ ] **Step 6: 重新构建，确认类型层与导出层已可继续推进**

```bash
npm run typecheck && npm run build
```

Expected:

```text
PASS，TypeScript 编译通过；如因 orchestrator/index.js 尚不存在而失败，继续 Task 2 一并补齐
```

- [ ] **Step 7: 提交本任务**

```bash
git add src/core/types.ts test/dispatch-quality-loop.test.mjs src/index.ts src/orchestrator/index.ts
git commit -m "feat: add dispatch loop core types"
```

### Task 2: 实现 Dispatch Analyzer，先解决“派错人”和“是否拆解”

**Files:**
- Create: `src/orchestrator/analyzer.ts`
- Create: `src/orchestrator/index.ts`
- Modify: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖三类关键分派场景**

```js
import { analyzeDispatchTask } from '../dist/orchestrator/index.js';

async function testAnalyzerRouting() {
  const writerTask = analyzeDispatchTask({
    prompt: '帮我补 README 的安装说明',
    stage: 'development',
    blockedReasons: [],
  });
  assert.strictEqual(writerTask.domain, 'writer');
  assert.strictEqual(writerTask.recommendedAgent, 'writer');
  assert.strictEqual(writerTask.executionMode, 'single_agent');

  const backendTask = analyzeDispatchTask({
    prompt: '修复认证接口 401 并验证不影响现有登录流程',
    stage: 'development',
    blockedReasons: [],
  });
  assert.strictEqual(backendTask.domain, 'backend');
  assert.ok(backendTask.expectedNextAgents.includes('qa_engineer'));

  const orchestrationTask = analyzeDispatchTask({
    prompt: '把 onboarding 流程的前端实现、说明文档和拆解方案一起补齐',
    stage: 'plan_ready',
    blockedReasons: [],
  });
  assert.strictEqual(orchestrationTask.recommendedAgent, 'commander');
  assert.strictEqual(orchestrationTask.needsDecomposition, true);
}
```

- [ ] **Step 2: 跑测试，确认 analyzer 尚未实现**

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
FAIL，提示 cannot find module ../dist/orchestrator/index.js 或 analyzeDispatchTask 未定义
```

- [ ] **Step 3: 编写 `src/orchestrator/analyzer.ts` 的最小可用规则实现**

```ts
import type { DispatchAgent, TaskAnalysis, WorkflowStage } from '../core/types.js';

export interface AnalyzeDispatchTaskInput {
  prompt: string;
  stage: WorkflowStage;
  blockedReasons?: string[];
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function analyzeDispatchTask(input: AnalyzeDispatchTaskInput): TaskAnalysis {
  const text = input.prompt.toLowerCase();

  if (hasAny(text, ['readme', '发布说明', 'release note', '文档', '说明'])) {
    return {
      domain: 'writer',
      complexity: 'simple',
      recommendedAgent: 'writer',
      fallbackAgents: ['pm'],
      executionMode: 'single_agent',
      needsDecomposition: false,
      rationale: ['任务以文档产出为主'],
      risks: [],
      expectedNextAgents: [],
    };
  }

  if (hasAny(text, ['接口', 'api', '数据库', '鉴权', '401', '后端'])) {
    return {
      domain: 'backend',
      complexity: hasAny(text, ['验证', '回归', '确认不影响']) ? 'multi_step' : 'simple',
      recommendedAgent: 'backend',
      fallbackAgents: ['pm', 'qa_engineer'],
      executionMode: hasAny(text, ['验证', '回归', '确认不影响']) ? 'serial_handoff' : 'single_agent',
      needsDecomposition: false,
      rationale: ['任务核心是后端逻辑修复'],
      risks: ['可能需要额外验证回归面'],
      expectedNextAgents: hasAny(text, ['验证', '回归', '确认不影响']) ? ['qa_engineer'] : [],
    };
  }

  if (hasAny(text, ['一起', '同时', '拆解', '前端', '文档', '跨角色'])) {
    return {
      domain: 'orchestration',
      complexity: 'composite',
      recommendedAgent: 'commander',
      fallbackAgents: ['pm'],
      executionMode: 'advisor_then_dispatch',
      needsDecomposition: true,
      rationale: ['任务涉及多个角色或多个交付物'],
      risks: ['若不拆解，单 agent 容易偏题或漏项'],
      expectedNextAgents: ['backend', 'frontend', 'writer'],
    };
  }

  return {
    domain: 'pm',
    complexity: 'simple',
    recommendedAgent: 'pm',
    fallbackAgents: [],
    executionMode: 'pm_direct',
    needsDecomposition: false,
    rationale: ['未命中明确专业域，先由 PM 收敛'],
    risks: [],
    expectedNextAgents: [],
  };
}
```

- [ ] **Step 4: 在 `src/orchestrator/index.ts` 导出 analyzer API**

```ts
export { analyzeDispatchTask } from './analyzer.js';
export { buildHandoffPacket } from './handoff.js';
export { evaluateDispatchResult } from './evaluator.js';
```

- [ ] **Step 5: 运行局部测试，确认 analyzer 路由行为已稳定**

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
writer / backend / orchestration 三类分析断言通过
```

- [ ] **Step 6: 提交本任务**

```bash
git add src/orchestrator/analyzer.ts src/orchestrator/index.ts test/dispatch-quality-loop.test.mjs
git commit -m "feat: add rule-based dispatch analyzer"
```

### Task 3: 实现 Handoff Packet Builder，解决“给不够上下文”

**Files:**
- Create: `src/orchestrator/handoff.ts`
- Modify: `src/orchestrator/prompts.ts`
- Modify: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 写失败测试，锁定 packet 字段完整性与 agent 差异化**

```js
import { buildHandoffPacket } from '../dist/orchestrator/index.js';

async function testHandoffPacket() {
  const backendPacket = buildHandoffPacket({
    prompt: '修复认证接口 401 并确认不影响现有登录流程',
    recommendedAgent: 'backend',
    analysis: analyzeDispatchTask({
      prompt: '修复认证接口 401 并确认不影响现有登录流程',
      stage: 'development',
      blockedReasons: [],
    }),
  });

  assert.strictEqual(backendPacket.targetAgent, 'backend');
  assert.ok(backendPacket.acceptanceCriteria.length > 0);
  assert.ok(backendPacket.returnFormat.some((item) => item.includes('验证')));
}
```

- [ ] **Step 2: 运行测试，确认 packet builder 尚不可用**

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
FAIL，提示 buildHandoffPacket 未实现或返回字段缺失
```

- [ ] **Step 3: 实现 `src/orchestrator/handoff.ts` 的最小 packet 构建器**

```ts
import type { DispatchAgent, HandoffPacket, TaskAnalysis } from '../core/types.js';

export interface BuildHandoffPacketInput {
  prompt: string;
  recommendedAgent: DispatchAgent;
  analysis: TaskAnalysis;
}

function basePacket(input: BuildHandoffPacketInput): HandoffPacket {
  return {
    goal: input.prompt,
    why: input.analysis.rationale.join('；') || '根据当前任务分析生成交接包',
    taskType: input.analysis.domain,
    targetAgent: input.recommendedAgent,
    scope: ['只处理当前任务直接相关内容'],
    inputs: [input.prompt],
    constraints: ['遵循现有项目结构', '不要擅自扩大范围'],
    acceptanceCriteria: ['输出必须对应目标任务', '输出必须可验证'],
    deliverables: ['执行结果摘要'],
    doneDefinition: ['明确说明完成项、未完成项与验证情况'],
    returnFormat: ['summary: 做了什么', 'verification: 如何验证', 'risk: 剩余风险'],
  };
}

export function buildHandoffPacket(input: BuildHandoffPacketInput): HandoffPacket {
  const packet = basePacket(input);

  if (input.recommendedAgent === 'backend') {
    packet.deliverables = ['代码修改摘要', '验证命令', '风险说明'];
    packet.acceptanceCriteria.push('说明接口或逻辑影响范围');
    packet.returnFormat.push('verification: 提供测试或构建命令');
  }

  if (input.recommendedAgent === 'frontend') {
    packet.deliverables = ['页面或组件修改摘要', '交互说明', '验收方式'];
    packet.acceptanceCriteria.push('说明 UI/交互影响范围');
  }

  if (input.recommendedAgent === 'writer') {
    packet.deliverables = ['文档变更摘要', '目标读者说明', '章节清单'];
    packet.acceptanceCriteria.push('文档结构清晰且与代码行为一致');
  }

  if (input.recommendedAgent === 'qa_engineer') {
    packet.deliverables = ['测试结论', '风险列表', '是否通过建议'];
    packet.acceptanceCriteria.push('明确列出验证范围与未覆盖项');
    packet.returnFormat.push('verification: 列出执行过的检查项');
  }

  if (input.recommendedAgent === 'commander') {
    packet.deliverables = ['任务拆解建议', '推荐角色顺序', '风险排序'];
    packet.constraints.push('只提供建议，不直接取代 PM 做最终决策');
  }

  if (!packet.goal || !packet.inputs.length || !packet.acceptanceCriteria.length) {
    throw new Error('handoff packet missing required fields');
  }

  return packet;
}
```

- [ ] **Step 4: 在 `src/orchestrator/prompts.ts` 新增 packet 渲染函数**

```ts
import type { DispatchAgent, HandoffPacket } from '../core/types.js';

export function renderAgentHandoffPrompt(agent: DispatchAgent, packet: HandoffPacket) {
  return `
【任务目标】
${packet.goal}

【任务背景】
${packet.why}

【范围】
${packet.scope.map((item, index) => `${index + 1}. ${item}`).join('\n')}

【输入】
${packet.inputs.map((item, index) => `${index + 1}. ${item}`).join('\n')}

【约束】
${packet.constraints.map((item, index) => `${index + 1}. ${item}`).join('\n')}

【验收标准】
${packet.acceptanceCriteria.map((item, index) => `${index + 1}. ${item}`).join('\n')}

【回传格式】
${packet.returnFormat.map((item, index) => `${index + 1}. ${item}`).join('\n')}
`.trim();
}
```

- [ ] **Step 5: 让 `buildExecutablePrompt()` 支持注入结构化 handoff 内容**

```ts
export function buildExecutablePrompt(
  agent: DispatchAgent,
  prompt: string,
  packet?: HandoffPacket,
) {
  const taskBody = packet
    ? renderAgentHandoffPrompt(agent, packet)
    : `【核心任务】\n${prompt}`;

  return `
${roleTitle}
${roleContext}

${taskBody}

【执行要求】
1. 严格遵循项目既有的代码规范与技术栈。
2. 优先执行，如有重大疑虑再行请示。
3. 过程务必清晰，结果务必可验证。
`.trim();
}
```

- [ ] **Step 6: 运行测试，确认 packet 构建与渲染通过**

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
PASS，backend / writer / commander 的 packet 字段完整，prompt 含结构化小节
```

- [ ] **Step 7: 提交本任务**

```bash
git add src/orchestrator/handoff.ts src/orchestrator/prompts.ts test/dispatch-quality-loop.test.mjs
git commit -m "feat: add structured handoff packets"
```

### Task 4: 实现 Result Evaluator，解决“回收机制差”

**Files:**
- Create: `src/orchestrator/evaluator.ts`
- Modify: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖 done / needs_verification / partial 三类最小场景**

```js
import { evaluateDispatchResult } from '../dist/orchestrator/index.js';

async function testEvaluator() {
  const packet = buildHandoffPacket({
    prompt: '修复认证接口 401 并确认不影响现有登录流程',
    recommendedAgent: 'backend',
    analysis: analyzeDispatchTask({
      prompt: '修复认证接口 401 并确认不影响现有登录流程',
      stage: 'development',
      blockedReasons: [],
    }),
  });

  const needsVerification = evaluateDispatchResult(packet, {
    exitCode: 0,
    stdout: '已修复 401，已更新认证逻辑，但尚未执行验证命令',
    stderr: '',
  });
  assert.strictEqual(needsVerification.status, 'needs_verification');
  assert.strictEqual(needsVerification.recommendedNextAgent, 'qa_engineer');

  const done = evaluateDispatchResult(packet, {
    exitCode: 0,
    stdout: '已修复 401，并执行 npm run build 与 node test/workflow-redesign.test.mjs 验证通过',
    stderr: '',
  });
  assert.strictEqual(done.status, 'done');
}
```

- [ ] **Step 2: 运行测试，确认 evaluator 尚未实现**

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
FAIL，提示 evaluateDispatchResult 未实现
```

- [ ] **Step 3: 编写 `src/orchestrator/evaluator.ts` 的轻量规则实现**

```ts
import type { EvaluationResult, HandoffPacket } from '../core/types.js';

export interface DispatchExecutionOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function evaluateDispatchResult(
  packet: HandoffPacket,
  output: DispatchExecutionOutput,
): EvaluationResult {
  const text = `${output.stdout}\n${output.stderr}`.toLowerCase();

  if (output.exitCode !== 0) {
    return {
      status: 'partial',
      summary: '执行未成功完成，需要继续处理失败项',
      matchedDeliverables: [],
      missingDeliverables: packet.deliverables,
      gaps: ['命令返回非 0 exitCode'],
      recommendedNextAgent: 'pm',
      recommendedNextAction: 'continue-development',
    };
  }

  const mentionsVerification = ['验证', 'test', 'build', 'review', '通过'].some((keyword) =>
    text.includes(keyword),
  );

  if (packet.targetAgent === 'backend' && !mentionsVerification) {
    return {
      status: 'needs_verification',
      summary: '后端工作已完成，但缺少可验证证据',
      matchedDeliverables: ['代码修改摘要'],
      missingDeliverables: ['验证命令', '测试结论'],
      gaps: ['尚未提供验证命令或验证结果'],
      recommendedNextAgent: 'qa_engineer',
      recommendedNextAction: 'run-code-review',
    };
  }

  if (packet.targetAgent === 'commander') {
    return {
      status: 'partial',
      summary: 'commander 已提供建议，仍需 PM 二次分派',
      matchedDeliverables: ['任务拆解建议'],
      missingDeliverables: [],
      gaps: ['建议不能直接视为最终完成'],
      recommendedNextAgent: 'pm',
      recommendedNextAction: 'continue-development',
    };
  }

  return {
    status: 'done',
    summary: '输出与交接包基本一致，可视为当前环节完成',
    matchedDeliverables: packet.deliverables,
    missingDeliverables: [],
    gaps: [],
  };
}
```

- [ ] **Step 4: 跑测试，确认 evaluator 结果分类稳定**

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
PASS，后端未验证会转 qa；验证充分可标记 done；commander 结果不会直接标记 done
```

- [ ] **Step 5: 提交本任务**

```bash
git add src/orchestrator/evaluator.ts test/dispatch-quality-loop.test.mjs
git commit -m "feat: add dispatch result evaluator"
```

### Task 5: 把 analyzer 与 handoff 集成进 `plan.ts`

**Files:**
- Modify: `src/orchestrator/plan.ts`
- Modify: `test/workflow-redesign.test.mjs`
- Modify: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 写失败测试，确保 `plan_ready` 不再把 commander 当默认主控**

```js
import { buildDispatchCommand } from '../dist/orchestrator/plan.js';

async function testPmRemainsCoordinator() {
  const dispatch = buildDispatchCommand(projectDir, '帮我补 README 的安装说明');
  assert.notStrictEqual(dispatch.recommendedAgent, 'commander');
  assert.ok(dispatch.analysis);
  assert.ok(dispatch.handoffPacket);
}
```

- [ ] **Step 2: 运行测试，确认旧逻辑仍把 `plan_ready` / `development` 直接指到 commander**

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
FAIL，推荐 agent 仍被旧逻辑直接设置为 commander，且 dispatch 无 analysis/handoffPacket
```

- [ ] **Step 3: 在 `src/orchestrator/plan.ts` 中引入 analyzer 覆盖层**

```ts
import { analyzeDispatchTask } from './analyzer.js';
import { buildHandoffPacket } from './handoff.js';

function chooseRecommendedAgent(
  fallbackAgent: DispatchAgent,
  prompt: string,
  stage: WorkflowStage,
  blockedReasons: string[],
) {
  const analysis = analyzeDispatchTask({ prompt, stage, blockedReasons });
  return {
    recommendedAgent: analysis.recommendedAgent,
    analysis,
  };
}
```

- [ ] **Step 4: 调整 `buildDispatchPlan()` 的返回结构，保留 stage 默认动作但不再把 commander 写死为主协调**

```ts
const basePrompt = prompt?.trim() || reason;
const analysis = analyzeDispatchTask({
  prompt: basePrompt,
  stage: state.stage,
  blockedReasons,
});

return {
  stage: state.stage,
  stageLabel: state.stageLabel,
  recommendedAgent: analysis.recommendedAgent,
  recommendedAction,
  preferredSession: state.session.preferred_session_id,
  reason,
  blocked,
  blockedReasons,
  nextStep: state.nextStep,
  analysis,
};
```

- [ ] **Step 5: 调整 `buildDispatchCommand()`，生成并注入 `handoffPacket`**

```ts
const handoffPacket = plan.analysis
  ? buildHandoffPacket({
      prompt: quotedPrompt,
      recommendedAgent: plan.recommendedAgent,
      analysis: plan.analysis,
    })
  : undefined;

const executablePrompt = buildExecutablePrompt(
  plan.recommendedAgent,
  quotedPrompt,
  handoffPacket,
);

return {
  ...plan,
  executableAgent,
  executablePrompt,
  command,
  commandArgs,
  handoffPacket,
};
```

- [ ] **Step 6: 跑测试，确认 dispatch 已具备 analysis 与 handoffPacket**

```bash
npm run typecheck && npm run build && node test/workflow-redesign.test.mjs && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
PASS，人物映射仍正确；dispatch 命令新增 analysis 与 handoffPacket；commander 不会被简单文档任务默认选中
```

- [ ] **Step 7: 提交本任务**

```bash
git add src/orchestrator/plan.ts test/workflow-redesign.test.mjs test/dispatch-quality-loop.test.mjs
git commit -m "feat: wire analyzer and handoff into dispatch plan"
```

### Task 6: 把 evaluator 集成进 `dispatch-tools.ts` 输出闭环结果

**Files:**
- Modify: `src/server/tools/dispatch-tools.ts`
- Modify: `test/dispatch-quality-loop.test.mjs`

- [ ] **Step 1: 写失败测试，要求 dry-run / execute 输出展示闭环信息**

```js
assert.ok(result.includes('analysis:'), 'dispatch output should include analysis');
assert.ok(result.includes('handoff packet:'), 'dispatch output should include handoff packet');
assert.ok(result.includes('evaluation:'), 'dispatch output should include evaluation summary after execution');
```

- [ ] **Step 2: 运行测试，确认当前工具输出缺少上述字段**

```bash
npm run build && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
FAIL，当前只打印推荐 agent / command / exitCode，无 analysis/handoff/evaluation 摘要
```

- [ ] **Step 3: 在 `pm-run-dispatch` / `pm-dry-run-dispatch` 输出中增加分析与 packet 摘要**

```ts
dispatch.analysis
  ? `- analysis: domain=${dispatch.analysis.domain} complexity=${dispatch.analysis.complexity} mode=${dispatch.analysis.executionMode}`
  : '- analysis: none',
dispatch.handoffPacket
  ? `- handoff packet: target=${dispatch.handoffPacket.targetAgent} acceptance=${dispatch.handoffPacket.acceptanceCriteria.length} deliverables=${dispatch.handoffPacket.deliverables.length}`
  : '- handoff packet: none',
```

- [ ] **Step 4: 在 `pm-execute-dispatch` 中接入 evaluator**

```ts
const evaluation = dispatch.handoffPacket
  ? evaluateDispatchResult(dispatch.handoffPacket, {
      exitCode: result.status ?? -1,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    })
  : undefined;
```

- [ ] **Step 5: 把 evaluation 摘要写入 execute 结果文本**

```ts
evaluation
  ? `- evaluation: ${evaluation.status} | ${evaluation.summary}`
  : '- evaluation: none',
evaluation?.recommendedNextAgent
  ? `- next agent hint: ${evaluation.recommendedNextAgent}`
  : '- next agent hint: none',
evaluation?.recommendedNextAction
  ? `- next action hint: ${evaluation.recommendedNextAction}`
  : '- next action hint: none',
```

- [ ] **Step 6: 运行集成验证，确认工具层输出闭环摘要**

```bash
npm run typecheck && npm run build && node test/workflow-redesign.test.mjs && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
PASS，dry-run 可见 analysis/handoff；execute 可见 evaluation/next-agent-hint
```

- [ ] **Step 7: 提交本任务**

```bash
git add src/server/tools/dispatch-tools.ts test/dispatch-quality-loop.test.mjs
git commit -m "feat: surface evaluation in dispatch tools"
```

### Task 7: 做最终回归与文档核对，确保自动化目标不倒退

**Files:**
- Modify: `test/workflow-redesign.test.mjs`
- Modify: `test/dispatch-quality-loop.test.mjs`
- Optional Modify: `CHANGELOG.md`

- [ ] **Step 1: 补最终回归断言，覆盖四个关键不回退点**

```js
assert.strictEqual(config.permissions.allow_execute_tools, true);
assert.strictEqual(config.confirm.require_confirm_for_execute, false);
assert.ok(!simpleWriterDispatch.executablePrompt.includes('commander 作为主 agent'));
assert.strictEqual(commanderAdviceEvaluation.status, 'partial');
```

- [ ] **Step 2: 运行现有回归测试**

```bash
node test/workflow-redesign.test.mjs
```

Expected:

```text
PASS，现有人物映射与默认自动化设置未被破坏
```

- [ ] **Step 3: 运行新增闭环测试**

```bash
node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
PASS，闭环分析、交接、回收与“pm 仍是主协调”全部通过
```

- [ ] **Step 4: 运行完整工程验证**

```bash
npm run typecheck && npm run build && node test/workflow-redesign.test.mjs && node test/dispatch-quality-loop.test.mjs
```

Expected:

```text
全部通过，无 TypeScript 编译错误，无回归失败
```

- [ ] **Step 5: 如需记录版本说明，补一条 Changelog**

```md
## 0.1.x

- 增加以 PM 为主协调者的 dispatch analyzer / handoff packet / result evaluator 最小闭环
- 保持低确认自动化默认值与现有 agent 映射兼容
```

- [ ] **Step 6: 提交最终回归结果**

```bash
git add test/workflow-redesign.test.mjs test/dispatch-quality-loop.test.mjs CHANGELOG.md
git commit -m "test: add pm-centered dispatch loop regression coverage"
```

---

## 四、实施顺序说明

推荐严格按以下顺序执行，不要跳步：

1. `types` 打底
2. `analyzer` 规则化
3. `handoff` 结构化
4. `evaluator` 回收化
5. `plan.ts` 接入分析与 packet
6. `dispatch-tools.ts` 接入 evaluation 摘要
7. 全量回归

原因：

- `plan.ts` 依赖 analyzer 与 handoff 的稳定接口
- `dispatch-tools.ts` 依赖 `DispatchCommand` 已含 packet 与执行后 evaluation 能力
- 先把边界稳定，再改工具层，能降低一次性联动风险

---

## 五、风险与应对

### 风险 1：`ExecutionMode` 命名冲突

当前 `src/core/types.ts` 已存在：

```ts
export type ExecutionMode = 'local' | 'single-subagent' | 'parallel-subagents';
```

本计划中的闭环模式不要直接复用这个名字，建议新命名为：

```ts
export type DispatchExecutionMode =
  | 'pm_direct'
  | 'single_agent'
  | 'serial_handoff'
  | 'advisor_then_dispatch';
```

### 风险 2：`plan.ts` 过度膨胀

应对：

- 分析逻辑只能放 `analyzer.ts`
- packet 构建逻辑只能放 `handoff.ts`
- `plan.ts` 只负责组装，不新增大段规则

### 风险 3：工具输出太长

应对：

- `dispatch-tools.ts` 只输出 analysis/handoff/evaluation 摘要，不直接整段打印整个 packet JSON
- 如需完整 JSON，后续再单独加 debug 入口

### 风险 4：旧用例被 commander 抢走

应对：

- 只在 `complexity === 'composite'` 或显式“拆解/多角色/一起做”命中时推荐 commander
- 为简单 writer/backend/frontend 用例写明确回归断言

---

## 六、完成定义

当且仅当以下条件同时满足，才可视为本计划落地完成：

1. `pm` 仍为主协调语义中心，简单任务不再默认落到 `commander`
2. `buildDispatchCommand()` 能返回 `analysis` 与 `handoffPacket`
3. `pm-run-dispatch` / `pm-dry-run-dispatch` 能展示闭环摘要
4. `pm-execute-dispatch` 能输出 `evaluation` 与下一步建议
5. `npm run typecheck`
6. `npm run build`
7. `node test/workflow-redesign.test.mjs`
8. `node test/dispatch-quality-loop.test.mjs`

---

## 七、建议执行方式

本计划适合按任务切块执行，每完成一个 Task 就做一次局部验证与一次小提交。不要把 7 个任务堆成一次大提交，否则很难定位是 analyzer、handoff 还是 evaluator 导致回归。

建议提交节奏：

1. `feat: add dispatch loop core types`
2. `feat: add rule-based dispatch analyzer`
3. `feat: add structured handoff packets`
4. `feat: add dispatch result evaluator`
5. `feat: wire analyzer and handoff into dispatch plan`
6. `feat: surface evaluation in dispatch tools`
7. `test: add pm-centered dispatch loop regression coverage`
