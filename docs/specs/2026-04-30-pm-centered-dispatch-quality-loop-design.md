# 以 PM 主协调为中心的高质量分派闭环设计文档

> 版本：v1.0（PM-Centered Dispatch Quality Loop）
> 日期：2026-04-30
> 状态：草稿，待用户审阅

---

## Purpose

本文档定义 `opencode-pm-workflow` 下一阶段的核心优化方向：在保持轻量、自动化、低打断的前提下，把当前插件从“阶段驱动的 agent 路由器”升级为“**以 PM 为主协调者的高质量任务分派闭环**”。

本次设计直接回应用户最初诉求：

- 更自动化，减少无谓确认与人工打断
- 主 agent 更专业地把任务分派给 backend / frontend / writer / qa 等专业 agent
- 不引入复杂、沉重、难维护的工作流引擎

本设计的核心判断如下：

1. **主 agent 始终是 `pm / 曹操`**，负责接收任务、判断复杂度、决定拆解、选择执行者、回收结果、推动下一步。
2. **`commander` 不是主 agent**，仅作为可被调用的专家，适用于复杂任务拆解、统筹建议、跨角色协作方案输出。
3. 系统新增三段式闭环：
   - `Dispatch Analyzer`：分派前判断
   - `Handoff Packet Builder`：结构化交接包生成
   - `Result Evaluator`：结果回收与验收
4. 第一阶段只做最小可用闭环，不做重型 DAG、并行调度器、长期学习派单系统。

---

## Prerequisites

### 1. 当前项目基础

当前项目已经具备：

- 基础状态机：`idea/spec_ready/plan_ready/development/review_pending/release_ready/...`
- 现有 dispatch / gate / state / runtime 机制
- OpenCode 原生 agent 映射与兼容 agent 定义
- 默认自动执行优化（`allow_execute_tools: true`、`require_confirm_for_execute: false`）

### 2. 现有关键文件

本设计主要围绕以下文件演进：

```text
src/core/config.ts
src/core/types.ts
src/orchestrator/plan.ts
src/orchestrator/prompts.ts
src/server/tools/dispatch-tools.ts
```

建议新增的轻量模块：

```text
src/orchestrator/analyzer.ts
src/orchestrator/handoff.ts
src/orchestrator/evaluator.ts
```

### 3. 当前问题前提

虽然项目已经完成一轮重要优化，但仍有四类分派质量问题没有系统解决：

1. **派错人**：任务类型判断不准，交给了不合适的 agent
2. **给不够上下文**：派对人了，但任务输入过薄，subagent 容易返工
3. **拆解不对**：复合任务未被识别和拆解，一个 agent 被迫硬扛
4. **回收机制差**：subagent 返回后，主协调缺少结构化验收与下一步决策

本设计必须同时覆盖这四类问题，而不是只修补其中一项。

---

## Steps

## 1. 设计目标与非目标

### 1.1 目标

第一阶段目标是把分派链路升级为：

```text
用户任务
-> PM 接收
-> 分派前分析
-> 结构化交接包
-> 专业 agent 执行
-> 结果评估
-> PM 决定下一步
```

实现后，系统应具备以下能力：

- PM 能识别任务属于 backend / frontend / writer / qa / orchestration 哪一类
- PM 能判断任务是简单、复合、还是需要拆解
- PM 给 subagent 的输入从“prompt 一段话”升级为“结构化任务单”
- PM 不再直接信任 subagent 的完成声明，而是做结果回收与下一步判断
- 常见串行接力链路可自然形成，例如：
  - `pm -> backend -> qa_engineer`
  - `pm -> frontend -> writer`
  - `pm -> commander(拆解建议) -> backend/frontend/...`

### 1.2 非目标

第一阶段明确不做以下内容：

- 不做可视化工作流设计器
- 不做重型 DAG 编排引擎
- 不做复杂并行执行与依赖图调度
- 不做自学习派单模型
- 不做长链路自治 agent 社会化系统

这些能力以后可扩展，但不应进入本轮设计范围。

---

## 2. 角色边界与职责重定义

### 2.1 PM / 曹操：唯一主协调者

`pm` 是系统唯一的主协调角色，负责：

- 接收用户目标与上下文
- 判断任务域与复杂度
- 决定是否拆解
- 选择下一个执行 agent
- 生成交接包
- 回收 subagent 结果
- 进行验收与下一步动作决策

这意味着：

```text
PM 不是“文档/需求 agent”那么简单，
而是 pm-workflow 在执行层面的真正编排者。
```

### 2.2 Commander：专家顾问，不是主入口

`commander` 的角色重新定义为：

- 复杂任务拆解专家
- 跨角色协作建议提供者
- 风险分析与任务排序顾问

`commander` **不负责**：

- 直接替代 PM 接收用户任务
- 作为默认主 agent 持续掌控流程
- 在未被 PM 调用时自行接管分派权

### 2.3 其他专业 agent

| Agent | 主要职责 | 典型触发场景 |
|---|---|---|
| `backend` | API、服务、数据、鉴权、数据库、性能 | 后端实现、后端问题修复 |
| `frontend` | UI、交互、组件、样式、前端体验 | 页面开发、组件改造、交互优化 |
| `writer` | 文档、说明、发布说明、交付总结 | README、使用说明、Release Notes |
| `qa_engineer` | 验证、回归、测试策略、review gate | 测试补强、回归验证、质量拦截 |

### 2.4 角色边界原则

新的角色边界遵循三条原则：

1. **协调权只属于 PM**
2. **专业产出由对应专业 agent 完成**
3. **顾问角色只提供建议，不替代决策**

---

## 3. 闭环总架构

### 3.1 新链路概览

```text
用户输入
  -> PM 收敛目标
  -> Dispatch Analyzer
  -> Handoff Packet Builder
  -> 目标 Agent 执行
  -> Result Evaluator
  -> PM 汇总 / 二次分派 / 结束
```

### 3.2 与当前系统的关系

当前系统的 `stage -> recommendedAgent` 模式并不会被完全删除，而是被降级为：

- **阶段性默认建议层**：给 PM 提供起始判断
- **不是最终分派决策层**：PM 仍可根据任务上下文重写推荐结果

换言之：

```text
stage 信息仍有价值，
但它不应直接决定最终派单对象。
```

### 3.3 第一阶段闭环粒度

为了保持轻量，第一阶段采用“最小闭环”策略：

- 每次只处理一次 PM -> 专业 agent -> PM 的基本循环
- 支持有限的串行接力
- 不追求跨多个 agent 的复杂状态图

---

## 4. Dispatch Analyzer 设计

### 4.1 目的

`Dispatch Analyzer` 用于在分派前解决三个问题：

1. 这是什么类型的任务？
2. 应该谁来做？
3. 这件事是直接派，还是先拆解？

### 4.2 建议新增数据结构

建议在 `src/core/types.ts` 中新增：

```ts
export type TaskDomain =
  | "pm"
  | "backend"
  | "frontend"
  | "writer"
  | "qa_engineer"
  | "orchestration";

export type TaskComplexity = "simple" | "multi_step" | "composite";

export type ExecutionMode =
  | "pm_direct"
  | "single_agent"
  | "serial_handoff"
  | "advisor_then_dispatch";

export interface TaskAnalysis {
  domain: TaskDomain;
  complexity: TaskComplexity;
  recommendedAgent: string;
  fallbackAgents: string[];
  executionMode: ExecutionMode;
  needsDecomposition: boolean;
  rationale: string[];
  risks: string[];
  expectedNextAgents: string[];
}
```

### 4.3 核心判断逻辑

第一阶段建议使用**规则优先**而不是模型自治：

- 根据用户任务文本、当前 stage、gate 状态、历史动作判断 domain
- 根据任务是否涉及多个交付物、多个角色、多个阶段判断 complexity
- 根据 complexity 决定 executionMode

规则示例：

- 单纯“补 README / 发布说明” -> `writer`
- “修接口 + 改数据库 + 跑测试” -> `backend` 主导，后续 `qa_engineer`
- “需求模糊 + 涉及多角色 + 需要拆解” -> `advisor_then_dispatch`，先调 `commander`

### 4.4 输出要求

Analyzer 输出不应只是一个 agent 名称，而应至少包含：

- 推荐 agent
- 推荐原因
- 是否需要拆解
- 是否预计需要后续接力
- 风险提示

这样 PM 在执行 dispatch 时有可解释依据，而不是黑箱派单。

---

## 5. Handoff Packet Builder 设计

### 5.1 目的

`Handoff Packet Builder` 用于解决“派对人但给不够上下文”的问题。

当前很多失败不是 agent 能力不够，而是输入太薄：

- 目标不清
- 范围不清
- 输入材料不完整
- 验收标准缺失
- 完成后如何回传不明确

### 5.2 建议新增数据结构

```ts
export interface HandoffPacket {
  goal: string;
  why: string;
  taskType: string;
  targetAgent: string;
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

### 5.3 不同 agent 的差异化模板

在 `src/orchestrator/prompts.ts` 中，建议从“纯 agent prompt 模板”升级为“**agent prompt + handoff packet 模板**”。

不同 agent 的 packet 模板侧重点不同：

#### backend
- 目标功能
- 影响文件/模块
- 数据与接口约束
- 验证命令
- 风险点

#### frontend
- 页面/组件范围
- 交互目标
- 样式边界
- 可访问性要求
- 验收方式

#### writer
- 文档对象
- 目标读者
- 输出格式
- 必含章节
- 与代码行为的对应关系

#### qa_engineer
- 测试对象
- 风险重点
- 最低验证范围
- 通过条件
- 失败时应如何报告

#### commander
- 要拆解的问题
- 需回答的关键问题
- 输出的任务拆解格式
- 不能直接代替 PM 做决定的限制

### 5.4 最低要求

第一阶段每个 handoff packet 至少要覆盖：

- 目标
- 背景
- 范围
- 输入
- 约束
- 验收标准
- 回传格式

如果做不到这些，就不应发起 dispatch。

---

## 6. Result Evaluator 设计

### 6.1 目的

`Result Evaluator` 负责解决“subagent 说完成了，但主协调无法判断是否真完成”的问题。

PM 不应直接相信“done / success”字样，而要基于原始 handoff packet 做结构化比对。

### 6.2 建议新增数据结构

```ts
export type EvaluationStatus =
  | "done"
  | "partial"
  | "misaligned"
  | "needs_verification";

export interface EvaluationResult {
  status: EvaluationStatus;
  summary: string;
  matchedDeliverables: string[];
  missingDeliverables: string[];
  gaps: string[];
  recommendedNextAgent?: string;
  recommendedNextAction?: string;
}
```

### 6.3 评估逻辑

第一阶段不做复杂评分系统，而用**轻量规则判断**：

#### done
- 交付物齐全
- 回传格式符合预期
- 验收标准已覆盖
- 没有明显缺口

#### partial
- 做完了一部分
- 缺少关键交付物或验证

#### misaligned
- 做了东西，但偏离原目标
- 输出与任务不匹配

#### needs_verification
- 输出看起来完整，但还需要 QA / build / test / review 才能确认

### 6.4 评估后的动作建议

Result Evaluator 不直接执行下一步，只给 PM 提供建议：

- `recommendedNextAgent`
- `recommendedNextAction`

例如：

- backend 改完代码但未验证 -> 推荐 `qa_engineer`
- frontend 完成页面但缺使用说明 -> 推荐 `writer`
- commander 给出拆解建议 -> 推荐 PM 重新分派给 backend / frontend / writer

---

## 7. 状态流转与决策链

### 7.1 单 agent 场景

```text
PM
-> Analyzer: writer/simple
-> HandoffPacket(writer)
-> writer 执行
-> Evaluator: done
-> PM 汇总结束
```

### 7.2 串行接力场景

```text
PM
-> Analyzer: backend/multi_step
-> HandoffPacket(backend)
-> backend 执行
-> Evaluator: needs_verification
-> PM 决定转给 qa_engineer
-> HandoffPacket(qa_engineer)
-> qa_engineer 执行
-> Evaluator: done
-> PM 汇总结束
```

### 7.3 顾问拆解场景

```text
PM
-> Analyzer: orchestration/composite
-> HandoffPacket(commander)
-> commander 输出拆解建议
-> Evaluator: partial（需继续分派）
-> PM 基于建议转派 backend/frontend/writer
```

### 7.4 与 stage 的协同关系

当前 stage 仍保留，但用途改变：

- `idea/spec_ready/plan_ready`：帮助 PM 理解当前项目阶段
- `review_pending/release_ready`：约束 PM 的下一步动作选择
- 不再直接等于最终执行者

---

## 8. 代码改造建议

### 8.1 `src/orchestrator/plan.ts`

当前职责偏重“阶段 -> 推荐 agent”。

建议改造为：

- 接收当前 stage + 用户任务上下文
- 调用 analyzer
- 输出更完整的 dispatch 决策对象

建议把 `recommendedAgent` 扩展为：

```ts
{
  recommendedAgent: string,
  fallbackAgents: string[],
  executionMode: ExecutionMode,
  analysis: TaskAnalysis
}
```

### 8.2 `src/orchestrator/prompts.ts`

建议新增：

- `buildHandoffPacket()`
- `renderAgentHandoffPrompt()`
- `renderCommanderAdvisorPrompt()`

现有 prompt 生成不应只拼角色文案，而应能注入结构化 packet。

### 8.3 `src/server/tools/dispatch-tools.ts`

建议扩展以下能力：

- dispatch 前执行 analyzer
- dispatch 时生成 handoff packet
- dispatch 后支持 evaluator 结果结构返回
- 输出下一步建议，而不是只返回执行结果

### 8.4 `src/core/types.ts`

新增以下类型：

- `TaskAnalysis`
- `HandoffPacket`
- `EvaluationResult`
- `ExecutionMode`
- `TaskDomain`
- `TaskComplexity`

### 8.5 新增轻量模块

新增：

```text
src/orchestrator/analyzer.ts
src/orchestrator/handoff.ts
src/orchestrator/evaluator.ts
```

这样可以避免继续把 `plan.ts` 和 `prompts.ts` 变成巨型文件。

---

## 9. 错误处理与回退策略

### 9.1 分析阶段失败

如果 analyzer 无法明确判断：

- 默认回退到 `pm_direct`
- 或调用 `commander` 做拆解建议
- 不能草率随机派单

### 9.2 交接包不完整

如果 handoff packet 缺少：

- 目标
- 输入
- 验收标准

则当前 dispatch 应被视为“不可执行”，由 PM 先补齐，而不是把低质量任务单发给 subagent。

### 9.3 执行结果模糊

如果 subagent 返回：

- 只描述过程，不给结果
- 没有对应到 deliverables
- 未说明验证情况

则 evaluator 应标记为 `partial` 或 `needs_verification`，不能直接 `done`。

### 9.4 高风险阶段

保留当前原则：

- `release`
- `repair`

这类动作依旧应保留较强 gate，不因分派闭环而被完全放开。

---

## 10. 测试策略

### 10.1 单元测试

建议新增测试覆盖：

#### analyzer
- 简单任务识别为单 agent
- 复合任务识别为需要拆解
- writer / backend / frontend / qa 域识别
- commander 仅在复杂任务中被推荐

#### handoff
- packet 字段完整性
- 不同 agent 模板差异化输出
- 缺字段时拒绝构建

#### evaluator
- done / partial / misaligned / needs_verification 四类结果识别
- backend 完成但缺验证 -> 推荐 qa
- commander 输出拆解建议 -> 推荐 PM 二次分派

### 10.2 集成测试

建议新增：

```text
test/dispatch-quality-loop.test.mjs
```

覆盖典型链路：

1. `pm -> writer -> done`
2. `pm -> backend -> qa_engineer`
3. `pm -> commander -> backend`
4. `commander` 不作为默认主 agent

### 10.3 回归测试重点

必须防止回归的问题：

- 把 `commander` 再次误设为主协调者
- handoff packet 退化回普通 prompt
- evaluator 缺失导致 PM 直接信任 subagent 返回
- 自动化默认值被重新改回频繁确认模式

---

## 11. 迁移策略

### 11.1 配置兼容

当前已有的：

- `dispatch_map`
- `pm_workflow_*` 兼容 agent
- OpenCode 原生 agent 映射

第一阶段应全部保留兼容，不做破坏性删除。

### 11.2 渐进迁移路径

建议采用三步迁移：

#### Step 1
先引入类型与模块壳：

- 新增 analyzer / handoff / evaluator
- 不立即切断旧逻辑

#### Step 2
让 `dispatch-tools.ts` 优先走新闭环，但保留 fallback 到旧链路

#### Step 3
在测试稳定后，把旧的“裸推荐 agent”逻辑降级为内部兼容路径

### 11.3 兼容原则

迁移过程中应保证：

- 旧命令仍可运行
- 旧状态文件仍可读取
- 旧配置字段不立即失效
- 不要求用户一次性重写配置

---

## 12. 验收标准

当第一阶段完成后，至少应满足以下验收条件：

1. **主协调角色正确**
   - `pm / 曹操` 始终是主 agent
   - `commander` 不再被当作默认总控入口

2. **分派判断增强**
   - 系统能区分简单任务、复合任务、需拆解任务
   - 系统能给出推荐 agent 与原因

3. **交接质量增强**
   - 每次 dispatch 都生成结构化 handoff packet
   - subagent 收到的信息比当前更完整

4. **回收能力增强**
   - PM 不再直接信任 subagent 的完成声明
   - evaluator 能给出下一步建议

5. **自动化目标不倒退**
   - 默认执行仍保持低确认、少打断
   - 高风险 gate 仍保留

6. **典型链路可验证**
   - `pm -> backend -> qa`
   - `pm -> frontend -> writer`
   - `pm -> commander(建议) -> specialist`

---

## Examples

### 示例 1：文档任务

```text
用户：帮我补 README 的安装说明

PM 分析：
- domain = writer
- complexity = simple
- executionMode = single_agent

-> 构建 writer handoff packet
-> writer 执行
-> evaluator 判断 done
-> PM 汇总回复用户
```

### 示例 2：后端修复后需要验证

```text
用户：修复认证接口 401 问题并确认不影响现有登录流程

PM 分析：
- domain = backend
- complexity = multi_step
- expectedNextAgents = [qa_engineer]

-> backend 执行修复
-> evaluator 判断 needs_verification
-> PM 转派 qa_engineer
-> QA 回收验证
-> PM 汇总结果
```

### 示例 3：复杂跨角色任务

```text
用户：把 onboarding 流程从需求、前端实现、说明文档一起补齐

PM 分析：
- domain = orchestration
- complexity = composite
- needsDecomposition = true

-> commander 输出拆解建议
-> PM 依据建议派给 frontend 和 writer
-> evaluator 分别回收
-> PM 汇总闭环
```

---

## FAQ

### Q1：为什么不直接让 commander 做主协调？

因为这会偏离本项目最初设计目标。用户明确要求 `pm / 曹操` 才是主 agent。`commander` 只能作为可调用专家，而不是默认总控入口。

### Q2：为什么不直接做完整工作流引擎？

因为当前项目阶段更需要“高质量分派闭环”，而不是复杂 orchestration runtime。过早引入重型机制会增加维护成本，削弱自动化体验。

### Q3：为什么要结构化 handoff packet？

因为很多 subagent 失败不是能力问题，而是输入信息不完整。结构化 packet 可以显著减少返工与偏题。

### Q4：evaluator 会不会太重？

第一阶段不会。它只做轻量规则判断，核心是避免 PM 无条件接受 subagent 的“已完成”说法。

### Q5：旧配置会失效吗？

不会。第一阶段采用渐进迁移，旧 `dispatch_map` 和兼容 agent 定义仍然保留，只是在运行时优先走新的闭环链路。

---

## Troubleshooting

### 1. analyzer 总是把任务派给同一个 agent

排查方向：

- 检查任务域规则是否过于宽泛
- 检查 stage 信息是否被错误当成最终决定因素
- 检查 fallback 逻辑是否覆盖了 analyzer 结果

### 2. handoff packet 生成后仍然信息不足

排查方向：

- 是否漏传 inputs / constraints / acceptanceCriteria
- 是否针对不同 agent 使用了同一个通用模板
- 是否遗漏当前 stage / gate / 已知产物

### 3. evaluator 误判为 done

排查方向：

- 是否只依据成功字样，而未核对 deliverables
- 是否缺失 doneDefinition 检查
- 是否未把“缺验证”判定为 `needs_verification`

### 4. commander 又变成默认主 agent

排查方向：

- 检查 `plan.ts` 默认推荐逻辑
- 检查 `dispatch_map` 是否被错误覆盖
- 检查 prompt 层是否把 commander 写成主协调者

---

## Change Log

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-04-30 | v1.0 | 首版设计：定义以 PM 主协调为中心的高质量分派闭环，明确 commander 为可调用专家而非主 agent，并提出 analyzer / handoff / evaluator 三段式最小闭环方案 |
