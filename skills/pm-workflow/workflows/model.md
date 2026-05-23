# 为 6 个 agent 分配模型

## 触发场景

用户提到以下任何一条都加载本文档：

- "给 commander 配 Opus" / "designer 用 GPT-5"
- "为 6 个 agent 分配模型"
- "初始化 agent 模型 / pmw models init"
- "我填好了 pm-workflow.models.example.json"
- "从全局 OpenCode 模型列表选择模型"
- "切换某个 agent 的模型 / fallback 模型"

## ⚠ 关键概念：模型配置写在哪里

**OpenCode 读取 agent 模型的唯一权威位置**：

```
~/.config/opencode/opencode.json 的 agent 段
```

格式：

```json
{
  "agent": {
    "commander": {
      "model": "bestool/claude-opus-4.x",
      "fallback_models": ["cx/gpt-5.5", "cx/gpt-5.4"]
    },
    "designer": { "model": "antigravity/gemini-3.1-pro-low" },
    ...
  }
}
```

**绝不要写到这些位置**（OpenCode 不读，写了无效）：

- ❌ `~/.config/opencode/pm-workflow.config.json` 的 `agents.definitions[*].model`
- ❌ `~/.config/opencode/agents/<id>.md` 的 frontmatter `model` 字段（rc.8 起 pm-workflow 主题不写这个，让用户全局配置统一管理）
- ❌ `<projectDir>/.pm-workflow/config.json`

如果之前的 AI 错误地写到这些位置，要：
1. 提示用户它们对 OpenCode 完全无效
2. 把配置移到正确位置（`opencode.json` agent 段）
3. 清理错误位置的残留（清掉 pm-workflow.config.json 里的 model 字段）

## 模型来源（唯一权威清单）

只能用 `~/.config/opencode/opencode.json` 的 `provider.*.models` 列表里**已存在**的模型 ID。

查询方法：

```bash
python3 -c "
import json
d = json.load(open('/Users/walkemac/.config/opencode/opencode.json'))
for prov_id, prov in d.get('provider', {}).items():
    for m in prov.get('models', {}):
        print(f'{prov_id}/{m}')"
```

或更简单：

```bash
jq -r '.provider | to_entries[] | .key as $p | .value.models | keys[] | "\($p)/\(.)"' ~/.config/opencode/opencode.json
```

## 模型 ID 格式

OpenCode 的 model 字段接受两种形式：

| 形式 | 示例 | 何时用 |
|---|---|---|
| `provider/model_id` | `bestool/claude-opus-4.x` | 推荐：明确指定 provider |
| 直接 `model_id`（OpenCode 自动找匹配 provider） | `claude-opus-4.x` | 简洁但有歧义风险 |

**绝不要发明 model ID**。如果用户说"用 Opus"但 inventory 没 Opus，明确告诉用户没有 + 列出实际可用的近似选项。

## 6 个 pm-workflow agent 推荐模型分配

按"成本 / 质量平衡"原则：

| Agent | 推荐模型类型 | 理由 |
|---|---|---|
| `commander` | **强模型**（Opus 级 / GPT-5 级 / Gemini Pro 级） | 决策错误代价大 |
| `backendcoder` | **强模型** | 后端架构判断需要顶级推理 |
| `designer` | 中等以上（Sonnet / GPT-5 / Gemini Pro） | UI 代码生成中等模型够用 |
| `fixer` | 中等以上 | 测试/修复需要确定性 |
| `advisor` | **轻量**（Haiku / GPT-5-mini / DeepSeek Flash） | 调研类大量 token 但不深推理 |
| `writer` | **轻量** | 文档创作不需要深推理 |

## 工作流程

### Step 1：澄清

向用户确认（最多 3 个澄清问题）：

1. 全局还是项目级？（默认全局：`~/.config/opencode/opencode.json`）
2. 6 个 agent 都配，还是只配某几个？
3. 需要 fallback 链吗？

### Step 2：探索 inventory

```bash
# 列出所有可用模型
jq -r '.provider | to_entries[] | .key as $p | .value.models | keys[] | "\($p)/\(.)"' ~/.config/opencode/opencode.json
```

### Step 3：建议分配

根据上面的"推荐分配"原则 + 用户实际可用模型，给出建议表给用户确认。**不要直接写文件**，先问用户：

```
基于你的模型 inventory，建议分配如下：

| Agent | 主模型 | Fallback |
|---|---|---|
| commander    | bestool/claude-opus-4.x        | cx/gpt-5.5 → cx/gpt-5.4 |
| backendcoder | cx/gpt-5.4                     | opencode-go/qwen3.6-plus |
| designer     | antigravity/gemini-3.1-pro-low | gemini-3-flash-preview |
| advisor      | bestool/claude-haiku-4.5       | cx/gpt-5.5-low |
| writer       | bestool/claude-haiku-4.5       | cx/gpt-5.5-low |
| fixer        | bestool/claude-sonnet-4.5      | opencode-go/deepseek-v4-pro |

确认后写入 ~/.config/opencode/opencode.json 的 agent 段？
```

### Step 4：写入正确位置

**用户确认后**，按以下方式写入。强烈建议用 Python 脚本而不是 jq（jq 不擅长 in-place merge 复杂嵌套）：

```bash
python3 <<'EOF'
import json

p = '/Users/walkemac/.config/opencode/opencode.json'
with open(p) as f:
    d = json.load(f)

# 备份建议先做：cp $p $p.backup-$(date +%Y%m%d-%H%M%S)

# 直接合并（保留其他 agent 配置，覆盖指定的 6 个）
agent_config = {
    'commander': {
        'model': 'bestool/claude-opus-4.x',
        'fallback_models': ['cx/gpt-5.5', 'cx/gpt-5.4'],
    },
    'backendcoder': {
        'model': 'cx/gpt-5.4',
        'fallback_models': ['opencode-go/qwen3.6-plus'],
    },
    # ... 等
}

if 'agent' not in d:
    d['agent'] = {}
for k, v in agent_config.items():
    d['agent'][k] = v

with open(p, 'w') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write('\n')

# 验证 JSON 合法
print('✓ 已写入')
EOF
```

### Step 5：验证

```bash
# JSON 合法性
jq empty ~/.config/opencode/opencode.json

# 实际配置
jq '.agent' ~/.config/opencode/opencode.json
```

### Step 6：让用户重启 OpenCode

```
✓ 配置已写入 ~/.config/opencode/opencode.json 的 agent 段。

请完全 quit + 重启 OpenCode 让新配置生效：
1. ⌘+Q 完全退出 OpenCode（菜单 OpenCode → Quit）
2. 双击 OpenCode 重新启动

启动后开新对话，让某个 agent 做事，看是否真用了你期望的模型。
```

## 关于 pm-workflow.config.json 的 agents.definitions

⚠ **这个段落里的 model 字段对 OpenCode 完全无效，绝不要往这里写。**

`pm-workflow.config.json` 是 pm-workflow plugin 自己的内部 metadata，存的是：

- agent ID、mode、description、prompt（plugin 内 fallback，OpenCode md 文件优先）
- permission（plugin 自己的权限规则，与 OpenCode permission 不同）
- dispatch_map / fallback / retry 策略（pm-workflow 内部行为）

**`agents.definitions[*].model` 即使写了，OpenCode 也不会读它分配模型给 agent**——它只是 plugin 内 fallback 时尝试用的 metadata，但实际路由仍由 OpenCode 的 agent 段决定。

如果发现 `pm-workflow.config.json` 里有 `model` / `fallback_models` 字段（之前 AI 误写的产物），告诉用户：

```bash
python3 -c "
import json
p = '/Users/walkemac/.config/opencode/pm-workflow.config.json'
d = json.load(open(p))
for k, v in d.get('agents', {}).get('definitions', {}).items():
    v.pop('model', None)
    v.pop('fallback_models', None)
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
print('✓ 已清理 pm-workflow.config.json 中无效的 model 字段')
"
```

## Fallback 模型机制

OpenCode 的 fallback：

```json
"agent": {
  "commander": {
    "model": "bestool/claude-opus-4.x",
    "fallback_models": ["cx/gpt-5.5", "cx/gpt-5.4"]
  }
}
```

行为：
- 主模型不可用（API 失败 / 超时 / 限流）→ 自动尝试 `cx/gpt-5.5`
- 仍失败 → 尝试 `cx/gpt-5.4`
- 全部失败 → 报错给用户

`fallback_models` 是数组，按顺序尝试。每项也必须在 `provider.*.models` 里存在。

## 用户模板（pm-workflow.models.example.json）

如果用户在项目根目录下提供了 `pm-workflow.models.example.json` 或类似模板，可以用它作为 intent，但**仍要按上述工作流写到 opencode.json**。

模板里的 `agent_models` / `default_model` / `agent_profiles` 是用户偏好声明，不是直接的 OpenCode 配置。AI 读模板 → 生成 OpenCode agent 段 → 用户确认 → 写入。

## 错误处理

| 症状 | 处理 |
|---|---|
| 用户说"模型不识别 / 报错" | 先 `jq '.agent' opencode.json` 看是否有 agent 段；没有就要先建。检查模型 ID 是否在 `provider.*.models` 里 |
| 用户提到 `claude-opus-4.x` 不识别 | 这是 bestool 路由器的合法通配符（路由到 4.x 系列最新版）。**前提是它在 `provider.bestool.models` 里有声明** |
| 模型 ID 含 `/` 是合法的 | OpenCode 接受 `provider/model_id` 形式 |
| 用户已有 `agent` 段不想覆盖 | 用 merge 而不是覆盖（Python 脚本里 `for k, v in agent_config.items(): d['agent'][k] = v`） |
| `provider` 段缺 apiKey | 检查 `provider.*.options.apiKey` 是否存在；缺了 OpenCode 调 API 会鉴权失败 |

## 关联

- [theme.md](theme.md) — 应用主题（agent display_name / body）
- [../reference/agent-frontmatter.md](../reference/agent-frontmatter.md) — agent md 完整规范
- [../troubleshooting/general.md](../troubleshooting/general.md) — T11 子代理模型继承问题
