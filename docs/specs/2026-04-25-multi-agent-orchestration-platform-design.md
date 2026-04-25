# 多智能体编排平台设计文档

> 版本：v0.3（补齐执行 attempt、幂等、artifact、tenant、扩展状态机与 OEP 契约）
> 日期：2026-04-25
> 状态：草稿，待用户确认

---

## 1. 产品定位与目标

### 1.1 核心定位

**可视化多智能体编排平台** —— 用户通过图形化界面设计 Agent 工作流，实时监控执行状态，无需编写 DAG 配置即可编排复杂的多 Agent 协作。

### 1.2 目标用户

| 用户类型 | 场景 | 核心诉求 |
|---|---|---|
| 独立开发者 | 自用自动化工作流 | 快速编排、实时可见、低门槛 |
| 产品经理 | 需求分析 → PRD → 验收全流程 | 可视化流程、自定义主 Agent |
| 团队 | 协作流水线 | 工作流复用、模板市场 |
| 外部用户 | 按需部署使用 | 自部署、即开即用 |

### 1.3 差异化价值

- **可视化编排**：拖拽式流程设计器，画出主 Agent 工作流
- **实时执行可见**：每个子 Agent 在做什么、输出了什么，Web 实时追踪
- **MCP 生态**：MCP Server 注册与发现，子 Agent 可对接 MCP 工具
- **声明式扩展**：扩展插件通过 manifest 声明贡献子 Agent，主 Agent 动态发现

### 1.4 目标市场（竞品分析背景）

| 竞品 | 缺失的部分（我们的机会） |
|---|---|
| LangGraph | 面向非工程师的可视化设计器（需写 Python DAG 代码） |
| CrewAI | 实时执行可见性（无 Web 实时追踪） |
| MS Agent Framework | 轻量 / OpenCode 基座（企业级，部署重） |
| AutoGen | 无可视化编排（代码驱动） |
| 所有竞品 | **可视化 + 实时 + MCP + 自定义主 Agent** |

---

## 2. 核心模块设计

### 2.1 模块总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        Web 控制台                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │ 流程设计器  │  │ 实时监控   │  │ Agent 注册 │              │
│  └────────────┘  └────────────┘  └────────────┘              │
└────────────────────────────┬───────────────────────────────────┘
                             │ REST API / SSE
┌────────────────────────────▼───────────────────────────────────┐
│                        API 网关层                                │
│              REST API  +  SSE/WebSocket 实时推送                │
└────────────────────────────┬───────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────┐
│                     核心服务层                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ Agent Registry  │  │ Orchestrator     │  │ Execution      │  │
│  │ （注册/发现）   │  │ Engine（编排）   │  │ Monitor（监控）│  │
│  └─────────────────┘  └──────────────────┘  └────────────────┘  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ MCP Gateway     │  │ Workflow Manager │  │ Policy Engine  │  │
│  │ （MCP 集成）   │  │ （流程管理）     │  │ （策略治理）  │  │
│  └─────────────────┘  └──────────────────┘  └────────────────┘  │
└────────────────────────────┬───────────────────────────────────┘
                             │ task dispatch
┌────────────────────────────▼───────────────────────────────────┐
│                    OpenCode 执行层（基座）                       │
│         OpenCode task dispatch  +  model routing  +  providers  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 各模块职责

| 模块 | 职责 |
|---|---|
| **Agent Registry** | 主/子 Agent 的定义注册中心；扩展插件通过 manifest 声明贡献子 Agent；支持 MCP Server 注册 |
| **Orchestrator Engine** | 主 Agent 的调度逻辑：接收任务 → 解析工作流 → 按 DAG 派发子 Agent → 汇总结果 |
| **Execution Monitor** | 实时采集每个子 Agent 的执行状态，通过 SSE 推送到 Web |
| **MCP Gateway** | MCP Server 注册表；子 Agent 通过 MCP 发现和调用外部工具 |
| **Workflow Manager** | 工作流的创建/版本/发布/模板管理 |
| **Policy Engine** | 重试策略、超时控制、并发限制、权限治理 |

---

## 3. Agent 定义（核心数据模型）

### 3.1 主 Agent 与子 Agent

| 类型 | 职责 | 配置重点 |
|---|---|---|
| **主 Agent（Orchestrator）** | 工作流编排者，决定任务拆解和派发逻辑 | 编排策略、派发规则、工作流模板 |
| **子 Agent（Worker）** | 纯执行单元，不关心被谁调用 | 能力描述（capabilities）、输入/输出 Schema |

### 3.2 子 Agent Manifest（扩展插件声明格式）

```jsonc
// 扩展插件的 agent.manifest.json
{
  "pluginId": "pm-workflow",
  "version": "0.1.1",
  "agents": [
    {
      "agentKey": "pm",
      "role": "sub",
      "description": "产品经理：需求分析、PRD 撰写、验收标准制定",
      "capabilities": ["product-spec-builder", "user-story-writer", "acceptance-criteria"],
      "skills": ["skill/pm-workflow", "skill/product-spec-builder"],  // 引用的 skill 列表
      "inputSchema": {
        "type": "object",
        "properties": {
          "idea": { "type": "string", "description": "用户原始想法" }
        },
        "required": ["idea"]
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "prd": { "type": "string" },
          "userStories": { "type": "array" }
        }
      },
      "timeout": {
        "defaultMs": 300000,
        "maxMs": 600000
      },
      "mcpTools": ["context7", "websearch"],
      "permissions": ["read", "write"],
      "heartbeatIntervalMs": 30000,   // 心跳间隔（检测卡住）
      "maxHeartbeatMisses": 3          // 最大心跳缺失次数（触发强制完成）
    },
    {
      "agentKey": "qa-engineer",
      "role": "sub",
      "description": "QA 工程师：测试策略、自动化测试、回归验证",
      "capabilities": ["test-strategy", "automation-scripts", "regression"],
      "skills": ["skill/qa-workflow"],
      "inputSchema": { "type": "object" },
      "outputSchema": { "type": "object" },
      "timeout": { "defaultMs": 180000, "maxMs": 300000 },
      "permissions": ["read"],
      "heartbeatIntervalMs": 30000,
      "maxHeartbeatMisses": 3
    }
  ]
}
```

### 3.3 主 Agent 编排定义（工作流 DSL）

```jsonc
// 工作流定义示例
{
  "workflowId": "product-dev-flow",
  "version": "1.0.0",
  "name": "产品开发全流程",
  "description": "从想法到可发布产品的完整流水线",

  "nodes": [
    {
      "nodeId": "start",
      "type": "start",
      "label": "开始"
    },
    {
      "nodeId": "pm-analyze",
      "type": "task",
      "agentKey": "pm",
      "label": "需求分析",
      "input": { "source": "trigger" }
    },
    {
      "nodeId": "split",
      "type": "parallel-split",
      "label": "并行执行",
      "out": ["frontend-dev", "backend-dev"]
    },
    {
      "nodeId": "frontend-dev",
      "type": "task",
      "agentKey": "frontend",
      "label": "前端开发",
      "input": { "source": "pm-analyze.output.spec" }
    },
    {
      "nodeId": "backend-dev",
      "type": "task",
      "agentKey": "backend",
      "label": "后端开发",
      "input": { "source": "pm-analyze.output.spec" }
    },
    {
      "nodeId": "join",
      "type": "join",
      "in": ["frontend-dev", "backend-dev"],
      "label": "汇合"
    },
    {
      "nodeId": "qa-review",
      "type": "task",
      "agentKey": "qa-engineer",
      "label": "QA 验收",
      "input": {
        "frontend": "frontend-dev.output",
        "backend": "backend-dev.output"
      },
      "condition": "qa-review.output.quality >= 0.8"
    },
    {
      "nodeId": "end",
      "type": "end",
      "label": "结束"
    }
  ],

  "edges": [
    { "from": "start", "to": "pm-analyze" },
    { "from": "pm-analyze", "to": "split" },
    { "from": "join", "to": "qa-review" },
    { "from": "qa-review", "to": "end" }
  ],

  "parallelBranches": [
    { "source": "split", "target": "frontend-dev" },
    { "source": "split", "target": "backend-dev" }
  ],

  "conditions": [
    {
      "nodeId": "qa-review",
      "field": "qa-review.output.quality",
      "operator": ">=",
      "value": 0.8,
      "passTarget": "end",
      "failTarget": "backend-dev"  // 质量不达标打回重做
    }
  ]
}
```

### 3.4 节点类型

| 节点类型 | 说明 |
|---|---|
| `start` | 工作流入口 |
| `end` | 工作流结束 |
| `task` | 调用单个子 Agent |
| `parallel-split` | 并行分支起点 |
| `parallel` | 并行执行（多个节点同时跑） |
| `join` | 分支汇聚（等待所有分支完成） |
| `condition` | 条件路由（基于输出字段判断） |
| `loop` | 循环（受限，避免死循环） |
| `compensation` | 补偿节点（失败回滚，可选） |

---

## 4. 编排引擎设计

### 4.1 执行流程

```
用户提交任务
    │
    ▼
Orchestrator 接收 DispatchRequest
    │
    ▼
加载工作流定义（DSL）
    │
    ▼
构建 DAG + 初始化状态机
    │
    ▼
遍历节点 ──▶ 有依赖未完成 ──▶ 等待
    │
    ▼ 无依赖节点
检查节点类型
    │
    ├── task ──▶ Agent Registry 匹配 ──▶ OpenCode task dispatch
    ├── parallel-split ──▶ 并发生成多个子节点
    ├── join ──▶ 等待所有入边完成
    └── condition ──▶ 计算条件 ──▶ 路由到对应分支
    │
    ▼
收集子 Agent 执行结果
    │
    ▼
写入 execution_events（事件溯源）
    │
    ▼
通过 SSE 推送到 Web 实时界面
    │
    ▼
所有节点完成 ──▶ 工作流结束
```

### 4.2 状态机（节点生命周期）

v0.3 将节点状态机从“单次执行视角”升级为“节点快照 + attempt 执行视角”双层模型。

```
PENDING → READY → DISPATCHED → RUNNING → SUCCEEDED
             │         │            ├──────────────→ STALLED
             │         │            ├──────────────→ TIMEOUT
             │         │            └──────────────→ FAILED
             │         │                               │
             │         └────────────→ BLOCKED         ▼
             │                                       RETRY_WAIT → READY
             │
             ├──────────────────────→ SKIPPED
             └──────────────────────→ CANCELLED

STALLED / TIMEOUT / FAILED / CANCELLED
                  └──────────────→ FORCE_COMPLETED
```

**状态语义说明：**

| 状态 | 语义 | 是否终态 |
|---|---|---|
| `PENDING` | 节点已创建但尚未满足依赖 | 否 |
| `READY` | 所有前置依赖满足，可派发 | 否 |
| `DISPATCHED` | 已向 OpenCode 发出派发请求，等待接单 | 否 |
| `RUNNING` | 当前 attempt 正在执行 | 否 |
| `RETRY_WAIT` | 当前 attempt 失败后等待退避重试 | 否 |
| `BLOCKED` | 依赖失败、权限拒绝或策略阻断，暂不可继续 | 否 |
| `SKIPPED` | 因条件路由未命中而跳过 | 是 |
| `SUCCEEDED` | 节点成功完成 | 是 |
| `FAILED` | 当前节点最终失败，且无更多重试 | 是 |
| `TIMEOUT` | 当前 attempt 到达执行超时阈值 | 否，需继续收敛到终态 |
| `STALLED` | 心跳丢失或执行卡死 | 否，需继续收敛到终态 |
| `CANCELLED` | 用户或上层工作流主动取消 | 是 |
| `FORCE_COMPLETED` | 编排器兜底终止并写明终止原因 | 是 |

### 4.3 Attempt 执行模型（新增）

v0.3 明确引入 `attempt` 维度，解决“一个节点多次重试时，日志、事件、产物和超时状态混在一起”的问题。

```typescript
interface StepAttempt {
  attemptId: string;          // attempt_run001_step001_01
  runId: string;
  stepId: string;
  nodeId: string;
  attemptNumber: number;      // 1, 2, 3...
  status: 'dispatched' | 'running' | 'succeeded' | 'failed' | 'timeout' | 'stalled' | 'cancelled' | 'force_completed';
  providerTaskId?: string;    // OpenCode / provider 返回的原始任务 id
  idempotencyKey: string;     // runId + stepId + attemptNumber + dispatchVersion
  startedAt?: string;
  endedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}
```

**设计原则：**

- `workflow_steps` 保存节点级最新快照，只反映“当前节点最终走到了哪里”
- `workflow_step_attempts` 保存每次执行的独立记录，日志、心跳、产物、取消动作都挂在 attempt 上
- 任何超时、卡住、人工终止都先落在 attempt，再由收敛逻辑决定节点最终是 `FAILED`、`CANCELLED` 还是 `FORCE_COMPLETED`
- 所有重试都必须新建 attempt，禁止覆盖前一次 attempt 记录

### 4.4 能力匹配派发（核心派发逻辑）

```typescript
// 派发伪代码
async function dispatchTask(node: TaskNode, context: WorkflowContext) {
  // 1. 能力匹配：从 Registry 中找到匹配 capabilities 的子 Agent
  const candidates = await registry.findAgentsByCapabilities(
    node.requiredCapabilities || node.agentKey  // agentKey 或 capabilities 二选一
  );

  // 2. 健康过滤 + 权重排序
  const healthy = candidates
    .filter(a => a.status === 'healthy')
    .sort((a, b) => b.weight - a.weight);

  // 3. 选择最优子 Agent
  const selected = healthy[0];
  if (!selected) throw new Error(`No available agent for: ${node.agentKey}`);

  // 4. 为本次派发创建 attempt，并生成幂等键
  const attempt = await attemptStore.create({
    runId: context.runId,
    stepId: node.stepId,
    nodeId: node.nodeId,
    attemptNumber: node.retryCount + 1,
    idempotencyKey: buildIdempotencyKey(context.runId, node.stepId, node.retryCount + 1)
  });

  // 5. 通过 OpenCode task dispatch 执行
  const result = await opencode.dispatch({
    agent: selected.agentKey,
    input: resolveInput(node.input, context),
    timeoutMs: node.timeoutMs,
    metadata: {
      runId: context.runId,
      stepId: node.stepId,
      nodeId: node.nodeId,
      attemptId: attempt.attemptId,
      idempotencyKey: attempt.idempotencyKey
    }
  });

  // 6. 写事件 + SSE 推送
  await eventStore.append({
    type: 'STEP_COMPLETED',
    nodeId: node.nodeId,
    stepId: node.stepId,
    attemptId: attempt.attemptId,
    output: result.output,
    duration: result.duration
  });

  return result;
}
```

### 4.5 Todo 机制（步骤级任务追踪）

每个工作流节点在派发时**同步创建一个 Todo**，与节点状态一一对应，全程可追踪、可干预。

```typescript
// 创建 Todo
const todo = await todoStore.create({
  runId: "run_abc123",
  stepId: "step_001",
  nodeId: "pm-analyze",
  agentKey: "pm",
  title: "需求分析 - pm",
  description: "调用 pm 子 Agent 进行需求分析",
  status: "in_progress",   // pending | in_progress | completed | failed | timed_out | stalled | cancelled | force_completed | blocked | skipped
  createdAt: new Date(),
  updatedAt: new Date()
});

// 状态变更时同步更新
// → DISPATCHED: 状态更新为 in_progress
// → RUNNING: 开始计时
// → SUCCEEDED: 更新为 completed
// → FAILED: 更新为 failed，触发重试判断
// → TIMEOUT: 更新为 timed_out，等待收敛逻辑决定最终是否 force_completed
// → STALLED: 更新为 stalled，等待重试或强制完成
// → CANCELLED: 更新为 cancelled
// → FORCE_COMPLETED: 更新为 force_completed
```

**Todo 与节点状态的映射关系：**

| 节点状态 | Todo status | 说明 |
|---|---|---|
| `PENDING` | `pending` | 等待调度 |
| `READY` | `pending` | 准备执行 |
| `DISPATCHED` | `in_progress` | 已派发，Agent 正在处理 |
| `RUNNING` | `in_progress` | 执行中 |
| `SUCCEEDED` | `completed` | 正常完成 |
| `FAILED` | `failed` | 执行失败（可重试） |
| `TIMEOUT` | `timed_out` | 执行超时，语义独立保留 |
| `STALLED` | `stalled` | 心跳丢失或卡住 |
| `CANCELLED` | `cancelled` | 手动取消 |
| `FORCE_COMPLETED` | `force_completed` | 编排器兜底终止 |
| `BLOCKED` | `blocked` | 等待依赖恢复或人工干预 |
| `SKIPPED` | `skipped` | 条件不命中，正常跳过 |

**回检机制（reconciliation loop）：**

```
Orchestrator 定期扫描所有 in_progress 状态的 Todo
    │
    ▼
检查心跳：
    ├── 有心跳 → 更新 updated_at，继续等待
    ├── 心跳缺失（> interval × maxMisses）→ 标记为 STALLED
    └── 无心跳 + 已超时 → 标记为 TIMEOUT
    │
    ▼
处理 STALLED / TIMEOUT 的 Todo：
    ├── 若可重试 → 重试计数器 +1，重新派发
    └── 若不可重试或超限 → 强制完成（force-complete）
    │
    ▼
强制完成后写入 CANCELLED 事件 + SSE 推送 + Web 通知
```

**Todo 数据模型：**

```sql
CREATE TABLE workflow_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  todo_id VARCHAR(64) UNIQUE NOT NULL,  -- "todo_run001_step001"
  run_id VARCHAR(64) NOT NULL,
  step_id VARCHAR(64) NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  agent_key VARCHAR(64) NOT NULL,
  title VARCHAR(256) NOT NULL,
  description TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  current_attempt INTEGER DEFAULT 1,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  terminal_reason VARCHAR(32),
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(run_id, node_id)
);

CREATE INDEX idx_todos_status ON workflow_todos(status);
CREATE INDEX idx_todos_run_id ON workflow_todos(run_id);
```

---

### 4.6 技能发现机制（Skill Registry）

#### 5.1 Skill 定义

每个子 Agent 可以声明自己依赖的 Skill（技能包），系统在派发时**按 Skill 标签匹配最合适的 Agent**。

```typescript
// Skill 定义
interface Skill {
  skillKey: string;           // "skill/pm-workflow"
  name: string;               // "PM Workflow"
  description: string;        // "产品需求分析与 PRD 撰写"
  tags: string[];             // ["product", "prd", "requirement"]
  version: string;            // "1.0.0"
  agentKeys: string[];        // 注册了此 Skill 的 Agent 列表
}
```

#### 5.2 Skill 注册表

```typescript
// Skill Registry（内存 + PostgreSQL 持久化）
const skillRegistry: Skill[] = [
  {
    skillKey: "skill/pm-workflow",
    name: "PM Workflow",
    description: "产品需求分析与 PRD 撰写",
    tags: ["product", "prd", "requirement"],
    version: "1.0.0",
    agentKeys: ["pm", "pm-gpt"]
  },
  {
    skillKey: "skill/qa-workflow",
    name: "QA Workflow",
    description: "测试策略与自动化脚本",
    tags: ["qa", "testing", "automation"],
    version: "1.0.0",
    agentKeys: ["qa-engineer"]
  }
];
```

#### 5.3 能力匹配派发（Skill-Based Dispatch）

派发子 Agent 时，按 **Skill → Capabilities → AgentKey** 三级匹配：

```
用户任务携带 skills: ["skill/pm-workflow"]
    │
    ▼
Step 1: Skill → Capabilities 映射
    skillRegistry.findBySkill("skill/pm-workflow")
    → capabilities: ["product-spec-builder", "user-story-writer"]

    ▼
Step 2: Capabilities → Agent 匹配
    registry.findAgentsByCapabilities(capabilities)
    → 找到所有声明了这些 capabilities 的 Agent

    ▼
Step 3: 健康检查 + 权重排序
    → 返回最优 Agent

    ▼
Step 4: OpenCode task dispatch
```

**能力匹配伪代码：**

```typescript
async function dispatchBySkill(skills: string[]): Promise<DispatchResult> {
  // 1. Skill → Capabilities
  const capabilities = skills.flatMap(skillKey => {
    const skill = skillRegistry.find(s => s.skillKey === skillKey);
    return skill ? capabilityMap[skillKey] : [];
  });

  // 2. Capabilities → Agent
  const candidates = await registry.findAgentsByCapabilities(capabilities);

  // 3. 过滤 + 排序
  const available = candidates
    .filter(a => a.status === 'healthy')
    .sort((a, b) => {
      // 优先：匹配 skill 数量 > 健康权重 > 并发数
      const aMatch = a.capabilities.filter(c => capabilities.includes(c)).length;
      const bMatch = b.capabilities.filter(c => capabilities.includes(c)).length;
      return bMatch - aMatch || b.weight - a.weight;
    });

  if (!available[0]) throw new Error('No available agent for required skills');
  return opencode.dispatch({ agent: available[0].agentKey, ... });
}
```

#### 5.4 扩展插件的 Skill 贡献

扩展插件通过 manifest 同时声明 Agent 和 Agent 依赖的 Skill：

```jsonc
// 扩展插件的 agent.manifest.json
{
  "pluginId": "pm-workflow",
  "version": "0.1.1",
  "skills": [
    {
      "skillKey": "skill/pm-workflow",
      "name": "PM Workflow",
      "description": "产品需求分析与 PRD 撰写",
      "tags": ["product", "prd"],
      "capabilities": ["product-spec-builder", "user-story-writer"]
    }
  ],
  "agents": [...]
}
```

平台启动时扫描所有插件 manifest，合并 Skill 注册表。

---

### 4.7 运行监控与强制完成机制

#### 6.1 心跳检测（Heartbeat Monitoring）

每个子 Agent 执行时**定时发送心跳**，Orchestrator 实时跟踪：

```
子 Agent 执行中
    │
    ├─▶ 定时心跳（每 N 秒一次）→ Orchestrator 更新 last_heartbeat_at
    │
    └─▶ 超时判断：
          ├── last_heartbeat_at 存在
          │     且 (now - last_heartbeat_at) > interval × maxMisses
          │     → 标记 STALLED → 触发强制完成
          │
          └── 无心跳 + 已超 timeoutMs
                → 标记 TIMEOUT → 触发强制完成
```

**心跳处理伪代码：**

```typescript
// Orchestrator 心跳监听
async function onHeartbeat(stepId: string, payload: HeartbeatPayload) {
  // 仅允许更新当前最新 attempt，避免旧 attempt 的迟到心跳覆盖新状态
  await todoStore.compareAndSwap(stepId, payload.attemptId, {
    lastHeartbeatAt: new Date(payload.timestamp),
    status: 'in_progress'
  });

  // 通过 SSE 推送心跳事件（Web 可实时看到某步骤还活着）
  await ssePush(runId, {
    type: 'HEARTBEAT',
    stepId,
    timestamp: payload.timestamp,
    message: payload.message  // Agent 可自定义心跳消息，如"正在搜索文档..."
  });
}

// 强制完成检测（定时任务，每 10 秒运行一次）
async function checkStalledTasks() {
  const stalled = await todoStore.findStalled({
    staleThresholdMs: 90000,   // 3 × 30000ms
    maxRetries: 3
  });

  for (const todo of stalled) {
    if (todo.retryCount < todo.maxRetries) {
      // 可重试：重新派发
      await retryTask(todo);
    } else {
      // 不可重试或超限：强制完成
      await forceComplete(todo, 'STALLED_TIMEOUT');
    }
  }
}
```

#### 6.1.1 心跳竞态保护（新增）

v0.3 明确加入以下保护，避免“旧心跳覆盖新 attempt 状态”或“重试后仍被前一次超时任务回写”的竞态：

- 所有心跳、日志、进度事件必须携带 `attemptId`
- `workflow_steps` / `workflow_todos` 更新时使用 `current_attempt` 做 CAS 校验
- Redis 锁只做快速互斥，不作为最终真相源
- 最终状态收敛必须在 PostgreSQL 中基于 `attempt_number` + `lock_version` 完成
- 如检测到迟到事件，事件保留但不回写最新节点快照

#### 6.2 强制完成（Force Completion）

当检测到 Agent 卡住或超时时，Orchestrator 执行强制完成：

```typescript
async function forceComplete(todo: Todo, reason: 'TIMEOUT' | 'STALLED_TIMEOUT' | 'MANUAL_CANCEL') {
  // 1. 通知 OpenCode 终止任务
  await opencode.cancelTask(todo.stepId);

  // 2. 更新 attempt 与 Todo 状态
  await attemptStore.finish(todo.stepId, todo.currentAttempt, {
    status: 'force_completed',
    terminalReason: reason,
    endedAt: new Date()
  });

  await todoStore.update(todo.id, {
    status: 'force_completed',
    terminalReason: reason,
    completedAt: new Date()
  });

  // 3. 写入执行事件（溯源）
  await eventStore.append({
    type: 'STEP_FORCE_COMPLETED',
    stepId: todo.stepId,
    reason,
    forcedAt: new Date()
  });

  // 4. SSE 推送（Web 立即可见）
  await ssePush(todo.runId, {
    type: 'STEP_FORCE_COMPLETED',
    stepId: todo.stepId,
    nodeId: todo.nodeId,
    reason,
    timestamp: new Date()
  });

  // 5. 通知用户（Web 提示 + 可选 webhook）
  await notifyUser(todo.runId, {
    level: 'warning',
    title: `步骤 ${todo.nodeId} 被强制终止`,
    message: `原因：${reason}。请检查 Agent 日志。`
  });

  // 6. 继续 DAG 流程（如策略允许）
  await advanceDAG(todo.runId, todo.nodeId);
}
```

#### 6.3 状态变更事件（完整列表）

```typescript
// 所有可能的状态变更事件
type StepEvent =
  | 'STEP_CREATED'           // Todo 创建
  | 'STEP_DISPATCHED'        // 已派发给 OpenCode
  | 'STEP_STARTED'           // 子 Agent 开始执行
  | 'STEP_HEARTBEAT'        // 心跳
  | 'STEP_PROGRESS'         // 进度更新（如 50%）
  | 'STEP_LOG'              // 日志片段
  | 'STEP_RETRY'            // 重试
  | 'STEP_SUCCEEDED'        // 正常完成
  | 'STEP_FAILED'           // 执行失败
  | 'STEP_TIMEOUT'           // 超时
  | 'STEP_FORCE_COMPLETED'   // 强制完成
  | 'STEP_CANCELLED';        // 手动取消
```

#### 6.4 Web 实时通知

所有状态变更通过 SSE 实时推送，Web 端自动更新：

```
心跳正常：
  { type: 'HEARTBEAT', stepId: 'step_001', nodeId: 'pm-analyze', message: '正在撰写 PRD...' }

心跳丢失 → 强制完成：
  { type: 'STEP_FORCE_COMPLETED', stepId: 'step_001', reason: 'STALLED_TIMEOUT' }
  → Web 提示：⚠️ "pm-analyze 步骤因心跳超时被强制终止"

超时：
  { type: 'STEP_TIMEOUT', stepId: 'step_001', reason: 'TIMEOUT' }
  → Web 提示：⏱️ "pm-analyze 步骤执行超时（5分钟）"
```

---

## 5. MCP 集成设计

### 5.1 MCP Gateway 职责

```
MCP Gateway
├── MCP Server 注册表（已知的 MCP Server 列表 + 状态）
├── MCP Tool 映射（将 MCP Tool 映射为子 Agent 的能力）
├── 动态发现（运行时发现新的 MCP Server）
└── 权限控制（MCP Tool 的访问权限）
```

### 5.2 MCP Server 注册

```jsonc
// mcp-servers.json（全局 MCP Server 注册表）
{
  "servers": [
    {
      "serverId": "context7",
      "name": "Context7 Documentation",
      "description": "最新框架/库文档检索",
      "capabilities": ["websearch", "context7"],
      "status": "healthy",
      "endpoint": "https://mcp.context7.com/mcp"
    },
    {
      "serverId": "tavily",
      "name": "Tavily Search",
      "capabilities": ["websearch"],
      "status": "healthy"
    }
  ]
}
```

### 5.3 子 Agent 与 MCP 的关系

```
子 Agent（pm）
    │
    ├── capabilities: ["product-spec-builder"]
    │       ↑
    │       │  （MCP Tool 映射）
    │       │
    └── mcpTools: ["context7", "tavily"]
              │       ↑
              └───────┘
              MCP Server（提供工具能力）
```

---

## 6. 存储设计（激进方案）

### 6.1 存储组合

| 存储 | 用途 |
|---|---|
| **PostgreSQL** | Agent Registry、Workflow 定义、Run/Step 快照、用户/权限 |
| **Redis** | 运行态队列、分布式锁、实时事件分发（Pub/Sub）、限流 |
| **对象存储（S3/MinIO）** | 大日志文件、执行产物、中间数据 |

### 6.2 核心数据模型

```sql
-- Agent Registry
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  agent_key VARCHAR(64) UNIQUE NOT NULL,  -- 唯一标识，如 "pm", "frontend"
  role VARCHAR(16) NOT NULL,             -- 'orchestrator' | 'worker'
  source VARCHAR(32) NOT NULL,            -- 'system' | 'plugin'
  plugin_id VARCHAR(64),
  version VARCHAR(16),
  description TEXT,
  capabilities JSONB,                     -- ["product-spec-builder", "user-story"]
  input_schema JSONB,
  output_schema JSONB,
  timeout_ms INTEGER DEFAULT 300000,
  mcp_tools TEXT[],
  permissions TEXT[],
  health VARCHAR(16) DEFAULT 'unknown',  -- healthy | degraded | offline
  status VARCHAR(16) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow 定义
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  workflow_key VARCHAR(64) UNIQUE NOT NULL,  -- "product-dev-flow"
  name VARCHAR(128) NOT NULL,
  version VARCHAR(16) NOT NULL,
  dsl JSONB NOT NULL,                       -- 完整工作流定义
  checksum VARCHAR(64) NOT NULL,             -- 内容校验
  status VARCHAR(16) DEFAULT 'draft',       -- draft | published | archived
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_key, version)
);

-- 工作流运行实例
CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  run_id VARCHAR(64) UNIQUE NOT NULL,      -- "run_abc123"（幂等 key）
  idempotency_key VARCHAR(128) UNIQUE NOT NULL,
  workflow_id UUID REFERENCES workflows(id),
  workflow_version VARCHAR(16) NOT NULL,
  trigger_type VARCHAR(32) NOT NULL,        -- manual | webhook | scheduled
  trigger_by UUID REFERENCES users(id),
  status VARCHAR(16) NOT NULL,               -- pending | running | completed | failed | cancelled | force_completed
  input_data JSONB,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 工作流步骤快照
CREATE TABLE workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  step_id VARCHAR(64) NOT NULL,            -- "step_001"
  run_id VARCHAR(64) NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  agent_key VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  current_attempt INTEGER DEFAULT 1,
  lock_version INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  input_ref TEXT,                            -- 输入存储引用
  output_ref TEXT,                            -- 输出存储引用
  terminal_reason VARCHAR(32),
  error_code VARCHAR(32),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, node_id)
);

-- 步骤执行 attempt（新增）
CREATE TABLE workflow_step_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  attempt_id VARCHAR(64) UNIQUE NOT NULL,
  run_id VARCHAR(64) NOT NULL,
  step_id VARCHAR(64) NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  attempt_number INTEGER NOT NULL,
  provider_task_id VARCHAR(128),
  idempotency_key VARCHAR(128) NOT NULL,
  status VARCHAR(24) NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  error_code VARCHAR(32),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, step_id, attempt_number)
);

-- 执行产物索引（新增）
CREATE TABLE workflow_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  artifact_id VARCHAR(64) UNIQUE NOT NULL,
  run_id VARCHAR(64) NOT NULL,
  step_id VARCHAR(64),
  attempt_id VARCHAR(64),
  artifact_type VARCHAR(32) NOT NULL,       -- log | prompt | output | attachment | snapshot
  storage_uri TEXT NOT NULL,
  content_type VARCHAR(64),
  size_bytes BIGINT,
  checksum VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 执行事件（append-only，用于溯源和实时推送）
CREATE TABLE execution_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID,
  run_id VARCHAR(64) NOT NULL,
  step_id VARCHAR(64),
  attempt_id VARCHAR(64),
  event_type VARCHAR(32) NOT NULL,
  payload JSONB,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_agents_capabilities ON agents USING GIN(capabilities);
CREATE INDEX idx_runs_status ON workflow_runs(status);
CREATE INDEX idx_events_run_id ON execution_events(run_id, occurred_at);
CREATE INDEX idx_steps_run_id ON workflow_steps(run_id);
CREATE INDEX idx_attempts_run_id ON workflow_step_attempts(run_id, step_id, attempt_number);
CREATE INDEX idx_artifacts_run_id ON workflow_artifacts(run_id, step_id, attempt_id);
```

### 6.3 幂等、锁与一致性策略（新增）

v0.3 在存储层明确三条一致性规则：

1. **幂等键**
   - `workflow_runs.idempotency_key` 用于防止同一触发源重复创建 run
   - `workflow_step_attempts.idempotency_key` 用于防止网络重试导致的重复派发

2. **Redis 锁 + PostgreSQL CAS**
   - Redis 只负责降低并发冲突，不负责最终一致性
   - 关键写操作必须带 `lock_version` 或 `current_attempt` 做数据库 CAS
   - 任何 CAS 失败都必须重新读取最新快照，再决定是否重试

3. **Fencing Token**
   - 每次获得派发锁时生成递增 fencing token
   - 外部回调、心跳、取消、完成事件都要校验 token
   - token 落后时，事件只归档不回写运行态快照

---

## 7. Web 可视化设计

### 7.1 核心页面

| 页面 | 功能 |
|---|---|
| **工作流设计器** | 拖拽式节点画布；节点：开始/结束/任务/并行/条件/汇合 |
| **实时执行监控** | 每一步 Agent 执行状态、输出、日志；SSE 实时推送 |
| **Agent 注册管理** | 查看所有主/子 Agent；插件贡献的 Agent 标注来源 |
| **MCP Server 管理** | MCP Server 注册与状态；Tool 与 Agent 能力映射 |
| **工作流模板市场** | 保存/发布/复用/导入工作流 |
| **历史记录** | 每次运行的输入/输出/耗时/状态，可回放 |

### 7.2 流程设计器交互

```
左侧面板：节点类型 ──▶ 拖拽到画布 ──▶ 连线定义依赖关系
                                      │
                                      ▼
                               双击节点配置
                               ├── 选择子 Agent
                               ├── 定义输入映射
                               ├── 超时时间
                               └── 条件表达式（仅 condition 节点）
```

### 7.3 实时监控面板

```
┌─────────────────────────────────────────────────────────┐
│  Run: run_abc123  ● Running  ▶ 已运行 2m 34s          │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐                                          │
│  │ ● 开始  │ ───────┐                               │
│  └──────────┘         │                               │
│  ┌──────────┐         ▼                               │
│  │ ● 需求分析│ → [pm]  ✓ 完成  用时 45s             │
│  └──────────┘                                          │
│         │                                               │
│         ▼                                               │
│  ┌──────────┐  ┌──────────┐                          │
│  │● 前端开发│  │● 后端开发│  ← 并行执行中...          │
│  │[frontend]│  │[backend] │    进度 60%               │
│  └──────────┘  └──────────┘                          │
│         │                                               │
│         ▼                                               │
│  ┌──────────┐                                          │
│  │ ● QA验收 │   等待中...                              │
│  └──────────┘                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 8. 技术栈建议

| 层级 | 技术选型 | 理由 |
|---|---|---|
| **Web 前端** | React + TypeScript + Tailwind | 成熟生态，组件库丰富 |
| **可视化流程图** | React Flow 或 @xyflow | DAG 可视化成熟，支持自定义节点 |
| **状态管理** | Zustand 或 Jotai | 轻量，够用 |
| **后端** | Node.js（与 OpenCode 一致） | 复用现有技术栈 |
| **数据库** | PostgreSQL + Redis | 激进方案既定 |
| **实时推送** | SSE（Server-Sent Events） | 实现简单，比 WebSocket 更适合单向实时 |
| **对象存储** | MinIO（自部署）或 S3 | 灵活 |
| **部署** | Docker Compose | 自部署友好 |

---

## 9. OpenCode 集成方式（OEP 模式）

### 9.1 集成架构

```
本平台（编排服务）              OpenCode（执行基座）
┌──────────────────┐           ┌──────────────────┐
│ Orchestrator     │ ──HTTP────▶│ task dispatch    │
│ Engine          │ ◀──SSE──── │ model routing   │
│ (本平台)         │           │ providers        │
└──────────────────┘           └──────────────────┘
```

**关键点**：本平台作为 OpenCode 的扩展插件（类似 pm-workflow）存在，通过 OpenCode 的 task dispatch API 派发子 Agent 任务，复用 OpenCode 的模型路由和执行能力。

### 9.2 插件接入方式

```jsonc
// opencode.json 中注册为插件
{
  "plugin": [
    "@weekii/opencode-pm-workflow@latest",
    "opencode-agent-orchestrator@latest"   // 新增：编排平台插件
  ]
}
```

### 9.3 子 Agent 派发接口

```typescript
// 通过 OpenCode task API 派发子 Agent
const result = await opencode.task({
  agent: 'pm',          // 子 Agent 名称（对应 agents 表的 agent_key）
  input: {
    idea: "我想做一个产品"
  },
  timeout: 300000,      // 5 分钟超时
  metadata: {
    runId: 'run_abc123',
    stepId: 'step_001',
    attemptId: 'attempt_run_abc123_step_001_01',
    idempotencyKey: 'run_abc123:step_001:01',
    heartbeatChannel: 'workflow.run_abc123.step_001'
  }
});

// result 包含：
// - output: 子 Agent 的执行结果
// - logs: 执行日志
// - duration: 执行耗时
```

### 9.4 OEP Dispatch 契约（新增）

v0.3 明确要求编排平台与 OpenCode 之间使用“最小但够用”的 dispatch 契约，避免只传 `agent + input + timeout` 导致运行时无法追踪。

```typescript
interface OepDispatchRequest {
  runId: string;
  stepId: string;
  nodeId: string;
  attemptId: string;
  idempotencyKey: string;
  tenantId?: string;
  workflowKey: string;
  workflowVersion: string;
  agent: string;
  input: Record<string, unknown>;
  timeoutMs: number;
  requiredSkills?: string[];
  requiredCapabilities?: string[];
  heartbeatIntervalMs?: number;
  maxHeartbeatMisses?: number;
}

interface OepDispatchResult {
  providerTaskId: string;
  acceptedAt: string;
  status: 'accepted' | 'rejected';
  rejectionReason?: string;
}
```

**契约要求：**

- 派发成功必须返回 `providerTaskId`
- 执行过程中必须允许心跳、日志、进度事件按 `attemptId` 回流
- 取消动作必须幂等，重复取消不能报错
- 当 OpenCode 不支持实时回调时，平台需回退到轮询适配层

---

## 10. MVP 功能优先级

### 第一阶段（MVP，必须有）

| 功能 | 理由 |
|---|---|
| Agent Registry（子 Agent 注册/发现） | 其他一切的基础 |
| 工作流设计器（画布 + 节点配置） | 核心差异化 |
| 编排引擎（串行 DAG 执行） | 最小可用编排 |
| 实时执行监控（SSE 推送） | 核心差异化 |
| 子 Agent 派发（对接 OpenCode） | 执行闭环 |
| 工作流保存/加载 | 基本可用 |
| Attempt 记录 + 幂等派发 | 没有这一层就无法安全重试 |
| Todo 回检 + Force Completion | 没有这一层就无法稳定收敛异常任务 |

### 第二阶段（完整功能）

| 功能 |
|---|
| 并行节点（parallel-split/join） |
| 条件路由（condition） |
| MCP Gateway（MCP Server 注册 + 子 Agent 能力映射） |
| 工作流模板市场 |
| 历史运行记录 + 回放 |

### 第三阶段（高级功能）

| 功能 |
|---|
| 循环节点（受限 loop） |
| 补偿节点（compensation 失败回滚） |
| 多租户 + 权限体系 |
| 插件 manifest 自动扫描 |
| Webhook 触发 |

---

## 11. 实现路径建议

### 阶段一：核心闭环（预计工作量：中）

```
1. 数据模型（PostgreSQL DDL）
2. Agent Registry（CRUD + 能力查询）
3. 工作流 DSL 定义 + 解析器
4. 最小编排引擎（串行 DAG，无并行）
5. Attempt / Todo / Event / Artifact 四张核心运行表
6. OpenCode task dispatch 适配层 + OEP 契约
7. 基本 Web UI（流程设计器 + 执行监控）
```

### 阶段二：并行 + 条件（预计工作量：大）

```
1. 并行节点实现（parallel-split/join）
2. 条件路由实现
3. SSE 实时推送完善
4. MCP Gateway v1
```

### 阶段三：生态扩展（预计工作量：中）

```
1. 插件 manifest 扫描
2. 工作流模板市场
3. Webhook 触发
4. 多租户权限
```

---

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| OpenCode task dispatch API 不支持异步/回调 | 先用轮询，兼容后再切 SSE |
| 并行节点的状态一致性 | Redis 锁 + PostgreSQL CAS + fencing token |
| 子 Agent 执行超时失控 | Policy Engine 超时强制 kill + 熔断 |
| WebSocket 连接数上限 | SSE 替代 WebSocket（单向实时更轻） |
| 工作流 DSL 复杂度高 | 提供 JSON Schema 校验 + 编辑器插件（Monaco） |
| PoC 后难转生产 | PostgreSQL 架构直接可扩展到生产 |
| 重试导致重复执行 | run/attempt 双层幂等键 + providerTaskId 去重 |
| 大日志和中间产物拖垮数据库 | 产物落对象存储，只在 PG 存索引 |

---

## 13. v0.3 新增结论

- 节点生命周期采用“节点快照 + attempt 明细”双层模型
- `TIMEOUT`、`STALLED` 不再直接映射为 `cancelled`，而是保留独立语义
- Redis 不再承担最终一致性职责，数据库 CAS 与 fencing token 才是最终防线
- OEP 派发契约必须携带 `runId`、`stepId`、`attemptId`、`idempotencyKey`
- Artifact 必须一开始就纳入模型，否则后续日志回放和产物审计会返工
- 多租户字段 `tenant_id` 先入表，哪怕 MVP 暂不开放多人协作

## 14. 待确认问题

- [ ] Web 前端技术栈是否采用 React？（还是你偏好其他框架？）
- [ ] 第一阶段完成后，你希望先验证哪个核心场景？（比如：产品开发流程、客服机器人、还是其他？）
- [ ] 你需要支持多人协作吗？还是单人使用为主？
- [ ] 自部署场景下，认证方案怎么考虑？（Simple Auth / 外部 IdP）
- [ ] Skill 的粒度怎么定？（是粗粒度如"pm-workflow"，还是细粒度如"product-spec-builder"？）
- [ ] 心跳间隔和最大缺失次数用默认值还是可配置？（当前默认值：30s / 3次）
- [ ] 强制完成后是否自动重试？重试几次？（当前默认：3次）

---

## 15. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.3 | 2026-04-25 | 补齐 attempt、幂等、artifact、tenant、扩展状态机、Todo 终态语义、心跳竞态保护与 OEP dispatch 契约 |
| v0.2 | 2026-04-25 | 新增 Todo 机制、技能发现、运行监控与强制完成 |
| v0.1 | 2026-04-25 | 首版多智能体编排平台总体设计 |
