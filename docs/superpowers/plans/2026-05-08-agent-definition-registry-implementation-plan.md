# Agent Definition Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 pm-workflow 优先从项目级与全局级 `opencode/agents/*.md` 读取 agent 定义，并保证最终 resolved agent 的 `model`、`mode`、`description` 与这些文件匹配；仅在主路径缺失时低优先级兼容 legacy `agent` 目录与现有内部 fallback。

**Architecture:** 本次改造分三层推进。第一层新增 agent discovery / parsing / registry 模块，统一处理 `.opencode/agents`、`~/.config/opencode/agents` 以及低优先级 legacy `agent` 目录，并输出结构化 resolved definitions。第二层将现有 config/runtime 的角色解析改为优先消费 registry，同时保留 `dispatch_map` 与默认 definitions 作为兼容兜底。第三层补齐 analyzer、diagnostics、model inventory 与 dispatch 集成测试，确保所有最终 agent 的模型 id 与 `agents/*.md` frontmatter 匹配，不被内部默认值静默覆盖。

**Tech Stack:** TypeScript、Node.js、YAML frontmatter 解析、现有 `test/*.test.mjs` 回归测试、`npm run build`、`npm test`

---

## File Structure

### Existing files to modify

- `src/core/config.ts`
  - 接入 agent registry 解析逻辑，调整默认 definitions / dispatch_map 的定位为 fallback。
- `src/core/types.ts`
  - 新增 registry 相关类型、resolved agent diagnostics 类型。
- `src/server/runtime.ts`
  - auto-continue 与 dispatch 过程改为消费 registry 解析结果，并输出来源/目录类型/兜底信息。
- `src/orchestrator/analyzer.ts`
  - 补齐 `researcher`、`tech-lead` 的语义识别与推荐角色映射。
- `src/shared.ts`
  - 导出新的 agent registry / resolver API，供 runtime、测试和外部调用使用。
- `pm-workflow.config.example.json`
  - 文档化 `dispatch_map` 与 `definitions` 的“兼容/兜底”定位，避免继续表达成首要事实源。
- `README.md`
  - 更新 agent 定义来源说明，明确 `opencode/agents/*.md` 为权威来源。
- `docs/runbooks/pm-workflow-usage-flow.md`
  - 增加 agent 来源与 diagnostics 说明。
- `docs/dev/pm-workflow-architecture-overview.md`
  - 补 architecture 里关于 agent registry 与 source precedence 的说明。
- `docs/dev/pm-workflow-routing-and-auto-continue.md`
  - 补 registry/source/fallback 与 mode-aware dispatch 的协作说明。

### New files to create

- `src/core/agent-registry.ts`
  - 统一封装 discovery、parsing、merge、fallback 与 resolved result 结构。
- `test/agent-registry.test.mjs`
  - 覆盖 `agents` 优先于 `agent`、项目优先于全局、frontmatter 模型 id 匹配、fallback diagnostics。

### Files to inspect during implementation

- `docs/superpowers/specs/2026-05-08-agent-definition-registry-design.md`
  - 本次实现的设计依据，尤其是 source precedence、legacy `agent` 兼容、model id matching 与 diagnostics 规则。
- `docs/dev/pm-workflow-compatibility-audit.md`
  - 已确认 OpenCode 支持 `~/.config/opencode/agents/*.md` 与 `.opencode/agents/*.md`。
- `test/model-inventory.test.mjs`
  - 现有模型库存校验测试，需要扩展为“registry 最终结果是否与 `agents/*.md` 匹配”。
- `test/mode-aware-dispatch.test.mjs`
  - 现有 mode-aware dispatch 测试，需要扩展来源与 resolved model 断言。

### No new orchestration runtime

- 不新增第二套 dispatch runtime。
- 不把 analyzer 改成依赖自由文本动态理解 agent 的系统。
- 不新增复杂 capability schema 或 metadata 治理系统。

---

### Task 1: 定义 Agent Registry 类型与最小对外 API

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/agent-registry.ts`
- Test: `test/agent-registry.test.mjs`

- [ ] **Step 1: 先写失败测试，锁定 registry 需要暴露的最小结构**

新建 `test/agent-registry.test.mjs`，先写一个最小结构断言测试，例如：

```js
import assert from 'node:assert';
import { resolveWorkflowAgentDefinition } from '../dist/index.js';

async function testResolvedAgentShape() {
  const resolved = resolveWorkflowAgentDefinition({
    projectDir: process.cwd(),
    semanticAgent: 'frontend',
  });

  assert.strictEqual(typeof resolved.id, 'string');
  assert.ok(['project', 'global', 'fallback'].includes(resolved.source));
  assert.ok(['agents', 'agent', 'fallback', undefined].includes(resolved.directoryKind));
  assert.strictEqual(typeof resolved.usedFallback, 'boolean');
}

await testResolvedAgentShape();
```

- [ ] **Step 2: 运行测试，确认因为 API 尚不存在而失败**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/agent-registry.test.mjs
```

Expected:

```text
SyntaxError / TypeError / ERR_MODULE_NOT_FOUND
```

失败原因应体现 `resolveWorkflowAgentDefinition` 或相关导出尚不存在。

- [ ] **Step 3: 在 `src/core/types.ts` 中定义 registry 相关类型**

加入以下类型定义：

```ts
export type AgentDefinitionSource = "project" | "global" | "fallback";

export type AgentDirectoryKind = "agents" | "agent" | "fallback";

export interface ResolvedAgentDefinition {
  id: string;
  model?: string;
  mode?: string;
  description?: string;
  source: AgentDefinitionSource;
  directoryKind?: AgentDirectoryKind;
  filePath?: string;
  shadowedGlobal: boolean;
  usedFallback: boolean;
  fallbackReason?:
    | "missing-agent"
    | "missing-model"
    | "missing-mode"
    | "parse-failed";
}

export interface ResolveWorkflowAgentInput {
  projectDir: string;
  semanticAgent: DispatchAgent;
}
```

- [ ] **Step 4: 在 `src/core/agent-registry.ts` 中先创建空实现与导出骨架**

先写最小可编译骨架：

```ts
import type { ResolveWorkflowAgentInput, ResolvedAgentDefinition } from "./types.js";

export function resolveWorkflowAgentDefinition(
  input: ResolveWorkflowAgentInput,
): ResolvedAgentDefinition {
  return {
    id: input.semanticAgent,
    source: "fallback",
    directoryKind: "fallback",
    shadowedGlobal: false,
    usedFallback: true,
    fallbackReason: "missing-agent",
  };
}
```

- [ ] **Step 5: 在 `src/shared.ts` 中导出该 API**

加入：

```ts
export { resolveWorkflowAgentDefinition } from "./core/agent-registry.js";
```

- [ ] **Step 6: 重新构建并运行单测，确认 shape 测试通过**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/agent-registry.test.mjs
```

Expected:

```text
agent registry tests passed
```

如果还未打印通过文本，就在测试末尾补：

```js
console.log('agent registry tests passed');
```

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/core/agent-registry.ts src/shared.ts test/agent-registry.test.mjs
git commit -m "feat: add workflow agent registry types"
```

---

### Task 2: 实现 `agents` 主路径优先、`agent` 仅兼容兜底的 discovery 与 merge

**Files:**
- Modify: `src/core/agent-registry.ts`
- Test: `test/agent-registry.test.mjs`

- [ ] **Step 1: 先补失败测试，锁定目录优先级顺序**

在 `test/agent-registry.test.mjs` 增加临时目录用例，构造：

- `<project>/.opencode/agents/frontend.md`
- `<project>/.opencode/agent/frontend.md`
- `<configHome>/opencode/agents/frontend.md`

断言最终一定选项目级 `agents`：

```js
assert.strictEqual(resolved.source, 'project');
assert.strictEqual(resolved.directoryKind, 'agents');
assert.ok(resolved.filePath.endsWith('/.opencode/agents/frontend.md'));
assert.strictEqual(resolved.shadowedGlobal, true);
```

- [ ] **Step 2: 运行测试，确认当前空实现失败**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/agent-registry.test.mjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: 在 `src/core/agent-registry.ts` 中实现目录发现函数**

加入这些小函数：

```ts
import { existsSync, readdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function getAgentSearchDirs(projectDir: string) {
  const globalBase = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode");
  return [
    { source: "project" as const, directoryKind: "agents" as const, dir: join(projectDir, ".opencode", "agents") },
    { source: "global" as const, directoryKind: "agents" as const, dir: join(globalBase, "agents") },
    { source: "project" as const, directoryKind: "agent" as const, dir: join(projectDir, ".opencode", "agent") },
    { source: "global" as const, directoryKind: "agent" as const, dir: join(globalBase, "agent") },
  ];
}

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(dir, name));
}
```

- [ ] **Step 4: 实现“首次命中即胜出”的候选收集规则**

在 registry 里把同名 agent 的合并逻辑写成：

```ts
type CandidateMeta = {
  id: string;
  source: "project" | "global";
  directoryKind: "agents" | "agent";
  filePath: string;
  raw: string;
};

function collectAgentCandidates(projectDir: string): Map<string, CandidateMeta[]> {
  const result = new Map<string, CandidateMeta[]>();
  for (const searchDir of getAgentSearchDirs(projectDir)) {
    for (const filePath of listMarkdownFiles(searchDir.dir)) {
      const id = filePath.replace(/.*\/|\.md$/g, "");
      const list = result.get(id) || [];
      list.push({
        id,
        source: searchDir.source,
        directoryKind: searchDir.directoryKind,
        filePath,
        raw: readFileSync(filePath, "utf-8"),
      });
      result.set(id, list);
    }
  }
  return result;
}
```

注意：顺序必须保持 `project agents -> global agents -> project agent -> global agent`。

- [ ] **Step 5: 重新运行测试，确认 precedence 用例通过**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/agent-registry.test.mjs
```

Expected:

```text
agent registry tests passed
```

- [ ] **Step 6: Commit**

```bash
git add src/core/agent-registry.ts test/agent-registry.test.mjs
git commit -m "feat: discover opencode agents with precedence"
```

---

### Task 3: 解析 `agents/*.md` frontmatter，并保证 model/mode/description 与文件匹配

**Files:**
- Modify: `src/core/agent-registry.ts`
- Test: `test/agent-registry.test.mjs`

- [ ] **Step 1: 先补失败测试，锁定 frontmatter 字段匹配**

在测试中写入一个真实 frontmatter 文件，例如：

```md
---
description: Frontend agent from project agents
mode: subagent
model: bestool-route-ant/antigravity/gemini-3-flash-preview
temperature: 0.2
---
你是前端 agent。
```

然后断言：

```js
assert.strictEqual(resolved.model, 'bestool-route-ant/antigravity/gemini-3-flash-preview');
assert.strictEqual(resolved.mode, 'subagent');
assert.strictEqual(resolved.description, 'Frontend agent from project agents');
assert.strictEqual(resolved.usedFallback, false);
```

- [ ] **Step 2: 运行测试，确认当前因未解析 frontmatter 失败**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/agent-registry.test.mjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: 在 registry 中增加 frontmatter 解析函数**

不要引入复杂依赖，先实现最小 YAML frontmatter 解析：

```ts
function parseSimpleFrontmatter(raw: string): Record<string, string> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split(/\n+/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && value && !value.startsWith("true") && !value.startsWith("false")) {
      result[key] = value;
    }
  }
  return result;
}
```

- [ ] **Step 4: 将 frontmatter 结果映射为 resolved definition**

在 `resolveWorkflowAgentDefinition(...)` 内部，把胜出的 candidate 转成：

```ts
const frontmatter = parseSimpleFrontmatter(candidate.raw);
return {
  id: candidate.id,
  model: frontmatter.model,
  mode: frontmatter.mode,
  description: frontmatter.description,
  source: candidate.source,
  directoryKind: candidate.directoryKind,
  filePath: candidate.filePath,
  shadowedGlobal: candidates.some((item) => item.source === "global"),
  usedFallback: false,
};
```

- [ ] **Step 5: 为真实全局样例补一个回归断言**

在测试里增加一个只在样例存在时执行的断言块，参考当前真实全局文件 `qa_engineer.md`：

```js
if (process.env.RUN_REAL_AGENT_FIXTURES === '1') {
  const resolved = resolveWorkflowAgentDefinition({
    projectDir: process.cwd(),
    semanticAgent: 'qa_engineer',
  });
  assert.strictEqual(resolved.directoryKind, 'agents');
  assert.strictEqual(resolved.mode, 'subagent');
  assert.strictEqual(resolved.model, 'bestool-route-kr/kr/claude-haiku-4.5');
}
```

默认不强依赖真实用户环境，但保留一个可选真实验证入口。

- [ ] **Step 6: 重新运行测试，确认 frontmatter 匹配通过**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/agent-registry.test.mjs
```

Expected:

```text
agent registry tests passed
```

- [ ] **Step 7: Commit**

```bash
git add src/core/agent-registry.ts test/agent-registry.test.mjs
git commit -m "feat: parse opencode agent frontmatter"
```

---

### Task 4: 接入 fallback，确保 `agents` 中已有 model/description 时不被内部默认值覆盖

**Files:**
- Modify: `src/core/config.ts`
- Modify: `src/core/agent-registry.ts`
- Test: `test/agent-registry.test.mjs`
- Test: `test/model-inventory.test.mjs`

- [ ] **Step 1: 先补失败测试，锁定 fallback 只在字段缺失时补齐**

在 `test/agent-registry.test.mjs` 加入用例：

1. `agents/frontend.md` 里有 `model`、`description`
2. 内部默认 definitions 里有不同的 `model`

断言：

```js
assert.strictEqual(resolved.model, 'bestool-route-ant/antigravity/gemini-3-flash-preview');
assert.strictEqual(resolved.description, 'Frontend agent from project agents');
assert.strictEqual(resolved.usedFallback, false);
```

再加一个缺 `mode` 的用例：

```js
assert.strictEqual(resolved.mode, 'all');
assert.strictEqual(resolved.usedFallback, true);
assert.strictEqual(resolved.fallbackReason, 'missing-mode');
```

- [ ] **Step 2: 运行测试，确认当前还没有字段级 fallback 逻辑**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/agent-registry.test.mjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: 在 `src/core/config.ts` 抽出 semantic agent -> executable agent 的 fallback 解析辅助函数**

新增一个内部函数，供 registry 使用：

```ts
export function getConfiguredExecutableAgent(
  semanticAgent: DispatchAgent,
  config: WorkflowConfig,
): string {
  return config.agents.dispatch_map[semanticAgent] || semanticAgent;
}
```

若当前已有同类函数，优先复用，不要制造重复实现。

- [ ] **Step 4: 在 registry 中实现字段级 fallback merge**

将胜出 candidate 与 fallback 定义合并为：

```ts
const fallbackDefinition = config.agents.definitions[executableAgent] || {};

const resolved: ResolvedAgentDefinition = {
  id: executableAgent,
  model: frontmatter.model || fallbackDefinition.model,
  mode: frontmatter.mode || fallbackDefinition.mode,
  description: frontmatter.description || fallbackDefinition.description,
  source: candidate.source,
  directoryKind: candidate.directoryKind,
  filePath: candidate.filePath,
  shadowedGlobal,
  usedFallback: !frontmatter.model || !frontmatter.mode || !frontmatter.description,
  fallbackReason: !frontmatter.model
    ? 'missing-model'
    : !frontmatter.mode
      ? 'missing-mode'
      : !frontmatter.description
        ? 'parse-failed'
        : undefined,
};
```

注意：如果 `frontmatter.model` 已存在，绝不能被 `fallbackDefinition.model` 覆盖。

- [ ] **Step 5: 扩展 `test/model-inventory.test.mjs`，校验 registry 结果与 agents frontmatter 匹配**

在测试中增加：

```js
import { resolveWorkflowAgentDefinition } from '../dist/index.js';

const qaResolved = resolveWorkflowAgentDefinition({
  projectDir,
  semanticAgent: 'qa_engineer',
});

assert.strictEqual(qaResolved.model, 'bestool-route-kr/kr/claude-haiku-4.5');
assert.strictEqual(qaResolved.mode, 'subagent');
```

这里需要在测试夹具里自行创建 `configHome/opencode/agents/qa_engineer.md`，不要依赖真实本机环境。

- [ ] **Step 6: 重新运行两组测试，确认字段级 fallback 行为通过**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/agent-registry.test.mjs && PATH="/opt/homebrew/bin:$PATH" node test/model-inventory.test.mjs
```

Expected:

```text
agent registry tests passed
global OpenCode model inventory tests passed
```

- [ ] **Step 7: Commit**

```bash
git add src/core/config.ts src/core/agent-registry.ts test/agent-registry.test.mjs test/model-inventory.test.mjs
git commit -m "feat: resolve agent definitions with fallback merge"
```

---

### Task 5: 让 runtime / dispatch 消费 resolved agent，并输出来源诊断信息

**Files:**
- Modify: `src/server/runtime.ts`
- Modify: `src/shared.ts`
- Test: `test/mode-aware-dispatch.test.mjs`

- [ ] **Step 1: 先补失败测试，锁定 auto-continue 的 resolved agent 诊断信息**

在 `test/mode-aware-dispatch.test.mjs` 的 `testAutoContinueDispatchUsesInvocationSemantics()` 中追加断言：

```js
assert.strictEqual(autoDispatch?.resolvedAgent?.source, 'project');
assert.strictEqual(autoDispatch?.resolvedAgent?.directoryKind, 'agents');
assert.strictEqual(autoDispatch?.resolvedAgent?.usedFallback, false);
```

如果当前 `DispatchCommand` 类型里没有该字段，测试应先失败。

- [ ] **Step 2: 运行测试，确认当前结构不含 resolved diagnostics**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/mode-aware-dispatch.test.mjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: 在相关类型中给 `DispatchCommand` 增加 resolved agent 诊断字段**

在 `src/core/types.ts` 的 `DispatchCommand` 上补：

```ts
resolvedAgent?: ResolvedAgentDefinition;
```

- [ ] **Step 4: 在 `src/server/runtime.ts` 用 registry 结果替代直接 `dispatch_map` 查找**

将这一段：

```ts
const executableAgent = getExecutableAgent(
  evaluation.recommendedNextAgent,
  config.agents.dispatch_map,
);
```

改为：

```ts
const resolvedAgent = resolveWorkflowAgentDefinition({
  projectDir,
  semanticAgent: evaluation.recommendedNextAgent,
});

const executableAgent = resolvedAgent.id;
```

并把 `resolvedAgent` 放进返回对象：

```ts
resolvedAgent,
```

- [ ] **Step 5: 让 invocation mode 继续基于 resolved mode / 角色语义工作**

如果 `resolvedAgent.mode` 存在，则调用语义优先参考它；若缺失，再按当前角色语义兜底。最小改法可保持：

```ts
const invocationMode =
  evaluation.recommendedNextAgent === 'pm'
    ? 'primary'
    : resolvedAgent.mode === 'primary'
      ? 'primary'
      : 'subagent';
```

注意：这里不要破坏已通过的 mode-aware dispatch 回归用例。

- [ ] **Step 6: 重新运行 dispatch 测试，确认来源信息与调用语义都通过**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/mode-aware-dispatch.test.mjs
```

Expected:

```text
mode-aware dispatch tests passed
```

如果测试文件没有该输出，请在末尾补：

```js
console.log('mode-aware dispatch tests passed');
```

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/server/runtime.ts src/shared.ts test/mode-aware-dispatch.test.mjs
git commit -m "feat: attach resolved agent diagnostics to dispatch"
```

---

### Task 6: 补齐 `researcher` / `tech-lead` 路由，并让它们也通过 registry 解析

**Files:**
- Modify: `src/orchestrator/analyzer.ts`
- Modify: `src/core/config.ts`
- Test: `test/agent-registry.test.mjs`
- Test: `test/workflow-redesign.test.mjs`

- [ ] **Step 1: 先补失败测试，锁定两个新语义域的最小识别规则**

在 `test/workflow-redesign.test.mjs` 增加断言，例如：

```js
const research = analyzeDispatchTask({
  prompt: '请调研 OpenCode agent 目录规范并整理对比结论',
  stage: 'planning',
});
assert.strictEqual(research.recommendedAgent, 'researcher');

const review = analyzeDispatchTask({
  prompt: '请做一次架构评审，重点看服务边界和扩展性风险',
  stage: 'review',
});
assert.strictEqual(review.recommendedAgent, 'tech-lead');
```

- [ ] **Step 2: 运行测试，确认当前 analyzer 尚未识别这些域**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/workflow-redesign.test.mjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: 在 `src/orchestrator/analyzer.ts` 补关键词与映射**

补充两类识别：

```ts
const researcherMatched =
  normalized.includes('调研') ||
  normalized.includes('资料搜索') ||
  normalized.includes('benchmark') ||
  normalized.includes('research');

const techLeadMatched =
  normalized.includes('架构评审') ||
  normalized.includes('技术评审') ||
  normalized.includes('architecture review') ||
  normalized.includes('设计审查');
```

并在 `inferDomain(...)` / `mapDomainToAgent(...)` 里补对应分支。

- [ ] **Step 4: 在 config fallback 层补两个角色的可解析映射**

若当前 `DispatchAgent`、`dispatch_map` 或 `DEFAULT_WORKFLOW_AGENTS` 尚未覆盖两个角色，需要补上最小兼容映射。要求：

- `researcher` 可解析到同名 agent 文件或 fallback agent id
- `tech-lead` 可解析到同名 agent 文件或 fallback agent id

具体实现要跟现有类型保持一致，不要临时发明新的语义名。

- [ ] **Step 5: 重新运行测试，确认两个新语义域进入 registry 解析路径**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" node test/workflow-redesign.test.mjs && PATH="/opt/homebrew/bin:$PATH" node test/agent-registry.test.mjs
```

Expected:

```text
workflow redesign tests passed
agent registry tests passed
```

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator/analyzer.ts src/core/config.ts test/workflow-redesign.test.mjs test/agent-registry.test.mjs
git commit -m "feat: add researcher and tech-lead routing"
```

---

### Task 7: 更新文档、示例配置定位，并做全量验证

**Files:**
- Modify: `README.md`
- Modify: `pm-workflow.config.example.json`
- Modify: `docs/runbooks/pm-workflow-usage-flow.md`
- Modify: `docs/dev/pm-workflow-architecture-overview.md`
- Modify: `docs/dev/pm-workflow-routing-and-auto-continue.md`

- [ ] **Step 1: 文档先写失败检查，锁定 `agents` 为主路径的表述**

在文档改动前先用搜索确认需要更新的位置，预期目标包括：

- `agents/*.md` 为权威来源
- `agent/` 仅 legacy 兼容兜底
- `dispatch_map` / `definitions` 为兼容层，不是首要事实源

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" rg "\.opencode/agent|~/.config/opencode/agent|dispatch_map|definitions" README.md docs pm-workflow.config.example.json
```

Expected:

```text
多个命中结果
```

- [ ] **Step 2: 更新 README 与架构文档表述**

确保文案覆盖以下内容：

- 项目级：`.opencode/agents/*.md`
- 全局级：`~/.config/opencode/agents/*.md`
- legacy：`agent/` 仅低优先级兼容
- `model` / `mode` / `description` 以 `agents/*.md` frontmatter 为准
- diagnostics 可见 `source` / `directoryKind` / `usedFallback`

- [ ] **Step 3: 更新示例配置的定位，而不是伪装成首要事实源**

在 `pm-workflow.config.example.json` 周边文档说明中明确：

- `dispatch_map` 负责语义角色到 agent id 的兼容映射
- `definitions` 负责 fallback 默认值
- 若 `opencode/agents/*.md` 存在，其 frontmatter 优先生效

- [ ] **Step 4: 运行全量验证**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" npm test
```

Expected:

```text
All verification tests passed successfully!
dispatch quality loop public exports ready
global OpenCode model inventory tests passed
agent registry tests passed
mode-aware dispatch tests passed
```

- [ ] **Step 5: Commit**

```bash
git add README.md pm-workflow.config.example.json docs/runbooks/pm-workflow-usage-flow.md docs/dev/pm-workflow-architecture-overview.md docs/dev/pm-workflow-routing-and-auto-continue.md
git commit -m "docs: clarify opencode agent registry precedence"
```

---

## Self-Review

- **Spec coverage:** 本计划覆盖了 spec 中的 discovery precedence、frontmatter parsing、fallback merge、diagnostics、`researcher` / `tech-lead` 路由、文档更新与全量验证要求。
- **Placeholder scan:** 无 `TODO`、`TBD`、`implement later`、`similar to` 这类占位表达；每个任务均给出实际文件、代码骨架与验证命令。
- **Type consistency:** `ResolvedAgentDefinition`、`directoryKind`、`usedFallback`、`fallbackReason` 等命名在各任务中保持一致；后续实现时若类型已有更合适命名，只允许一次性统一替换，不要在任务之间漂移。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-agent-definition-registry-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
