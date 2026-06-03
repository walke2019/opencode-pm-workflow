## 首次安装 pm-workflow

### Step 1：检查环境

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/check.sh
```

需要 Node ≥ 20、npm。

### Step 2：在 `~/.config/opencode/opencode.json` 加 plugin 行

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "@walke/opencode-pm-workflow@latest"
  ]
}
```

如果用户已有其他 plugin，append 进去；不要覆盖。

### Step 3：装全局 CLI

```bash
npm install -g @walke/opencode-pm-workflow@latest
pmw --version
```

### Step 4：双击启动 OpenCode

GUI 应用必须由用户操作（shell 触不到）。启动时 plugin 会自动：

- Bun 装 plugin 到 `~/.cache/opencode/node_modules/@walke/opencode-pm-workflow/`
- skill auto-install 把包内 `skills/pm-workflow/` 整个目录递归同步到 `~/.config/opencode/skills/pm-workflow/`（含 SKILL.md + 4 个子目录）
- 创建 `~/.config/opencode/pm-workflow.config.json`（默认配置）

### Step 5：验证

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/check.sh
```

应该看到所有 ✓。

### Step 6：询问主题与模型

启动后问用户：

1. **主题**："要给 6 个 agent 应用主题吗？" → 详见 [theme.md](theme.md)
2. **模型**："要为 6 个 agent 单独配模型吗？" → 详见 [model.md](model.md)

### 完成后的标准状态

```bash
ls ~/.config/opencode/skills/pm-workflow/
# SKILL.md  reference/  workflows/  troubleshooting/  scripts/

ls ~/.config/opencode/agents/
# advisor.md  backendcoder.md  commander.md  designer.md  fixer.md  writer.md
```

---

## 关联

- [theme.md](theme.md) — 应用主题给 6 个 agent
- [model.md](model.md) — 为 agent 分配模型
- [../troubleshooting/install.md](../troubleshooting/install.md) — 安装失败时的排查
