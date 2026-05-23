# Agent md 字段类问题（T3-T6）

## T3: 切换列表显示太多

### 症状

OpenCode UI 按 Tab 键切换 primary agent 时，看到 6 个 agent 都出现（应该只有 commander）。

### 根因

rc.6 之前主题没写 `mode` 字段，OpenCode 默认当 `all` 处理。`mode: all` 在切换列表里也会出现。

### 修复

```bash
# 1. 检查现状
grep "^mode:" ~/.config/opencode/agents/*.md

# 应只看到 commander.md: mode: primary
# 其他都应是 mode: subagent

# 2. 如果不对，重新 apply 主题
pmw agents theme apply default --scope global

# 3. 完全 quit + 重启 OpenCode
pkill -9 -f OpenCode && sleep 2
# 用户双击启动 OpenCode
```

### 验证

启动后按 Tab 键，**只应看到 commander 一个**。其他 5 个 agent 通过 `@advisor` / `@backendcoder` 等 mention 调用，不在 Tab 切换列表里。

---

## T4: agent md 字段缺失

### 症状

```bash
$ grep -c "^temperature:" ~/.config/opencode/agents/commander.md
0
```

agent md 缺 `temperature` / `tools` / `permission` 字段。

### 根因

rc.7 之前的主题渲染没写这些字段，所以 OpenCode 用模型默认 temperature、不限制工具、不限制权限。

### 修复

```bash
# 1. 升级
${CLAUDE_SKILL_DIR}/scripts/upgrade.sh

# 2. 重置 agent md 到当前主题最新版
${CLAUDE_SKILL_DIR}/scripts/reset-agents.sh
```

`reset-agents.sh` 会先备份 `~/.config/opencode/agents/` 到 `.backup-<timestamp>/`，然后重新跑 `pmw agents theme apply <主题> --scope global` 写入完整字段版。

### 验证

```bash
for f in ~/.config/opencode/agents/*.md; do
  agent=$(basename "$f" .md)
  has_temp=$(grep -c '^temperature:' "$f")
  has_tools=$(grep -c '^tools:' "$f")
  has_perm=$(grep -c '^permission:' "$f")
  echo "$agent: temp=$has_temp tools=$has_tools perm=$has_perm"
done
# 每个 agent 都应是 temp=1 tools=1 perm=1
```

---

## T5: commander task 白名单缺失

### 症状

commander 在对话中拒绝调用 backendcoder/designer 等子代理，或反过来 commander 调用 OpenCode 内置 agent（general 等）超出预期。

### 根因

agent md 缺 `permission.task` 白名单字段。rc.7 之前没有此约束。

### 修复

```bash
grep -A 12 "^permission:" ~/.config/opencode/agents/commander.md
```

应包含：

```yaml
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
```

如果缺，跑：

```bash
pmw agents theme apply default --scope global
```

完全 quit + 重启 OpenCode。

### 验证

新会话里让 commander 试图分派任务给 backendcoder（"实现一个登录 API"），它应该调用 task tool 把任务委派出去而不是自己做。

---

## T6: writer bash 权限错误

### 症状

writer 试图跑 `git log --oneline` 整理发布说明，被拒绝。

### 根因

rc.7 之前 writer 的 bash 是简化的 `bash: deny`（完全禁用），rc.8 起改为细粒度 glob。

### 修复

```bash
grep -A 6 "^  bash:" ~/.config/opencode/agents/writer.md
```

应该是细粒度：

```yaml
  bash:
    "*": deny
    "git log*": allow
    "git diff*": allow
    "git status*": allow
    "npm run docs:*": allow
```

如果是 `bash: deny` 一行，重新 apply 主题：

```bash
pmw agents theme apply default --scope global
```

### 验证

让 writer 跑 `git log --oneline -5`，应该被允许。跑 `rm -rf` 应该被拒绝。

---

