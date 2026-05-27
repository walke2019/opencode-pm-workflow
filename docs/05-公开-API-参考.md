# pm-workflow 公开 API 参考

> 本文档是 pm-workflow 公开 API 的权威清单。
>
> **从 1.0.0 起，本文档列出的所有符号将作为 SemVer 承诺的载体**：新增（minor）+ 删除/改名（major + deprecation 周期）。在 1.0.0 之前（0.x），本文档保持同步但不强制 SemVer。
>
> 实际可机读的快照位于 `tools/api-snapshot.json`，由 `scripts/api-snapshot.mjs` 自动维护；`prepare-publish` 会校验当前 `dist/index.js` 与快照一致。

## 1. 入口

```js
import {
  // 见下文分类
} from "@walke/opencode-pm-workflow";
```

或显式入口：

| 入口 | 用途 |
| --- | --- |
| `@walke/opencode-pm-workflow` | 默认入口，等同于 `./index` |
| `@walke/opencode-pm-workflow/server` | OpenCode server 插件入口 |
| `@walke/opencode-pm-workflow/tui` | OpenCode TUI 插件入口 |
| `@walke/opencode-pm-workflow/shared` | 与 `index` 同；保留别名 |

## 2. 公开 API 分类

总计 **135 个符号**（不含 `__esModule` / `default`）。按职责分类如下。

### 2.1 OpenCode 插件入口

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `pmWorkflowServerPlugin` | function | OpenCode server 插件构造器 |
| `pmWorkflowTuiPlugin` | function | OpenCode TUI 插件构造器 |
| `pmWorkflowTuiPluginCompat` | function | 1.14.x 兼容入口 |

### 2.2 配置（WorkflowConfig）

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `defaultWorkflowConfig` | function | 返回默认配置 |
| `readWorkflowConfig` | function | 从项目目录读取配置（自动初始化） |
| `seedWorkflowConfig` | function | 用 overrides 初始化项目配置 |
| `normalizeWorkflowConfigOverrides` | function | 标准化用户传入的 overrides |
| `getConfiguredExecutableAgent` | function | 按 dispatch_map 解析 semantic agent → executable agent |
| `getExecutableAgent` | function | 同上的薄包装 |
| `setPermission` | function | 设置 `permissions.allow_*` 字段 |
| `setAutomationMode` | function | 设置 `automation.mode` |
| `getAutomationMode` | function | 读取 `automation.mode` |
| `isAutomationCapabilityEnabled` | function | 判断当前 automation mode 是否启用某能力 |
| `getGlobalWorkflowConfigPath` | function | 全局 `~/.config/opencode/pm-workflow.config.json` 路径 |
| `getGlobalOpenCodeConfigPath` | function | 全局 `~/.config/opencode/opencode.json` 路径 |
| `ensureGlobalWorkflowConfig` | function | 确保全局配置存在（首次写入默认） |
| `readGlobalWorkflowConfigOverrides` | function | 读取全局 overrides |
| `validateWorkflowConfigAgentModels` | function | 校验 agent.model 在全局清单中存在 |
| `configureWorkflowAgentModels` | function | 0.11.1 起的 `pmw models init` 内部实现 |
| `configureOpenCodeAgentModels` | function | 1.0.3 起写入 OpenCode 官方 `opencode.json.agent.<id>.model` |
| `buildDefaultOpenCodeAgentModelAssignments` | function | 1.0.3 起生成 6 个 pm-workflow agent + explore 的模型分配 |

### 2.3 模型清单（Global OpenCode）

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `readGlobalOpenCodeModelInventory` | function | 读取全局 `provider.*.models` 清单 |
| `listGlobalOpenCodeModelKeys` | function | 列出全部完整模型 ID |
| `isGlobalOpenCodeModelKey` | function | 判断某模型 ID 是否在全局清单中 |

### 2.4 状态机（WorkflowState）

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `createInitialState` | function | 创建初始状态 |
| `readState` | function | 读取项目 state.json |
| `writeState` | function | 写入项目 state.json |
| `syncState` | function | 同步 state（推断 stage / docs / review） |
| `defaultRetryState` | function | 默认 retry 状态 |
| `defaultFallbackState` | function | 默认 fallback 状态 |
| `inferStage` | function | 推断当前 WorkflowStage |
| `inferStageLabel` | function | stage 的中文标签 |
| `inferNextStep` | function | 当前 stage 的下一步建议 |
| `inferReviewStatus` | function | 推断 review 状态 |

### 2.5 项目目录与文档

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `getStatePath` | function | `.pm-workflow/state.json` 路径 |
| `getConfigPath` | function | `.pm-workflow/config.json` 路径 |
| `getHistoryPath` | function | `.pm-workflow/history.jsonl` 路径 |
| `getProjectDocsDir` | function | 项目文档目录 |
| `getProjectFeedbackDir` | function | 项目反馈目录 |
| `getProjectScopedDocPath` | function | 项目作用域内文档路径 |
| `getMigrationManifestPath` | function | 迁移清单路径 |
| `ensureProjectStorageDirs` | function | 确保 `.pm-workflow` 目录存在 |
| `ensureStateDir` | function | 确保 state 目录存在 |
| `migrateLegacyProjectArtifacts` | function | 迁移老版项目残留 |
| `getMigrationReport` | function | 读取迁移报告 |
| `resolveDocReadPath` | function | 文档读路径解析（兼容 legacy） |
| `resolveDocWritePath` | function | 文档写路径解析 |
| `getFeedbackReadRoots` | function | 反馈读根目录 |
| `detectDocs` | function | 检测必要文档存在性 |
| `detectHasCode` | function | 检测项目是否含代码 |
| `DOC_FILENAMES` | const | 文档文件名常量 |
| `REVIEW_MARKER_FILENAME` | const | review marker 文件名 |
| `hashFileSha256` | function | 文件 sha256 |

### 2.6 Dispatch / 编排

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `analyzeDispatchTask` | function | 分析任务，给出 recommendedAgent / fallbackAgents |
| `buildDispatchPlan` | function | 构建 dispatch plan（含 stage / blockedReasons） |
| `buildDispatchCommand` | function | 构建完整 dispatch 命令（含 prompt / handoff） |
| `buildExecutionPlan` | function | 构建多步执行计划 |
| `buildExecutionSummary` | function | 汇总执行摘要 |
| `buildHandoffPacket` | function | 构建压缩 handoff packet |
| `buildExecutablePrompt` | function | 渲染最终 prompt 字符串 |
| `buildAutoContinueDispatch` | function | 构建 auto-continue 下一步 dispatch |
| `executeDispatchCommand` | function | 执行 dispatch（支持 ForegroundFallback） |
| `recordDispatchExecution` | function | 写 dispatch.executed 历史 |
| `resolveAgentInvocationSemantics` | function | 解析 primary / subagent / all |
| `resolveLaneContext` | function | 解析 lane（quick/medium/full/debug） |
| `resolveWorkflowAgentDefinition` | function | 项目/全局/legacy/fallback 四级解析 |
| `setLastAgent` | function | 写最近使用 agent |
| `setPreferredSession` | function | 设置 preferred session |
| `summarizeLaneDispatch` | function | lane 视角汇总 |
| `shouldCreateTodoForLane` | function | 是否为该 lane 自动建 todo |
| `inferTopologyFromAnalysis` | function | 从 analysis 推断拓扑 |

### 2.7 Gate / Permission / Confirm

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `buildGateSummary` | function | Gate 总览 |
| `buildExecutionGate` | function | 执行 gate（spec/plan/review/release） |
| `buildPermissionGate` | function | 权限 gate |
| `buildConfirmGate` | function | 显式确认 gate |
| `buildSafetyReport` | function | 安全总报告 |

### 2.8 Retry / Fallback / Recovery

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `buildRetryPlan` | function | 重试计划 |
| `buildFallbackPlan` | function | agent fallback 计划 |
| `buildFallbackCommand` | function | fallback 命令构造 |
| `recordFallbackExecution` | function | 写 fallback.executed 历史 |
| `buildRecoverySummary` | function | recovery 总结 |
| `getLastFailure` | function | 最近一次失败 |

### 2.9 ForegroundFallback（运行时模型降级，0.4.0+）

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `detectFallbackTrigger` | function | 识别 429/timeout/overflow/unavailable 触发器 |
| `resolveFallbackChain` | function | 解析 fallback chain |
| `pickNextFallbackModel` | function | 选取下一个备选 model |
| `buildForegroundFallbackPlan` | function | 完整降级 plan |

### 2.10 Auto-continue（0.5.0+）

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `evaluateAutoContinueGuard` | function | 5 步分层 Guard 评估 |
| `detectFeedbackStopSignal` | function | 中英文用户停止词检测 |
| `markAutoContinueChainStart` | function | 链路启动状态机 |
| `recordAutoContinueStep` | function | 单步成功状态机 |
| `markAutoContinueAborted` | function | 链路终止状态机 |

### 2.11 插件健康检查（0.6.0+）

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `evaluatePluginHealth` | function | 装配健康度评估 |
| `reportPluginHealth` | function | 写 ctx.client.app.log |
| `guardPluginActivation` | function | 进程内 plugin id 哨兵防 hot-reload |
| `_resetPluginActivationGuardForTesting` | function | 仅供测试，不属于 SemVer 承诺范围 |
| `DEFAULT_HEALTH_THRESHOLDS` | const | 默认阈值 |

### 2.12 声明式路由（0.7.0+）

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `parseFrontmatterTaskPermission` | function | 解析 agent markdown frontmatter 中的 permission.task |
| `resolveAgentTaskRouting` | function | 项目优先 → 全局回退 |
| `isSubagentAllowedByDeclarativeRouting` | function | 三级优先级判定 deny > allow|ask > fallback |

### 2.13 量化分派指引（0.4.0+）

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `pickAgentStats` | function | 多候选场景选 1-3 张 agent 卡片 |
| `AGENT_STATS_LIBRARY` | const | 6 个 PM agent 量化卡片库 |

### 2.14 评估与回执

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `evaluateDispatchResult` | function | 评估 dispatch 输出 |
| `recordExecutionReceipt` | function | 写执行回执 |
| `getExecutionReceipts` | function | 列回执 |
| `getExecutionReceiptById` | function | 按 id 取回执 |
| `getLastExecutionReceipt` | function | 最近一次回执 |
| `buildStateSummary` | function | 状态摘要 |
| `buildTodoPolicySummary` | function | todo 策略摘要 |

### 2.15 历史 / 审计

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `appendHistory` | function | 追加 history 事件 |
| `readHistory` | function | 读全部 history |
| `queryHistory` | function | 按 type / limit 查询 |
| `ensureHistoryBootstrap` | function | 确保 history 文件存在 |

### 2.16 Doctor / Repair

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `buildDoctorReport` | function | doctor 全报告 |
| `repairDoctorState` | function | 自动修复 |
| `buildDocsCheckReport` | function | 0.11.0 起 docs 治理检查报告 |

### 2.17 Report Dashboard（0.9.0+）

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `buildHistoryReportSummary` | function | history 摘要 |
| `renderHistoryReportHtml` | function | 单文件 HTML 渲染 |

### 2.18 Agent Library（0.10.0+）

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `listAgentLibrary` | function | 列项目 + 全局 agent，识别 shadow |
| `promoteProjectAgentToGlobal` | function | 安全复制项目 agent 到全局 |
| `doctorAgentLibrary` | function | frontmatter 完整性检查 |
| `applyAgentThemeOverrides` | function | 1.0.3 起局部覆盖固定 agent 的 `display_name` |

### 2.19 OpenCode agent 配置生成

| 符号 | 类型 | 说明 |
| --- | --- | --- |
| `buildOpenCodeAgentConfig` | function | 把 WorkflowAgentConfig 转换为 OpenCode `agent` 字段 |

## 3. 兼容承诺（1.0.0 起生效）

- **新增符号**：minor 版本（如 1.0 → 1.1）。
- **删除/改名/参数列表 breaking 变更**：major 版本（如 1.x → 2.0），且必须先经过至少一个 minor 版本的 deprecation 期，期间符号仍存在但 console.warn。
- **修复 bug 而不改 API**：patch 版本（如 1.0.0 → 1.0.1）。
- **`@beta` 与 `_*` 前缀符号不享受承诺**：例如 `_resetPluginActivationGuardForTesting` 仅供测试，可能在任何版本删除。

## 4. 维护流程

```bash
# 1. 改 src/ 后 build
npm run build

# 2. 校验是否破坏 API（CI 自动跑）
npm run api-snapshot:check

# 3. 有新增/删除时确认无误，更新快照
npm run api-snapshot:update

# 4. 同步本文档
#    - 增加新符号到对应章节
#    - 在 §3 写明版本来源
```

## Change Log

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-05-28 | 1.0.3 | 新增 3 个公开 API：`applyAgentThemeOverrides`、`configureOpenCodeAgentModels`、`buildDefaultOpenCodeAgentModelAssignments`；快照更新到 135 个符号 |
| 2026-05-23 | 0.12.0 | 新建：把 `dist/index.js` 全部 120 个公开 export 按 19 个职责分类列出；与 `tools/api-snapshot.json` 互相校验；prepare-publish 自动跑 api-snapshot check + docs check |
