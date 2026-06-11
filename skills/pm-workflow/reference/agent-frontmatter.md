# pm-workflow 6 个 agent 完整 frontmatter


主题 apply 后的标准 frontmatter（1.1.4 起，OpenCode 1.17 permission-only）：

### commander.md

```yaml
---
description: 主协调官 — 分析需求、规划分派、收敛验收、决策推进。
mode: primary
temperature: 0.2
display_name: 主协调官
theme: default
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  edit: deny
  bash: deny
  external_directory: deny
  todowrite: allow
  webfetch: allow
  websearch: allow
  lsp: allow
  skill: allow
  question: allow
  doom_loop: allow
  task:
    "*": deny
    advisor: allow
    backendcoder: allow
    designer: allow
    fixer: allow
    writer: allow
    explore: allow
    scout: allow
---
```

### advisor.md

```yaml
---
description: 调研顾问 — 资料调研、方案对比、任务拆解、风险识别。
mode: subagent
temperature: 0.3
display_name: 调研顾问
theme: default
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  edit: deny       ← 顾问不动代码
  bash:
    "*": deny
    "ls *": allow
    "cat *": allow
    "rg *": allow
    "git diff*": allow
  external_directory: deny
  todowrite: deny
  webfetch: allow
  websearch: allow
  lsp: allow
  skill: allow
  question: allow
  doom_loop: allow
---
```

### backendcoder.md

```yaml
---
description: 后端工程师 — API、数据库、服务逻辑、性能优化。
mode: subagent
temperature: 0.2
display_name: 后端工程师
theme: default
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  edit: allow
  bash: allow
  external_directory: deny
  todowrite: deny
  webfetch: ask
  websearch: ask
  lsp: allow
  skill: allow
  question: allow
  doom_loop: allow
---
```

### designer.md

```yaml
---
description: 设计师 — UI/UX 设计、前端代码、交互原型、图像生成。
mode: subagent
temperature: 0.4
display_name: 设计师
theme: default
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  edit: allow
  bash: allow
  external_directory: deny
  todowrite: deny
  webfetch: ask
  websearch: ask
  lsp: allow
  skill: allow
  question: allow
  doom_loop: allow
---
```

### fixer.md

```yaml
---
description: 测试发布员 — 测试、修复、打包、部署、CI/CD。
mode: subagent
temperature: 0.1     ← 最低，工程类要确定性
display_name: 测试发布员
theme: default
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  edit: allow
  bash: allow
  external_directory: deny
  todowrite: deny
  webfetch: ask
  websearch: ask
  lsp: allow
  skill: allow
  question: allow
  doom_loop: allow
---
```

### writer.md

```yaml
---
description: 文档撰稿人 — README、API 文档、注释、发布说明、ADR。
mode: subagent
temperature: 0.3
display_name: 文档撰稿人
theme: default
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  edit: allow      ← 文档可改
  bash:            ← 细粒度
    "*": deny
    "git log*": allow
    "git diff*": allow
    "git status*": allow
    "npm run docs:*": allow
  external_directory: deny
  todowrite: deny
  webfetch: allow
  websearch: allow
  lsp: allow
  skill: allow
  question: allow
  doom_loop: allow
---
```

### `display_name` 与 `theme` 字段说明

这两个是 **pm-workflow 自定义字段**，OpenCode **忽略**（按规范 "未知 frontmatter 字段会被忽略"）。
pm-workflow registry 自己读这两个字段做主题展示。安全保留。

### 主题强制约束的字段

`mode` / `temperature` / `permission` 都由主题强制写入，**不受 `preserveExisting` 影响**。理由：

- 这些是 OpenCode UI 行为（mode 控切换列表）和 pm-workflow 路由设计（task 白名单）的核心
- 用户自定义会破坏整体设计
- 如真要改，应该手动改 md 文件，而非通过主题切换

---
