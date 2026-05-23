---
name: pm-workflow-config
description: pm-workflow 插件全场景帮手——首次安装、升级、配置、诊断、排错、卸载。覆盖 OpenCode plugin 加载、agent md 规范、skill 子目录结构、6 个固定 agent（commander/advisor/backendcoder/designer/fixer/writer）的 mode/temperature/tools/permission 配置、主题切换、模型分配、CLI 工具用法、常见错误处理。任何涉及 @walke/opencode-pm-workflow 的问题都从这里开始。AI 应该在用户提到 pm-workflow / pmw / commander / advisor / backendcoder / designer / fixer / writer / pm-workflow 主题 / OpenCode plugin 加载失败 / agent md 缺字段 / skill 不识别 / 切换列表显示太多 agent 等场景时主动加载此 skill。
license: MIT
compatibility: opencode
metadata:
  audience: pm-workflow users
  scope: install-config-debug-uninstall
---

# pm-workflow 配置向导

任何涉及 `@walke/opencode-pm-workflow` 的问题，**第一步永远是跑 `${CLAUDE_SKILL_DIR}/scripts/check.sh`**。它会一次性输出环境、CLI、plugin cache、skills、agents、log 错误的全部状态，让你立刻定位问题在哪一层。

这个 skill 是 pm-workflow 的"总入口"。具体的主题切换走 `agent-theme-config` skill；模型配置走 `agent-model-config` skill；其余配置 / 诊断 / 排错 / 卸载都在这里。

## 触发词（10 个高频用户原话 → 走哪条分支）

| 用户说什么 | 走哪条分支 | 是否调用兄弟 skill |
|---|---|---|
| "怎么装 pm-workflow" / "怎么用 commander" | § 1 首次安装 | 装完询问是否要 → 主题/模型 |
| "升级到最新版" / "我要用最新 rc" | § 2 升级（详见 [upgrade.md](upgrade.md)） | — |
| "pmw doctor 报错" / "OpenCode 加载失败" | § 3 诊断（详见 [troubleshooting.md](troubleshooting.md)） | — |
| "切三国主题" / "改 designer 的展示名" | § 4 主题 | ✓ → `agent-theme-config` |
| "给 commander 配 Opus" / "designer 用 GPT-5" | § 5 模型 | ✓ → `agent-model-config` |
| "切换列表显示太多" / "UI 看到 6 个 agent" | § 6 切换列表问题 | — |
| "writer 跑不了 git log" / "commander 不调 backendcoder" | § 7 权限问题 | — |
| "AI 不知道有什么主题" / "skill 没生效" | § 8 skill 加载问题 | — |
| "彻底卸载 pm-workflow" | § 9 卸载（详见 [uninstall.md](uninstall.md)） | — |
| 任何含 "pm-workflow" / "pmw" / "@walke" 的报错 | 先跑 `scripts/check.sh` | — |

## 核心约束（每次操作前必查）

| 约束 | 验证方法 | 引入版本 |
|---|---|---|
| **CLI 版本对齐** | `pmw --version` 与 `~/.cache/opencode/packages/@walke/opencode-pm-workflow@rc/node_modules/@walke/opencode-pm-workflow/package.json` 的 version 一致 | rc.4 |
| **Skill 子目录结构** | `~/.config/opencode/skills/<id>/SKILL.md`（不是扁平 `<id>.md`） | rc.7 |
| **Agent md 完整字段** | 含 `description` / `mode` / `temperature` / `tools` / `permission` | rc.8 |
| **mode 严格约束** | commander = primary，其他 5 个 = subagent | rc.6 |
| **6 个固定 ID 永不可改** | commander / advisor / backendcoder / designer / fixer / writer | rc.6 |
| **跨平台兼容** | 用 `os.homedir()` / `os.tmpdir()`，不用 `process.env.HOME` | rc.5 |

## 6 个固定 agent 的标准配置

| Agent | mode | temp | edit | bash | webfetch | task |
|---|---|---|---|---|---|---|
| **commander** | primary | 0.2 | ask | ask | allow | 严格白名单（advisor / backendcoder / designer / fixer / writer / explore / scout） |
| **advisor** | subagent | 0.3 | deny | allow | allow | — |
| **backendcoder** | subagent | 0.2 | allow | allow | ask | — |
| **designer** | subagent | 0.4 | allow | allow | ask | — |
| **fixer** | subagent | 0.1 | allow | allow | ask | — |
| **writer** | subagent | 0.3 | allow | 细粒度（git log/diff/status, npm run docs:*） | allow | — |

详细规范参考 [reference.md](reference.md)。

---

## § 1 首次安装

### Step 1.1：检查环境

```bash
${CLAUDE_SKILL_DIR}/scripts/check.sh
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
pmw --version  # 应显示 1.0.0-rc.X
```

### Step 1.4：启动 OpenCode

让用户**双击启动 OpenCode**（GUI 应用 shell 触不到，必须用户操作）。

OpenCode 启动时会：
- Bun 自动装 plugin 到 `~/.cache/opencode/packages/@walke/opencode-pm-workflow@rc/`
- plugin 首次激活时调用 skill auto-install
  - 把包内 `skills/<id>/SKILL.md` + supporting files + scripts/ 同步到 `~/.config/opencode/skills/<id>/`（rc.9 起递归同步）
- 创建 `~/.config/opencode/pm-workflow.config.json`（默认配置）

### Step 1.5：验证

启动后跑：

```bash
${CLAUDE_SKILL_DIR}/scripts/check.sh
```

应该看到所有 ✓。

### Step 1.6：询问主题与模型

启动后问用户：

1. **主题**："要给 6 个 agent 应用主题（默认 / 三国 / 西游 / 漫威 / 现代职场）吗？" → 如果要，调 `agent-theme-config` skill
2. **模型**："要为 6 个 agent 单独配模型吗（不配则全部跟随 commander 主模型）？" → 如果要，调 `agent-model-config` skill

---

## § 2 升级

详见 [upgrade.md](upgrade.md)。

互动式升级脚本：

```bash
${CLAUDE_SKILL_DIR}/scripts/upgrade.sh
```

---

## § 3 诊断

详见 [troubleshooting.md](troubleshooting.md)，含 12 种常见错误的诊断树。

第一步永远是综合健康检查：

```bash
${CLAUDE_SKILL_DIR}/scripts/check.sh
```

---

## § 4 主题切换

主题问题不在这个 skill 里处理，**直接调用 `agent-theme-config` skill**。它专门处理：

- 列出 5 套内置主题
- 预览主题渲染（dry-run）
- 应用主题（落盘到 `~/.config/opencode/agents/<id>.md`）
- 子集应用 / 切换 / 回滚

不要在这个 skill 里重复主题逻辑。

---

## § 5 模型分配

模型问题不在这个 skill 里处理，**直接调用 `agent-model-config` skill**。它专门处理：

- 全局 OpenCode 配置层模型分配
- `pmw models init` 工具用法
- 不同 provider 的模型 ID 格式
- 子代理是否独立模型 vs 跟随主代理

不要在这个 skill 里重复模型逻辑。

---

## § 6 切换列表显示问题

### 症状

用户在 OpenCode UI 按 Tab 键看到全部 6 个 agent，而不是只 commander。

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

如果不止 commander 是 primary，说明 agent md 是旧版（rc.6 之前主题没写 mode 字段，OpenCode 默认当 `all` 处理）。

### 修复

重新 apply 主题：

```bash
pmw agents theme apply default --scope global
```

或调 `agent-theme-config` skill 让用户选其他主题。

应用后必须**完全 quit + 重启 OpenCode**（不是 reload，OpenCode 启动时才扫描 agents 目录）。

---

## § 7 权限问题

### 症状一：commander 不调用 backendcoder

```bash
grep -A 12 "^permission:" ~/.config/opencode/agents/commander.md
```

应包含：

```yaml
permission:
  task:
    "*": deny
    advisor: allow
    backendcoder: allow
    designer: allow
    fixer: allow
    writer: allow
    explore: allow
    scout: allow
```

如果缺 task 字段或字段值不对，说明 agent md 是旧版（rc.7 之前没有 task 白名单）。修复：

```bash
pmw agents theme apply default --scope global
```

### 症状二：writer 跑不了 git log / npm run docs:build

```bash
grep -A 6 "^  bash:" ~/.config/opencode/agents/writer.md
```

应该是：

```yaml
  bash:
    "*": deny
    "git log*": allow
    "git diff*": allow
    "git status*": allow
    "npm run docs:*": allow
```

如果是 `bash: deny` 一行（rc.7 之前的简化版），重新 apply 主题修复。

### 症状三：advisor 改了代码但不该改

```bash
grep "^  edit:" ~/.config/opencode/agents/advisor.md
```

应该是 `edit: deny`（advisor 是顾问，不动代码）。如果是 allow，重新 apply 主题修复。

---

## § 8 skill 加载问题

### 症状

OpenCode AI 说"我不知道有什么主题"，无法识别 `pm-workflow-config` / `agent-theme-config` / `agent-model-config` skill。

### 诊断

```bash
ls -la ~/.config/opencode/skills/
```

预期看到子目录结构（rc.7 起）：

```
~/.config/opencode/skills/
├── pm-workflow-config/
│   └── SKILL.md
├── agent-theme-config/
│   └── SKILL.md
├── agent-model-config/
│   └── SKILL.md
└── ...
```

**不应该看到扁平的 `*.md` 文件**（rc.3-rc.6 时期的错误产物）。

### 修复

#### 错误模式 A：看到扁平 `*.md` 文件

rc.3-rc.6 plugin 错误地把 SKILL.md 复制成扁平结构。OpenCode 不识别。修复：

```bash
# 1. 升级到最新版（rc.7+）
${CLAUDE_SKILL_DIR}/scripts/upgrade.sh

# 2. 清旧的扁平 md
rm -fv ~/.config/opencode/skills/*.md

# 3. 完全 quit + 重启 OpenCode（auto-install 会写正确结构）
```

#### 错误模式 B：子目录里 SKILL.md 没 name 字段

```bash
head -10 ~/.config/opencode/skills/<id>/SKILL.md
```

如果缺 `name:` 行，OpenCode 不识别。重新 quit + 重启 OpenCode 让 auto-install 重写。

---

## § 9 卸载

详见 [uninstall.md](uninstall.md)。

完整清理脚本（带确认守护）：

```bash
${CLAUDE_SKILL_DIR}/scripts/full-clean.sh --confirm
```

---

## 关键脚本

| 脚本 | 用途 | 风险等级 |
|---|---|---|
| [scripts/check.sh](scripts/check.sh) | 综合健康检查（一行输出关键状态） | 只读，无风险 |
| [scripts/upgrade.sh](scripts/upgrade.sh) | 互动式升级到最新 rc | 低（清 cache + npm install） |
| [scripts/reset-agents.sh](scripts/reset-agents.sh) | 重置 6 个 agent md 到当前主题 | 中（覆盖已有 agent md） |
| [scripts/full-clean.sh](scripts/full-clean.sh) | 完全清理（含 agent md / skill / config） | 高（必须 --confirm） |

**每个脚本都会输出详细日志过程**，便于 AI 与用户追溯每一步操作。

---

## 行为约束（AI 用此 skill 时必须遵守）

1. **先问后做**：模糊请求时最多问 3 个澄清问题再操作。
2. **先 dry-run**：所有写盘操作（apply 主题、改 model、修 agent md、清理 cache）必须先预览或确认。
3. **不假设环境**：先跑 `scripts/check.sh` 再下结论。绝不臆断版本 / 路径 / 状态。
4. **委派而非揽**：主题问题立刻调 `agent-theme-config` skill，模型问题调 `agent-model-config` skill。不要在这个 skill 里重复实现。
5. **可回滚**：每步操作前告知用户回滚命令；高风险操作（删 agent md / 清 config）必须备份到 `.backup-<timestamp>`。
6. **输出过程日志**：跑脚本时把脚本的全部输出展示给用户，不要省略。

## 不可破坏的红线

- 6 个固定 agent ID 永不改（commander / advisor / backendcoder / designer / fixer / writer）
- skill 必须子目录结构 `<id>/SKILL.md`
- agent md 必须含完整 frontmatter 字段
- commander 必须 primary，其他 5 个必须 subagent
- 任何"清理 ~/.config/opencode/agents/"操作前必须备份
- 任何"删 ~/.config/opencode/pm-workflow.config.json"操作前必须问用户
- 任何 `pkill OpenCode` / `npm install -g` 操作前必须告知用户

## 版本历史与已修复 bug

| 版本 | 修复内容 |
|---|---|
| rc.4 | OpenCode plugin 加载失败（projectDir 兜底） |
| rc.5 | 跨平台兼容（macOS/Linux/Windows，用 `os.homedir()` / `os.tmpdir()`） |
| rc.6 | 6 个 agent 重命名 + 角色合并 + 切换列表只显示 commander |
| rc.7 | OpenCode skill 必须子目录 + SKILL.md（rc.3-rc.6 写错了） |
| rc.8 | agent md 完全符合 OpenCode 规范（temperature / tools / permission / 完整 body） |
| rc.9 | 新增 `pm-workflow-config` skill（本文件）+ skill auto-install 递归拷贝 supporting files / scripts/ 子目录 |

如果用户描述的症状与某个旧版本一致，**第一步永远是建议升级到最新版**：

```bash
${CLAUDE_SKILL_DIR}/scripts/upgrade.sh
```
