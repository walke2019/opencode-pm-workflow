# Agent Definition Registry 设计

日期：2026-05-08  
状态：已确认，待实现计划  
范围：`src/core/config.ts`、新增 agent registry/discovery 模块、`src/orchestrator/analyzer.ts`、`src/server/runtime.ts`、相关测试与文档

## 背景

当前 pm-workflow 已具备 lane orchestration、mode-aware dispatch、compact handoff 与结构化 evaluator。但在 agent 定义来源上，仍存在一部分重复维护问题：

1. pm-workflow 内部保留了一套角色到 agent/model 的配置认知。
2. OpenCode 自身已经通过 agent 目录维护角色定义，运行时真正执行的也是这些 agent。
3. 当角色模型、mode 或描述信息发生变化时，pm-workflow 与 OpenCode agent 定义可能出现漂移。
4. 当前项目还需要进一步补齐 `researcher`、`tech-lead` 等语义路由，如果继续在多处重复维护角色定义，长期成本会越来越高。

用户已明确要求本次设计采用“中度统一”方案：

- 项目级 `.opencode/agents` 优先于全局 `~/.config/opencode/agents`
- 同名冲突时默认采用项目级，但需要可见告警
- pm-workflow 只读取实用集字段：`id/name`、`model`、`mode`、`description`
- 若外部 agent 定义缺失，允许回退到 pm-workflow 内部兼容配置，但必须在诊断信息中可见
- agent 的说明与模型 id 以项目级 / 全局级 `opencode/agents/*.md` 中的定义为准

## 目标

1. **统一 agent 定义来源**：优先从 OpenCode agent 目录读取 agent 基础定义，而不是在 pm-workflow 中长期硬编码同类信息。
2. **保持 pm-workflow 的编排主导权**：任务语义分析、角色选择、fallback 与 dispatch 决策仍由 pm-workflow 负责。
3. **降低重复维护成本**：模型、mode、角色描述等基础信息尽量由外部 agent 定义提供。
4. **保证可诊断性**：让“最终用了哪个 agent、来自哪里、是否覆盖全局、是否触发 fallback”都可见。
5. **平滑兼容现有配置**：不在本次改造中强制移除 `dispatch_map` 或旧配置路径。

## 非目标

1. 不把 `/agent` 目录直接变成任务语义路由规则的唯一来源。
2. 不要求所有 agent `.md` 文件立刻引入统一 frontmatter schema。
3. 不在本次设计中实现复杂 capability matrix、动态 provider fallback 或多层模型竞选逻辑。
4. 不删除现有 `dispatch_map`、示例配置或兼容默认值。
5. 不把 analyzer 重写成依赖 LLM 动态理解 agent 自由文本内容的系统。

## 设计原则

1. **事实源前移，语义控制保留**：agent 的存在、模型、mode、描述尽量从 OpenCode 定义读取；任务语义与委派控制仍留在 pm-workflow。
2. **项目优先于全局**：项目级 `.opencode/agents` 是第一优先级，全局目录仅作补充。
3. **冲突可见，不静默吞掉**：项目级覆盖全局级时，要留下结构化诊断信号。
4. **软依赖而非强依赖**：外部源缺失时允许 fallback，但必须让用户看得见。
5. **避免过度建设**：本期只读取实用集字段，不引入复杂 metadata 规范绑定。

## 总体方案

本次采用 **“项目级优先的 Agent Definition Registry + pm-workflow 最小语义路由保留”** 方案。

核心思想：

1. 引入一层标准化的 **Agent Definition Registry**。
2. registry 负责发现、解析、合并 `.opencode/agents` 与 `~/.config/opencode/agents`。
3. analyzer 继续判断“任务应该交给哪个角色”。
4. dispatch/runtime 再通过 registry 将角色名解析为最终可执行的 agent 定义。
5. 当外部定义缺失时，再回退到 `dispatch_map` / 内置兼容配置。

这样可以把“角色语义判断”和“agent 实体解析”分开，降低耦合。

## 架构分层

### 1. Discovery 层

负责发现 agent 定义文件，按固定顺序扫描：

1. 项目级主路径：`<workspace>/.opencode/agents`
2. 全局级主路径：`~/.config/opencode/agents`
3. 兼容兜底路径：`<workspace>/.opencode/agent`
4. 兼容兜底路径：`~/.config/opencode/agent`

该层只负责：

- 判断目录是否存在
- 列出候选 agent 文件
- 记录来源层级与文件路径

目录优先级必须满足：

- `agents` 永远高于 `agent`
- 项目级永远高于全局级
- 兼容 `agent` 目录只能补缺，绝不能覆盖同名 `agents` 定义

不负责任务语义分析，也不负责最终 dispatch 决策。

### 2. Parsing 层

负责从候选 agent 定义中提取本期允许的“实用集”字段：

- `id/name`
- `model`
- `mode`
- `description`

解析原则：

- 能读取到就保留
- 读不到某字段则留空，交给后续 merge/fallback 处理
- 不依赖自由文本推断复杂 domain/capability

### 3. Registry 层

负责将 discovery + parsing 结果合并成统一注册表，并附带来源与诊断信息。

registry 对外提供：

- 按角色名查询最终 agent 定义
- 查询某个角色是否来自 project/global/fallback
- 查询是否发生同名覆盖
- 查询是否触发缺字段兜底

### 4. Routing / Dispatch 层

继续由 pm-workflow 保持主导：

- analyzer 负责任务语义分析
- orchestrator/runtime 负责角色选择、mode-aware dispatch、fallback、execution

该层不再直接假定 agent/model 定义来自内部固定映射，而是优先消费 registry 的解析结果。

## 发现与优先级规则

### 目录优先级

固定优先级如下：

1. `.opencode/agents`
2. `~/.config/opencode/agents`
3. `.opencode/agent`（仅兼容兜底）
4. `~/.config/opencode/agent`（仅兼容兜底）
5. pm-workflow 内部 fallback

### 同名冲突规则

若项目级与全局级存在同名 agent：

- 最终采用项目级定义
- registry 中记录 `shadowedGlobal: true`
- 保留被覆盖的全局来源信息，供 debug / summary 使用

若同名定义同时出现在 `agents` 与 `agent`：

- 优先采用 `agents`
- `agent` 只能在对应同名 `agents` 不存在时生效
- diagnostics 里应能看出最终是否来自 legacy `agent` 目录

这对应用户确认的策略：**项目优先 + 冲突告警**。

### 缺失兜底规则

若 analyzer/orchestrator 期望使用某个角色，但 registry 未解析出对应 agent，或解析出的字段不完整，则：

1. 先尝试低优先级 legacy `agent` 目录（若主路径 `agents` 未命中）
2. 再尝试现有 `dispatch_map` / 配置映射
3. 再尝试内置兼容默认值
4. 在结果中标记 `usedFallback: true`
5. 提供 `fallbackReason`

这对应用户确认的策略：**软依赖 + 内部兜底**。

## 标准化数据模型

建议引入标准结构：

```ts
type AgentDefinitionSource = "project" | "global" | "fallback"

type ResolvedAgentDefinition = {
  id: string
  model?: string
  mode?: string
  description?: string
  source: AgentDefinitionSource
  filePath?: string
  directoryKind?: "agents" | "agent"
  shadowedGlobal?: boolean
  usedFallback?: boolean
  fallbackReason?: "missing-agent" | "missing-model" | "missing-mode" | "parse-failed"
}
```

若需要保留更丰富的调试信息，可在内部结构增加：

```ts
type AgentRegistryEntry = {
  resolved: ResolvedAgentDefinition
  overriddenGlobal?: {
    filePath?: string
    model?: string
    mode?: string
    description?: string
  }
}
```

但对外暴露给主流程的最小结构应保持克制，避免 registry 变成新的复杂配置系统。

## 与现有模块的职责边界

### registry 负责什么

- 发现 agent 文件
- 解析基础字段
- 合并 project/global
- 生成最终 agent 定义
- 标记覆盖与 fallback 诊断信息
- 保证最终 `model` / `description` 优先匹配 `agents/*.md` 中的定义

### registry 不负责什么

- 决定任务属于 frontend / backend / writer / qa_engineer / researcher / tech-lead / plan 中的哪个域
- 决定是否拆解任务
- 决定是否 auto-continue
- 替代 gate / evaluator / topology / todo policy

### analyzer 继续负责什么

- 从用户任务语义判断目标角色
- 输出“为什么倾向这个角色”的分析结果
- 后续可补齐 `researcher`、`tech-lead` 等独立语义域识别

### runtime / orchestrator 继续负责什么

- 根据 analyzer 结果挑选角色
- 通过 registry 解析最终 agent 定义
- 按 mode-aware 规则选择 `opencode run --agent` 或 `opencode task`
- 在缺失时触发 fallback

## 对现有配置的定位调整

本次不直接删除 `dispatch_map`，而是将其定位调整为：

1. **兼容层**：兼容已有安装与旧配置方式
2. **兜底层**：当 registry 无法提供完整解析结果时作为回退来源
3. **过渡层**：后续若用户尚未维护 `.opencode/agents`，系统仍可运行

因此，`dispatch_map` 不再是推荐的首要事实源，而是“当外部定义不足时的稳定兜底”。

## 读取字段范围

本次只读取用户确认的“实用集”：

1. `id/name`
2. `model`
3. `mode`
4. `description`

理由：

- 足以满足模型/角色/模式统一来源的目标
- 足以支撑 summary、debug 和 dispatch 决策所需信息
- 不要求立即规范全部 agent 文件元数据
- 避免一开始就把 `tags/domains/capabilities` 做成复杂 schema

## 任务语义路由保留策略

本次设计不把任务语义路由交给 `/agents` 或 `/agent` 的自由文本。

仍由 pm-workflow 维护最小语义路由能力，例如：

- UI/交互/组件/样式/响应式 → `frontend`
- API/数据库/服务/鉴权/性能 → `backend`
- 文档/说明/发布说明 → `writer`
- 测试/验证/回归 → `qa_engineer`
- 调研/资料搜索 → `researcher`
- 规划/方案/拆解 → `plan`
- 技术评审/架构审查 → `tech-lead`

区别在于：

- **语义到角色**：仍由 pm-workflow 负责
- **角色到实际 agent 定义**：交由 registry 解析

## 诊断与可观测性设计

为避免“为什么这次不是那个模型”之类的问题难以排查，建议在 dispatch summary、debug 输出或 execution receipt 中增加以下字段：

- `agentSource: project | global | fallback`
- `agentDirectoryKind: agents | agent | fallback`
- `resolvedFrom: <file path>`
- `shadowedGlobal: true | false`
- `usedFallback: true | false`
- `fallbackReason: missing-agent | missing-model | missing-mode | parse-failed`

这些信息不一定都展示给普通用户，但至少应对 debug lane、诊断工具或结构化输出可见。

## 错误处理策略

### 场景 1：目录不存在

- 不报致命错误
- 视为该层无 agent 来源
- 继续尝试下一个层级或 fallback

### 场景 2：agent 文件解析失败

- 不让单个文件解析失败拖垮整个 registry
- 跳过该文件并记录 `parse-failed`
- 如该角色最终无可用定义，再触发 fallback

### 场景 3：只解析到部分字段

- 允许保留部分字段结果
- 缺失 `model` 或 `mode` 时可用 fallback 补齐
- 诊断信息中标记 `usedFallback: true`

### 场景 4：角色存在但 mode 与预期不符

- 不由 registry 决定是否可执行
- 交由现有 mode-aware dispatch 逻辑处理
- registry 只保证把读取到的 mode 原样提供给 orchestrator/runtime

## 测试策略

建议测试覆盖以下层面：

### 1. discovery 测试

- 项目级 `agents` 目录存在 / 不存在
- 全局级 `agents` 目录存在 / 不存在
- `agents` 与 legacy `agent` 同时存在
- 两层同时存在

### 2. merge 测试

- 项目级同名覆盖全局级
- 不同名 agent 正确合并
- 覆盖时保留 `shadowedGlobal`
- `agents` 同名覆盖 legacy `agent`

### 3. fallback 测试

- registry 缺失主路径 `agents` 时可低优先级读取 legacy `agent`
- registry 缺失角色时回退到 `dispatch_map`
- registry 缺失 `model` 或 `mode` 时补齐兜底
- 结构化结果包含 `usedFallback` 与 `fallbackReason`
- 当 `agents/*.md` 已提供 `model` / `description` 时，不允许被内部默认值覆盖

### 4. dispatch 集成测试

- analyzer 输出角色名后，可正确解析最终 agent 定义
- primary / subagent 的路径选择仍符合 mode-aware dispatch 规则
- summary/debug 可展示来源信息

### 5. 回归测试

- 不破坏现有 lane、compact handoff、evaluator、model inventory 测试
- 对尚未定义项目级 `.opencode/agents` 的仓库保持兼容

## 渐进迁移策略

建议按渐进方式推进，而不是一次性替换：

### 第一步：引入 registry，但不改变 analyzer 语义输出

- 先把角色解析能力统一到 registry
- 保持 analyzer 当前输出结构尽量不变

### 第二步：让 runtime / dispatch 优先使用 registry

- 仅当 registry 缺失时才落回 `dispatch_map`

### 第三步：补齐独立语义角色

- 为 `researcher` 与 `tech-lead` 增加更明确的 analyzer 识别与路由
- 并让这些角色也通过 registry 解析实际 agent 定义

### 第四步：更新文档与示例配置定位

- 将 `dispatch_map` 的文档定位改为“兼容/兜底”，而不是唯一推荐入口

## 方案取舍说明

本次没有选择“纯运行时每次全量扫描”的原因：

- 会把发现、解析、合并责任散落到运行路径上
- 测试和调试边界更乱
- 不如 registry 明确、可复用、可诊断

本次也没有选择“完全依赖 agent 自由文本自动推断路由”的原因：

- 不稳定
- 难测试
- 容易随着 agent 文案变化而漂移
- 超出当前 YAGNI 边界

因此，**项目级优先的标准化 registry + 最小语义路由保留** 是当前最均衡的方案。

## 验收标准

本设计完成后，后续实现应满足：

1. pm-workflow 能优先从 `.opencode/agents` 与 `~/.config/opencode/agents` 读取 agent 定义，并仅在主路径缺失时低优先级尝试 legacy `agent` 目录。
2. 同名 agent 冲突时，项目级定义生效，且冲突信息对 debug/diagnostics 可见。
3. analyzer 仍负责任务语义到角色的判断，不被 registry 替代。
4. runtime 能根据 registry 提供的最终 mode 信息继续正确执行 primary/subagent 分流。
5. 未配置项目级 agent 目录的现有用户不会被破坏。
6. `agents/*.md` 中提供的模型 id 与说明会成为最终 resolved 结果的优先来源，不会被内部默认值静默覆盖。
7. 结构化输出能够说明最终 agent 的来源、目录类型与是否触发 fallback。

## 后续实现提示

后续 implementation plan 应重点覆盖：

- 新增 agent discovery / parsing / registry 模块
- 将 config/runtime 中现有角色解析切换为优先依赖 registry
- 为 `researcher` / `tech-lead` 路由预留兼容扩展点
- 新增 registry、fallback、diagnostics、dispatch 集成测试
- 更新 README / runbook / architecture 文档中关于 agent 定义来源的说明
