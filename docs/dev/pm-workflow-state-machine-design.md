# PM Workflow State Machine Design

## 目的

为 `pm-workflow` 从“插件增强型业务工作流”升级到“业务插件框架”提供状态层与阶段机设计规范。

本设计遵守以下边界：

- 不修改 OpenCode 核心代码
- 不依赖 OpenCode 内部数据库 schema 扩展
- 优先通过 skill、plugin、脚本、配置和项目侧状态文件实现

## 目标

当前 `pm-workflow` 已经具备：

- skill 方法论
- plugin runtime 注入
- 辅助脚本
- review gate
- session workaround

下一阶段的目标不是继续补零散脚本，而是建立：

1. **统一状态层**
2. **统一阶段机**
3. **统一 gate 系统**
4. **统一调度依据**

这样 `pm-workflow` 才能从：

```text
skill + plugin + scripts
```

进化为：

```text
有状态、有迁移规则、有运行时约束的业务插件框架
```

## 设计原则

### 1. 状态外置

不把业务状态放进 OpenCode 核心数据库。

原因：

- 避免修改 OpenCode 核心实现
- 降低兼容性风险
- 便于迁移和调试

### 2. 项目级优先

状态优先落在项目目录内，保证状态跟着项目走，而不是跟着某个本地运行实例走。

### 3. 只存业务状态，不存大上下文

状态文件只保存：

- 当前处于哪个阶段
- 当前 task / review / release 是否允许推进
- 最近一次验证时间

不保存大段对话，不复制 session 历史。

### 4. 插件只做状态协调，不替代业务文档

状态层负责：

- 判断
- 迁移
- gate
- 调度依据

业务细节仍由：

- `Product-Spec.md`
- `Design-Brief.md`
- `DEV-PLAN.md`
- `references/*.md`

承担。

## 状态文件位置

推荐使用项目内状态目录：

```text
.pm-workflow/state.json
```

推荐配套：

```text
.pm-workflow/
├── state.json
├── history.jsonl
└── locks/
```

说明：

- `state.json`：当前状态快照
- `history.jsonl`：状态迁移历史
- `locks/`：可选的运行时锁文件（如 release lock / review lock）

## 状态模型

### 顶层结构

建议的 `state.json` 结构：

```json
{
  "version": 1,
  "project": {
    "root": "/absolute/path/to/project",
    "name": "project-name"
  },
  "stage": "development",
  "phase": {
    "current": "Phase 2",
    "status": "in_progress"
  },
  "task": {
    "current": null,
    "status": "idle"
  },
  "documents": {
    "product_spec": true,
    "design_brief": false,
    "dev_plan": true
  },
  "review": {
    "status": "needs_review",
    "marker_file": ".needs-review"
  },
  "release": {
    "status": "blocked",
    "last_check_at": null
  },
  "session": {
    "preferred_session_id": "ses_2536bfb2affekTj1q0a1HswoVx",
    "last_agent": "build"
  },
  "timestamps": {
    "updated_at": "2026-04-21T00:00:00Z",
    "last_verified_at": null
  }
}
```

## 核心字段定义

### `stage`

表示当前项目所处的全局阶段。

可选值：

```text
idea
spec_ready
design_ready
plan_ready
development
review_pending
release_ready
released
maintenance
```

### `phase.current`

表示当前 `DEV-PLAN.md` 中正在推进的 Phase。

示例：

```text
Phase 1
Phase 2
Phase 3
```

### `phase.status`

可选值：

```text
not_started
in_progress
blocked
verified
completed
```

### `task.current`

当前正在处理的 task 标识。

如果没有 task 级执行，可为 `null`。

### `task.status`

可选值：

```text
idle
in_progress
blocked
done
```

### `documents`

只记录核心文档是否存在：

- `product_spec`
- `design_brief`
- `dev_plan`

### `review.status`

可选值：

```text
clean
needs_review
reviewing
blocked
```

### `release.status`

可选值：

```text
not_ready
blocked
ready
released
```

### `session.preferred_session_id`

当前项目优先使用的稳定 session。

这能把 workaround 纳入正式状态层，而不是散落在外部文档里。

## 阶段迁移规则

### 1. `idea -> spec_ready`

条件：

- `Product-Spec.md` 存在

### 2. `spec_ready -> design_ready`

条件：

- `Design-Brief.md` 存在

说明：

- 这一步可跳过
- 如果无设计阶段，也可直接走 `spec_ready -> plan_ready`

### 3. `spec_ready / design_ready -> plan_ready`

条件：

- `DEV-PLAN.md` 存在

### 4. `plan_ready -> development`

条件：

- 项目代码目录存在
- 开始进入 build 流程

### 5. `development -> review_pending`

条件：

- 检测到代码修改
- `.needs-review` 状态为 `needs_review`

### 6. `review_pending -> development`

条件：

- review 未通过
- 回到继续实现 / 修复流程

### 7. `review_pending -> release_ready`

条件：

- review 状态为 `clean`
- phase 验证通过
- 编译通过
- 功能验证通过

### 8. `release_ready -> released`

条件：

- release 流程已完成

### 9. `released -> maintenance`

条件：

- 进入迭代修复 / 版本维护状态

## Gate 规则

### Spec Gate

当 `documents.product_spec == false` 时：

- 禁止进入 `dev-builder`
- 禁止进入 release

### Plan Gate

当 `documents.dev_plan == false` 时：

- 禁止进入开发主流程

### Review Gate

当 `review.status == needs_review` 时：

- 禁止 release
- 禁止 stop
- 禁止标记 phase 完成

### Phase Gate

当 `phase.status != completed` 时：

- 禁止推进到下一 phase

### Release Gate

当以下任一条件不满足时：

- review clean
- phase verified
- release check passed

则：

- `release.status = blocked`

## 插件职责

状态层落地后，plugin 应承担以下职责：

### 1. 读写状态文件

- 启动时读取 `.pm-workflow/state.json`
- 文件变化后更新状态
- 关键事件发生后写回状态

### 2. 维护迁移历史

每次状态迁移追加到：

```text
.pm-workflow/history.jsonl
```

记录内容建议包含：

- 时间
- 旧状态
- 新状态
- 触发原因
- 触发事件

### 3. 提供状态工具

建议后续插件正式提供：

```text
pm-get-state
pm-get-stage
pm-get-next-step
pm-advance-stage
pm-check-gates
pm-set-review-status
pm-set-preferred-session
```

### 4. 注入前台状态提示

将以下信息持续注入 TUI/prompt：

- 当前 stage
- 当前 phase
- 当前 review 状态
- 当前下一步建议

## Skill 职责

状态层建立后，skill 继续承担：

- 方法论
- 长说明文档
- references
- templates
- 人格与表达风格

换句话说：

- plugin 负责“系统怎么运作”
- skill 负责“系统应该怎么做”

## 推荐实施顺序

### 第一阶段

先实现：

1. `.pm-workflow/state.json`
2. `stage` / `phase` / `review` 三类核心字段
3. 基础迁移规则
4. `pm-get-state` / `pm-get-next-step`

### 第二阶段

再实现：

5. `history.jsonl`
6. gate 系统
7. `pm-set-review-status`
8. `pm-set-preferred-session`

### 第三阶段

最后实现：

9. 统一调度逻辑
10. phase 自动推进
11. release readiness 计算

## 不做的事

当前设计明确不做：

- 修改 OpenCode 核心代码
- 修改 OpenCode 官方数据库 schema
- 把大段对话历史复制进状态文件
- 让状态文件替代 Product-Spec / DEV-PLAN

## 变更记录

- 2026-04-21：创建第一版状态层与阶段机设计规范
