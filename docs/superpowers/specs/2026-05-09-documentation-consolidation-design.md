# pm-workflow 文档收敛与重组设计

## 1. 背景

当前仓库中的文档已经覆盖了架构、路由、自动续跑、使用方式、迁移、发布、兼容性、设计 spec、implementation plan 等多个主题，但存在以下问题：

- 文档数量过多，读者很难判断哪篇才代表当前真实机制。
- README、`docs/dev`、`docs/runbooks`、`docs/specs`、`docs/superpowers` 之间存在信息重复与版本漂移。
- 许多文档仍保留历史阶段的叙述方式，已经不适合作为现行入口。
- 流程图散落在多篇文档中，职责边界与阅读路径不清晰。
- 维护成本高：同一条机制变化常常需要改动多篇文档，且容易漏改。

用户要求对全项目文档进行复核与精简，并将现有内容按项目真实情况收敛到不超过 5 篇主文档，且必须覆盖：

- 技术架构（含流程图）
- 业务功能与任务流转（含流程图）
- 使用与运维
- 当前 todo / 演进清单

## 2. 目标

本次文档重组目标如下：

1. 将现行有效文档收敛到 **5 篇以内**。
2. 所有主文档均以 **当前真实实现机制** 为准，不再让历史文档承担现行入口职责。
3. 流程图并入主文档正文，不再零散维护。
4. 删除过时、重复、碎片化、仅剩阶段性参考价值的文档。
5. 让读者只需阅读少量主文档即可理解项目定位、架构、流程、使用方式与后续计划。

## 3. 非目标

以下内容不属于本次工作的目标：

- 不保留大量历史 spec / plan 作为主入口。
- 不为了“文档完整性”继续维持现有多层目录结构。
- 不为每个历史改造阶段保留单独说明文档。
- 不引入新的文档体系或第二套知识库目录。

## 4. 设计原则

### 4.1 单一现行真相

同一机制的当前版本说明只能在主文档中存在一份权威描述，避免 README、架构文档、runbook、设计文档各自维护一套说法。

### 4.2 文档按读者任务组织，而不是按历史产物组织

文档结构应围绕“我是谁、系统怎么工作、我怎么用、接下来做什么”来组织，而不是围绕历史 spec、plan、migration、audit 的形成过程来组织。

### 4.3 历史材料能吸收就吸收，不能吸收就删除

本次不采用“全部保留归档入口”的策略。若某文档只剩重复信息或阶段性记录价值，应直接删除。

### 4.4 流程图服务正文

流程图不再单独散落维护，而是合并到承载对应主题的主文档中，并全部以当前真实机制重绘与统一中文化。

### 4.5 总量优先受控

文档数量必须控制在 **README + 4 篇主文档** 之内；若内容超载，优先做结构压缩与章节重组，而不是继续新增文档。

## 5. 目标文档结构

本次收敛后的目标结构如下：

1. `README.md`
2. `docs/01-技术架构.md`
3. `docs/02-业务功能与任务流转.md`
4. `docs/03-使用与运维手册.md`
5. `docs/04-待办与演进清单.md`

### 5.1 README.md

定位为首次进入项目时的唯一总入口，负责：

- 项目定位
- 安装与接入方式
- 核心工作流原则
- 当前版本说明
- 4 篇主文档导航

README 不再承载过多内部实现细节，但要明确项目的真实机制边界，例如：

- `pm_workflow_caocao` 是统一主协调入口
- command lanes 只是 facade，不是第二套 runtime
- 任务语义层、agent registry、runtime 分层存在且职责不同

### 5.2 docs/01-技术架构.md

作为维护者阅读的第一主文档，负责说明：

- 核心任务域与角色边界
- `Analyzer / Registry / Runtime / Evaluator / Gate` 分层职责
- `lane facade -> PM 主协调 -> specialist` 的总体结构
- primary / subagent 调用分流
- agent 定义来源与解析优先级
- 核心架构图与调用路径图

该文档需要吸收现有架构总览、路由实现、lane mapping、subagent migration 中与“当前机制”有关的稳定内容。

### 5.3 docs/02-业务功能与任务流转.md

作为“系统会怎样推进任务”的主文档，负责说明：

- 项目阶段（idea/spec/plan/dev/review/release 等）
- dispatch 动作与下一步推荐
- auto-continue 的业务语义与边界
- 复合任务如何由主 agent 编排
- 用户视角的任务流转图
- lane 的业务选择方式

该文档重点回答“系统如何把一个任务从想法推进到发布”。

### 5.4 docs/03-使用与运维手册.md

负责操作层内容：

- 插件接入方式
- 配置文件位置与说明
- 常用 `pm-*` tools 及推荐执行顺序
- 诊断与故障排查
- 发布前验证与发布步骤
- 常见问题

该文档需要吸收现有 runbook、plugin usage、publish checklist、readiness 等操作性内容。

### 5.5 docs/04-待办与演进清单.md

负责说明当前项目状态与后续方向：

- 已完成能力
- 已确认但暂不扩张的边界
- 当前未完成项
- 后续演进方向
- 文档治理规则（例如新增 agent 不自动扩展语义角色）

该文档不是历史 changelog，也不是 release note，而是“当前项目的活跃待办与架构演进约束”。

## 6. 现有文档处理策略

### 6.1 保留并重写

- `README.md`

### 6.2 主要吸收来源（内容并入新主文档）

- `docs/dev/pm-workflow-architecture-overview.md`
- `docs/dev/pm-workflow-routing-and-auto-continue.md`
- `docs/runbooks/pm-workflow-usage-flow.md`
- `docs/dev/command-lane-mapping.md`
- `docs/dev/subagent-dispatch-migration.md`
- `docs/dev/pm-workflow-plugin-usage.md`
- `docs/dev/pm-workflow-state-machine-design.md`
- `docs/dev/pm-workflow-plugin-publish-checklist.md`
- `docs/dev/pm-workflow-plugin-release-readiness.md`
- `docs/dev/pm-workflow-plugin-release-notes-draft.md`
- `docs/dev/pm-workflow-plugin-migration-summary.md`
- `docs/dev/pm-workflow-compatibility-audit.md`
- `docs/dev/opencode-pm-workflow-and-session-status.md`
- `docs/specs/2026-04-30-pm-workflow-diagrams-design.md`

### 6.3 默认删除对象

以下类型文档默认删除，除非在重组过程中发现其包含无法从其他文档恢复、且仍与当前机制直接相关的必要信息：

- 历史 spec / implementation plan
- migration summary / draft / audit / readiness 文档
- 与当前主文档内容重复的 runbook / dev 文档
- 仅用于阶段性讨论的 superpowers spec / plan 文档

## 7. 流程图策略

本次只保留对当前读者有价值的少量流程图，并统一放入主文档正文：

- 技术架构总览图
- primary / subagent 调度图
- 业务任务流转图
- 使用/运维常用动作图（若确有必要，且不与前两类重复）

流程图要求：

1. 全部中文化
2. 全部对齐当前真实机制
3. 不保留同义重复图
4. 不再额外维护“只放图不讲正文”的文档

## 8. 删除与风险控制

### 8.1 删除策略

本次采用激进精简策略：旧文档能删就删，不以“以后可能有用”为由保留大量入口。

### 8.2 风险

主要风险有两个：

1. 删除过猛导致个别仍有价值的信息丢失。
2. 合并后主文档过长、章节职责不清。

### 8.3 控制方式

- 先完成内容映射与目标文档分配，再执行删除。
- 对每篇保留文档明确职责边界，避免把所有内容堆进单篇文档。
- 以“是否解释当前机制”作为保留判断标准，而不是“是否曾经写过”。

## 9. 验收标准

本次文档重组完成后，应满足：

1. 仓库现行主文档总数不超过 5 篇。
2. README 与 4 篇主文档之间职责清晰、无明显重复真相。
3. 当前真实机制可仅通过主文档读懂。
4. 历史 spec / plan / migration / audit / draft 文档已大幅删除。
5. 流程图全部与当前机制一致，且并入主文档正文。

## 10. 推荐实施顺序

1. 盘点现有文档 -> 建立“保留 / 吸收 / 删除”映射
2. 先重写 README 与 4 篇主文档骨架
3. 再把现有内容归并进去
4. 重绘并统一流程图
5. 最后删除旧文档并清理目录入口
