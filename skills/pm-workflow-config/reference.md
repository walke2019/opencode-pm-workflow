# pm-workflow 完整规范参考

本文件是 [SKILL.md](SKILL.md) 的支持文件，提供 pm-workflow 涉及的全部 OpenCode 规范与字段细节。AI 在解决具体配置问题需要查规范时按需引用。

## 目录

1. [OpenCode agent md 规范](#1-opencode-agent-md-规范)
2. [OpenCode skill md 规范](#2-opencode-skill-md-规范)
3. [pm-workflow 6 个 agent 完整 frontmatter](#3-pm-workflow-6-个-agent-完整-frontmatter)
4. [`pm-workflow.config.json` 配置](#4-pm-workflowconfigjson-配置)
5. [`opencode.json` 中 plugin 配置](#5-opencodejson-中-plugin-配置)
6. [文件路径与目录结构](#6-文件路径与目录结构)
7. [pmw CLI 命令参考](#7-pmw-cli-命令参考)

---

## 1. OpenCode agent md 规范

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
| `tools` | 工具集合控制 | 嵌套对象，见下 |
| `permission` | 细粒度权限 | 嵌套对象，见下 |
| `hidden` | 是否在 @ 自动补全菜单显示 | true / false（仅 subagent 有效） |
| `color` | UI 显示颜色 | 十六进制或主题色名 |

### `tools` 字段

```yaml
tools:
  write: true
  edit: true
  bash: true
  webfetch: true
  task: true              # 仅 primary agent 有意义
  # 也支持通配符
  mymcp_*: false          # 禁用某 MCP 服务器全部工具
```

### `permission` 字段

```yaml
permission:
  edit: allow | ask | deny
  bash: allow | ask | deny
  webfetch: allow | ask | deny
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

## 2. OpenCode skill md 规范

参考：https://opencode.ai/docs/zh-cn/skills/

### 路径（**必须子目录**）

- 全局：`~/.config/opencode/skills/<name>/SKILL.md`
- 项目：`<projectDir>/.opencode/skills/<name>/SKILL.md`
- 兼容：`~/.claude/skills/<name>/SKILL.md` 与 `~/.agents/skills/<name>/SKILL.md`

**文件名必须大写 `SKILL.md`**，必须在 `<name>/` 子目录内。

### Frontmatter

```yaml
---
name: my-skill              # 必填，必须匹配目录名
description: <1-1024 字符>  # 必填
license: MIT                # 可选
compatibility: opencode     # 可选
metadata:                   # 可选
  audience: developers
  workflow: github
---
```

`name` 必须满足 `^[a-z0-9]+(-[a-z0-9]+)*$`：
- 小写字母 + 数字 + 单连字符
- 不以 `-` 开头/结尾
- 不连续 `--`

### Supporting files（rc.9 起 skill auto-install 支持）

```
my-skill/
├── SKILL.md                # 必填，主入口
├── reference.md            # 选填，详细参考（按需加载）
├── examples.md             # 选填，使用示例
└── scripts/                # 选填，可执行脚本
    └── helper.sh           # AI 通过 bash 工具调用
```

**SKILL.md 中引用其他文件**：

```markdown
详细规范见 [reference.md](reference.md)
跑诊断脚本：`bash ${CLAUDE_SKILL_DIR}/scripts/check.sh`
```

`${CLAUDE_SKILL_DIR}` 是 OpenCode/Claude Code 提供的环境变量，指向当前 skill 所在目录。

### 权限控制（在 `opencode.json`）

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "experimental-*": "ask"
    }
  }
}
```

---

## 3. pm-workflow 6 个 agent 完整 frontmatter

主题 apply 后的标准 frontmatter（rc.8 起）：

### commander.md

```yaml
---
description: 主协调官 — 分析需求、规划分派、收敛验收、决策推进。
mode: primary
temperature: 0.2
display_name: 主协调官
theme: default
permission:
  edit: ask
  bash: ask
  webfetch: allow
  task:
    "*": deny
    advisor: allow
    backendcoder: allow
    designer: allow
    fixer: allow
    writer: allow
    explore: allow
    scout: allow
tools:
  write: true
  edit: true
  bash: true
  webfetch: true
  task: true
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
  edit: deny       ← 顾问不动代码
  bash: allow
  webfetch: allow
tools:
  write: false
  edit: false
  bash: true
  webfetch: true
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
  edit: allow
  bash: allow
  webfetch: ask
tools:
  write: true
  edit: true
  bash: true
  webfetch: true
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
  edit: allow
  bash: allow
  webfetch: ask
tools:
  write: true
  edit: true
  bash: true
  webfetch: true
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
  edit: allow
  bash: allow
  webfetch: ask
tools:
  write: true
  edit: true
  bash: true
  webfetch: true
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
  edit: allow      ← 文档可改
  bash:            ← 细粒度
    "*": deny
    "git log*": allow
    "git diff*": allow
    "git status*": allow
    "npm run docs:*": allow
  webfetch: allow
tools:
  write: true
  edit: true
  bash: false      ← bash 整体关闭，permission 控制例外
  webfetch: true
---
```

### `display_name` 与 `theme` 字段说明

这两个是 **pm-workflow 自定义字段**，OpenCode **忽略**（按规范 "未知 frontmatter 字段会被忽略"）。
pm-workflow registry 自己读这两个字段做主题展示。安全保留。

### 主题强制约束的字段

`mode` / `temperature` / `tools` / `permission` 都由主题强制写入，**不受 `preserveExisting` 影响**。理由：

- 这些是 OpenCode UI 行为（mode 控切换列表）和 pm-workflow 路由设计（task 白名单）的核心
- 用户自定义会破坏整体设计
- 如真要改，应该手动改 md 文件，而非通过主题切换

---

## 4. `pm-workflow.config.json` 配置

路径：`~/.config/opencode/pm-workflow.config.json`

```json
{
  "retry": {
    "max_attempts": 2,
    "retryable_actions": [...]
  },
  "fallback": {
    "max_attempts": 1,
    "agent_map": {
      "commander": "commander",
      "advisor": "advisor",
      "backendcoder": "backendcoder",
      "designer": "designer",
      "fixer": "fixer",
      "writer": "writer"
    }
  },
  "agents": {
    "enabled": true,
    "default_mode": "subagent",
    "dispatch_map": {
      "commander": "commander",
      ...
    }
  },
  "automation": { "mode": "assist" },
  "docs": { "storage_mode": "legacy" }
}
```

由 plugin 启动时自动生成；删除后下次启动会重新生成默认配置。

---

## 5. `opencode.json` 中 plugin 配置

路径：`~/.config/opencode/opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "@walke/opencode-pm-workflow@rc",
    "其他 plugin..."
  ]
}
```

支持版本说明符：

| 写法 | 含义 |
|---|---|
| `@walke/opencode-pm-workflow` | 装 latest tag 指向版本 |
| `@walke/opencode-pm-workflow@latest` | 同上 |
| `@walke/opencode-pm-workflow@rc` | 装 rc tag → 当前最新 RC |
| `@walke/opencode-pm-workflow@1.0.0-rc.9` | 锁版本 |

OpenCode 启动时用 Bun 自动装到 `~/.cache/opencode/packages/`。

---

## 6. 文件路径与目录结构

### macOS / Linux

| 类型 | 路径 |
|---|---|
| 配置目录 | `~/.config/opencode/` |
| 数据目录（log） | `~/.local/share/opencode/` |
| 缓存目录（plugin） | `~/.cache/opencode/` |
| pmw fallback projectDir | `~/.cache/pm-workflow/global/` |

### Windows

| 类型 | 路径 |
|---|---|
| 配置目录 | `%USERPROFILE%\.config\opencode\` |
| 数据目录 | `%USERPROFILE%\.local\share\opencode\` |
| 缓存目录 | `%USERPROFILE%\.cache\opencode\` |
| pmw fallback | `%USERPROFILE%\.cache\pm-workflow\global\` |

注意：OpenCode 在 Windows 上**不用** `%APPDATA%`，统一用 `%USERPROFILE%\.config\` 等 Linux 风格。

### plugin 装在哪

```
~/.cache/opencode/packages/
└── @walke/
    └── opencode-pm-workflow@rc/
        └── node_modules/
            └── @walke/
                └── opencode-pm-workflow/
                    ├── package.json
                    ├── dist/
                    └── skills/        ← 包内的 skill 源
```

skill auto-install 把 `skills/<id>/` 同步到 `~/.config/opencode/skills/<id>/`。

---

## 7. pmw CLI 命令参考

```bash
pmw --version                                    # 当前 CLI 版本
pmw doctor                                       # 综合健康检查
pmw doctor --json                                # JSON 输出（脚本友好）

pmw agents list                                  # 列项目级 + 全局级 agent
pmw agents promote <id> [--overwrite]            # 复制项目级 agent 到全局
pmw agents doctor [--json]                       # 检查 agent frontmatter 完整性

pmw agents theme list                            # 列出 5 套内置主题
pmw agents theme preview <id> [--scope]          # 预览渲染（dry-run）
pmw agents theme apply <id> [--scope project|global] [--agents X,Y]  # 落盘

pmw models init --model <id> [--fallback <id>]   # 初始化 agent 主模型
pmw models list                                  # 列出当前模型分配

pmw docs check [--json]                          # 检查 README / 主文档治理规则
pmw verify                                       # 本地跑 typecheck + build + smoke
```

---

## 关联资源

- [SKILL.md](SKILL.md)：主入口
- [troubleshooting.md](troubleshooting.md)：错误诊断目录
- [upgrade.md](upgrade.md)：升级流程
- [uninstall.md](uninstall.md)：卸载流程
- OpenCode 官方文档：
  - https://opencode.ai/docs/zh-cn/agents/
  - https://opencode.ai/docs/zh-cn/skills/
  - https://opencode.ai/docs/zh-cn/permissions/
