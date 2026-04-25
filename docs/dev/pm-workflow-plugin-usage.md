# pm-workflow Plugin Usage

## 目的

说明 `pm-workflow` 插件层的作用、启用方式、与 `pm-workflow` skill 的协作边界，以及当前版本的限制。

## 前置条件

- 已存在 `pm-workflow` skill：
  - `~/.config/opencode/skills/pm-workflow/`
- 已存在插件文件：
  - `~/.config/opencode/plugins/pm-workflow-plugin.ts`
  - `~/.config/opencode/plugins/pm-workflow-plugin-tui.ts`
- 当前环境可加载本地 TypeScript 插件
- 本机可用 Python 3（插件会优先复用 `pm-workflow/scripts/*.py`）

## 作用

当前插件层分成两部分：

- `pm-workflow-plugin.ts`：server 侧 hook + 自定义工具
- `pm-workflow-plugin-tui.ts`：TUI 侧 toast + slash command

它们共同把最容易失效的流程约束从纯 skill 提示提升到 runtime 能力。

当前版本实现了三十九类能力：

1. `session.created`
   - 检测项目状态
   - 记录当前阶段信息

2. `tui.prompt.append`
   - 将当前项目阶段和下一步建议直接注入提示区
   - 让状态检测结果从后台日志提升为前台可见信息

3. `tool.execute.before`
   - 当检测到 `git commit` 时，执行 `pre_commit_check.py`
   - 编译检查失败则阻止提交

4. `tool.execute.after`
   - 在 `edit` / `write` / `apply_patch` 修改代码文件后，自动写入 `.needs-review`

5. 自定义工具 `pm-check-project-state`
   - 主动返回当前项目阶段和下一步建议

6. 自定义工具 `pm-check-review-gate`
   - 主动返回当前项目是否仍有待 review 的代码变更

7. 自定义工具 `pm-get-next-step`
   - 主动返回当前阶段下最合理的下一步动作

8. 自定义工具 `pm-check-feedback-signal`
   - 主动检测一段用户消息是否包含明显的修正或反馈信号

9. TUI 启动后自动 toast：项目阶段提示

10. TUI 启动后自动 toast：review gate 提示

11. TUI slash command：`/pm-workflow-status`

12. TUI slash command：`/pm-workflow-review-gate`

13. `session.idle`
   - 在会话空闲时运行 `stop_gate.py`
   - 如果仍有 review 未完成，记录警告日志

14. 项目状态持久化：`.pm-workflow/state.json`

15. 状态历史追踪：`.pm-workflow/history.jsonl`

16. 自定义工具：
   - `pm-get-state`
   - `pm-check-gates`
   - `pm-set-preferred-session`

17. 调度层 V1：
   - `pm-get-dispatch-plan`
   - 基于 `state + gates` 返回推荐 agent、动作和阻塞原因

18. 调度执行器 V1：
   - `pm-run-dispatch`
   - 生成可直接执行的调度命令，并写回 `last_agent`

19. 调度执行器 V2：
   - `pm-execute-dispatch`
   - 直接执行推荐命令，并返回 stdout / stderr / exitCode

20. Gate 驱动执行拦截 V1：
   - `pm-execute-dispatch` 执行前检查 action 级 gate
   - gate 不通过时返回阻止原因，不执行命令

21. 自动循环编排 V1：
   - `pm-run-loop`
   - 最多执行指定步数，每一步重新计算 state / gates / dispatch

22. 恢复 / 重试层 V1：
   - 状态层新增 `retry`
   - `pm-run-loop` 在可重试失败时最多追加一次重试

23. 模型 / 执行 fallback 层 V1：
   - 状态层新增 `fallback`
   - retry 仍失败后，可在 `plan` / `build` 之间做一次 fallback 执行

24. 恢复 / fallback 策略配置化 V1：
   - 新增 `.pm-workflow/config.json`
   - retry 次数、可重试 action、fallback 映射可配置

25. 事件 / 恢复历史索引 V1：
   - `pm-get-history`
   - `pm-get-last-failure`
   - `pm-get-recovery-summary`

26. 运行时健康检查 / doctor V1：
   - `pm-doctor`
   - 检查 state/config/history/gates/recovery/preferred session

27. 自检自动修复 / doctor repair V1：
   - `pm-doctor-repair`
   - 安全修复缺失的 state/config/history 运行文件

28. TUI 命令层补齐 V1：
   - `/pm-dispatch`
   - `/pm-doctor`
   - `/pm-history`
   - `/pm-recovery-summary`

29. 权限 / 危险动作分级 V1：
   - `permissions.allow_execute_tools`
   - `permissions.allow_repair_tools`
   - `permissions.allow_release_actions`

30. 策略管理工具 V1：
   - `pm-get-config`
   - `pm-check-permissions`
   - `pm-set-permission`

31. 策略只读 TUI 入口 V1：
   - `/pm-config`
   - `/pm-permissions`

32. 权限策略测试 / dry-run V1：
   - `pm-dry-run-dispatch`
   - `pm-dry-run-loop`

33. dry-run TUI 入口 V1：
   - `/pm-dry-run-dispatch`
   - `/pm-dry-run-loop`

34. TUI 安全审计入口 V1：
   - `/pm-safety-report`
   - 前台 toast 显示执行权限开启前的安全审计摘要

35. 策略切换 TUI 入口 V1：
   - `/pm-permission-execute-on`
   - `/pm-permission-execute-off`

36. 执行前确认 / confirm gate V1：
   - `confirm.require_confirm_for_execute`
   - `pm-execute-dispatch(confirm="YES")`
   - `pm-run-loop(confirm="YES")`

37. 执行会话审计 / execution receipt V1：
   - `execution.receipt`
   - `pm-get-last-execution`
   - `pm-get-execution-receipt`
   - `pm-get-execution-by-id`

38. 执行回执 TUI 入口 V1：
   - `/pm-last-execution`
   - `/pm-execution-receipts`

39. 执行摘要 / execution summary V1：
   - `pm-get-execution-summary`
   - `/pm-execution-summary`

## 与 Skill 的职责边界

### 插件负责

- 会话级状态检测
- 前台阶段提示注入
- 主动项目状态工具
- 主动 review gate 工具
- 主动下一步建议工具
- 主动反馈信号检测工具
- 主动状态快照工具
- 主动 gate 检查工具
- preferred session 写入工具
- 状态持久化与历史文件
- 策略配置文件初始化与读取
- 权限策略检查
- 策略配置读取与安全更新工具
- 权限 / gate / retry / fallback dry-run 工具
- 策略只读 TUI 入口
- 事件历史查询与恢复摘要工具
- 运行时健康检查工具
- 自检自动修复工具
- TUI slash command 入口
- 调度建议工具
- 调度执行命令工具
- 调度直接执行工具
- gate 驱动执行拦截
- 自动循环编排工具
- 恢复 / 重试状态管理
- 模型 / 执行 fallback 状态管理
- 前台 toast 提示
- TUI slash command 入口
- 提交前 gate
- 代码修改后 review 标记
- 会话空闲时的 review gate 检查

### Skill 负责

- 产品流程方法论
- references 文档
- templates 模板
- 角色风格与长上下文说明
- 其余仍需 agent 主动执行的流程

## 启用方式

当前文件放在：

```text
~/.config/opencode/plugins/pm-workflow-plugin.ts
~/.config/opencode/plugins/pm-workflow-plugin-tui.ts
```

根据 OpenCode 官方插件机制，**全局插件目录下的本地插件会自动加载**，因此当前这份插件默认不需要额外写入 `opencode.json`。

只有在以下场景才需要显式写进配置：

1. 想把插件改成 npm 包形式发布
2. 想从项目级目录 `.opencode/plugins/` 改成通过 `plugin` 数组统一管理

当前推荐方式：

- 插件放在 `~/.config/opencode/plugins/`
- skill 放在 `~/.config/opencode/skills/pm-workflow/`
- 重启 OpenCode 后自动生效

状态文件会落在项目目录：

```text
.pm-workflow/state.json
.pm-workflow/history.jsonl
.pm-workflow/config.json
```

## TUI 前台能力

当前 TUI 插件会提供：

1. 启动后自动 toast
   - 当前项目阶段
   - 当前 review gate 状态
   - 当前 dispatch 建议

2. 多个 slash / command 入口

```text
/pm-workflow-status
/pm-workflow-review-gate
/pm-workflow-dispatch
/pm-dispatch
/pm-doctor
/pm-history
/pm-recovery-summary
/pm-config
/pm-permissions
/pm-dry-run-dispatch
/pm-dry-run-loop
/pm-safety-report
/pm-permission-execute-on
/pm-permission-execute-off
/pm-last-execution
/pm-execution-receipts
/pm-execution-summary
```

作用：

- 手动查看当前项目阶段与下一步建议
- 手动查看当前是否仍有待 review 的代码变更
- 手动查看推荐 agent/action
- 手动查看 runtime doctor 摘要
- 手动查看最近历史事件
- 手动查看恢复摘要
- 手动查看策略配置摘要
- 手动查看执行/修复/发布权限策略
- 手动安全预览 dispatch 执行决策
- 手动安全预览 loop 首步决策
- 手动查看开启执行权限前的安全审计摘要
- 手动受限切换 `allow_execute_tools`
- 手动查看最近一次 execution receipt 摘要
- 手动查看最近几次 execution receipt 摘要
- 手动查看 execution receipt 成功率与最近执行摘要

补充说明：

- 根据当前环境的实测表现，全局插件目录中的 TS 插件文件在 server 启动链路里也会先尝试按 server 插件加载一次
- 因此 `pm-workflow-plugin-tui.ts` 当前带有一个 noop `server` 默认导出，用于兼容这条加载路径
- 真正的 TUI 行为仍由命名导出 `plugin: TuiPluginModule` 提供

## 示例

### 提交前阻断

当 agent 或用户执行：

```bash
git commit -m "feat: add feature"
```

插件会先调用：

```text
~/.config/opencode/skills/pm-workflow/scripts/pre_commit_check.py
```

如果 TypeScript 编译失败，插件会直接阻断本次 commit。

### 前台阶段提示

插件会通过 `tui.prompt.append` 向提示区注入如下信息：

```text
## pm-workflow 项目状态
- Product Spec: 已完成/未完成
- Design Brief: 已生成/未生成
- DEV-PLAN: 已生成/未生成
- 项目代码: 已创建/未创建
- 当前阶段: ...
- 下一步: ...
```

这样进入会话时就能直接看到当前项目所处阶段，而不是仅写入日志。

### 主动项目状态查询

插件还注册了一个正式工具：

```text
pm-check-project-state
```

作用：

- 主动返回当前项目处于 `pm-workflow` 的哪个阶段
- 返回下一步建议

典型返回内容：

```text
pm-workflow 项目状态
- Product Spec: 已完成
- Design Brief: 未生成
- DEV-PLAN: 已生成
- 项目代码: 已创建
- 当前阶段: 项目开发中
- 下一步: 继续开发、审查、修复或发布
```

### 主动状态快照查询

插件还注册了：

```text
pm-get-state
```

作用：

- 返回当前 `.pm-workflow/state.json` 的核心状态快照
- 作为后续阶段机、gate 和调度的统一依据

典型返回内容：

```json
{
  "stage": "idea",
  "stageLabel": "全新项目",
  "phase": {
    "current": null,
    "status": "not_started"
  },
  "review": {
    "status": "clean",
    "marker_file": ".needs-review"
  },
  "preferredSession": "ses_2536bfb2affekTj1q0a1HswoVx",
  "nextStep": "使用 pm-workflow 收集产品需求"
}
```

### 主动 review gate 查询

插件还注册了：

```text
pm-check-review-gate
```

典型返回内容：

```text
pm-workflow review gate 状态
- 状态: clean / needs_review
- 标记文件: /path/to/.needs-review
- 说明: 当前没有待 review 的代码变更。
```

### 主动 gate 检查

插件还注册了：

```text
pm-check-gates
```

作用：

- 检查当前项目的 spec / plan / review / release gate
- 返回当前阻塞原因

典型返回内容：

```text
pm-workflow gates 状态
- Spec Gate: blocked
- Plan Gate: blocked
- Review Gate: pass
- Release Gate: blocked
- 阻塞原因: 缺少 Product-Spec.md；缺少 DEV-PLAN.md；未满足 release gate（review 或 phase 未完成）
```

### 主动下一步建议查询

插件还注册了：

```text
pm-get-next-step
```

典型返回内容：

```text
pm-workflow 下一步建议
- 当前阶段: 项目开发中
- 建议动作: 继续开发、审查、修复或发布
```

### 主动反馈信号检测

插件还注册了：

```text
pm-check-feedback-signal
```

输入：

- 一段用户消息文本

典型返回内容：

```text
pm-workflow feedback signal 检测
- detected: yes
- 说明: 检测到用户修正或反馈信号。
- 细节: {"additionalContext":"..."}
```

这个工具适合在你怀疑用户是在纠正 agent 行为时，主动做一次确认。

### 更新 preferred session

插件还注册了：

```text
pm-set-preferred-session
```

作用：

- 更新 `.pm-workflow/state.json` 中的 `preferred_session_id`
- 让 workaround session 不再只靠外部文档维护

### 主动调度建议查询

插件还注册了：

```text
pm-get-dispatch-plan
```

作用：

- 基于当前 `state.json` 与 gate 计算结果
- 返回推荐的 agent、推荐动作、preferred session 和阻塞原因

### 调度执行器 V1

插件还注册了：

```text
pm-run-dispatch
```

作用：

- 基于当前 `state + gates` 生成一条可直接执行的调度命令
- 同时把推荐 agent 写回 `.pm-workflow/state.json` 中的 `last_agent`

典型返回内容：

```text
pm-workflow 调度执行建议
- 当前阶段: 全新项目
- 推荐 Agent: pm
- 推荐动作: collect-spec
- 说明: Spec Gate 未通过，必须先生成 Product-Spec.md。
- 阻塞原因: 缺少 Product-Spec.md；缺少 DEV-PLAN.md；未满足 release gate（review 或 phase 未完成）
- 推荐命令: opencode run --session ses_2536bfb2affekTj1q0a1HswoVx --agent pm "继续当前阶段的推荐动作"
```

### 调度执行器 V2

插件还注册了：

```text
pm-execute-dispatch
```

作用：

- 基于当前 `state + gates` 直接执行推荐命令
- 返回执行结果，包括：
  - `stdout`
  - `stderr`
  - `exitCode`

说明：

- 这是在不修改 OpenCode 核心代码前提下，`pm-workflow` 当前最接近“统一调度执行器”的一层
- 它仍然不是平台级自动编排器，但已经从“给建议”进化到“能触发执行”

### Gate 驱动执行拦截 V1

`pm-execute-dispatch` 执行前会先检查当前推荐动作是否被 gate 允许。

当前已支持的拦截规则：

- `collect-spec`：允许执行，因为缺少 Product Spec 时正应该进入需求收集
- `create-design-brief`：缺少 `Product-Spec.md` 时阻止
- `create-dev-plan`：缺少 `Product-Spec.md` 时阻止
- `start-development` / `continue-development`：缺少 `DEV-PLAN.md` 时阻止
- `start-development` / `continue-development`：存在待 review 代码时阻止
- `run-code-review`：缺少 `Product-Spec.md` 时阻止
- `prepare-release`：Release Gate 未通过时阻止

典型阻止输出：

```text
pm-workflow 调度执行已阻止
- 当前阶段: 项目开发中
- 推荐 Agent: build
- 推荐动作: continue-development
- 拦截原因: 当前存在待 review 的代码变更，应先执行 code review。
- 推荐命令（未执行）: opencode run --session ...
```

### 自动循环编排 V1

插件还注册了：

```text
pm-run-loop
```

作用：

- 按当前 `state / gates / dispatch` 自动执行多步
- 每一步都会重新计算状态和 gate
- 最多执行 1-5 步，避免无限循环
- 任一步 gate 不通过或命令失败即停止
- 命令失败时会查询 retry plan；如 action 可重试且未超过次数，会追加一次重试

输入：

- `steps`：最大执行步数，建议 1-5
- `prompt`：交给自动循环编排的基础任务描述

典型返回内容：

```text
pm-workflow 自动循环编排结果
- 最大步数: 3
- Step 1: pm / collect-spec
  exitCode: 0
  next stage: Spec 已完成
- Step 2: plan / create-dev-plan
  gate blocked: 缺少 Product-Spec.md
```

### 恢复 / 重试层 V1

状态文件新增：

```json
"retry": {
  "status": "idle",
  "action": null,
  "attempts": 0,
  "max_attempts": 2,
  "last_error": null,
  "last_exit_code": null
}
```

规则：

- 成功执行后，retry 状态重置为 `idle`
- 失败执行后，记录失败 action、attempts、exitCode、错误摘要
- `pm-run-loop` 对可重试 action 最多追加一次重试
- `prepare-release` 和 `blocked` 不自动重试

这不是模型 fallback，也不是平台级恢复；它是业务工作流层的最小 retry 状态。

### 模型 / 执行 fallback 层 V1

状态文件新增：

```json
"fallback": {
  "status": "idle",
  "from_agent": null,
  "to_agent": null,
  "action": null,
  "attempts": 0,
  "max_attempts": 1,
  "last_error": null,
  "last_exit_code": null
}
```

规则：

- 原执行失败后，先走 retry 逻辑
- retry 仍失败时，查询 fallback plan
- `plan` 可 fallback 到 `build`
- `build` 可 fallback 到 `plan`
- `prepare-release` 和 `blocked` 不走 fallback
- fallback 执行会同时记录普通 dispatch 历史和 `fallback.executed` 历史

这不是 provider/model 级 fallback；它是业务调度层的最小 executable agent fallback。

### 恢复 / fallback 策略配置化 V1

插件会初始化项目级配置文件：

```text
.pm-workflow/config.json
```

默认内容：

```json
{
  "retry": {
    "max_attempts": 2,
    "retryable_actions": [
      "collect-spec",
      "create-design-brief",
      "create-dev-plan",
      "start-development",
      "run-code-review",
      "continue-development"
    ]
  },
  "fallback": {
    "max_attempts": 1,
    "enabled_actions": [
      "collect-spec",
      "create-design-brief",
      "create-dev-plan",
      "start-development",
      "run-code-review",
      "continue-development"
    ],
    "agent_map": {
      "plan": "build",
      "build": "plan"
    }
  },
  "permissions": {
    "allow_execute_tools": false,
    "allow_repair_tools": true,
    "allow_release_actions": false
  },
  "confirm": {
    "require_confirm_for_execute": true
  }
}
```

说明：

- `retry.max_attempts` 控制同一 action 总尝试次数
- `retry.retryable_actions` 控制哪些 action 可重试
- `fallback.max_attempts` 控制 fallback 尝试次数
- `fallback.enabled_actions` 控制哪些 action 可 fallback
- `fallback.agent_map` 控制 executable agent 的 fallback 方向
- `permissions.allow_execute_tools` 控制是否允许 `pm-execute-dispatch` / `pm-run-loop`
- `permissions.allow_repair_tools` 控制是否允许 `pm-doctor-repair`
- `permissions.allow_release_actions` 控制是否允许 `prepare-release`
- `confirm.require_confirm_for_execute` 控制执行型工具是否必须显式确认

默认策略：

- 执行型工具默认关闭
- 修复型工具默认开启
- 发布动作默认关闭
- 执行前确认默认开启

这样可以避免误触发嵌套 OpenCode 执行或发布动作。

### 执行前确认 / confirm gate V1

执行型工具现在除了权限检查，还会经过 confirm gate：

```text
confirm.require_confirm_for_execute
```

当前受影响入口：

- `pm-execute-dispatch`：需要传 `confirm="YES"`
- `pm-run-loop`：需要传 `confirm="YES"`

默认行为：

- 如果未传 `confirm` 或值不是 `YES`
- 工具会直接返回阻止原因
- 不会执行任何命令

这样即便执行权限已开启，也仍然要求显式确认，避免误执行。

### 执行会话审计 / execution receipt V1

真实执行路径现在会额外写入结构化 receipt：

```text
execution.receipt
```

插件新增只读查询工具：

```text
pm-get-last-execution
pm-get-execution-receipt
pm-get-execution-by-id
```

`pm-get-execution-receipt` 还支持可选过滤：

```text
action=<动作名>
agent=<executable_agent>
success=true|false
```

receipt 主要字段：

- `execution_id`
- `action`
- `executable_agent`
- `prompt_summary`
- `command_args`
- `exitCode`
- `retry_used`
- `fallback_used`
- `stage_before`
- `stage_after`

说明：

- receipt 只在真实执行发生后写入
- dry-run / doctor / safety report 不会生成 receipt
- 当前若没有真实执行，查询结果为空是正常现象
- 如已拿到 `execution_id`，可用 `pm-get-execution-by-id` 精确查询单次回执
- 如要筛选 receipt，可用 `pm-get-execution-receipt(action=..., agent=..., success=...)`

### 执行回执 TUI 入口 V1

TUI 插件新增以下只读 slash commands：

```text
/pm-last-execution
/pm-execution-receipts
```

说明：

- `/pm-last-execution`：toast 显示最近一次 receipt 的 action / agent / exitCode
- `/pm-execution-receipts`：toast 显示最近几次 receipt 摘要
- 若当前没有真实执行，toast 会明确提示当前没有 receipt
- 不执行命令
- 不写 state/config/history

### 执行摘要 / execution summary V1

插件新增只读查询工具：

```text
pm-get-execution-summary
```

并新增 TUI 入口：

```text
/pm-execution-summary
```

摘要字段：

- `total`
- `successCount`
- `failureCount`
- `successRate`
- `lastAction`
- `lastAgent`
- `lastExitCode`
- `lastExecutionId`

说明：

- 用于快速查看最近 execution receipts 的整体情况
- 若还没有真实执行，摘要会返回 0 / null / 空数组
- TUI toast 只展示最关键的 total / success / failure / lastAction

### 权限 / 危险动作分级 V1

插件会在执行型和修复型入口前检查权限策略：

```text
permissions.allow_execute_tools
permissions.allow_repair_tools
permissions.allow_release_actions
```

当前受控入口：

- `pm-execute-dispatch`：需要 `allow_execute_tools=true`
- `pm-run-loop`：需要 `allow_execute_tools=true`
- `pm-doctor-repair`：需要 `allow_repair_tools=true`
- `prepare-release`：需要 `allow_release_actions=true`

如果权限不允许，工具会返回阻止原因，不执行动作。

### 策略管理工具 V1

插件还注册了：

```text
pm-get-config
pm-check-permissions
pm-set-permission
```

作用：

- `pm-get-config`：读取当前 `.pm-workflow/config.json`
- `pm-check-permissions`：查看 execute / repair / release 权限当前状态
- `pm-set-permission`：只允许修改单个 `permissions.*` 布尔值

`pm-set-permission` 支持的 key：

```text
allow_execute_tools
allow_repair_tools
allow_release_actions
```

要求：

- `value` 必须是 `true` 或 `false`
- 每次修改都会写入 `config.permission_updated` 历史事件
- 不允许通过该工具修改 retry/fallback action 列表，避免误改复杂策略

### 策略只读 TUI 入口 V1

TUI 插件新增以下只读 slash commands：

```text
/pm-config
/pm-permissions
```

说明：

- `/pm-config`：显示 retry/fallback/execute 权限摘要
- `/pm-permissions`：显示 execute / repair / release 权限状态
- TUI 层不暴露 `pm-set-permission`，避免误改运行策略

### 权限策略测试 / dry-run V1

插件还注册了：

```text
pm-dry-run-dispatch
pm-dry-run-loop
```

作用：

- 不执行 `opencode run`
- 不写入 state/history
- 只模拟 dispatch、permission、gate、retry、fallback 决策
- 在 `permissions.allow_execute_tools=false` 时也能安全预览执行计划

`pm-dry-run-dispatch` 会输出：

- 当前阶段
- 推荐 agent / executable agent
- 推荐 action
- permission 是否允许
- gate 是否允许
- retry/fallback 是否可用
- 将要执行但不会执行的命令

`pm-dry-run-loop` 会按指定步数模拟 loop，每步输出相同决策，并在 permission 或 gate 阻止时停止模拟。

### dry-run TUI 入口 V1

TUI 插件新增以下只读 slash commands：

```text
/pm-dry-run-dispatch
/pm-dry-run-loop
```

说明：

- `/pm-dry-run-dispatch`：toast 显示推荐 action、permission、gate、retry、fallback 摘要
- `/pm-dry-run-loop`：toast 显示 loop 首步 dispatch / permission / gate 摘要
- TUI dry-run 不执行命令、不写 state、不写 history

### TUI 安全审计入口 V1

TUI 插件新增以下只读 slash command：

```text
/pm-safety-report
```

说明：

- toast 显示 execute 权限、doctor 状态、推荐 action、`safe_to_enable_execute`
- 不执行命令
- 不写 state/config/history
- 用于前台快速判断是否值得临时开启执行权限

### 策略切换 TUI 入口 V1

TUI 插件新增以下受限 slash commands：

```text
/pm-permission-execute-on
/pm-permission-execute-off
```

说明：

- 只允许切换 `permissions.allow_execute_tools`
- 不暴露通用任意配置写入能力
- 开启时 toast 会附带当前 `safe_to_enable_execute` 摘要
- 关闭时会直接恢复安全默认状态
- 会写入 `config.permission_updated` 历史事件

### 事件 / 恢复历史索引 V1

插件还注册了：

```text
pm-get-history
pm-get-last-failure
pm-get-recovery-summary
```

作用：

- 查询 `.pm-workflow/history.jsonl` 中的事件
- 支持按 `type` / `action` / `agent` 过滤
- 快速查看最近一次失败
- 汇总 dispatch failure、fallback execution、stage transition 数量

示例：

```text
pm-get-history(type="dispatch.executed", limit="10")
pm-get-last-failure()
pm-get-recovery-summary()
```

### 运行时健康检查 / doctor V1

插件还注册了：

```text
pm-doctor
```

作用：

- 检查 `.pm-workflow/state.json` 是否存在
- 检查 `.pm-workflow/config.json` 是否存在
- 检查 `.pm-workflow/history.jsonl` 是否存在且可解析
- 检查 preferred session 是否已设置
- 检查 retry/fallback 策略是否合法
- 汇总当前 gate / recovery 状态
- 输出 warnings 与 blockers

典型返回内容：

```text
pm-workflow doctor
- ok: yes
- stage: idea
checks:
- PASS state.json: .../.pm-workflow/state.json
- PASS config.json: .../.pm-workflow/config.json
- PASS history.jsonl: .../.pm-workflow/history.jsonl
- PASS preferred_session_id: ses_2536bfb2affekTj1q0a1HswoVx
warnings:
- 缺少 Product-Spec.md，当前仍处于需求收集前阶段。
```

### 自检自动修复 / doctor repair V1

插件还注册了：

```text
pm-doctor-repair
```

作用：

- 缺 `.pm-workflow/state.json` 时安全生成
- 缺 `.pm-workflow/config.json` 时安全生成
- 缺 `.pm-workflow/history.jsonl` 时安全 bootstrap
- 通过状态读取逻辑迁移缺失的 `retry` / `fallback` 字段
- 写入 `doctor.repair` 历史事件

明确不做：

- 不修改 OpenCode 核心代码
- 不修改 OpenCode SQLite 数据库
- 不自动创建 `Product-Spec.md` / `DEV-PLAN.md` 等业务文档
- 不自动改写 preferred session；为空时仅由 doctor 提示

典型返回内容：

```text
pm-workflow doctor repair
- repaired: none
- before ok: yes
- after ok: yes
- warnings: 缺少 Product-Spec.md，当前仍处于需求收集前阶段。
- blockers: none
```

### TUI 命令层补齐 V1

TUI 插件新增以下只读/安全 slash commands：

```text
/pm-dispatch
/pm-doctor
/pm-history
/pm-recovery-summary
```

说明：

- `/pm-dispatch`：显示当前推荐 agent 与 action
- `/pm-doctor`：显示 runtime 健康状态 toast
- `/pm-history`：显示最近 3 条 history 事件摘要
- `/pm-recovery-summary`：显示 failure / fallback / transition 摘要

当前 TUI 层暂不暴露 `/pm-run-loop` 这种会触发嵌套执行的入口，避免误触发长任务。

### 主动调度建议查询

插件还注册了：

```text
pm-get-dispatch-plan
```

作用：

- 基于当前 `state.json` 与 gate 计算结果
- 返回推荐的 agent、推荐动作、preferred session 和阻塞原因

典型返回内容：

```text
pm-workflow 调度建议
- 当前阶段: 全新项目
- 推荐 Agent: pm
- 推荐动作: collect-spec
- preferred session: ses_2536bfb2affekTj1q0a1HswoVx
- 说明: Spec Gate 未通过，必须先生成 Product-Spec.md。
- 阻塞原因: 缺少 Product-Spec.md；缺少 DEV-PLAN.md；未满足 release gate（review 或 phase 未完成）
```

### 代码修改后自动标记 review

当发生以下工具调用时：

- `edit`
- `write`
- `apply_patch`

只要涉及代码文件，插件就会写入：

```text
.needs-review
```

内容为：

```text
needs_review
```

### 空闲时检查 gate

会话空闲时，插件会执行：

```text
~/.config/opencode/skills/pm-workflow/scripts/stop_gate.py
```

如果仍未 review，当前版本会记录 warning 日志，提醒后续不要忽略 code review。

## 当前限制

1. 当前版本优先复用 skill 中的 Python 脚本
   - 好处：逻辑单一来源，减少重复维护
   - 限制：仍依赖 Python 运行时

2. `session.idle` 当前仍主要记录 warning
   - 虽然已有 TUI toast，但还没有把 idle 检查做成真正的强阻断 UI 流程

3. feedback/evolution 流程尚未插件化
   - 这些仍主要依赖 skill 与脚本

4. 当前状态层还是 V1
   - 已支持状态持久化、历史文件、历史查询、doctor 检查、doctor repair、策略配置、策略管理工具、权限策略、执行审计、TUI 只读入口、TUI 安全审计入口、TUI 策略切换入口、基本 gate 计算、调度建议、调度命令生成、直接执行、gate 拦截、受控循环编排、最小 retry 状态与 executable agent fallback
   - 尚未实现真正的平台级统一自动调度执行器和 provider/model fallback 层

5. 调度执行已改为 argv 数组执行
   - 当前使用 `spawnSync("opencode", commandArgs, { shell: false })`
   - `command` 字符串仅用于展示，不再作为 shell 输入执行
   - 这降低了 prompt 注入风险，但仍需注意 prompt 内容会传递给下游 agent

6. TUI 插件当前带有 server noop 兼容层
   - 这是为了适配当前环境对全局插件目录的实际加载行为

## 排障

### 插件未生效

检查：

- 插件文件是否位于 `~/.config/opencode/plugins/pm-workflow-plugin.ts`
- 插件文件是否位于 `~/.config/opencode/plugins/pm-workflow-plugin-tui.ts`
- 插件路径是否正确
- OpenCode 是否已重启

补充说明：

- 当前这份插件走的是**全局插件目录自动加载**机制，不依赖 `opencode.json` 的 `plugin` 数组
- 只有将来改成 npm 包或改成其他加载方式时，才需要写入配置文件

### 提交前没有阻断

检查：

- 是否真的通过 `bash` 工具执行了 `git commit`
- `pre_commit_check.py` 是否存在
- Python 3 是否可用

### 修改代码后没有写入 `.needs-review`

检查：

- 是否通过 `edit` / `write` / `apply_patch` 修改
- 修改的是不是代码文件而不是 Markdown / JSON / 图片等非代码文件

## 变更记录

- 2026-04-21：创建第一版 `pm-workflow-plugin`
- 2026-04-21：接入 `session.created`、`tui.prompt.append`、`tool.execute.before`、`tool.execute.after`、`session.idle`
- 2026-04-21：新增自定义工具 `pm-check-project-state`
- 2026-04-21：新增自定义工具 `pm-check-review-gate`
- 2026-04-21：新增自定义工具 `pm-get-next-step`
- 2026-04-21：新增自定义工具 `pm-check-feedback-signal`
- 2026-04-21：新增 TUI 插件 `pm-workflow-plugin-tui.ts`
- 2026-04-21：新增 `/pm-workflow-status` 与 `/pm-workflow-review-gate`
- 2026-04-21：新增状态层 V1（`.pm-workflow/state.json` + `history.jsonl`）
- 2026-04-21：新增调度层 V1（`pm-get-dispatch-plan`）
- 2026-04-21：新增调度执行器 V1/V2（`pm-run-dispatch` + `pm-execute-dispatch`）
- 2026-04-21：新增 Gate 驱动执行拦截 V1（`pm-execute-dispatch` action 级阻止）
- 2026-04-21：新增自动循环编排 V1（`pm-run-loop`）
- 2026-04-21：新增恢复 / 重试层 V1（`retry` state + loop retry）
- 2026-04-21：新增模型 / 执行 fallback 层 V1（`fallback` state + plan/build fallback）
- 2026-04-21：调度执行从 shell 字符串改为 `opencode` + `commandArgs[]` argv 执行
- 2026-04-21：新增恢复 / fallback 策略配置化 V1（`.pm-workflow/config.json`）
- 2026-04-21：新增事件 / 恢复历史索引 V1（`pm-get-history` / `pm-get-last-failure` / `pm-get-recovery-summary`）
- 2026-04-21：新增运行时健康检查 / doctor V1（`pm-doctor`）
- 2026-04-21：新增自检自动修复 / doctor repair V1（`pm-doctor-repair`）
- 2026-04-21：新增 TUI 命令层补齐 V1（`/pm-dispatch` / `/pm-doctor` / `/pm-history` / `/pm-recovery-summary`）
- 2026-04-21：新增权限 / 危险动作分级 V1（`permissions.*`）
- 2026-04-21：新增策略管理工具 V1（`pm-get-config` / `pm-check-permissions` / `pm-set-permission`）
- 2026-04-21：新增策略只读 TUI 入口 V1（`/pm-config` / `/pm-permissions`）
- 2026-04-21：新增权限策略测试 / dry-run V1（`pm-dry-run-dispatch` / `pm-dry-run-loop`）
- 2026-04-21：新增 dry-run TUI 入口 V1（`/pm-dry-run-dispatch` / `/pm-dry-run-loop`）
- 2026-04-21：新增 TUI 安全审计入口 V1（`/pm-safety-report`）
- 2026-04-21：新增策略切换 TUI 入口 V1（`/pm-permission-execute-on` / `/pm-permission-execute-off`）
- 2026-04-21：新增执行前确认 / confirm gate V1（`confirm.require_confirm_for_execute`）
- 2026-04-21：新增执行会话审计 / execution receipt V1（`execution.receipt` / `pm-get-last-execution` / `pm-get-execution-receipt` / `pm-get-execution-by-id`）
- 2026-04-21：新增执行回执 TUI 入口 V1（`/pm-last-execution` / `/pm-execution-receipts`）
- 2026-04-21：新增执行摘要 / execution summary V1（`pm-get-execution-summary` / `/pm-execution-summary`）
