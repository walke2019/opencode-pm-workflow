# pm-workflow 故障排查目录

本文件是 [SKILL.md](SKILL.md) 的支持文件，按"症状 → 根因 → 修复 → 验证"的诊断树组织。AI 在用户报告问题时按需引用对应章节。

**所有诊断的第一步永远是跑 `${CLAUDE_SKILL_DIR}/scripts/check.sh`**——一行输出当前所有关键状态，能立刻定位问题在哪一层。

## 索引

| # | 症状关键词 | 章节 |
|---|---|---|
| T1 | "command not found: pmw" | [pmw 命令找不到](#t1-pmw-命令找不到) |
| T2 | OpenCode log 出现 `mkdir '/.pm-workflow' failed` | [plugin 加载 mkdir 失败](#t2-plugin-加载-mkdir-失败) |
| T3 | UI 切换列表显示 6 个 agent | [切换列表显示太多](#t3-切换列表显示太多) |
| T4 | Agent md 缺 temperature / tools / permission 字段 | [agent md 字段缺失](#t4-agent-md-字段缺失) |
| T5 | commander 不调用 backendcoder / 任意子代理 | [commander task 白名单缺失](#t5-commander-task-白名单缺失) |
| T6 | writer 跑不了 git log / npm run docs | [writer bash 权限错误](#t6-writer-bash-权限错误) |
| T7 | OpenCode 不识别主题 / `agent-theme-config` skill 不生效 | [skill 子目录结构错误](#t7-skill-子目录结构错误) |
| T8 | AI 看不到 pm-workflow-config skill | [新 skill 没装上](#t8-新-skill-没装上) |
| T9 | pmw doctor 报 preferred_session_id 未设置 | [preferred_session_id warning](#t9-preferred_session_id-warning) |
| T10 | plugin cache 版本与 pmw CLI 不一致 | [版本不一致](#t10-版本不一致) |
| T11 | 子代理跟 commander 同模型 | [子代理模型继承](#t11-子代理模型继承) |
| T12 | OpenCode log 大量 ERROR 但与 pm-workflow 无关 | [其他 plugin 错误干扰](#t12-其他-plugin-错误干扰) |

---

## T1: pmw 命令找不到

### 症状

```bash
$ pmw --version
zsh: command not found: pmw
```

### 根因

OpenCode 装 plugin 不会暴露 bin 到全局 PATH（设计安全性，避免污染）。需要单独 `npm install -g`。

### 修复

```bash
npm install -g @walke/opencode-pm-workflow@rc
which pmw   # 应输出 /opt/homebrew/bin/pmw 或类似路径
pmw --version
```

### 验证

```bash
pmw --version
# 应输出 1.0.0-rc.X
```

---

## T2: plugin 加载 mkdir 失败

### 症状

OpenCode log（`~/.local/share/opencode/log/*.log`）出现：

```
ERROR service=plugin path=@walke/opencode-pm-workflow@rc
      error=ENOENT: no such file or directory, mkdir '/.pm-workflow'
      failed to load plugin
```

注意是 **根目录** `/.pm-workflow` 而不是 `~/.pm-workflow`。

### 根因

rc.4 之前 `getProjectDir()` 兜底逻辑不够强：

- OpenCode server 在 system service 模式下 `process.cwd()` 是 `/`
- 旧版 `ctx.worktree || ctx.directory || process.cwd()` 得到 `/`
- 后续 `mkdir(join('/', '.pm-workflow'))` ENOENT
- 整个 plugin 加载 abort

### 修复

升级到 rc.4+：

```bash
${CLAUDE_SKILL_DIR}/scripts/upgrade.sh
```

升级后必须**完全 quit + 重启 OpenCode**，让 OpenCode 用 Bun 重新拉新版到 cache。

### 验证

启动后查 log：

```bash
LATEST=$(ls -t ~/.local/share/opencode/log/*.log | head -1)
grep "mkdir '/.pm-workflow'" "$LATEST"
# 应无输出
```

---

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

## T9: preferred_session_id warning

### 症状

```bash
$ pmw doctor
✗ preferred_session_id — 未设置
```

### 根因

`preferred_session_id` 是 OpenCode session workaround 的辅助字段，仅影响某些边缘场景的"接续会话"。**对绝大多数用户不影响**。

### 修复

```bash
pmw set preferred-session-id <session-id>
# 或忽略此 warning
```

如果用户没遇到具体功能问题，**这个 warning 可以忽略**。pm-workflow 的核心功能（dispatch / 主题 / Auto-continue）都不依赖它。

---

## T10: 版本不一致

### 症状

```bash
$ pmw --version
1.0.0-rc.9

$ cat ~/.cache/opencode/packages/@walke/opencode-pm-workflow@rc/node_modules/@walke/opencode-pm-workflow/package.json | grep version
"version": "1.0.0-rc.7",
```

CLI 是 rc.9 但 OpenCode plugin cache 还是 rc.7。

### 根因

升级 CLI 时没清 OpenCode cache。OpenCode 复用现有 cache，不会自动拉新版。

### 修复

```bash
${CLAUDE_SKILL_DIR}/scripts/upgrade.sh
```

或手动：

```bash
pkill -9 -f OpenCode && sleep 2
rm -rf ~/.cache/opencode/packages/@walke/opencode-pm-workflow@rc
# 用户双击启动 OpenCode（会让 Bun 重新拉新版）
```

### 验证

```bash
${CLAUDE_SKILL_DIR}/scripts/check.sh | grep -A 3 "plugin cache"
# 应看到 "✓ CLI 与 plugin 版本一致"
```

---

## T11: 子代理模型继承

### 症状

用户期望 backendcoder 用 Opus，advisor 用 Haiku 省成本，但全部都用了 commander 的模型。

### 根因

agent md **不写 model 字段**是 rc.8+ 的设计。OpenCode 默认行为：subagent 继承调用它的 primary 模型。

要让子代理用不同模型，需要在 `~/.config/opencode/opencode.json` 里**单独配置每个 agent**。

### 修复

调用 `agent-model-config` skill，或手动：

```bash
pmw models init --commander opencode/gpt-5 --backendcoder opencode/gpt-5 --advisor opencode/gpt-5-mini --writer opencode/gpt-5-mini
```

会写到 `opencode.json` 的 agent 段：

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

注意：`opencode.json` 的 model 配置 **会被** agent md 里的 model 字段覆盖（如果 md 里也写了）。pm-workflow 主题不写 model 字段（rc.8 起），所以 `opencode.json` 配置是唯一来源。

### 验证

完全 quit + 重启 OpenCode，让某个子代理跑任务，看用的什么模型。OpenCode 会在响应中标注。

---

## T12: 其他 plugin 错误干扰

### 症状

OpenCode log 有几十个 ERROR，用户怀疑 pm-workflow 出问题。

### 根因

通常是其他 plugin 或 MCP 服务器的问题，与 pm-workflow 无关。常见来源：

- `service=mcp clientName=postgresql-mcp error=...`
- `service=mcp clientName=mcp-chrome-devtools error=...`
- `Stripping types is currently unsupported`（来自 opencode-agent-skills）

### 诊断

```bash
LATEST=$(ls -t ~/.local/share/opencode/log/*.log | head -1)

# 查 pm-workflow 相关错误
grep -E "pm-workflow|@walke" "$LATEST" | grep -i error

# 应该 0 行（rc.4+）
```

### 修复

如果上面 grep 没输出但 log 仍有大量 ERROR，那些**与 pm-workflow 无关**，告诉用户去对应 plugin 的仓库提 issue 或禁用对应 plugin。

pm-workflow 的健康判断标准：

- `grep "pm-workflow.*failed" log` → 0 行
- `grep "mkdir.*pm-workflow" log` → 0 行
- `grep "@walke.*ERROR" log` → 0 行
- `pmw doctor` → ok ≥ 8/9

满足这 4 条就算 pm-workflow 健康。

---

## 通用排查思路

如果上述 12 个症状都不匹配，按以下顺序：

1. **跑 check.sh** —— 看哪个层级标 ⚠ 或 ✗
2. **看 OpenCode log 末尾 50 行** —— 看启动后是否有 pm-workflow 相关 error
3. **比对 cache 版本** —— `pmw --version` vs cache 里 package.json 的 version
4. **跑 reset-agents.sh** —— 重置 agent md 到当前主题最新版（覆盖任何手改）
5. **跑 full-clean.sh --confirm** —— 极端情况，全部重来

每一步都会输出详细日志，便于追溯。

## 关联资源

- [SKILL.md](SKILL.md)：触发词 + 流程导航
- [reference.md](reference.md)：完整规范参考
- [upgrade.md](upgrade.md)：升级流程详解
- [uninstall.md](uninstall.md)：卸载流程详解
- [scripts/check.sh](scripts/check.sh)：综合健康检查
