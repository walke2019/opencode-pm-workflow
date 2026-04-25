# OpenCode PM Workflow And Session Status

## 目的

统一记录当前 `pm-workflow` 的落地状态、OpenCode `Session not found` 问题的判断结果，以及后续应使用的文档入口。

## 当前结论

当前状态应拆成两个问题看：

### 1. `pm-workflow`

结论：**已完成，可用**。

已完成内容：

- `pm-workflow` skill 已创建并放在标准目录
- `SKILL.md` 已改为通过 `read_skill_file(...)` 加载 reference
- `references/` 已清理为普通 Markdown 标题格式，无嵌套 frontmatter
- `scripts/` 下 6 个跨平台 Python 脚本已完成并通过语法检查
- `templates/` 已整理完成
- 第一阶段插件化已完成
- 状态层 V1 已落地（`.pm-workflow/state.json` + `history.jsonl`）
- 事件 / 恢复历史索引 V1 已落地（`pm-get-history` / `pm-get-last-failure` / `pm-get-recovery-summary`）
- 运行时健康检查 / doctor V1 已落地（`pm-doctor`）
- 自检自动修复 / doctor repair V1 已落地（`pm-doctor-repair`）
- 策略配置层 V1 已落地（`.pm-workflow/config.json`）
- 权限 / 危险动作分级 V1 已落地（`permissions.*`，默认禁止执行型工具和发布动作）
- 策略管理工具 V1 已落地（`pm-get-config` / `pm-check-permissions` / `pm-set-permission`）
- TUI 命令层补齐 V1 已落地（`/pm-dispatch` / `/pm-doctor` / `/pm-history` / `/pm-recovery-summary`）
- 策略只读 TUI 入口 V1 已落地（`/pm-config` / `/pm-permissions`）
- 权限策略测试 / dry-run V1 已落地（`pm-dry-run-dispatch` / `pm-dry-run-loop`）
- dry-run TUI 入口 V1 已落地（`/pm-dry-run-dispatch` / `/pm-dry-run-loop`）
- 执行审计 / safety report V1 已落地（`pm-safety-report`）
- TUI 安全审计入口 V1 已落地（`/pm-safety-report`）
- 策略切换 TUI 入口 V1 已落地（`/pm-permission-execute-on` / `/pm-permission-execute-off`）
- 执行前确认 / confirm gate V1 已落地（`confirm.require_confirm_for_execute`）
- 执行会话审计 / execution receipt V1 已落地（`execution.receipt` / `pm-get-last-execution` / `pm-get-execution-receipt` / `pm-get-execution-by-id`）
- 执行回执 TUI 入口 V1 已落地（`/pm-last-execution` / `/pm-execution-receipts`）
- 执行摘要 / execution summary V1 已落地（`pm-get-execution-summary` / `/pm-execution-summary`）
- 调度层 V1 已落地（`pm-get-dispatch-plan` + prompt 中的建议 Agent/动作）
- 调度执行器 V2 已落地（`pm-run-dispatch` + `pm-execute-dispatch` + `last_agent` 回写）
- Gate 驱动执行拦截 V1 已落地（`pm-execute-dispatch` action 级阻止）
- 自动循环编排 V1 已落地（`pm-run-loop`，最多 N 步受控执行）
- 恢复 / 重试层 V1 已落地（`retry` state + `pm-run-loop` 失败追加一次重试）
- 模型 / 执行 fallback 层 V1 已落地（`fallback` state + `plan/build` 受控 fallback）
- 调度执行安全收敛已落地（`spawnSync("opencode", commandArgs, { shell: false })`）
- 审计文档与使用文档已补齐

当前它已经不再只是纯 skill，而是：

```text
skill + plugin + scripts + state layer
```

也就是说，它已经进入“插件增强型业务工作流”阶段，并开始具备事件历史查询、doctor 健康检查、自检自动修复、策略配置、策略管理、权限策略、执行审计、confirm gate、execution receipt、execution summary、dry-run、TUI 只读入口、策略只读 TUI 入口、dry-run TUI 入口、TUI 安全审计入口、TUI 策略切换入口、执行回执 TUI 入口、执行摘要 TUI 入口、调度建议、调度命令生成、受控执行、gate 拦截、受控循环编排、最小失败重试、executable agent fallback 与 argv 安全执行能力。

### 2. OpenCode `Session not found`

结论：**这不是 `pm-workflow` skill 本身的问题，而是 OpenCode 会话入口链路的问题。**

更准确地说：

- 已有 session 可继续使用
- 自动选择 session / 新建 session / `--continue` 路径存在异常
- `oh-my-openagent` / `oh-my-opencode` 主要提供编排增强、fallback、hook 恢复
- 它们**没有直接修复**底层 `workspace/session` 数据一致性问题

## 关键验证结果

### `pm-workflow` 结构验证

- `SKILL.md` 中 `read_skill_file(skill="pm-workflow", ...)`：27 处
- `pm-workflow` skill 总文件数：26
- Python 脚本数：6
- 6 个脚本均可通过 `python3 -m py_compile`
- 状态层目录 `.pm-workflow/` 已生成并写入 `state.json` 与 `history.jsonl`
- 插件 prompt 注入已包含“建议 Agent / 建议动作”

### OpenCode 命令行为验证

失败路径：

```bash
opencode --pure run --agent plan "ping"
opencode --pure run --agent build "ping"
opencode --pure run --continue "ping"
opencode run --agent commander "ping"
```

这些路径会报：

```text
Error: Session not found
```

可用路径：

```bash
opencode --pure run --session ses_2536bfb2affekTj1q0a1HswoVx --agent plan "ping"
opencode run --session ses_2536bfb2affekTj1q0a1HswoVx "ping"
```

这说明当前更像是：

- 自动入口链路异常
- 显式指定已有 session 可绕过问题点

## `oh-my-openagent` 的定位

当前判断：

- 它主要做 agent override、category routing、runtime fallback、hook 恢复
- 它解决的是“运行时可用性”和“失败恢复”
- 它不是直接修复 SQLite 中 `workspace/session` 关系异常

进一步确认的本地机制包括：

- `~/.config/opencode/oh-my-openagent.json` 中的 agent 覆盖与 category 路由
- runtime fallback 配置（模型失败自动回退）
- session recovery / delegate task retry / hook 注入等恢复机制

这些能力的共同点是：

- 它们在**配置层、调度层、恢复层**增强 OpenCode
- 它们帮助系统在很多失败场景下继续工作
- 它们**不直接修复**当前已观察到的 `workspace/session` 数据状态异常

一句话总结：

```text
oh-my-openagent 解决的是上层编排与恢复，不是底层 session/workspace 数据一致性。
```

## 对当前问题的最终判断

当前最准确的判断是：

```text
这不是 pm-workflow skill 的问题；
也不是 oh-my-openagent 已经修好的问题；
而是 OpenCode 会话入口链路在当前数据状态下存在异常，
oh-my-openagent 只能缓解部分运行时失败，不能替代底层数据修复。
```

## 当前可直接使用的文档

### 1. 临时规避方案

当你想先稳定使用 OpenCode，而不碰数据库时，使用：

```text
docs/dev/opencode-session-workaround.md
```

该文档包含：

- 当前可用 `session_id`
- 可复制运行的 `opencode` 命令
- `build` / `plan` / `general` 的推荐用法
- 为什么不要依赖 `--continue`
- 为什么 `commander` 不能直接作为 primary agent

### 2. 最小修复方案

当你准备真正修复 session 入口链路时，使用：

```text
docs/dev/opencode-session-workspace-minimal-fix.md
```

该文档包含：

- 执行前检查 SQL
- 备份步骤
- 最小修复 SQL
- 执行后验证 SQL
- 风险边界说明

### 3. `pm-workflow` 插件与兼容性文档

```text
docs/dev/pm-workflow-plugin-usage.md
docs/dev/pm-workflow-compatibility-audit.md
docs/dev/pm-workflow-state-machine-design.md
```

### 4. 状态与调度总览

```text
docs/dev/opencode-pm-workflow-and-session-status.md
```

## 当前推荐操作

### 如果你的目标是“先继续工作”

直接按 workaround 文档继续：

```text
docs/dev/opencode-session-workaround.md
```

### 如果你的目标是“彻底恢复原生 session 入口”

执行最小修复：

```text
docs/dev/opencode-session-workspace-minimal-fix.md
```

## 当前阻塞项

唯一真正未执行的动作是：

```text
OpenCode SQLite 最小数据库修复
```

它属于数据库写操作，必须在明确授权后执行。

## 变更记录

- 2026-04-21：创建状态总览文档，统一收口 `pm-workflow`、session workaround、minimal fix 三部分信息
