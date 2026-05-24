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

## 订阅平台预设方案（preset）

如果用户已订阅常见 OpenCode 兼容平台，下面给出**开箱即用的 model 分配** —— AI 检测到用户的 provider 后可以**主动建议**对应方案，用户确认后写入。

### 设计原则

- **保持 6 个 agent 名永不改**：commander / advisor / backendcoder / designer / fixer / writer
- **预设是建议**，不是强制；用户可改任意一个 agent 的模型
- **混合 provider 完全合法**：commander 用 OpenAI、designer 用 OpenCode-Go 是 OK 的，OpenCode 接受跨 provider 的 fallback 链
- **模型 ID 必须含 provider 前缀**：详见上文 § 模型 ID 格式 + 下文 § E1 错误诊断

---

### Preset A：OpenAI 订阅（OpenCode Zen / openai provider）

适合 OpenCode Zen 订阅、OpenAI API 直连、走 `openai/*` provider 的用户。

```json
{
  "agent": {
    "commander": {
      "model": "openai/gpt-5.5",
      "fallback_models": ["openai/gpt-5.4", "openai/gpt-5.4-mini"]
    },
    "advisor": {
      "model": "openai/gpt-5.4-mini",
      "fallback_models": ["openai/gpt-5.5"]
    },
    "backendcoder": {
      "model": "openai/gpt-5.5",
      "fallback_models": ["openai/gpt-5.4"]
    },
    "designer": {
      "model": "openai/gpt-5.4-mini",
      "fallback_models": ["openai/gpt-5.5"]
    },
    "fixer": {
      "model": "openai/gpt-5.4-mini",
      "fallback_models": ["openai/gpt-5.5"]
    },
    "writer": {
      "model": "openai/gpt-5.4-mini",
      "fallback_models": []
    }
  }
}
```

设计要点：

- commander / backendcoder：`gpt-5.5`（强决策与代码）
- advisor / designer / fixer / writer：`gpt-5.4-mini`（中等成本，OpenAI 体系内 mini 性能足够）
- 主模型 5.5 撞限额时降级到 5.4 / 5.4-mini

---

### Preset B：OpenCode-Go 订阅（opencode-go provider）

适合 OpenCode Go 订阅用户，可用 deepseek / kimi / glm / minimax 等多种国产高质量模型。

```json
{
  "agent": {
    "commander": {
      "model": "opencode-go/glm-5.1",
      "fallback_models": [
        "opencode-go/deepseek-v4-pro",
        "opencode-go/kimi-k2.6"
      ]
    },
    "advisor": {
      "model": "opencode-go/minimax-m2.7",
      "fallback_models": [
        "opencode-go/deepseek-v4-flash",
        "opencode-go/glm-5.1"
      ]
    },
    "backendcoder": {
      "model": "opencode-go/deepseek-v4-pro",
      "fallback_models": [
        "opencode-go/kimi-k2.6",
        "opencode-go/glm-5.1"
      ]
    },
    "designer": {
      "model": "opencode-go/kimi-k2.6",
      "fallback_models": [
        "opencode-go/deepseek-v4-pro",
        "opencode-go/qwen3.6-plus"
      ]
    },
    "fixer": {
      "model": "opencode-go/deepseek-v4-flash",
      "fallback_models": [
        "opencode-go/deepseek-v4-pro",
        "opencode-go/kimi-k2.6"
      ]
    },
    "writer": {
      "model": "opencode-go/minimax-m2.7",
      "fallback_models": [
        "opencode-go/deepseek-v4-flash"
      ]
    }
  }
}
```

设计要点：

- commander：`glm-5.1`（强中文推理 + 决策）
- backendcoder：`deepseek-v4-pro`（业界顶级代码模型）
- designer：`kimi-k2.6`（前端/视觉理解强）
- advisor / writer：`minimax-m2.7`（中等成本，速度快）
- fixer：`deepseek-v4-flash`（快速验证 / 测试）

---

### Preset C：bestool 路由器（多 provider 一站式）

适合通过 `route.bestool.cc` 这类聚合路由器订阅、可用 Anthropic / OpenAI / Google / DeepSeek 等任意模型的用户。

```json
{
  "agent": {
    "commander": {
      "model": "bestool/claude-opus-4.x",
      "fallback_models": [
        "bestool/cx/gpt-5.5-medium",
        "bestool/cx/gpt-5.5",
        "bestool/cx/gpt-5.4"
      ]
    },
    "advisor": {
      "model": "bestool/claude-haiku-4.5",
      "fallback_models": [
        "bestool/cx/gpt-5.5-low",
        "bestool/cx/gpt-5.4-mini",
        "bestool/opencode-go/deepseek-v4-flash"
      ]
    },
    "backendcoder": {
      "model": "bestool/cx/gpt-5.4",
      "fallback_models": [
        "bestool/cx/gpt-5.3-codex",
        "bestool/opencode-go/qwen3.6-plus"
      ]
    },
    "designer": {
      "model": "bestool/cx/gpt-5.5",
      "fallback_models": [
        "bestool/cx/gpt-5.4",
        "bestool/opencode-go/qwen3.6-plus"
      ]
    },
    "fixer": {
      "model": "bestool/claude-sonnet-4.5",
      "fallback_models": [
        "bestool/opencode-go/deepseek-v4-pro",
        "bestool/opencode-go/kimi-k2.6"
      ]
    },
    "writer": {
      "model": "bestool/claude-haiku-4.5",
      "fallback_models": [
        "bestool/cx/gpt-5.5-low",
        "bestool/cx/gpt-5.4-mini",
        "bestool/opencode-go/deepseek-v4-flash"
      ]
    }
  }
}
```

设计要点：

- 跨 provider 混搭：claude / gpt / deepseek 各取所长
- commander：claude-opus-4.x（最强决策能力）
- 兜底走 cx/gpt-5.* 与 opencode-go/* 多家路由器分担风险
- 注意 model ID 都以 `bestool/` 开头（详见 § E1）

---

### 让 AI 检测 + 推荐 preset 的工作流

在 § 工作流程 Step 2 探索 inventory 之后，AI 应该：

1. 看 `provider` 段有哪些 key（`openai` / `opencode-go` / `bestool` / 等）
2. 选择匹配的 preset：
   - 单一 `openai` → Preset A
   - 单一 `opencode-go` → Preset B
   - `bestool` 含多种子分类 → Preset C
   - 其他单一 provider → 询问用户偏好后**类推 Preset A 风格**生成
3. 把对应 preset 的 JSON 给用户**预览**，让用户改任意 agent 的模型
4. 用户确认后**按 § Step 4 工作流写入** `~/.config/opencode/opencode.json`

### 自定义改任意一项

每个 agent 都可独立改：

```python
# 比如用户想把 commander 改成 anthropic Opus（直连），其他保持 OpenAI
import json
p = '/Users/walkemac/.config/opencode/opencode.json'
d = json.load(open(p))
d['agent']['commander'] = {
    'model': 'anthropic/claude-opus-4-20250514',
    'fallback_models': ['openai/gpt-5.5'],
}
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
```

混合 provider 完全合法——OpenCode 按 model ID 前缀路由到对应 provider，fallback 链跨 provider 也支持。

### 不在 preset 列表里的 provider 怎么办

直接照 Preset A 的结构类推：

- 找该 provider 模型清单：`jq '.provider.<provider-id>.models | keys' opencode.json`
- 按模型档位（强 / 中 / 轻）映射到 6 个 agent（参见 § 6 个 agent 推荐模型分配）
- 主模型从该 provider 选，fallback 可跨 provider 也可同 provider 不同模型

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

## 错误处理（高频问题速查）

| 症状 | 处理 |
|---|---|
| 用户说"模型不识别 / 报错" | 先 `jq '.agent' opencode.json` 看是否有 agent 段；没有就要先建。检查模型 ID 是否在 `provider.*.models` 里 |
| 用户提到 `claude-opus-4.x` 不识别 | 这是 bestool 路由器的合法通配符（路由到 4.x 系列最新版）。**前提是它在 `provider.bestool.models` 里有声明** |
| 模型 ID 含 `/` 是合法的 | OpenCode 接受 `provider/model_id` 形式 |
| 用户已有 `agent` 段不想覆盖 | 用 merge 而不是覆盖（Python 脚本里 `for k, v in agent_config.items(): d['agent'][k] = v`） |
| `provider` 段缺 apiKey | 检查 `provider.*.options.apiKey` 是否存在；缺了 OpenCode 调 API 会鉴权失败 |

## 常见错误诊断（深入）

下面 5 种是 1.0.0-rc 系列实测发现的高频坑，AI 在用户报告"模型有问题"时按症状对照诊断。

### E1. ProviderModelNotFoundError — 模型 ID 缺 provider 前缀

**症状**：

OpenCode log 出现：

```
ERROR ProviderModelNotFoundError
providerID: "antigravity"
modelID: "gemini-3.1-pro-low"
```

**根因**：

OpenCode 1.15 解析 `model` 字段时，把第一个 `/` 之前的部分当作 provider ID。如果用户配的是 `antigravity/gemini-3.1-pro-low`（不含 `bestool/` 前缀），OpenCode 会去找名为 `antigravity` 的 provider——但实际上你的 inventory 里只有 `bestool` 这一个 provider，`antigravity` 是 bestool 内部的子分类。

**OpenCode 不识别 model ID 内部的多级路径**——它只看第一段 `/` 前作为 provider。

**修复**：所有 model ID 必须以**已注册的 provider** 名开头。

```bash
# 看真实 provider 列表
jq '.provider | keys' ~/.config/opencode/opencode.json

# 模型必须以这些 provider 名开头：
# 错：antigravity/gemini-3.1-pro-low
# 对：bestool/antigravity/gemini-3.1-pro-low
# 错：opencode-go/qwen3.6-plus
# 对：bestool/opencode-go/qwen3.6-plus
```

**批量修复脚本**（自动给所有缺前缀的 model ID 加上）：

```bash
python3 <<'EOF'
import json
p = '/Users/walkemac/.config/opencode/opencode.json'
d = json.load(open(p))
known = list(d.get('provider', {}).keys())
def fix(m):
    if not isinstance(m, str): return m
    first = m.split('/', 1)[0]
    if first in known: return m
    # 默认前缀 bestool（按需调整）
    return f'bestool/{m}'

for name, conf in d.get('agent', {}).items():
    if 'model' in conf:
        conf['model'] = fix(conf['model'])
    if 'fallback_models' in conf:
        conf['fallback_models'] = [fix(m) for m in conf['fallback_models']]

for k in ['model', 'small_model']:
    if k in d:
        d[k] = fix(d[k])

with open(p, 'w') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
print('已修复所有缺前缀的 model ID')
EOF
```

**验证**：JSON 合法 + 启动 OpenCode 后 log 无 ProviderModelNotFoundError。

---

### E2. 配了 model 但 OpenCode 不用 — 用户 UI 手选覆盖了

**症状**：

用户在 `opencode.json` 配了 `commander.model: bestool/claude-opus-4.x`，但 OpenCode log 显示 `agent=commander modelID=opencode-go/deepseek-v4-pro`——用了别的模型。

**根因**：

OpenCode session 状态会**记住用户在 UI 里手动切过的模型**（model picker / Tab 键切换 / `/model` 命令），并优先于 `opencode.json` 的 agent 段配置。

OpenCode 模型选择优先级：

```
1. session 内用户手选（最高，存到 ~/.local/share/opencode/storage/session_diff/）
2. opencode.json agent.<id>.model
3. opencode.json 全局 model
```

**修复**：

- **如果是用户主动选的**（例如想测某个模型）→ 这是预期行为，不修
- **如果是误操作**：让用户在 OpenCode UI 里**手动切回**期望的模型（`/model` 命令或 model picker 快捷键）；这次切换会被记住替代之前的选择
- **如果想完全重置**：清掉 session diff state（**会丢失会话历史**，慎用）：

  ```bash
  # 极端情况，会丢失对话状态
  rm -rf ~/.local/share/opencode/storage/session_diff/
  ```

**验证**：让 commander 跑任务，看 log 里 `agent=commander modelID=...` 是否符合期望。

---

### E3. 主模型限额但 fallback 不触发 — isRetryable: false

**症状**：

agent 配了 fallback 链（`fallback_models: [...]`），主模型撞限额返回 HTTP 402，但 OpenCode **直接报错给用户**，没尝试 fallback。

log 里看到：

```
service=llm error={"name":"AI_APICallError","statusCode":402,
  "responseBody":"{...}","isRetryable":false,
  "data":{"error":{"message":"[402]: You have reached the limit."}}}
```

**根因**：

OpenCode 看 `isRetryable` 字段决定是否走 fallback：

| HTTP 状态 | isRetryable | 是否触发 fallback |
|---|---|---|
| 5xx 服务器错误 | true | ✓ |
| 429 限流 | 通常 true | ✓ |
| **402 配额已满** | **false**（路由器主动标记）| **✗** |
| 401/403 认证失败 | false | ✗ |
| 400 请求错误 | false | ✗ |

bestool 路由器把 402 标记为 `isRetryable: false`（路由器认为"用户付费问题"不是"模型不可用"），所以 OpenCode 不走 fallback，直接报错。

**修复**：

把容易撞限额的模型从主模型位置移除，只留在 fallback 链尾兜底：

```python
# 把 designer 主模型从 sonnet-4.5（容易满额）改为 cx/gpt-5.5
import json
p = '/Users/walkemac/.config/opencode/opencode.json'
d = json.load(open(p))
d['agent']['designer'] = {
    'model': 'bestool/cx/gpt-5.5',
    'fallback_models': [
        'bestool/cx/gpt-5.4',
        'bestool/opencode-go/qwen3.6-plus',
        'bestool/claude-sonnet-4.5',  # 留作最后兜底
    ],
}
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
```

**验证**：主模型不再是限额模型；让 designer 跑任务看是否成功。

**长期方案**：

- 联系 bestool 后端把 402 标记成 `isRetryable: true`（路由器开发者改）
- 或 pm-workflow plugin 做 402 自动 fallback 拦截（rc.14+ 候选 feature）

---

### E4. 路由器层错误 — 503 熔断 / 模型暂时不可用

**症状**：

API 调用返回 HTTP 503：

```
{"error":{"message":"Provider antigravity circuit breaker is open",
  "type":"server_error","code":"provider_circuit_open",
  "provider":"antigravity","retry_after":12}}
```

**根因**：

bestool / 类似路由器在底层 provider（如 antigravity / cx / opencode-go）出问题时**主动熔断**，对应模型几分钟内全部 503。这是路由器层行为，**不是用户配置错**。

**判断标志**：

- 报错信息含 "circuit breaker is open" 或 "circuit_open"
- HTTP 503
- `retry_after` 字段（秒数）

**修复**：

- **短期**：换 fallback 链里的模型（路由器熔断不会全部子分类同时熔断）
- **长期**：联系 bestool 后端查熔断原因 / 等熔断恢复

**验证**：

```bash
# 直接 curl 测哪些模型可用
APIKEY=$(jq -r '.provider.bestool.options.apiKey' ~/.config/opencode/opencode.json)
for MODEL in "claude-opus-4.x" "cx/gpt-5.5" "antigravity/gemini-3.1-pro-low"; do
  HTTP=$(curl -s -o /tmp/r.txt -w "%{http_code}" \
    -X POST https://route.bestool.cc/v1/chat/completions \
    -H "Authorization: Bearer $APIKEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":10,\"stream\":false}" \
    --max-time 15)
  echo "  $MODEL: HTTP $HTTP"
done
rm -f /tmp/r.txt
```

把 503 的模型从配置移除，换其他可用模型。

---

### E5. opencode.json JSON 语法错误 — 合并 provider 时漏 `,`

**症状**：

OpenCode 启动失败，或所有 plugin 都不加载，log 里：

```
SyntaxError: Expecting ',' delimiter: line N column M
```

或 `jq empty opencode.json` 报错。

**根因**：

用户手动编辑 `opencode.json` 时常见的两种错误：

1. **缺逗号**：合并 provider 时多个字段挤在一行：
   ```json
   "baseURL": "https://..." "apiKey": "sk-..."   ← 错：缺 ,
   ```
2. **多余 `}`**：合并段时根对象被错误闭合：
   ```json
   "provider": { ... },
   },                       ← 错：根对象提前闭合
   "mcp": { ... }           ← 在根外
   ```

**修复**：

```bash
# 1. 先用 jq 验证 JSON 合法性
jq empty ~/.config/opencode/opencode.json
# 报错信息会指出 line column

# 2. 看错误附近的代码
sed -n '$LINE,$LINEp' ~/.config/opencode/opencode.json

# 3. 修对应字符（典型场景）
# 缺 ,：在 "..." 与下一个 "key": 之间加 ",\n"
# 多 }：删除孤立的 ^}, 行
```

**自动修复脚本**（适用于"合并 provider 后多了根级 `}`"场景）：

```bash
python3 <<'EOF'
import re
content = open('/Users/walkemac/.config/opencode/opencode.json').read()
# 删掉所有顶层错误的 ^}, 行
content = re.sub(r'^\}\,$\n', '', content, flags=re.MULTILINE)
# 检查 { 与 } 平衡
opens = content.count('{')
closes = content.count('}')
if opens > closes:
    needed = opens - closes
    content = content.rstrip() + '\n' + ('}\n' * needed)
import json
try:
    json.loads(content)
    open('/Users/walkemac/.config/opencode/opencode.json', 'w').write(content)
    print('已修复')
except json.JSONDecodeError as e:
    print(f'仍有错: {e}')
EOF
```

**预防**：

- 手动改 `opencode.json` 后**永远先 `jq empty`** 验证再保存
- 用 Python 脚本（`json.load` + `json.dump`）改配置，自动保证语法正确

---

## 关联

- [theme.md](theme.md) — 应用主题（agent display_name / body）
- [../reference/agent-frontmatter.md](../reference/agent-frontmatter.md) — agent md 完整规范
- [../troubleshooting/general.md](../troubleshooting/general.md) — T11 子代理模型继承问题
