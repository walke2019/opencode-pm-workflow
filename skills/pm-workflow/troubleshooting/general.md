# 其他类问题（T9-T12）

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

