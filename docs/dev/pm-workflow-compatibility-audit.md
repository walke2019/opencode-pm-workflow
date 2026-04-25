# pm-workflow Compatibility Audit

## 目的

记录 `pm-workflow` skill 与 OpenCode 官方机制、当前本地增强环境之间的兼容性结论，方便后续维护、迁移和排查。

## 前置条件

- skill 路径位于 `~/.config/opencode/skills/pm-workflow/`
- 当前环境包含 OpenCode 本体与 `oh-my-openagent` 增强配置
- 当前环境已暴露 `read_skill_file`、`run_skill_script`、`skill` 等工具

## 核查范围

- skill 自动发现机制
- `SKILL.md` frontmatter 合法性
- `references/`、`scripts/`、`templates/` 资源组织
- agent / subagent / task 映射
- `qa_engineer`、`build`、`deep` 的真实可用性
- hooks 替代脚本的执行方式

## 结论

`pm-workflow` 在当前环境下可以正常使用，且已完成一轮兼容性收敛：

- 官方兼容能力：可用
- 当前增强环境能力：可用
- 环境迁移稳健性：中上，优于初始版本

当前版本不再把 `deep` 写成唯一默认实现路径，而是改为：

- `build` agent 优先
- `deep` category 作为当前环境增强回退

## 官方保证项

以下能力来自 OpenCode 官方文档或官方 skill/agent 机制，可以作为稳定依赖：

1. skill 发现路径支持：
   - `~/.config/opencode/skills/<name>/SKILL.md`
   - `.opencode/skills/<name>/SKILL.md`

2. `SKILL.md` 必须包含 YAML frontmatter，且至少包含：
   - `name`
   - `description`

3. agent 支持 markdown 定义，路径支持：
   - `~/.config/opencode/agents/*.md`
   - `.opencode/agents/*.md`

4. `mode: subagent` 的 agent 可被主代理调用

5. `build` 是官方稳定的开发主力 agent 语义

## 当前环境增强项

以下能力在当前环境中真实存在并可用，但不建议当作纯官方最小能力假设：

1. `read_skill_file`
   - 可直接读取 skill 包内的 `references/` 与 `templates/` 文件

2. `run_skill_script`
   - 可直接执行 skill 包内 `scripts/` 目录的脚本

3. `qa_engineer`
   - 当前环境自定义 subagent，位于 `~/.config/opencode/agents/qa_engineer.md`

4. `deep`
   - 当前环境来自 `oh-my-openagent.json` 的 category 路由能力
   - 不是官方 agents 文档里的标准 agent 名称

## 文件与结构检查结果

### skill 主文件

文件：

```text
~/.config/opencode/skills/pm-workflow/SKILL.md
```

检查结果：

- frontmatter 合法
- `name` 与目录名一致
- `description` 存在

### references

当前共 12 个文件，包含：

- `product-spec-builder.md`
- `design-brief-builder.md`
- `design-maker.md`
- `dev-planner.md`
- `dev-builder.md`
- `bug-fixer.md`
- `code-review.md`
- `release-builder.md`
- `skill-builder.md`
- `feedback-writer.md`
- `evolution-engine.md`
- `hooks-guide.md`

检查结果：

- 所有 reference 文件可读
- 首行均为 Markdown 标题，而不是嵌套 YAML frontmatter
- `hooks-guide.md` 中出现的 `---` 为 Markdown 分隔线，不是 frontmatter

### scripts

当前共 6 个 Python 脚本：

- `detect_feedback_signal.py`
- `check_evolution.py`
- `pre_commit_check.py`
- `auto_push.py`
- `mark_review_needed.py`
- `stop_gate.py`

检查结果：

- 6/6 通过 Python 语法检查
- 使用 Python 3 标准库实现
- 设计目标为跨平台执行（macOS / Linux / Windows）

## Agent 映射结论

### code-reviewer -> qa_engineer

结论：可用。

原因：

- `qa_engineer` 在当前环境中真实存在
- `mode: subagent` 配置成立
- 适合作为代码审查与 QA 任务载体

限制：

- `qa_engineer` 的默认人格更偏测试与缺陷报告
- 若需要严格执行两阶段 Spec 审查，需要在 task prompt 中明确要求

### implementer -> build 优先，deep 回退

结论：当前写法合理，优于旧版本。

原因：

- `build` 属于官方更稳定的开发 agent 语义
- `deep` 在当前环境可用，但本质更接近 category 路由而不是标准 subagent

建议：

- 默认使用 `build`
- 仅在确认环境支持 category 路由时再使用 `deep`

## hooks 替代机制结论

原技能包中的 hooks 已转换为脚本工具，但执行语义发生变化：

- 不是 OpenCode 平台原生自动 hook
- 而是 agent 按 skill 流程主动调用 `run_skill_script(...)`

这意味着：

- 脚本本身可用
- 但是否执行取决于 agent 是否遵循 skill 规则

## 当前插件化进展

`pm-workflow` 目前已经不再只是纯 skill，还新增了本地插件层：

```text
~/.config/opencode/plugins/pm-workflow-plugin.ts
~/.config/opencode/plugins/pm-workflow-plugin-tui.ts
```

当前插件层已实现：

- `session.created`：项目状态检测
- `tui.prompt.append`：前台阶段提示注入
- TUI toast：前台项目阶段提示
- TUI toast：前台 review gate 提示
- TUI slash command：`/pm-workflow-status`
- TUI slash command：`/pm-workflow-review-gate`
- `tool.execute.before`：提交前 gate
- `tool.execute.after`：代码修改后 review 标记
- `session.idle`：review gate 检查
- 自定义工具 `pm-check-project-state`：主动查询当前阶段与下一步建议
- 自定义工具 `pm-check-review-gate`：主动查询当前项目的 review gate 状态
- 自定义工具 `pm-get-next-step`：主动查询当前阶段下最合理的下一步动作
- 自定义工具 `pm-check-feedback-signal`：主动检测用户消息中的修正或反馈信号
- 自定义工具 `pm-get-state`：主动查询 `.pm-workflow/state.json` 快照
- 自定义工具 `pm-check-gates`：主动检查 spec/plan/review/release gate
- 自定义工具 `pm-set-preferred-session`：更新状态层中的 preferred session
- 自定义工具 `pm-get-dispatch-plan`：基于 state/gates 返回推荐 agent、动作与阻塞原因
- 自定义工具 `pm-run-dispatch`：生成可直接执行的调度命令，并写回 `last_agent`
- 自定义工具 `pm-execute-dispatch`：直接执行推荐命令，并返回 stdout / stderr / exitCode
- Gate 驱动执行拦截 V1：`pm-execute-dispatch` 执行前按 action 检查 gate，不通过则阻止执行
- 自定义工具 `pm-run-loop`：按 state/gates/dispatch 进行最多 N 步的受控自动循环编排
- 恢复 / 重试层 V1：状态层新增 `retry`，`pm-run-loop` 可对失败 action 追加一次受控重试
- 模型 / 执行 fallback 层 V1：状态层新增 `fallback`，retry 失败后可在 `plan` / `build` 间追加一次 fallback 执行
- 恢复 / fallback 策略配置化 V1：新增 `.pm-workflow/config.json`，配置 retry/fallback 策略
- 事件 / 恢复历史索引 V1：新增 `pm-get-history` / `pm-get-last-failure` / `pm-get-recovery-summary`
- 运行时健康检查 / doctor V1：新增 `pm-doctor`，检查 state/config/history/gates/recovery/preferred session
- 自检自动修复 / doctor repair V1：新增 `pm-doctor-repair`，安全修复缺失的 state/config/history 运行文件
- TUI 命令层补齐 V1：新增 `/pm-dispatch` / `/pm-doctor` / `/pm-history` / `/pm-recovery-summary`
- 权限 / 危险动作分级 V1：新增 `permissions.*`，默认禁止执行型工具和发布动作
- 策略管理工具 V1：新增 `pm-get-config` / `pm-check-permissions` / `pm-set-permission`
- 策略只读 TUI 入口 V1：新增 `/pm-config` / `/pm-permissions`
- 权限策略测试 / dry-run V1：新增 `pm-dry-run-dispatch` / `pm-dry-run-loop`，只模拟不执行
- dry-run TUI 入口 V1：新增 `/pm-dry-run-dispatch` / `/pm-dry-run-loop`
- TUI 安全审计入口 V1：新增 `/pm-safety-report`
- 策略切换 TUI 入口 V1：新增 `/pm-permission-execute-on` / `/pm-permission-execute-off`
- 执行前确认 / confirm gate V1：新增 `confirm.require_confirm_for_execute`，执行型工具需显式传 `confirm="YES"`
- 执行会话审计 / execution receipt V1：新增 `execution.receipt`、`pm-get-last-execution`、`pm-get-execution-receipt`、`pm-get-execution-by-id`
- 执行回执 TUI 入口 V1：新增 `/pm-last-execution` / `/pm-execution-receipts`
- 执行摘要 / execution summary V1：新增 `pm-get-execution-summary` / `/pm-execution-summary`
- 状态层目录 `.pm-workflow/`：当前已落地 `state.json` 和 `history.jsonl`

补充说明：

- 当前环境实测表明，全局插件目录中的 TypeScript 插件文件在 server 启动链路中也会先尝试按 server 插件加载
- 因此 `pm-workflow-plugin-tui.ts` 额外提供了一个 noop `server` 默认导出作为兼容层
- 真正的 TUI 行为仍由 `plugin: TuiPluginModule` 命名导出提供

这意味着当前架构已升级为：

- skill 负责知识、模板、方法论
- plugin 负责 runtime 硬约束、主动工具入口、TUI 只读入口、策略只读 TUI 入口、dry-run TUI 入口、TUI 安全审计入口、TUI 策略切换入口、执行回执 TUI 入口、执行摘要 TUI 入口、状态层持久化、历史查询、doctor 检查、doctor repair、策略配置、策略管理、权限策略、执行审计、confirm gate、execution receipt、dry-run、调度建议计算、调度命令生成、调度执行、gate 拦截、受控循环编排、最小 retry 恢复和 executable agent fallback

## 旧待办复核结果

针对历史残留的 3 项 todo，已重新按当前文件状态做过一次严格复核：

1. `SKILL.md` 中的 reference 引用方式
   - 已确认使用 `read_skill_file(skill="pm-workflow", filename="references/...")`
   - 当前共复核到 26 处引用

2. reference 文件 frontmatter 清理
   - 已确认 12 个 reference 文件不存在嵌套 YAML frontmatter 问题
   - `hooks-guide.md` 中出现的 `---` 为 Markdown 正文分隔线，不是文件头 frontmatter

3. 整个 skill 包可用性
   - 当前 skill 包共 26 个文件
   - `scripts/` 下 6 个 Python 文件已再次通过语法检查
   - 目录结构完整：`SKILL.md` + `references/` + `scripts/` + `templates/`

这三项旧待办应视为已完成，不需要再次处理。

## 风险点

### 风险 1：把增强环境能力当成官方默认能力

典型例子：

- `task(category="deep", ...)`
- `read_skill_file(...)`
- `run_skill_script(...)`

这些在当前环境成立，但迁移到更纯净的 OpenCode 环境时需要重新确认。

### 风险 2：qa_engineer 不是原始 code-reviewer 的完全等价人格

虽然机制可调用，但审查风格依赖 prompt，而不是天然继承原技能包的严格规则。

### 风险 3：脚本不是平台强制生命周期

例如：

- pre-commit 检查
- auto-push
- stop gate

它们不是平台自动拦截，而是流程约束。

### 风险 4：调度执行仍会启动嵌套 OpenCode

`pm-execute-dispatch` / `pm-run-loop` 会启动子 `opencode run` 进程。

当前已做的收敛：

- 使用 `spawnSync("opencode", commandArgs, { shell: false })`
- 不再把 prompt 拼入 shell 命令执行
- `command` 字符串只用于展示和审计

剩余风险：

- prompt 内容仍会交给下游 agent，需要避免把不可信输入当作系统指令
- 嵌套 OpenCode 执行仍可能受当前 session/workspace 问题影响

## 迁移建议

如果后续要迁移到更纯的 OpenCode 环境，建议按以下顺序检查：

1. 先检查 skill 目录发现是否正常
2. 再检查 `read_skill_file` / `run_skill_script` 是否仍然可用
3. 如 category 路由不可用，统一回退到 `build`
4. 如 `qa_engineer` 不存在，补一个本地 subagent 或改为 `general` / `explore` + 明确 prompt

## 示例

推荐的实现任务派发写法：

```text
优先：task(subagent_type="build", load_skills=["pm-workflow"], ...)
回退：task(category="deep", load_skills=["pm-workflow"], ...)
```

推荐的审查任务派发写法：

```text
task(subagent_type="qa_engineer", load_skills=["pm-workflow"], ...)
```

## FAQ

### `pm-workflow` 是不是纯官方 OpenCode skill？

不是。它基于官方 skill 机制构建，但同时利用了当前环境的增强能力。

### 现在能不能用？

可以。在当前机器和当前配置下可正常使用。

### 现在是不是已经不只是 skill 了？

是。当前已经是：

```text
skill + plugin + scripts + state layer
```

并且已经进入“状态层 + 事件历史索引 V1 + doctor V1 + doctor repair V1 + 策略配置层 V1 + 策略管理工具 V1 + 权限策略 V1 + 执行审计 V1 + dry-run V1 + TUI 命令层 V1 + 策略只读 TUI 入口 V1 + dry-run TUI 入口 V1 + TUI 安全审计入口 V1 + 调度层 V1 + 调度执行器 V2 + Gate 拦截 V1 + 自动循环编排 V1 + 恢复/重试层 V1 + 模型/执行 fallback 层 V1”阶段。

但它还不是 `oh-my-openagent` 那种平台级运行时增强框架，而是“插件增强型业务工作流”。

### 调度执行现在是否还用 shell 字符串？

不再用于真实执行。

当前真实执行路径是：

```text
spawnSync("opencode", commandArgs, { shell: false })
```

`command` 字符串仍保留，用于提示、日志和人工审计。

### 最大的不稳定点是什么？

`deep` 不是官方标准 agent 名称，而是当前环境的 category 路由能力。

## 排障

### skill 没被发现

检查：

- 路径是否为 `skills/` 而不是 `skill/`
- 文件名是否是全大写 `SKILL.md`
- frontmatter 是否包含 `name` 和 `description`

### references 读不到

检查：

- 是否通过 `read_skill_file(skill="pm-workflow", filename="references/xxx.md")` 调用
- 文件名是否真实存在于 skill 包目录中

### scripts 跑不起来

检查：

- 当前环境是否存在 `run_skill_script`
- Python 3 是否可用

## 变更记录

- 2026-04-21：完成第一版兼容性审计
- 2026-04-21：将 implementer 映射从“deep 唯一实现路径”调整为“build 优先，deep 回退”
