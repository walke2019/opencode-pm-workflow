# Agent 命名简化与角色合并实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 agent 名称从三国角色名简化为通用短名称，合并重复角色（QA+Writer→reviewer，前端双角色→frontend），移除硬编码模型 ID，并建立向后兼容映射。

**Architecture:** 在 config.ts 中建立旧名称到新名称的自动映射，更新所有内置定义、dispatch map、prompt 分支、analyzer 路由和测试断言，同步更新全部文档，发 0.2.0 minor 版本。

**Tech Stack:** TypeScript、OpenCode plugin API、npm

---

## 文件结构与职责映射

### 修改文件
- `src/core/config.ts`：内置 agent 定义、兼容映射、dispatch map
- `src/orchestrator/prompts.ts`：dispatch map、prompt 分支
- `src/orchestrator/analyzer.ts`：domain → agent 映射
- `AGENTS.md`：Agent 定义表、协作模型描述
- `README.md`：角色表
- `docs/01-技术架构.md`：角色表、架构图
- `docs/02-业务功能与任务流转.md`：角色边界表
- `CHANGELOG.md`：0.2.0 变更记录
- `package.json`：版本号升级
- `test/*.mjs`：相关断言更新

### 新名称映射表
| 旧名称 | 新名称 | 职责 |
| --- | --- | --- |
| `pm_workflow_caocao` | `pm_lead` | 主协调 |
| `pm_workflow_zhuge` | `pm_advisor` | 顾问 |
| `pm_workflow_lvbu` | `pm_backend` | 后端 |
| `pm_workflow_diaochan` | `pm_frontend` | 前端 |
| `pm_workflow_qa` | `pm_reviewer` | 审查/文档 |
| `pm_workflow_writer` | `pm_reviewer` | 审查/文档（合并） |
| `pm_workflow_frontend` | `pm_frontend` | 前端（合并） |
| `researcher` | `pm_researcher` | 调研 |

---

### Task 1: 更新 config.ts 内置定义与兼容映射

**Files:**
- Modify: `src/core/config.ts`

- [ ] **Step 1: 添加旧名称到新名称的兼容映射**

在 `config.ts` 顶部添加：

```typescript
// 旧三国角色名到新通用名称的自动映射（向后兼容）
const LEGACY_AGENT_MAP: Record<string, string> = {
  "pm_workflow_caocao": "pm_lead",
  "pm_workflow_zhuge": "pm_advisor",
  "pm_workflow_lvbu": "pm_backend",
  "pm_workflow_diaochan": "pm_frontend",
  "pm_workflow_qa": "pm_reviewer",
  "pm_workflow_writer": "pm_reviewer",
  "pm_workflow_frontend": "pm_frontend",
};

function normalizeAgentName(name: string): string {
  return LEGACY_AGENT_MAP[name] || name;
}
```

- [ ] **Step 2: 重写 DEFAULT_WORKFLOW_AGENTS 使用新名称**

将 `DEFAULT_WORKFLOW_AGENTS` 改为：

```typescript
const DEFAULT_WORKFLOW_AGENTS: Partial<Record<string, WorkflowAgentConfig>> = {
  pm_lead: {
    mode: "primary",
    description: "pm-workflow 主协调官，负责分析决策、规划分派、收敛验收。",
    prompt: "你是 pm-workflow 的主协调官。负责快速压缩需求，确定目标、边界、todo、验收标准与分派路径；随后直接推进开发、测试、发布摘要。你表达直接、务实、清晰，重视结果与验证。",
    permission: { edit: "ask", write: "ask", bash: "ask" },
  },
  pm_advisor: {
    mode: "primary",
    description: "拆解顾问，擅长任务拆解、风险识别与顾问式支持。",
    prompt: "你是 pm-workflow 的拆解顾问。擅长将复杂任务拆解为清晰的推进步骤，识别风险并提供顾问式支持。先澄清疑虑，再划定边界，最后给出合适的分派建议与推进顺序。",
    permission: { edit: "allow", write: "allow", bash: "allow" },
  },
  pm_backend: {
    mode: "all",
    description: "后端执行，负责 API、数据库、服务、性能。",
    prompt: "你是 pm-workflow 的后端 agent。专注于 API、数据库、服务逻辑与性能优化。追求代码质量与架构清晰。",
    permission: { edit: "allow", write: "allow", bash: "allow" },
  },
  pm_frontend: {
    mode: "all",
    description: "前端执行，负责 UI、交互、组件、响应式。",
    prompt: "你是 pm-workflow 的前端 agent。负责前端实现、UI/UX、组件拆分、响应式布局、可访问性和视觉一致性。",
    permission: { edit: "allow", write: "allow", bash: "allow" },
  },
  pm_reviewer: {
    mode: "all",
    hidden: true,
    description: "审查与文档，负责测试、回归、代码审查、文档与发布。",
    prompt: "你是 pm-workflow 的 reviewer agent。优先检查 bug、回归风险、安全问题和缺失测试；同时负责整理发布说明、变更摘要与用户可读文档。",
    permission: { edit: "ask", write: "ask", bash: "ask" },
  },
  pm_researcher: {
    mode: "all",
    hidden: true,
    description: "调研，负责资料检索、官方方案调研、事实比对。",
    prompt: "你是 pm-workflow 的 researcher agent。负责资料检索、官方方案调研、事实核查、备选路径比较与参考依据整理。不直接承担实现工作。",
    permission: { edit: "ask", write: "ask", bash: "ask" },
  },
};
```

注意：移除了所有 `model` 字段，改为从全局配置读取。

- [ ] **Step 3: 更新 dispatch_map 使用新名称**

```typescript
dispatch_map: {
  plan: "pm_advisor",
  build: "pm_backend",
  pm: "pm_lead",
  qa_engineer: "pm_reviewer",
  writer: "pm_reviewer",
  frontend: "pm_frontend",
  commander: "pm_advisor",
  backend: "pm_backend",
  researcher: "pm_researcher",
},
```

- [ ] **Step 4: 更新 fallback.agent_map 使用新名称**

```typescript
agent_map: {
  plan: "pm_advisor",
  build: "pm_backend",
  pm: "pm_lead",
  qa_engineer: "pm_reviewer",
  writer: "pm_reviewer",
  commander: "pm_advisor",
  backend: "pm_backend",
  frontend: "pm_frontend",
  researcher: "pm_researcher",
},
```

- [ ] **Step 5: 在 readWorkflowConfig 中应用名称归一化**

在合并配置后，对 agents.definitions 的 key 应用 `normalizeAgentName`：

```typescript
// 在 mergeWorkflowConfig 返回前
const normalizedDefinitions: WorkflowConfig["agents"]["definitions"] = {};
for (const [name, def] of Object.entries(merged.agents.definitions)) {
  normalizedDefinitions[normalizeAgentName(name)] = def;
}
merged.agents.definitions = normalizedDefinitions;
```

- [ ] **Step 6: Commit**

```bash
git add src/core/config.ts
git commit -m "feat: simplify agent names and merge duplicate roles

- 三国角色名替换为通用短名称（pm_lead/pm_advisor/pm_backend/pm_frontend/pm_reviewer/pm_researcher）
- QA + Writer 合并为 pm_reviewer
- 前端双角色合并为 pm_frontend
- 移除硬编码模型 ID，改为从全局配置读取
- 建立 LEGACY_AGENT_MAP 向后兼容映射"
```

---

### Task 2: 更新 prompts.ts dispatch map 与 prompt 分支

**Files:**
- Modify: `src/orchestrator/prompts.ts`

- [ ] **Step 1: 更新 DEFAULT_DISPATCH_AGENT_MAP**

将所有旧名称替换为新名称：
- `pm_workflow_caocao` → `pm_lead`
- `pm_workflow_zhuge` → `pm_advisor`
- `pm_workflow_lvbu` → `pm_backend`
- `pm_workflow_diaochan` → `pm_frontend`
- `pm_workflow_qa` → `pm_reviewer`
- `pm_workflow_writer` → `pm_reviewer`
- `pm_workflow_frontend` → `pm_frontend`
- `researcher` → `pm_researcher`

- [ ] **Step 2: 更新 buildExecutablePrompt 的 switch 分支**

将 switch case 中的旧名称全部替换为新名称，并合并 qa/writer 分支为 reviewer 分支。

- [ ] **Step 3: Commit**

```bash
git add src/orchestrator/prompts.ts
git commit -m "feat: update dispatch map and prompt branches to new agent names"
```

---

### Task 3: 更新 analyzer.ts 路由映射

**Files:**
- Modify: `src/orchestrator/analyzer.ts`

- [ ] **Step 1: 更新 mapDomainToAgent 函数**

```typescript
function mapDomainToAgent(domain: TaskDomain): DispatchAgent {
  switch (domain) {
    case "backend": return "pm_backend";
    case "frontend": return "pm_frontend";
    case "writer": return "pm_reviewer";
    case "qa_engineer": return "pm_reviewer";
    case "researcher": return "pm_researcher";
    case "pm": return "pm_lead";
    case "orchestration":
    default: return "pm_lead";
  }
}
```

- [ ] **Step 2: 更新 inferExpectedNextAgents 中的 agent 名称**

将所有旧名称替换为新名称。

- [ ] **Step 3: Commit**

```bash
git add src/orchestrator/analyzer.ts
git commit -m "feat: update analyzer routing to new agent names"
```

---

### Task 4: 更新类型定义

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: 更新 DispatchAgent 类型**

```typescript
export type DispatchAgent =
  | "pm_lead"
  | "pm_advisor"
  | "pm_backend"
  | "pm_frontend"
  | "pm_reviewer"
  | "pm_researcher";
```

- [ ] **Step 2: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: update DispatchAgent type to new agent names"
```

---

### Task 5: 更新测试文件

**Files:**
- Modify: `test/workflow-redesign.test.mjs`
- Modify: `test/mode-aware-dispatch.test.mjs`
- Modify: `test/dispatch-quality-loop.test.mjs`
- Modify: `test/model-inventory.test.mjs`
- Modify: `test/agent-registry.test.mjs`
- Modify: `test/command-lane-analysis.test.mjs`
- Modify: `test/topology-summary.test.mjs`

- [ ] **Step 1: 全局替换测试中的旧 agent 名称**

在所有测试文件中将旧名称替换为新名称。

- [ ] **Step 2: 验证测试通过**

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" npm test
```

- [ ] **Step 3: Commit**

```bash
git add test/
git commit -m "test: update all test assertions to new agent names"
```

---

### Task 6: 更新全部文档

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/01-技术架构.md`
- Modify: `docs/02-业务功能与任务流转.md`

- [ ] **Step 1: 更新 AGENTS.md**

- 内置 Agent 定义表使用新名称
- 移除具体模型 ID，改为"从全局配置读取"
- 补充模型配置说明

- [ ] **Step 2: 更新 README.md**

- 角色表使用新名称
- 移除硬编码模型引用

- [ ] **Step 3: 更新 docs/01-技术架构.md**

- 角色表使用新名称
- 架构图中的 agent 名称更新

- [ ] **Step 4: 更新 docs/02-业务功能与任务流转.md**

- 角色边界表使用新名称

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md docs/
git commit -m "docs: update all documentation to new agent names"
```

---

### Task 7: 更新 CHANGELOG 与发版

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 更新 CHANGELOG.md**

```markdown
## 0.2.0

- **Breaking**: 简化 agent 命名，弃用三国角色名（caocao/zhuge/lvbu/diaochan）
  - `pm_workflow_caocao` → `pm_lead`（主协调）
  - `pm_workflow_zhuge` → `pm_advisor`（顾问）
  - `pm_workflow_lvbu` → `pm_backend`（后端）
  - `pm_workflow_diaochan` → `pm_frontend`（前端）
  - `pm_workflow_qa` + `pm_workflow_writer` → `pm_reviewer`（审查/文档）
  - `pm_workflow_frontend` 合并到 `pm_frontend`
  - `researcher` → `pm_researcher`（调研）
- 移除硬编码模型 ID，改为从全局 OpenCode 配置读取
- 建立向后兼容映射，旧名称自动转换为新名称（保留 2 个版本兼容期）
- 更新全部文档使用新名称
```

- [ ] **Step 2: 升级版本号**

```bash
npm version minor --no-git-tag-version
```

- [ ] **Step 3: 验证并发布**

```bash
PATH="/opt/homebrew/bin:$PATH" npm run verify-release
npm publish --access public
npm view @walke/opencode-pm-workflow version
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md package.json package-lock.json
git commit -m "chore: bump version to 0.2.0 for agent name simplification"
```

---

### Task 8: 最终验证与推送

- [ ] **Step 1: 完整验证**

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" npm test
```

- [ ] **Step 2: 推送到远程**

```bash
git push origin main
```

- [ ] **Step 3: 确认发布成功**

```bash
npm view @walke/opencode-pm-workflow version
```

---

## Self-Review

1. **Spec coverage:** 所有要求已覆盖：新名称映射、兼容映射、文档更新、测试更新、发版。
2. **Placeholder scan:** 无 TBD/TODO/占位符。
3. **Type consistency:** DispatchAgent 类型、config.ts、prompts.ts、analyzer.ts、测试文件中的名称一致。
4. **Breaking change handling:** 通过 LEGACY_AGENT_MAP 实现向后兼容，用户现有配置不会失效。
5. **Model ID handling:** 所有硬编码模型 ID 已移除，改为从全局配置读取。
