# Agent Theme Config

## 任务定位

用户希望把 pm-workflow 的 6 个固定 agent（commander / advisor / backendcoder / designer / fixer / writer）包装成不同"皮肤"——比如三国谋士、西游师徒、漫威英雄。

这是 **UX 层** 的能力：

- 永不改语义 ID。
- 永不改 dispatch 路由 / history 记录 / permission 规则。
- 只换 frontmatter 的 `description` / `display_name` / `theme` / `mode` 与 body 的称呼与语气。
- `mode` 字段强制：commander = primary（唯一在 OpenCode 切换列表），其他 = subagent。

## 你能做什么

| 命令 | 用途 |
|---|---|
| `pmw agents theme list` | 列出 5 套内置主题（default / sanguo / xiyou / marvel / workplace） |
| `pmw agents theme preview <id>` | 预览主题渲染结果（dry-run，不写文件） |
| `pmw agents theme apply <id>` | 把 6 个 agent 的 md 写到目标目录 |

也可以直接通过 SDK 调用：

```ts
import {
  listAgentThemes,
  previewAgentTheme,
  applyAgentTheme,
} from "@walke/opencode-pm-workflow";
```

## 标准流程

### Step 1 — 跟用户确认 4 件事

1. **主题** ID（必填）：`default` / `sanguo` / `xiyou` / `marvel` / `workplace` 之一，或者用户用中文表达（"三国" → `sanguo`，"现代职场" → `workplace`）。
2. **写入范围** scope：`global`（默认）= `~/.config/opencode/agents/`；`project` = `<projectDir>/.opencode/agents/`。
3. **是否限定 agent 子集**：默认全部 6 个；用户可指定例如 "只换 designer" → `agents: ["designer"]`。
4. **是否保留已有配置**：默认全部保留（model / permission / fallback_models / temperature）。注意 mode 由主题强制写入，不受 preserveExisting 影响。

### Step 2 — 强制 dry-run 给用户看

任何 apply 前必须先：

```bash
pmw agents theme preview <theme-id> --scope <scope>
```

把 6 个 md 文件的预览贴给用户，让他确认主题语气、display_name、保留的 model / permission 是否符合预期。

### Step 3 — 用户确认后执行 apply

```bash
pmw agents theme apply <theme-id> --scope <scope>
# 或者带 agents / no-preserve flag：
pmw agents theme apply sanguo --scope project --agents backendcoder,designer
pmw agents theme apply default --scope global --no-preserve-model
```

apply 成功输出会列出每个 md 是 "新增" 还是 "覆盖"，以及目标路径。

### Step 4 — 验证

```bash
pmw agents list   # 确认目标目录里出现 6 个 md
pmw doctor        # 检查整体健康度
```

或在 OpenCode 内重启会话，6 个 agent 在 dispatch 输出中应能看到主题化的 `display_name`（如"诸葛亮"）；UI 切换列表只显示 commander。

## 6 个固定 agent 的职责（rc.6 起）

| ID | 职责 | mode |
|---|---|---|
| `commander` | 主控、决策、协调、分派 | primary |
| `advisor` | 调研、分析、拆解、决策顾问 | subagent |
| `backendcoder` | 后端代码（API、数据库、服务、性能） | subagent |
| `designer` | 设计 + 前端代码 + 交互原型 + 图像生成 | subagent |
| `fixer` | 测试 + 修复 + 打包 + 部署 + CI/CD | subagent |
| `writer` | 文档撰写 + 发布说明 + 注释 + ADR | subagent |

## 不可破坏的约束

| 约束 | 原因 |
|---|---|
| 不能改 agent 文件名 | 文件名 = 语义 ID = 路由锚点 |
| 不能合并 / 拆分 / 删除任何固定 agent | pm-workflow 的 dispatch_map / permission.task / registry 都锚定 6 个固定 ID |
| 不能跳过 preview 直接 apply | 主题写盘可能影响 OpenCode UI 展示，必须用户预览确认 |
| 不能默认 `preserveExisting: false` | 会覆盖用户已配的模型与权限；除非用户明确要求 |
| 不能写 history.jsonl | 主题切换是 UX 动作，与执行回执无关 |
| commander 必须 primary，其他必须 subagent | OpenCode UI 切换列表只显示 commander，符合主代理设计 |

## 用户自定义主题

如果用户给的主题不在内置 5 套里（例如 "古希腊神话"、"《指环王》"），目前需要走"先 PR 进内置"的路径：

1. 主题数据放在 `src/core/agent-theme-data.ts` 的 `BUILTIN_THEMES` 数组里。
2. 必须给齐全部 6 个 agent 的皮肤；少一个就退到 `default`。
3. 约束：display_name ≤ 12 字；description ≤ 60 字；body 保留"职责 + 边界"两段语义；commander 强制 mode=primary，其他 5 个强制 mode=subagent。

不支持运行时动态加载用户 JSON 主题（避免 prompt 注入与不一致），后续可能开放。

## 常见对话样例

**用户**："帮我把所有 agent 改成三国主题"

→ 你应该：
1. 解释将要改什么（display_name + description + body 文案 + theme + mode 字段，model 与 permission 不动）。
2. 跑 `pmw agents theme preview sanguo --scope global`，把预览贴给用户。
3. 用户确认后 `pmw agents theme apply sanguo --scope global`。
4. 给出验证命令。

**用户**："只把前端换成貂蝉"

→ `pmw agents theme apply sanguo --scope global --agents designer`。

**用户**："恢复成普通名字"

→ `pmw agents theme apply default --scope global`（也是覆盖写入，把 6 个 md 重置为中性命名）。

## 错误处理

| 报错 | 处理 |
|---|---|
| `unknown theme "xxx"` | 列出可用主题让用户重选 |
| 写文件失败（权限 / 路径不存在） | 检查 scope 对应目录权限；project 模式可能需要先 `mkdir -p .opencode/agents` |
| apply 后 OpenCode UI 没变 | 让用户**完全 quit + 重启 OpenCode**（不是 reload），OpenCode 在启动时读取 agents 目录 |
