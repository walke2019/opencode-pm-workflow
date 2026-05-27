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
pmw repair opencode-cache
```

该命令会把版本不一致或损坏的 pm-workflow OpenCode/Kilo plugin cache 改名为 `.bak-<timestamp>`。然后完全 quit + 重启 OpenCode，让它重新拉当前版本。

旧版 CLI 没有该命令时，先升级：

```bash
npm install -g @walke/opencode-pm-workflow@latest
pmw repair opencode-cache
```

### 验证

```bash
pmw repair opencode-cache --dry-run --json
# staleCount 应为 0
```

---

## T11: 子代理模型继承

### 症状

用户期望 backendcoder 用 Opus，advisor 用 Haiku 省成本，但全部都用了 commander 的模型。或者：之前 AI 报告"已写入"模型配置，但 OpenCode 内实际还是用全局默认模型。

### 根因

模型配置可能被写到了**错误的位置**。OpenCode 读 agent 模型只认一个权威位置：

```
~/.config/opencode/opencode.json 的 agent 段
```

如果之前 AI 写到了：

| 错误位置 | OpenCode 是否读 | 修复 |
|---|---|---|
| `~/.config/opencode/pm-workflow.config.json` 的 `agents.definitions[*].model` | ❌ 不读 | 配置移到 opencode.json，清掉这里的 model 字段 |
| `~/.config/opencode/agents/<id>.md` frontmatter 的 model 字段 | ⚠ rc.8+ pm-workflow 主题不写 model | 手动加上或改主题，或写到 opencode.json |
| `<projectDir>/.pm-workflow/config.json` | ❌ 不读 | 同上，移到 opencode.json |

agent md **不写 model 字段**是 rc.8+ 的设计。OpenCode 默认行为：subagent 继承调用它的 primary 模型——除非 `opencode.json` 的 `agent` 段明确指定。

### 诊断

```bash
# 看 OpenCode 实际读的位置（agent 段）
jq '.agent' ~/.config/opencode/opencode.json
```

如果 `agent: {}` 或没有这个段，OpenCode 就在用全局默认模型给所有 agent。

```bash
# 看是否有"无效配置"残留
python3 -c "
import json
p = '/Users/walkemac/.config/opencode/pm-workflow.config.json'
try:
    d = json.load(open(p))
    found = False
    for k, v in d.get('agents', {}).get('definitions', {}).items():
        if 'model' in v or 'fallback_models' in v:
            print(f'⚠ {k} 在 pm-workflow.config.json 有 model 字段（OpenCode 不读，无效）')
            found = True
    if not found:
        print('✓ pm-workflow.config.json 干净')
except Exception as e:
    print(f'(读不到 {p}: {e})')
"
```

### 修复

调用 model 工作流（详见 [../workflows/model.md](../workflows/model.md)）。核心步骤：

```bash
# 1. 备份
cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.backup-$(date +%Y%m%d-%H%M%S)

# 2. 写到 opencode.json 的 agent 段
python3 <<'EOF'
import json
p = '/Users/walkemac/.config/opencode/opencode.json'
with open(p) as f:
    d = json.load(f)

if 'agent' not in d:
    d['agent'] = {}

# 按用户需求合并（不覆盖现有其他 agent）
d['agent']['commander']    = {'model': 'bestool/claude-opus-4.x'}
d['agent']['backendcoder'] = {'model': 'cx/gpt-5.4'}
d['agent']['designer']     = {'model': 'antigravity/gemini-3.1-pro-low'}
d['agent']['advisor']      = {'model': 'bestool/claude-haiku-4.5'}
d['agent']['writer']       = {'model': 'bestool/claude-haiku-4.5'}
d['agent']['fixer']        = {'model': 'bestool/claude-sonnet-4.5'}

with open(p, 'w') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('✓ 已写入 opencode.json 的 agent 段')
EOF

# 3. 清掉 pm-workflow.config.json 里无效的 model 残留（如果有）
python3 <<'EOF'
import json
p = '/Users/walkemac/.config/opencode/pm-workflow.config.json'
d = json.load(open(p))
cleaned = []
for k, v in d.get('agents', {}).get('definitions', {}).items():
    if v.pop('model', None) is not None:
        cleaned.append(f'{k}.model')
    if v.pop('fallback_models', None) is not None:
        cleaned.append(f'{k}.fallback_models')
if cleaned:
    json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
    print(f'✓ 已清理: {cleaned}')
else:
    print('✓ pm-workflow.config.json 已干净')
EOF

# 4. 完全 quit + 重启 OpenCode
pkill -9 -f OpenCode && sleep 2
# 用户双击启动 OpenCode
```

### 验证

启动后让 backendcoder 做一个明显需要 Opus 的任务，看响应里它自报的模型是不是 opus（强模型通常会自报）。或者直接问 commander：「你现在用的什么模型？」

`opencode.json` 的 `agent` 段是 OpenCode 唯一读 model 的位置。pm-workflow 主题不写 model 字段（rc.8 起），所以 `opencode.json` 配置是唯一来源。

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
