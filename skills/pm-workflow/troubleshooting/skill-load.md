# Skill 加载类问题（T7-T8）

## T7: skill 子目录结构错误

### 症状

OpenCode AI 不识别主题，说"我不知道有什么主题"。或 `agent-theme-config` skill 列表里看不到。

### 根因

rc.3 至 rc.6 plugin 错误地把 SKILL.md 复制成扁平 `~/.config/opencode/skills/<id>.md`。OpenCode 官方规范要求**子目录** `~/.config/opencode/skills/<id>/SKILL.md`。

### 修复

```bash
# 1. 升级到 rc.7+
${CLAUDE_SKILL_DIR}/scripts/upgrade.sh

# 2. 清旧的扁平 .md（rc.3-rc.6 错误产物）
rm -fv ~/.config/opencode/skills/*.md

# 3. 确认子目录结构
ls -la ~/.config/opencode/skills/

# 4. 完全 quit + 重启 OpenCode（plugin auto-install 写正确结构）
```

### 验证

```bash
ls -la ~/.config/opencode/skills/
# 应看到子目录：
# pm-workflow-config/
# agent-theme-config/
# agent-model-config/

ls ~/.config/opencode/skills/agent-theme-config/
# 应看到 SKILL.md
```

---

## T8: 新 skill 没装上

### 症状

升级到 rc.9+ 后，用户对 OpenCode 说"帮我装 pm-workflow"，AI 不识别 `pm-workflow-config` skill。

### 根因

OpenCode 启动时 plugin auto-install 没把新 skill 写进去。可能原因：
- 还在跑旧 cache（rc.8 或更早）
- skill 目录已存在 SKILL.md 但内容不同（保留用户改动，rc.9 默认行为）

### 修复

```bash
# 1. 升级
${CLAUDE_SKILL_DIR}/scripts/upgrade.sh

# 2. 强制清掉 pm-workflow-config skill 目录（让 auto-install 重写）
rm -rf ~/.config/opencode/skills/pm-workflow-config

# 3. 完全 quit + 重启 OpenCode
pkill -9 -f OpenCode && sleep 2
# 用户双击启动

# 4. 验证
ls ~/.config/opencode/skills/pm-workflow-config/
# 应看到 SKILL.md / reference.md / troubleshooting.md / upgrade.md / uninstall.md / scripts/
```

### 验证

OpenCode 内开新对话，对 AI 说"我装 pm-workflow 出问题了"。AI 应该自动加载 `pm-workflow-config` skill。

---

