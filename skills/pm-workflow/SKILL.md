---
name: pm-workflow
description: pm-workflow（@walke/opencode-pm-workflow）插件全场景帮手——首次安装、升级、配置、诊断、排错、卸载，以及 6 个固定 agent（commander / advisor / backendcoder / designer / fixer / writer）的主题切换、模型分配、权限调整、UI 切换列表问题。AI 应在用户提到 pm-workflow / pmw / 任一固定 agent ID / OpenCode plugin 加载失败 / agent md 缺字段 / skill 不识别 / 切换列表显示太多 / 切三国主题 / 给 commander 配 Opus / 等场景时主动加载此 skill。这是 pm-workflow 的唯一 AI 入口，集成了之前分散的 pm-workflow-config / agent-theme-config / agent-model-config 三个 skill。
license: MIT
compatibility: opencode
metadata:
  audience: pm-workflow users
  scope: install-config-theme-model-debug-uninstall
---

# pm-workflow

任何涉及 `@walke/opencode-pm-workflow` 的问题都从这里开始。

**第一步永远是跑诊断**：

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/check.sh
```

它会一次性输出环境、CLI、plugin cache、skills、agents、log 错误的全部状态，让你立刻定位问题在哪一层。

## 触发词与流程导航

| 用户说什么 | 走哪条分支 | 详细文档 |
|---|---|---|
| "怎么装 pm-workflow" / "怎么用 commander" | § 1 首次安装 | — |
| "升级到最新版" / "我要用最新 rc" | § 2 升级 | [upgrade.md](upgrade.md) |
| "pmw doctor 报错" / "OpenCode 加载失败" / "mkdir 失败" | § 3 诊断 | [troubleshooting.md](troubleshooting.md) |
| "切三国主题" / "改 designer 的展示名" / "应用主题" / "回滚到默认主题" | § 4 主题 | [theme.md](theme.md) |
| "给 commander 配 Opus" / "designer 用 GPT-5" / "为子代理分配模型" | § 5 模型 | [model.md](model.md) |
| "切换列表显示太多" / "UI 看到 6 个 agent" | § 6 切换列表问题 | — |
| "writer 跑不了 git log" / "commander 不调 backendcoder" | § 7 权限问题 | — |
| "AI 不知道有什么主题" / "skill 没生效" | § 8 skill 加载问题 | — |
| "彻底卸载 pm-workflow" | § 9 卸载 | [uninstall.md](uninstall.md) |
| 任何含 "pm-workflow" / "pmw" / "@walke" 的报错 | 先跑 `scripts/check.sh` | [troubleshooting.md](troubleshooting.md) |
| 想看完整规范（agent / skill / config 字段） | — | [reference.md](reference.md) |

## 6 个固定 agent

pm-workflow 永远只有这 6 个语义 agent，ID 永不可改：

| ID | 职责 | mode |
|---|---|---|
| `commander` | 主控、决策、协调、分派 | **primary**（OpenCode UI 切换列表唯一显示它） |
| `advisor` | 调研、分析、拆解、决策顾问 | subagent |
| `backendcoder` | 后端代码（API、数据库、服务、性能） | subagent |
| `designer` | 设计 + 前端代码 + 交互原型 + 图像生成 | subagent |
| `fixer` | 测试 + 修复 + 打包 + 部署 + CI/CD | subagent |
| `writer` | 文档撰写 + 发布说明 + 注释 + ADR | subagent |

详细 frontmatter / permission 表见 [reference.md](reference.md)。

## 核心约束（每次操作前必查）

| 约束 | 验证方法 | 引入版本 |
|---|---|---|
| **CLI 版本对齐** | `pmw --version` 与 plugin cache 里 package.json 的 version 一致 | rc.4 |
| **Skill 子目录结构** | `~/.config/opencode/skills/<id>/SKILL.md`（不是扁平 `<id>.md`） | rc.7 |
| **Agent md 完整字段** | 含 `description` / `mode` / `temperature` / `tools` / `permission` | rc.8 |
| **mode 严格约束** | commander = primary，其他 5 个 = subagent | rc.6 |
| **6 个固定 ID 永不可改** | commander / advisor / backendcoder / designer / fixer / writer | rc.6 |
| **跨平台兼容** | 用 `os.homedir()` / `os.tmpdir()`，不用 `process.env.HOME` | rc.5 |

---

## § 1 首次安装

### Step 1.1：检查环境

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/check.sh
```

如果缺 Node ≥ 20 或 npm，先告诉用户装。

### Step 1.2：在 `~/.config/opencode/opencode.json` 加 plugin 行

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "@walke/opencode-pm-workflow@rc"
  ]
}
```

如果用户已有其他 plugin，append 进去；不要覆盖。

### Step 1.3：装全局 CLI

```bash
npm install -g @walke/opencode-pm-workflow@rc
pmw --version
```

### Step 1.4：启动 OpenCode

让用户**双击启动 OpenCode**（GUI 应用 shell 触不到，必须用户操作）。

启动时 plugin 会自动：
- Bun 装 plugin 到 `~/.cache/opencode/packages/@walke/opencode-pm-workflow@rc/`
- skill auto-install 把包内 `skills/pm-workflow/` 整个目录递归同步到 `~/.config/opencode/skills/pm-workflow/`（含 supporting files + scripts/）
- 创建 `~/.config/opencode/pm-workflow.config.json`（默认配置）

### Step 1.5：验证

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/check.sh
```

应该看到所有 ✓。

### Step 1.6：询问主题与模型

启动后问用户：

1. **主题**："要给 6 个 agent 应用主题（默认 / 三国 / 西游 / 漫威 / 现代职场）吗？" → 详细工作流见 [theme.md](theme.md)
2. **模型**："要为 6 个 agent 单独配模型吗（不配则全部跟随 commander 主模型）？" → 详细工作流见 [model.md](model.md)

---

## § 2 升级

详见 [upgrade.md](upgrade.md)。

互动式升级脚本：

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/upgrade.sh
```

---

## § 3 诊断

详见 [troubleshooting.md](troubleshooting.md)，含 12 种常见错误的诊断树。

第一步永远是综合健康检查：

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/check.sh
```

---

## § 4 主题切换

完整工作流详见 [theme.md](theme.md)。

简单流程：

```bash
# 1. 列出 5 套内置主题
pmw agents theme list

# 2. 预览（dry-run，不写盘）
pmw agents theme preview <theme-id> --scope global

# 3. 应用（落盘到 ~/.config/opencode/agents/）
pmw agents theme apply <theme-id> --scope global
```

5 套主题：`default` / `sanguo` / `xiyou` / `marvel` / `workplace`。

主题只换 frontmatter `description` / `display_name` / `theme` 与 body 文案，**不改语义 ID 与路由**。

---

## § 5 模型分配

完整工作流详见 [model.md](model.md)。

**核心原则**：`agent md 不写 model 字段`（rc.8 起）。模型由 `~/.config/opencode/opencode.json` 单独配置：

```json
{
  "agent": {
    "commander": { "model": "opencode/gpt-5" },
    "backendcoder": { "model": "opencode/gpt-5" },
    "advisor": { "model": "opencode/gpt-5-mini" },
    "writer": { "model": "opencode/gpt-5-mini" },
    "designer": { "model": "opencode/gpt-5" },
    "fixer": { "model": "opencode/gpt-5" }
  }
}
```

或用 `pmw models init` 工具帮用户分配。详见 [model.md](model.md)。

---

## § 6 切换列表显示问题

### 症状

用户在 OpenCode UI 按 Tab 键看到全部 6 个 agent，应该只 commander。

### 诊断

```bash
grep "^mode:" ~/.config/opencode/agents/*.md
```

预期输出：

```
~/.config/opencode/agents/advisor.md:mode: subagent
~/.config/opencode/agents/backendcoder.md:mode: subagent
~/.config/opencode/agents/commander.md:mode: primary       ← 唯一 primary
~/.config/opencode/agents/designer.md:mode: subagent
~/.config/opencode/agents/fixer.md:mode: subagent
~/.config/opencode/agents/writer.md:mode: subagent
```

如果不止 commander 是 primary，说明 agent md 是旧版（rc.6 之前主题没写 mode 字段）。

### 修复

```bash
pmw agents theme apply default --scope global
```

或调主题章节让用户选其他主题。应用后必须**完全 quit + 重启 OpenCode**。

---

## § 7 权限问题

### 症状一：commander 不调用 backendcoder

```bash
grep -A 12 "^permission:" ~/.config/opencode/agents/commander.md
```

应包含 task 严格白名单（`"*": deny` + 6 个固定 agent + explore/scout）。

### 症状二：writer 跑不了 git log / npm run docs:build

```bash
grep -A 6 "^  bash:" ~/.config/opencode/agents/writer.md
```

应该是细粒度（`"*": deny` + 4 条 allow）。

### 修复

任何 permission 字段错误都用以下命令修复：

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/reset-agents.sh
```

会自动备份现有 agent md 到 `.backup-agents-<timestamp>/`，然后重新 apply 当前主题。

---

## § 8 skill 加载问题

### 症状

OpenCode AI 说"我不知道 pm-workflow"或加载不了 skill。

### 诊断

```bash
ls -la ~/.config/opencode/skills/pm-workflow/
```

预期看到：

```
SKILL.md  reference.md  theme.md  model.md  troubleshooting.md  upgrade.md  uninstall.md  scripts/
```

如果只有扁平的 `pm-workflow.md`（rc.3-rc.6 错误产物），用 [troubleshooting.md](troubleshooting.md) 修复。

### 已迁移的旧 skill

rc.10 起合并为单一 `pm-workflow` skill。如果你之前装过 rc.6-rc.9，可能有以下旧 skill 目录残留（**OpenCode 仍会加载它们但不再被 plugin 维护**）：

```
~/.config/opencode/skills/agent-theme-config/    (rc.6+ 引入)
~/.config/opencode/skills/agent-model-config/    (rc.6+ 引入)
~/.config/opencode/skills/pm-workflow-config/    (rc.9 引入)
```

清理（推荐，避免 description 冗余占用 OpenCode skill listing budget）：

```bash
rm -rf ~/.config/opencode/skills/{agent-theme-config,agent-model-config,pm-workflow-config}
```

---

## § 9 卸载

详见 [uninstall.md](uninstall.md)。

完整清理脚本（带 `--confirm` 守护）：

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/full-clean.sh --confirm
```

不加 `--confirm` 时只 dry-run，不真删。

---

## 关键脚本

| 脚本 | 用途 | 风险等级 |
|---|---|---|
| [scripts/check.sh](scripts/check.sh) | 综合健康检查（一行输出关键状态） | 只读，无风险 |
| [scripts/upgrade.sh](scripts/upgrade.sh) | 互动式升级到最新 rc | 低（清 cache + npm install） |
| [scripts/reset-agents.sh](scripts/reset-agents.sh) | 重置 6 个 agent md 到当前主题 | 中（覆盖已有 agent md，自动备份） |
| [scripts/full-clean.sh](scripts/full-clean.sh) | 完全清理（含 agent md / skill / config） | 高（必须 --confirm） |

**每个脚本都会输出详细日志过程**，便于 AI 与用户追溯每一步操作。

---

## 行为约束（AI 用此 skill 时必须遵守）

1. **先问后做**：模糊请求时最多问 3 个澄清问题再操作。
2. **先 dry-run**：所有写盘操作（apply 主题、改 model、修 agent md、清理 cache）必须先预览或确认。
3. **不假设环境**：先跑 `scripts/check.sh` 再下结论。绝不臆断版本 / 路径 / 状态。
4. **不重复实现**：主题问题查 [theme.md](theme.md)，模型问题查 [model.md](model.md)，按 supporting file 里的标准流程走，不要重新编。
5. **可回滚**：每步操作前告知用户回滚命令；高风险操作（删 agent md / 清 config）必须备份到 `.backup-<timestamp>`。
6. **输出过程日志**：跑脚本时把脚本的全部输出展示给用户，不要省略。

## 不可破坏的红线

- 6 个固定 agent ID 永不改（commander / advisor / backendcoder / designer / fixer / writer）
- skill 必须子目录结构 `<id>/SKILL.md`
- agent md 必须含完整 frontmatter 字段
- commander 必须 primary，其他 5 个必须 subagent
- 任何"清理 ~/.config/opencode/agents/" 操作前必须备份
- 任何"删 ~/.config/opencode/pm-workflow.config.json" 操作前必须问用户
- 任何 `pkill OpenCode` / `npm install -g` 操作前必须告知用户

## 版本历史与已修复 bug

| 版本 | 修复内容 |
|---|---|
| rc.4 | OpenCode plugin 加载失败（projectDir 兜底） |
| rc.5 | 跨平台兼容（macOS/Linux/Windows，用 `os.homedir()` / `os.tmpdir()`） |
| rc.6 | 6 个 agent 重命名 + 角色合并 + 切换列表只显示 commander |
| rc.7 | OpenCode skill 必须子目录 + SKILL.md（rc.3-rc.6 写错了） |
| rc.8 | agent md 完全符合 OpenCode 规范（temperature / tools / permission / 完整 body） |
| rc.9 | 新增 pm-workflow-config / agent-theme-config / agent-model-config 三个 skill + skill auto-install 递归同步 |
| **rc.10** | **三个 skill 合并为单一 `pm-workflow` skill**：用户问 pm-workflow 任意问题都通过这一个 skill 解决；通过 supporting files (theme.md / model.md) 拆分细分领域逻辑 |

如果用户描述的症状与某个旧版本一致，**第一步永远是建议升级到最新版**：

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/upgrade.sh
```
