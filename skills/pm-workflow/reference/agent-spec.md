# OpenCode agent md 规范


参考：https://opencode.ai/docs/zh-cn/agents/

### 路径

- 全局：`~/.config/opencode/agents/<id>.md`
- 项目级：`<projectDir>/.opencode/agents/<id>.md`

文件名（不含 `.md`）即 agent ID。

### 必填字段

```yaml
---
description: <30-1024 字符，必填>
mode: primary | subagent | all     # 不写默认 all
---
```

### 选填字段

| 字段 | 用途 | 取值 |
|---|---|---|
| `model` | 覆盖模型 | `provider/model-id` 格式 |
| `temperature` | LLM 随机性 | 0.0-1.0 |
| `top_p` | 响应多样性 | 0.0-1.0 |
| `steps` | 最大迭代次数 | 数字 |
| `disable` | 禁用 agent | true / false |
| `prompt` | 自定义系统 prompt 文件 | 相对配置文件路径 |
| `permission` | 细粒度权限 | 嵌套对象，见下 |
| `hidden` | 是否在 @ 自动补全菜单显示 | true / false（仅 subagent 有效） |
| `color` | UI 显示颜色 | 十六进制或主题色名 |

> OpenCode 1.17 起 `tools` 已 deprecated。新 agent md 应只写 `permission`。

### `permission` 字段

```yaml
permission:
  read: allow | ask | deny
  edit: allow | ask | deny
  glob: allow | ask | deny
  grep: allow | ask | deny
  list: allow | ask | deny
  bash: allow | ask | deny
  external_directory: allow | ask | deny
  todowrite: allow | ask | deny
  webfetch: allow | ask | deny
  websearch: allow | ask | deny
  lsp: allow | ask | deny
  skill: allow | ask | deny
  question: allow | ask | deny
  doom_loop: allow | ask | deny
  # bash 支持 glob 形式细粒度控制
  bash:
    "*": deny
    "git log*": allow
    "npm run docs:*": allow
  # task 仅 primary agent 用
  task:
    "*": deny
    advisor: allow
    backendcoder: allow
```

**永远 `*` 在前，具体规则在后**（OpenCode "最后匹配优先" 规则）。

### body（系统 prompt）

frontmatter 之后的全部内容是系统 prompt。

- pm-workflow 6 个 agent 的 body 都 ≥ 60 行
- 含 5 段：核心职责 / 工作流程 / 输出格式 / 边界 / 错误处理
- 5 个子代理的输出格式统一为 `summary / verification / risk` 三段反馈

### 内置 agent 不要重定义

OpenCode 已有 5 个内置 agent：`build` / `plan` / `general` / `explore` / `scout`。pm-workflow 不要重名。

---
