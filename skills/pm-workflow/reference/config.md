# pm-workflow.config.json 与 opencode.json 配置


路径：`~/.config/opencode/pm-workflow.config.json`

```json
{
  "retry": {
    "max_attempts": 2,
    "retryable_actions": [...]
  },
  "fallback": {
    "max_attempts": 1,
    "agent_map": {
      "commander": "commander",
      "advisor": "advisor",
      "backendcoder": "backendcoder",
      "designer": "designer",
      "fixer": "fixer",
      "writer": "writer"
    }
  },
  "agents": {
    "enabled": true,
    "default_mode": "subagent",
    "dispatch_map": {
      "commander": "commander",
      ...
    }
  },
  "automation": { "mode": "assist" },
  "docs": { "storage_mode": "legacy" }
}
```

由 plugin 启动时自动生成；删除后下次启动会重新生成默认配置。

---

## 5. `opencode.json` 中 plugin 配置

路径：`~/.config/opencode/opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "@walke/opencode-pm-workflow@latest",
    "其他 plugin..."
  ]
}
```

支持版本说明符：

| 写法 | 含义 |
|---|---|
| `@walke/opencode-pm-workflow` | 装 latest tag 指向版本 |
| `@walke/opencode-pm-workflow@latest` | 同上 |
| `@walke/opencode-pm-workflow@rc` | 装 rc tag → 当前最新 RC |
| `@walke/opencode-pm-workflow@1.0.0-rc.9` | 锁版本 |

OpenCode 启动时用 Bun 自动装到 `~/.cache/opencode/node_modules/`；旧版 OpenCode 或历史安装可能残留在 `~/.cache/opencode/packages/`。

---
