# Compact Handoff Prompt 设计

日期：2026-05-07  
状态：已确认，待实现计划  
范围：`src/orchestrator/handoff.ts`、`src/orchestrator/prompts.ts`、`src/orchestrator/evaluator.ts` 及相关测试

## 背景

当前 pm-workflow 在将任务分派给 subagent 时，会基于角色说明与 handoff packet 生成 executable prompt。现有结构可以表达任务目标、约束和验收要求，但存在以下问题：

1. 原始任务描述可能被重复承载，例如同时出现在 `goal` 与 `inputs` 中。
2. 长文本缺少明确的裁剪与摘要规则，用户若直接提供大段日志、代码、文档或评审意见，dispatch prompt 会明显膨胀。
3. 不同 agent 共享同一类冗长上下文，缺少按职责裁剪的信息分配。
4. evaluator 目前主要基于“是否有文本输出”进行评估，对结构化回传的要求还不够强。

本次设计目标是在不牺牲任务精度的前提下，减少重复信息与无效 token 消耗，并为后续结构化评估打下基础。

## 目标

1. **精准传达任务**：保留目标、边界、验收和回传要求。
2. **避免重复表达**：同一段原始任务不在多个字段中重复展开。
3. **控制 token 成本**：超长输入采用摘要与引用，而不是全文内嵌。
4. **提升结果可评估性**：subagent 输出格式与 evaluator 规则更紧密对齐。

## 非目标

1. 不在本次设计中引入复杂的多轮压缩链或额外模型调用。
2. 不自动抓取整个文件正文、完整 diff 或完整日志并注入 handoff prompt。
3. 不改变现有 primary/subagent 调用语义。
4. 不把 commands 层改造成第二套独立编排系统。

## 设计原则

1. **原始任务只保留一次**。
2. **全文改为摘要 + 引用**。
3. **按字段上限约束长度**，避免无限膨胀。
4. **按 agent 职责裁剪上下文**，只给必要信息。
5. **输出格式固定化**，降低 evaluator 判断歧义。

## 新的 handoff 信息模型

将现有偏罗列型的 packet，重构为压缩型信息模型。核心字段如下：

### 1. mission

一句话主任务，只保留一次原始任务的核心表达。

要求：

- 只出现一次。
- 优先保留用户动作意图、目标对象与预期结果。
- 不重复复制整段原始 prompt。

示例：

- 完善设置页 UI 交互并补充可验证说明。
- 为发布流程补齐架构说明与中文文档同步。

### 2. context

关键背景摘要，最多 3-5 条短句。

内容可包括：

- 当前阶段或角色定位。
- 为什么交给当前 agent。
- 与上一阶段或上一 agent 的关系。
- 关键风险背景。

目标是替代冗长 `why`，避免把 `analysis.rationale` 全量拼接成大段文字。

### 3. scope

明确当前 agent 应做与不应做的范围边界，分为两类：

- `do`
- `dont`

每类最多 3-5 条，要求短句、可执行、可判断。

示例：

- do：只处理设置页相关组件和交互。
- do：补充必要的验收说明。
- dont：不要扩展到无关页面。
- dont：不要做大规模重构。

### 4. acceptance

真正决定“当前环节是否可视为完成”的验收条件，最多 3 条。

要求：

- 直接对齐任务目标。
- 可被人工或 evaluator 判断。
- 避免与 scope、responseFormat 重复。

### 5. artifacts

只放引用，不放全文。内容包括：

- 相关文件路径
- 相关模块名
- 相关文档名
- 必要时附一句简述

规则：

- 不内嵌大段代码。
- 不内嵌大段日志。
- 不内嵌大段 diff。
- 不内嵌大段文档正文。

### 6. responseFormat

固定短模板，统一 subagent 输出约束：

- `summary:` 做了什么
- `verification:` 如何验证 / 未验证原因
- `risk:` 剩余风险或 blocked 原因

默认不超过 3 个字段；若后续需要按 agent 增补专属字段，应作为受控扩展，而不是自由增长。

## 现有字段映射策略

### 保留但改造

#### `goal` → `mission`

- 保留“任务目标”概念。
- 改为单句主任务。
- 不再长段原样复制。

#### `constraints` → 精简约束 + `scope.dont`

- 只保留关键禁止项与边界约束。
- 风险信息不再无上限塞入 constraints。

#### `acceptanceCriteria` → `acceptance`

- 保留。
- 压缩到最多 3 条。
- 去掉泛化、重复、无法判断的表述。

#### `returnFormat` → `responseFormat`

- 保留“回传格式”概念。
- 固定为短结构。
- 不允许随着 agent 或上下文无限扩写。

### 删除或合并

#### 删除 `inputs` 的原样文本承载

- 不再保留 `inputs: [input.prompt]` 这种完整重复。
- 如需保留用户输入中的实体引用，应转入 `artifacts` 或压缩进 `context`。

#### `doneDefinition` 合并进 `acceptance`

- 二者目标高度重叠。
- 避免单独维持重复字段。

#### `why` 改为 `context[]`

- 不再整段保留。
- 用短句背景摘要替代。

## 长文本压缩规则

### 规则 1：原始 prompt 只保留一次

不允许同一段原始任务同时出现在 `mission`、`inputs`、`why` 等多个字段中。

### 规则 2：超过阈值即摘要

按长度分层处理：

- 短 prompt：直接提炼成 `mission`。
- 中长 prompt：提炼成 `mission` + `context`。
- 超长 prompt：只抽取核心目标、关键对象、明确约束与对象引用。

### 规则 3：大文本一律引用化

如果用户输入中包含大段代码、日志、diff 或文档内容，handoff 中只保留：

- 问题摘要
- 涉及对象
- 文件/模块/文档引用

不保留全文。

### 规则 4：字段数量设置上限

建议默认上限：

- `context`: 最多 4 条
- `scope.do`: 最多 3 条
- `scope.dont`: 最多 3 条
- `acceptance`: 最多 3 条
- `artifacts`: 最多 6 条

这些上限的目的不是机械截断，而是迫使生成逻辑做优先级取舍。

## 按 agent 类型的裁剪策略

### frontend

重点保留：

- mission
- 受影响页面或组件
- 交互边界
- 验收方式

减少：

- 过多流程性背景
- 与发布或文档无关内容

### qa_engineer

重点保留：

- 变更范围
- 验证目标
- 未覆盖风险
- 需要确认的行为

减少：

- 实现细节
- 冗长背景描述

### writer

重点保留：

- 文档目标
- 目标读者
- 涉及章节或文件
- 与代码行为一致性要求

减少：

- 开发实现细节
- UI 或代码级描述

### commander

重点保留：

- 任务目标
- 拆解要求
- 风险排序
- 推荐角色顺序

减少：

- 执行层细节
- 验证层细节

## 推荐的 executable prompt 模板

```text
【执行角色】
你是 <agent-role>，负责完成当前 pm-workflow 分派任务。

【任务目标】
<mission>

【关键背景】
1. <context 1>
2. <context 2>
3. <context 3>

【处理范围】
- 应做：<scope.do>
- 不做：<scope.dont>

【相关对象】
- <artifact 1>
- <artifact 2>

【验收标准】
1. <acceptance 1>
2. <acceptance 2>
3. <acceptance 3>

【回传格式】
summary: ...
verification: ...
risk: ...
```

该模板应替代现有多段重复、无长度控制的表达方式，目标是短、清晰、边界明确、便于 evaluator 判断。

## evaluator 联动要求

若只改 prompt 而不增强 evaluator，收益会受限。建议 evaluator 逐步对齐以下结构：

1. 检查是否包含 `summary:`。
2. 检查是否包含 `verification:`。
3. 检查是否包含 `risk:`。
4. 若输出仅有自然语言但缺少结构字段，应标记为 `partial` 或 `needs_verification`，而不是轻易视为 `done`。

这样可以减少“有一些文本输出，但并不满足交付要求”的误判。

## 分阶段落地建议

### 第一步：最小可落地改造

1. 去掉 `inputs: [input.prompt]`。
2. `goal` 改为压缩版 `mission`。
3. `why` 压缩为 `context[]`。
4. `doneDefinition` 合并进 `acceptance`。
5. `returnFormat` 固定成 `summary / verification / risk`。
6. 对 context、scope、acceptance、artifacts 设置数量上限。

### 第二步：增强版改造

1. 引入超长输入摘要规则。
2. 引入 agent-specific 裁剪逻辑。
3. evaluator 增加对结构字段的显式检查。

## 测试建议

需要新增或更新测试，覆盖以下场景：

1. 原始 prompt 很长时，不会在多个字段中重复展开。
2. 包含大段日志/代码的 prompt 会被摘要并转为引用。
3. frontend / qa / writer / commander 收到的 handoff 信息确实有差异化裁剪。
4. evaluator 能识别缺少 `summary` / `verification` / `risk` 的输出。
5. 空输出仍保持现有 `partial` / `blocked` 保护逻辑。

## 风险与权衡

1. **压缩过度风险**：若 mission/context 提炼过头，可能损失任务精度。
2. **规则维护成本**：agent-specific 裁剪规则需要持续维护。
3. **评估收紧后的兼容性**：旧的自然语言输出可能需要适配新的结构化要求。

因此建议先做最小落地，再逐步增强，而不是一次性引入复杂压缩系统。

## 结论

本设计采用“结构化压缩层”方案，通过新的 handoff 信息模型与固定回传格式，解决当前 dispatch prompt 中的重复、膨胀和评估松散问题。它在“信息精准”与“token 成本可控”之间做平衡，适合作为当前 pm-workflow 的演进方向。
