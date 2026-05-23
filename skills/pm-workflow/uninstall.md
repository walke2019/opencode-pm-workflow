# pm-workflow 完全卸载流程

本文件是 [SKILL.md](SKILL.md) 的支持文件，详细介绍如何完全卸载 pm-workflow。AI 在用户说"彻底卸载 pm-workflow"时按需引用。

**关键提醒**：卸载会清掉用户的 6 个 agent md、pm-workflow 全局配置、可能还有项目级状态。**所有破坏性步骤都必须先备份 + 询问用户确认**。

**最快路径**：用带守护的清理脚本：

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/full-clean.sh --confirm
```

不加 `--confirm` 时只会显示将要做什么（dry-run），不会真的删。

---

## 卸载范围

完全卸载涉及 5 个层级：

| 层级 | 路径 | 默认是否清 |
|---|---|---|
| 1. opencode.json plugin 行 | `~/.config/opencode/opencode.json` | ✓ 清（移除 plugin 行） |
| 2. 全局 pmw CLI | npm global package | ✓ 清 |
| 3. OpenCode plugin cache | `~/.cache/opencode/packages/@walke/` | ✓ 清 |
| 4. agent md / skill / pm-workflow 全局配置 | `~/.config/opencode/{agents,skills/pm-workflow-config,skills/agent-theme-config,skills/agent-model-config,pm-workflow.config.json}` | ⚠ 询问用户 |
| 5. 项目级状态 | `<projectDir>/.pm-workflow/` | ⚠ 询问用户 |

层级 4 和 5 包含用户的配置和历史数据，**必须问用户**才能清。

---

## 完整卸载步骤

### Step 0：完全 quit OpenCode

```bash
pkill -9 -f "OpenCode Helper" && pkill -9 -f "OpenCode.app" && sleep 3
ps aux | grep -iE "OpenCode\.app/Contents" | grep -v grep | wc -l
# 应输出 0
```

### Step 1：备份用户数据（自动）

任何卸载前**强制**备份：

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP=~/.config/opencode/.backup-uninstall-$TIMESTAMP
mkdir -p "$BACKUP"

# 备份 agents/
[ -d ~/.config/opencode/agents ] && cp -r ~/.config/opencode/agents "$BACKUP/agents"

# 备份 pm-workflow 相关 skills
[ -d ~/.config/opencode/skills/pm-workflow-config ] && cp -r ~/.config/opencode/skills/pm-workflow-config "$BACKUP/skills-pm-workflow-config"
[ -d ~/.config/opencode/skills/agent-theme-config ] && cp -r ~/.config/opencode/skills/agent-theme-config "$BACKUP/skills-agent-theme-config"
[ -d ~/.config/opencode/skills/agent-model-config ] && cp -r ~/.config/opencode/skills/agent-model-config "$BACKUP/skills-agent-model-config"

# 备份配置
[ -f ~/.config/opencode/pm-workflow.config.json ] && cp ~/.config/opencode/pm-workflow.config.json "$BACKUP/pm-workflow.config.json"

echo "备份至: $BACKUP"
ls -la "$BACKUP"
```

告诉用户备份位置，让他们知道随时能恢复。

### Step 2：移除 opencode.json 中的 plugin 行

```bash
# 看当前配置
cat ~/.config/opencode/opencode.json
```

找到 `"plugin"` 数组，移除 `"@walke/opencode-pm-workflow@rc"` 这一行（或类似版本说明）。

可以用 jq 自动改：

```bash
jq 'del(.plugin[] | select(. | startswith("@walke/opencode-pm-workflow")))' ~/.config/opencode/opencode.json > /tmp/opencode.json.tmp && mv /tmp/opencode.json.tmp ~/.config/opencode/opencode.json
```

### Step 3：卸载全局 pmw CLI

```bash
npm uninstall -g @walke/opencode-pm-workflow
which pmw
# 应输出 "pmw not found" 或类似
```

### Step 4：清 OpenCode plugin cache

```bash
rm -rfv ~/.cache/opencode/packages/@walke
ls ~/.cache/opencode/packages/@walke 2>/dev/null
# 应不存在
```

### Step 5：（可选，问用户）清 agent md

```bash
# 列出将清除的文件，让用户确认
ls -la ~/.config/opencode/agents/

# 用户确认后
rm -fv ~/.config/opencode/agents/{commander,advisor,backendcoder,designer,fixer,writer}.md
```

如果 agents 目录里只有 pm-workflow 的 6 个文件，清完目录就空了；如果有其他第三方 agent 也在，**不要**整目录清。

### Step 6：（可选，问用户）清 pm-workflow 相关 skill

```bash
# 列出 pm-workflow 相关 skill
ls -la ~/.config/opencode/skills/ | grep -E "pm-workflow|agent-theme|agent-model"

# 用户确认后
rm -rfv ~/.config/opencode/skills/pm-workflow-config
rm -rfv ~/.config/opencode/skills/agent-theme-config
rm -rfv ~/.config/opencode/skills/agent-model-config
```

**不要**清其他 skill（如 `cloudflare-wrangler-edgetunnel` 这种用户自己装的）。

### Step 7：（可选，问用户）清全局 pm-workflow 配置

```bash
ls -la ~/.config/opencode/pm-workflow.config.json
# 用户确认后
rm -fv ~/.config/opencode/pm-workflow.config.json
```

### Step 8：（可选，问用户）清 fallback projectDir

```bash
ls -la ~/.cache/pm-workflow/
# 用户确认后
rm -rfv ~/.cache/pm-workflow
```

这是 rc.4+ 引入的 fallback projectDir，用于 OpenCode 给空 worktree 时的兜底。一般是空的或只含日志。

### Step 9：（可选，问用户）清项目级状态

每个使用过 pm-workflow 的项目都可能有：

```
<projectDir>/.pm-workflow/
├── state.json
├── config.json
└── history.jsonl
```

**这些是项目级历史数据**，建议保留（除非用户明确要清）。如果要清：

```bash
# 在每个项目里
rm -rf <projectDir>/.pm-workflow
```

---

## 验证卸载完成

```bash
# CLI 没了
which pmw
# 应：pmw not found

# OpenCode plugin cache 没了
ls ~/.cache/opencode/packages/@walke/ 2>/dev/null
# 应：No such file or directory

# opencode.json 没 pm-workflow 行
grep -i "pm-workflow\|@walke" ~/.config/opencode/opencode.json
# 应无输出

# agent md 已清（如选了 Step 5）
ls ~/.config/opencode/agents/{commander,advisor,backendcoder,designer,fixer,writer}.md 2>/dev/null
# 应全部 No such file or directory

# 重启 OpenCode 后 log 不再有 pm-workflow 相关记录
LATEST=$(ls -t ~/.local/share/opencode/log/*.log | head -1)
grep -E "pm-workflow|@walke" "$LATEST"
# 应无输出
```

---

## 部分卸载（保留某些数据）

### 只移除 plugin 但保留主题文件

如果用户想暂时停用 pm-workflow 但**保留 agent md 和配置以便日后再启用**：

只跑 Step 0、2、3、4。跳过 Step 5-9。

下次想重新启用：

```bash
# 1. 在 opencode.json 加回 plugin 行
# 2. 装 CLI
npm install -g @walke/opencode-pm-workflow@rc
# 3. 重启 OpenCode（plugin 会沿用现有 agent md / config.json，不会覆盖）
```

### 保留主题，重置配置

如果用户想**保留主题化的 agent md，但重置 pm-workflow 的状态/历史**：

只跑 Step 7（清 pm-workflow.config.json）和 Step 9（清项目级 .pm-workflow/）。

下次启动 OpenCode：plugin 会用默认配置重建 pm-workflow.config.json，但 agents/ 目录不动。

---

## 恢复（撤销卸载）

如果用户后悔了，从备份恢复：

```bash
BACKUP=~/.config/opencode/.backup-uninstall-<timestamp>
ls "$BACKUP"

# 恢复 agents/
cp -r "$BACKUP/agents" ~/.config/opencode/agents

# 恢复 skills
cp -r "$BACKUP/skills-pm-workflow-config" ~/.config/opencode/skills/pm-workflow-config
cp -r "$BACKUP/skills-agent-theme-config" ~/.config/opencode/skills/agent-theme-config
cp -r "$BACKUP/skills-agent-model-config" ~/.config/opencode/skills/agent-model-config

# 恢复 config
cp "$BACKUP/pm-workflow.config.json" ~/.config/opencode/pm-workflow.config.json

# 装回 plugin（在 opencode.json 加 plugin 行 + 装 CLI）
npm install -g @walke/opencode-pm-workflow@rc

# 重启 OpenCode
```

备份目录会一直保留在 `~/.config/opencode/.backup-uninstall-*`，用户可以随时清掉：

```bash
rm -rf ~/.config/opencode/.backup-uninstall-*
```

---

## 关联资源

- [SKILL.md](SKILL.md)：主入口
- [scripts/full-clean.sh](scripts/full-clean.sh)：带守护的完全清理脚本
- [troubleshooting.md](troubleshooting.md)：卸载过程中遇到错误的诊断
