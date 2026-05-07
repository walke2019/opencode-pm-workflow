# Command Lane Mode-Aware Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add command-lane UX, explicit lane context, mode-aware agent dispatch, todo-aware orchestration summaries, and TUI/test/docs coverage without creating a second runtime.

**Architecture:** Keep `commands/` as thin UX facades and route all execution through the existing PM workflow runtime. Introduce a typed lane-policy layer plus a mode-aware dispatch adapter so `pm_workflow_caocao` remains the single primary orchestrator while specialist subagents are invoked through subagent-safe execution paths.

**Tech Stack:** TypeScript, OpenCode plugin APIs, existing pm-workflow runtime/orchestrator modules, Node.js test scripts.

---

## File Structure Map

### New files

- `commands/pm-quick.md` — low-risk lane command facade that routes through PM orchestration.
- `commands/pm-medium.md` — recommended default lane facade with structured summaries and todo encouragement.
- `commands/pm-full.md` — strict/high-risk lane facade with stronger automation and review posture.
- `commands/pm-debug.md` — debug-oriented lane facade with reproduce/isolate/fix/verify guidance.
- `src/commands/types.ts` — lane/topology/result typing shared by command/runtime integration.
- `src/commands/registry.ts` — single source of truth for lane defaults.
- `src/commands/lane-policy.ts` — helpers to resolve and serialize lane context.
- `src/commands/analysis.ts` — wraps existing task analysis into lane-aware summaries.
- `src/commands/topology.ts` — topology inference and summary formatting.
- `src/commands/result.ts` — normalized result shape for dispatch/loop outputs.
- `test/command-lane-analysis.test.mjs` — verifies lane context, todo posture, and topology summary wiring.
- `test/mode-aware-dispatch.test.mjs` — verifies primary/subagent/all invocation semantics.
- `test/topology-summary.test.mjs` — verifies single/sequential/parallel/hybrid classification output.
- `docs/dev/command-lane-mapping.md` — command lane to runtime tool mapping.
- `docs/dev/subagent-dispatch-migration.md` — explains the migration from primary-path specialist dispatch to mode-aware dispatch.

### Modified files

- `src/core/types.ts` — add lane/topology/invocation/result types to existing shared contracts.
- `src/orchestrator/analyzer.ts` — expose richer analysis fields used by lane/topology summaries.
- `src/orchestrator/prompts.ts` — split primary vs subagent command construction.
- `src/orchestrator/plan.ts` — accept lane context, compute topology summary, attach structured metadata to dispatch results.
- `src/shared.ts` — export new command-layer helpers.
- `src/server/runtime.ts` — implement mode-aware dispatch resolver/executor helpers.
- `src/server/tools/dispatch-tools.ts` — surface lane/topology/todo/automation details in dry-run/run/execute/loop responses.
- `src/server/plugin.ts` — no logic change expected, but validate new tool outputs remain wired correctly.
- `src/tui/commands.ts` — register `/pm-quick`, `/pm-medium`, `/pm-full`, `/pm-debug`.
- `src/tui/toasts.ts` — show lane/topology-aware summaries in toasts.
- `src/tui/plugin.ts` — keep registration path intact after command additions.
- `README.md` — document command lanes, runtime-backed routing, and compatibility expectations.
- `package.json` — publish `commands/` and include new tests in the test script.

### Existing files to reference while implementing

- `docs/superpowers/specs/2026-05-07-command-lane-mode-aware-orchestration-design.md`
- `test/workflow-redesign.test.mjs`
- `test/dispatch-quality-loop.test.mjs`

## Task 1: Add shared lane/topology types and policy registry

**Files:**
- Create: `src/commands/types.ts`
- Create: `src/commands/registry.ts`
- Create: `src/commands/lane-policy.ts`
- Modify: `src/core/types.ts`
- Modify: `src/shared.ts`
- Test: `test/command-lane-analysis.test.mjs`

- [ ] **Step 1: Write the failing test for lane defaults and todo posture**

```js
import assert from 'node:assert';
import {
  inferTopologyFromAnalysis,
  resolveLaneContext,
  shouldCreateTodoForLane,
} from '../dist/index.js';

async function testLaneDefaults() {
  const medium = resolveLaneContext('medium');
  assert.deepStrictEqual(medium, {
    lane: 'medium',
    risk: 'moderate',
    automation: 'assisted',
    topologyVerbosity: 'structured',
    reviewExpectation: 'standard',
  });
  assert.strictEqual(shouldCreateTodoForLane(medium, 3), true);

  const quick = resolveLaneContext('quick');
  assert.strictEqual(shouldCreateTodoForLane(quick, 2), false);
}

await testLaneDefaults();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node test/command-lane-analysis.test.mjs`

Expected: FAIL with an error similar to `resolveLaneContext is not a function` or `Cannot find module '../dist/index.js' export`.

- [ ] **Step 3: Add the lane/topology types in `src/commands/types.ts`**

```ts
export type PmCommandLane = "quick" | "medium" | "full" | "debug";

export type PmLaneRisk = "low" | "moderate" | "high" | "debug";
export type PmLaneAutomation = "guided" | "assisted" | "elevated";
export type PmLaneTopologyVerbosity = "minimal" | "structured";
export type PmLaneReviewExpectation = "light" | "standard" | "strict";

export type ExecutionTopology = "single" | "sequential" | "parallel" | "hybrid";

export type PmLaneContext = {
  lane: PmCommandLane;
  risk: PmLaneRisk;
  automation: PmLaneAutomation;
  topologyVerbosity: PmLaneTopologyVerbosity;
  reviewExpectation: PmLaneReviewExpectation;
};

export type TodoPolicySummary = {
  shouldCreate: boolean;
  minimumStepCount: number;
  preferredShape: "none" | "default" | "phased" | "debug-4stage";
};

export type TopologySummary = {
  topology: ExecutionTopology;
  reason: string;
  specialistCount: number;
  expectedAgents: string[];
};
```

- [ ] **Step 4: Add the registry and policy helpers**

`src/commands/registry.ts`

```ts
import type { PmCommandLane, PmLaneContext } from "./types.js";

export const PM_LANE_REGISTRY: Record<PmCommandLane, PmLaneContext> = {
  quick: {
    lane: "quick",
    risk: "low",
    automation: "guided",
    topologyVerbosity: "minimal",
    reviewExpectation: "light",
  },
  medium: {
    lane: "medium",
    risk: "moderate",
    automation: "assisted",
    topologyVerbosity: "structured",
    reviewExpectation: "standard",
  },
  full: {
    lane: "full",
    risk: "high",
    automation: "elevated",
    topologyVerbosity: "structured",
    reviewExpectation: "strict",
  },
  debug: {
    lane: "debug",
    risk: "debug",
    automation: "assisted",
    topologyVerbosity: "structured",
    reviewExpectation: "standard",
  },
};
```

`src/commands/lane-policy.ts`

```ts
import { PM_LANE_REGISTRY } from "./registry.js";
import type { PmCommandLane, PmLaneContext, TodoPolicySummary } from "./types.js";

export function resolveLaneContext(
  lane: PmCommandLane | null | undefined,
): PmLaneContext {
  return PM_LANE_REGISTRY[lane || "medium"];
}

export function shouldCreateTodoForLane(
  lane: PmLaneContext,
  inferredStepCount: number,
): boolean {
  if (lane.lane === "full" || lane.lane === "debug") return true;
  if (lane.lane === "medium") return inferredStepCount >= 3;
  return inferredStepCount >= 3;
}

export function buildTodoPolicySummary(
  lane: PmLaneContext,
  inferredStepCount: number,
): TodoPolicySummary {
  if (lane.lane === "debug") {
    return { shouldCreate: true, minimumStepCount: 2, preferredShape: "debug-4stage" };
  }
  if (lane.lane === "full") {
    return { shouldCreate: true, minimumStepCount: 2, preferredShape: "phased" };
  }
  if (lane.lane === "medium") {
    return {
      shouldCreate: shouldCreateTodoForLane(lane, inferredStepCount),
      minimumStepCount: 3,
      preferredShape: "default",
    };
  }
  return {
    shouldCreate: shouldCreateTodoForLane(lane, inferredStepCount),
    minimumStepCount: 3,
    preferredShape: "none",
  };
}
```

- [ ] **Step 5: Extend shared core types and exports minimally**

Add to `src/core/types.ts` near existing dispatch types:

```ts
export type AgentInvocationMode = "primary" | "subagent" | "all";

export type DispatchInvocationSemantics = {
  mode: AgentInvocationMode;
  supportsDirectRun: boolean;
  requiresTaskPermission: boolean;
};
```

Add to `src/shared.ts` exports:

```ts
export {
  resolveLaneContext,
  shouldCreateTodoForLane,
  buildTodoPolicySummary,
} from "./commands/lane-policy.js";
export type {
  ExecutionTopology,
  PmCommandLane,
  PmLaneContext,
  TopologySummary,
} from "./commands/types.js";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run build && node test/command-lane-analysis.test.mjs`

Expected: PASS with assertions confirming lane defaults and todo posture.

- [ ] **Step 7: Commit**

```bash
git add src/commands/types.ts src/commands/registry.ts src/commands/lane-policy.ts src/core/types.ts src/shared.ts test/command-lane-analysis.test.mjs
git commit -m "feat: add lane policy foundations"
```

## Task 2: Add lane-aware analysis and topology summaries

**Files:**
- Create: `src/commands/analysis.ts`
- Create: `src/commands/topology.ts`
- Create: `src/commands/result.ts`
- Modify: `src/orchestrator/analyzer.ts`
- Modify: `src/orchestrator/plan.ts`
- Modify: `src/core/types.ts`
- Modify: `src/shared.ts`
- Test: `test/command-lane-analysis.test.mjs`
- Test: `test/topology-summary.test.mjs`

- [ ] **Step 1: Write the failing topology summary tests**

```js
import assert from 'node:assert';
import {
  analyzeDispatchTask,
  inferTopologyFromAnalysis,
  summarizeLaneDispatch,
} from '../dist/index.js';

async function testTopologyInference() {
  const simple = analyzeDispatchTask({
    prompt: '帮我补 README 的安装说明',
    stage: 'development',
    blockedReasons: [],
  });
  assert.strictEqual(inferTopologyFromAnalysis(simple).topology, 'single');

  const composite = analyzeDispatchTask({
    prompt: '把 onboarding 流程的前端实现、说明文档和拆解方案一起补齐',
    stage: 'plan_ready',
    blockedReasons: [],
  });
  assert.strictEqual(inferTopologyFromAnalysis(composite).topology, 'hybrid');

  const summary = summarizeLaneDispatch({ analysis: composite, lane: 'medium' });
  assert.strictEqual(summary.todo.shouldCreate, true);
  assert.strictEqual(summary.topology.topology, 'hybrid');
}

await testTopologyInference();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node test/topology-summary.test.mjs`

Expected: FAIL with missing exports for `inferTopologyFromAnalysis` and `summarizeLaneDispatch`.

- [ ] **Step 3: Extend `TaskAnalysis` with fields needed for summaries**

Modify `src/orchestrator/analyzer.ts` return shape to include:

```ts
return {
  domain,
  complexity,
  recommendedAgent,
  fallbackAgents: recommendedAgent === "pm" ? ["commander"] : ["pm"],
  executionMode,
  needsDecomposition: complexity !== "simple",
  rationale: [
    `当前任务被识别为 ${domain} 域`,
    `当前复杂度判断为 ${complexity}`,
    `当前执行方式建议为 ${executionMode}`,
  ],
  risks: [
    ...(complexity === "simple" ? [] : ["任务包含多步或跨角色协作，需要中间结果回收"]),
    ...blockedReasons.map((reason) => `当前存在阻塞：${reason}`),
  ],
  expectedNextAgents,
  suggestedStepCount:
    complexity === "simple" ? 1 : complexity === "multi_step" ? 3 : 4,
  specialistCount: new Set(expectedNextAgents.filter((agent) => agent !== "pm")).size,
};
```

Also extend `src/core/types.ts`:

```ts
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
  suggestedStepCount: number;
  specialistCount: number;
}
```

- [ ] **Step 4: Implement topology and lane summary helpers**

`src/commands/topology.ts`

```ts
import type { TaskAnalysis } from "../core/types.js";
import type { TopologySummary } from "./types.js";

export function inferTopologyFromAnalysis(analysis: TaskAnalysis): TopologySummary {
  if (analysis.complexity === "simple") {
    return {
      topology: "single",
      reason: "任务简单，单 specialist 即可完成。",
      specialistCount: analysis.specialistCount,
      expectedAgents: analysis.expectedNextAgents,
    };
  }
  if (analysis.executionMode === "advisor_then_dispatch") {
    return {
      topology: "hybrid",
      reason: "需要先由顾问/PM拆解，再串行交接给 specialist。",
      specialistCount: analysis.specialistCount,
      expectedAgents: analysis.expectedNextAgents,
    };
  }
  return {
    topology: "sequential",
    reason: "任务存在多步依赖，建议串行推进。",
    specialistCount: analysis.specialistCount,
    expectedAgents: analysis.expectedNextAgents,
  };
}
```

`src/commands/result.ts`

```ts
import type { TaskAnalysis } from "../core/types.js";
import { buildTodoPolicySummary, resolveLaneContext } from "./lane-policy.js";
import { inferTopologyFromAnalysis } from "./topology.js";
import type { PmCommandLane } from "./types.js";

export function summarizeLaneDispatch({
  analysis,
  lane,
}: {
  analysis: TaskAnalysis;
  lane?: PmCommandLane;
}) {
  const laneContext = resolveLaneContext(lane);
  const topology = inferTopologyFromAnalysis(analysis);
  const todo = buildTodoPolicySummary(laneContext, analysis.suggestedStepCount);
  return { laneContext, topology, todo };
}
```

- [ ] **Step 5: Attach lane summary support in `src/orchestrator/plan.ts` without changing runtime ownership**

Add imports:

```ts
import { resolveLaneContext } from "../commands/lane-policy.js";
import { summarizeLaneDispatch } from "../commands/result.js";
import type { PmCommandLane } from "../commands/types.js";
```

Change `buildDispatchCommand` signature and returned shape:

```ts
export function buildDispatchCommand(
  projectDir: string,
  prompt?: string,
  lane?: PmCommandLane,
): DispatchCommand {
  const laneContext = resolveLaneContext(lane);
  // existing logic...
  const summary = summarizeLaneDispatch({ analysis, lane: laneContext.lane });

  return {
    ...plan,
    recommendedAgent: targetAgent,
    analysis,
    laneContext,
    topologySummary: summary.topology,
    todoPolicy: summary.todo,
    executableAgent,
    executablePrompt,
    command,
    commandArgs,
    handoffPacket,
  };
}
```

- [ ] **Step 6: Run tests to verify topology and summary coverage passes**

Run: `npm run build && node test/command-lane-analysis.test.mjs && node test/topology-summary.test.mjs`

Expected: PASS with topology and todo assertions succeeding.

- [ ] **Step 7: Commit**

```bash
git add src/commands/analysis.ts src/commands/topology.ts src/commands/result.ts src/orchestrator/analyzer.ts src/orchestrator/plan.ts src/core/types.ts src/shared.ts test/command-lane-analysis.test.mjs test/topology-summary.test.mjs
git commit -m "feat: add lane-aware topology summaries"
```

## Task 3: Implement mode-aware primary vs subagent dispatch routing

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/orchestrator/prompts.ts`
- Modify: `src/server/runtime.ts`
- Modify: `src/orchestrator/plan.ts`
- Test: `test/mode-aware-dispatch.test.mjs`

- [ ] **Step 1: Write the failing mode-aware dispatch tests**

```js
import assert from 'node:assert';
import {
  buildDispatchCommand,
  executeDispatchCommand,
  resolveAgentInvocationSemantics,
} from '../dist/index.js';

async function testInvocationSemantics() {
  const pm = resolveAgentInvocationSemantics('pm_workflow_caocao', 'primary');
  assert.deepStrictEqual(pm, {
    mode: 'primary',
    supportsDirectRun: true,
    requiresTaskPermission: false,
  });

  const specialist = resolveAgentInvocationSemantics('pm_workflow_frontend', 'subagent');
  assert.strictEqual(specialist.mode, 'subagent');
  assert.strictEqual(specialist.supportsDirectRun, false);
  assert.strictEqual(specialist.requiresTaskPermission, true);
}

await testInvocationSemantics();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node test/mode-aware-dispatch.test.mjs`

Expected: FAIL because `resolveAgentInvocationSemantics` does not exist.

- [ ] **Step 3: Split primary and subagent command construction in `src/orchestrator/prompts.ts`**

Add helpers:

```ts
export function buildPrimaryDispatchCommandStrings(
  sessionID: string | null | undefined,
  executableAgent: string,
  executablePrompt: string,
) {
  return sessionID
    ? {
        command: `opencode run --session ${sessionID} --agent ${executableAgent} "${escapePrompt(executablePrompt)}"`,
        commandArgs: ["run", "--session", sessionID, "--agent", executableAgent, executablePrompt],
      }
    : {
        command: `opencode run --agent ${executableAgent} "${escapePrompt(executablePrompt)}"`,
        commandArgs: ["run", "--agent", executableAgent, executablePrompt],
      };
}

export function buildSubagentDispatchCommandStrings(
  sessionID: string | null | undefined,
  executableAgent: string,
  executablePrompt: string,
) {
  const baseArgs = ["run"];
  if (sessionID) baseArgs.push("--session", sessionID);
  baseArgs.push(executablePrompt);
  return {
    command: sessionID
      ? `opencode run --session ${sessionID} "@${executableAgent} ${escapePrompt(executablePrompt)}"`
      : `opencode run "@${executableAgent} ${escapePrompt(executablePrompt)}"`,
    commandArgs: [...baseArgs],
  };
}
```

Keep `buildDispatchCommandStrings(...)` as a compatibility wrapper for primary-only callers until all call sites are updated.

- [ ] **Step 4: Implement invocation resolution and executors in `src/server/runtime.ts`**

Add helpers:

```ts
export function resolveAgentInvocationSemantics(
  executableAgent: string,
  configuredMode: "primary" | "subagent" | "all" = "primary",
) {
  if (configuredMode === "subagent") {
    return {
      mode: "subagent",
      supportsDirectRun: false,
      requiresTaskPermission: true,
    };
  }
  if (configuredMode === "all") {
    return {
      mode: "all",
      supportsDirectRun: true,
      requiresTaskPermission: false,
    };
  }
  return {
    mode: "primary",
    supportsDirectRun: true,
    requiresTaskPermission: false,
  };
}

export function executeDispatchByMode(projectPath: string, dispatch: ReturnType<typeof buildDispatchCommand>, prompt: string) {
  return dispatch.invocationSemantics?.mode === "subagent"
    ? executeSubagentDispatch(projectPath, dispatch, prompt)
    : executePrimaryDispatch(projectPath, dispatch, prompt);
}
```

Replace calls to `spawnSync("opencode", dispatch.commandArgs, ...)` in `executeDispatchCommand(...)` with the new mode-aware dispatcher.

- [ ] **Step 5: Thread configured mode from plan building into dispatch command results**

In `src/orchestrator/plan.ts`, resolve agent config mode before constructing command strings:

```ts
const configuredAgent = config.agents.definitions[executableAgent];
const invocationSemantics = resolveAgentInvocationSemantics(
  executableAgent,
  configuredAgent?.mode || config.agents.default_mode,
);
const { command, commandArgs } = invocationSemantics.mode === "subagent"
  ? buildSubagentDispatchCommandStrings(sessionID, executableAgent, executablePrompt)
  : buildPrimaryDispatchCommandStrings(sessionID, executableAgent, executablePrompt);
```

Return the semantics on the dispatch result:

```ts
return {
  ...plan,
  recommendedAgent: targetAgent,
  analysis,
  laneContext,
  topologySummary: summary.topology,
  todoPolicy: summary.todo,
  invocationSemantics,
  executableAgent,
  executablePrompt,
  command,
  commandArgs,
  handoffPacket,
};
```

- [ ] **Step 6: Run tests to verify mode-aware routing passes**

Run: `npm run build && node test/mode-aware-dispatch.test.mjs && node test/dispatch-quality-loop.test.mjs`

Expected: PASS with subagents no longer using primary-path command construction.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/orchestrator/prompts.ts src/server/runtime.ts src/orchestrator/plan.ts test/mode-aware-dispatch.test.mjs
git commit -m "fix: route subagents through mode-aware dispatch"
```

## Task 4: Surface lane/topology/todo/automation metadata in dispatch tools

**Files:**
- Modify: `src/server/tools/dispatch-tools.ts`
- Modify: `src/server/runtime.ts`
- Modify: `src/core/types.ts`
- Test: `test/dispatch-quality-loop.test.mjs`
- Test: `test/command-lane-analysis.test.mjs`

- [ ] **Step 1: Write the failing tool-format assertions**

```js
import assert from 'node:assert';
import { formatTaskAnalysisLines } from '../dist/server/tools/dispatch-tools.js';
import { buildDispatchCommand } from '../dist/orchestrator/plan.js';

async function testDispatchFormatting(projectDir) {
  const dispatch = buildDispatchCommand(projectDir, '修复认证接口 401 并确认不影响现有登录流程', 'medium');
  const lines = formatTaskAnalysisLines(dispatch.analysis, dispatch);

  assert.ok(lines.some((line) => line.includes('lane context: medium/moderate/assisted')));
  assert.ok(lines.some((line) => line.includes('topology: sequential')));
  assert.ok(lines.some((line) => line.includes('todo policy: create=yes')));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node test/dispatch-quality-loop.test.mjs`

Expected: FAIL because the formatter does not yet print lane/topology/todo lines.

- [ ] **Step 3: Extend formatter helpers in `src/server/tools/dispatch-tools.ts`**

Update the signature and lines returned by `formatTaskAnalysisLines`:

```ts
export function formatTaskAnalysisLines(
  analysis?: TaskAnalysis,
  dispatch?: Pick<
    ReturnType<typeof buildDispatchCommand>,
    "laneContext" | "topologySummary" | "todoPolicy" | "invocationSemantics"
  >,
): string[] {
  if (!analysis) {
    return ["- task analysis: unavailable"];
  }

  const extra = dispatch
    ? [
        `- lane context: ${dispatch.laneContext?.lane}/${dispatch.laneContext?.risk}/${dispatch.laneContext?.automation}`,
        `- topology: ${dispatch.topologySummary?.topology} (${dispatch.topologySummary?.reason})`,
        `- todo policy: create=${dispatch.todoPolicy?.shouldCreate ? "yes" : "no"} shape=${dispatch.todoPolicy?.preferredShape}`,
        `- invocation semantics: mode=${dispatch.invocationSemantics?.mode} direct=${dispatch.invocationSemantics?.supportsDirectRun ? "yes" : "no"}`,
      ]
    : [];

  return [
    `- task analysis: domain=${analysis.domain} complexity=${analysis.complexity} mode=${analysis.executionMode}`,
    ...extra,
    `- task analysis agent: recommended=${analysis.recommendedAgent} fallback=${analysis.fallbackAgents.join(",") || "none"}`,
    `- task analysis decomposition: ${analysis.needsDecomposition ? "yes" : "no"}`,
  ];
}
```

- [ ] **Step 4: Include structured metadata in dry-run/run/execute/loop outputs**

Wherever `buildDispatchCommand(projectPath, prompt)` is used, change to:

```ts
const dispatch = buildDispatchCommand(projectPath, prompt, lane);
```

Add structured result blocks alongside the textual lines:

```ts
const structured = {
  laneContext: dispatch.laneContext,
  topologySummary: dispatch.topologySummary,
  todoPolicy: dispatch.todoPolicy,
  invocationSemantics: dispatch.invocationSemantics,
  automationDecision: {
    canAutoContinue: evaluation?.canAutoContinue ?? false,
    autoContinueSafe: evaluation?.autoContinueSafe ?? false,
  },
};
```

Ensure tool messages still stay readable while including this object in the result payload.

- [ ] **Step 5: Run tests to verify tool summaries pass**

Run: `npm run build && node test/dispatch-quality-loop.test.mjs && node test/command-lane-analysis.test.mjs`

Expected: PASS with lane/topology/todo/invocation lines visible in formatter output.

- [ ] **Step 6: Commit**

```bash
git add src/server/tools/dispatch-tools.ts src/server/runtime.ts src/core/types.ts test/dispatch-quality-loop.test.mjs test/command-lane-analysis.test.mjs
git commit -m "feat: expose lane and topology in dispatch tools"
```

## Task 5: Add command-lane UX files, TUI registration, and package publishing support

**Files:**
- Create: `commands/pm-quick.md`
- Create: `commands/pm-medium.md`
- Create: `commands/pm-full.md`
- Create: `commands/pm-debug.md`
- Modify: `src/tui/commands.ts`
- Modify: `src/tui/toasts.ts`
- Modify: `src/tui/plugin.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing package/TUI smoke assertions**

```js
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
assert.ok(pkg.files.includes('commands'), 'commands directory must be published');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/model-inventory.test.mjs`

Expected: Existing tests still pass, but the new package assertion should FAIL until `commands` is added to `files`.

- [ ] **Step 3: Create lane command markdown files**

`commands/pm-medium.md`

```md
---
description: Medium-risk PM workflow lane with structured dispatch summaries
agent: pm_workflow_caocao
subtask: true
---

Use the pm-workflow runtime as the single source of truth.

Requirements:
1. Analyze the user task before choosing any specialist.
2. Pass lane context equivalent to:
   - lane=medium
   - risk=moderate
   - automation=assisted
   - topologyVerbosity=structured
   - reviewExpectation=standard
3. Prefer todo creation when the task needs 3 or more steps.
4. If a specialist is required, dispatch through PM orchestration; do not bypass directly to the specialist as the lane entry.
5. Minimize unnecessary user confirmations.
```

Create analogous files for `pm-quick.md`, `pm-full.md`, and `pm-debug.md`, changing only the lane semantics and todo/review posture.

- [ ] **Step 4: Register TUI slash commands and improve toast summaries**

Add to `src/tui/commands.ts` within the registered command array:

```ts
{
  title: "pm-workflow /pm-medium",
  value: "pm-medium",
  description: "以 medium lane 进入 PM orchestration",
  category: "pm-workflow",
  slash: { name: "pm-medium" },
  onSelect: () => showDispatchToast(6500),
}
```

Add equivalent items for `pm-quick`, `pm-full`, `pm-debug`.

Update `src/tui/toasts.ts` dispatch toast formatting so it can display lane/topology when present:

```ts
const lanePrefix = dispatch.laneContext
  ? `[${dispatch.laneContext.lane}/${dispatch.topologySummary?.topology || "single"}] `
  : "";
message: `${lanePrefix}${dispatch.reason}${blockedSuffix}`,
```

- [ ] **Step 5: Publish the command files in `package.json`**

Update the `files` array:

```json
"files": [
  "dist",
  "commands",
  "skills",
  "scripts",
  "pm-workflow.schema.json",
  "pm-workflow.config.example.json",
  "README.md",
  "CHANGELOG.md",
  "tsconfig.json",
  "tsconfig.build.json"
]
```

Also update the test script:

```json
"test": "node test/workflow-redesign.test.mjs && node test/dispatch-quality-loop.test.mjs && node test/model-inventory.test.mjs && node test/command-lane-analysis.test.mjs && node test/mode-aware-dispatch.test.mjs && node test/topology-summary.test.mjs"
```

- [ ] **Step 6: Run build and test to verify TUI/package changes pass**

Run: `npm run build && npm test`

Expected: PASS with the new command/test files included and no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add commands/pm-quick.md commands/pm-medium.md commands/pm-full.md commands/pm-debug.md src/tui/commands.ts src/tui/toasts.ts src/tui/plugin.ts package.json
git commit -m "feat: add command lane UX entrypoints"
```

## Task 6: Update docs and final verification

**Files:**
- Modify: `README.md`
- Create: `docs/dev/command-lane-mapping.md`
- Create: `docs/dev/subagent-dispatch-migration.md`
- Test: `npm test`
- Test: `npm run verify-release`

- [ ] **Step 1: Write the failing docs expectation check**

```js
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf-8');
assert.ok(readme.includes('Command Lanes'), 'README should document command lanes');
assert.ok(readme.includes('mode-aware dispatch'), 'README should explain specialist routing changes');
```

- [ ] **Step 2: Run the docs check to verify it fails**

Run: `node test/command-lane-analysis.test.mjs`

Expected: FAIL until `README.md` includes the new sections.

- [ ] **Step 3: Update `README.md` with command lane and routing guidance**

Add a new section after “常用工具”:

```md
## Command Lanes

本包支持以下 lane 风格入口：

- `pm-quick`
- `pm-medium`
- `pm-full`
- `pm-debug`

这些 command 只是 UX facade，不是第二套 runtime。所有真实判断仍由 `pm_workflow_caocao` + `pm-*` tools 完成。

## Mode-Aware Dispatch

PM 仍是唯一 primary orchestrator。specialist agent 若为 subagent，将通过 subagent-safe 路径执行，而不是被错误地按 primary path 直跑。
```

- [ ] **Step 4: Write the two new dev docs**

`docs/dev/command-lane-mapping.md`

```md
# Command Lane Mapping

| Lane | Default Risk | Automation | Todo Posture | Typical Runtime Entry |
| --- | --- | --- | --- | --- |
| quick | low | guided | optional | `pm-dry-run-dispatch` or `pm-execute-dispatch` |
| medium | moderate | assisted | recommended for 3+ steps | `pm-execute-dispatch` |
| full | high | elevated | phased by default | `pm-run-loop` |
| debug | debug | assisted | reproduce/isolate/fix/verify | `pm-run-loop` |
```

`docs/dev/subagent-dispatch-migration.md`

```md
# Subagent Dispatch Migration

## Problem

Some specialist agents are configured as subagents, but older dispatch flows built primary-path commands.

## Migration

1. Resolve agent invocation semantics from workflow config.
2. Use primary-path commands only for `primary` / `all` agents.
3. Use subagent-safe task/session routing for `subagent` agents.
4. Keep PM as the only lane entrypoint.
```

- [ ] **Step 5: Run full verification**

Run: `npm test && npm run verify-release`

Expected: PASS with `typecheck`, `build`, `smoke`, and `pack-dry-run` all succeeding.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/dev/command-lane-mapping.md docs/dev/subagent-dispatch-migration.md
git commit -m "docs: document command lanes and mode-aware routing"
```

## Self-Review Checklist

- Spec coverage: the plan covers lane UX, explicit lane context, mode-aware routing, todo-aware orchestration, topology summary, TUI integration, tests, docs, and publishing.
- Placeholder scan: no `TODO`, `TBD`, “similar to above”, or unspecified code/test steps remain.
- Type consistency: all plan snippets use the same names: `PmLaneContext`, `ExecutionTopology`, `resolveLaneContext`, `inferTopologyFromAnalysis`, `summarizeLaneDispatch`, `resolveAgentInvocationSemantics`, `executeDispatchByMode`.

## Recommended execution order

1. Task 1 — lane policy foundation
2. Task 2 — topology and structured summaries
3. Task 3 — mode-aware runtime dispatch
4. Task 4 — tool output enrichment
5. Task 5 — commands/TUI/package wiring
6. Task 6 — docs and final verification
