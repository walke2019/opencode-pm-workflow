---
name: pm-workflow
description: pm-workflow（@walke/opencode-pm-workflow）插件全场景帮手——首次安装、升级、配置、诊断、排错、卸载，以及 6 个固定 agent（commander / advisor / backendcoder / designer / fixer / writer）的主题切换、模型分配、权限调整、UI 切换列表问题。AI 应在用户提到 pm-workflow / pmw / 任一固定 agent ID / OpenCode plugin 加载失败 / agent md 缺字段 / skill 不识别 / 切换列表显示太多 / 切三国主题 / 给 commander 配 Opus / 等场景时主动加载此 skill。这是 pm-workflow 的唯一 AI 入口。详细内容按场景拆分到 workflows/ reference/ troubleshooting/ scripts/ 四个子目录，AI 按需读取对应子文件。
license: MIT
compatibility: opencode
metadata:
  audience: pm-workflow users
  scope: install-config-theme-model-debug-uninstall
---

# pm-workflow

pm-workflow 全场景 AI 帮手。任何涉及 `@walke/opencode-pm-workflow` 的问题都从这里开始。

**第一步永远是诊断**：

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/check.sh
```

它一次性输出环境、CLI、plugin cache、skills、agents、log 错误的全部状态，让你立刻定位问题在哪一层。

## 触发词与流程导航

| 用户说什么 | 走哪个文件 |
|---|---|
| "怎么装 pm-workflow" / "怎么用 commander" | [workflows/install.md](workflows/install.md) |
| "升级到最新版" / "我要用最新 rc" | [workflows/upgrade.md](workflows/upgrade.md) |
| "切三国主题" / "改 designer 的展示名" / "回滚到默认主题" | [workflows/theme.md](workflows/theme.md) |
| "给 commander 配 Opus" / "designer 用 GPT-5" / "为 agent 分配模型" | [workflows/model.md](workflows/model.md) |
| "我是 OpenAI / OpenCode-Go / bestool 订阅用户" / "推荐模型方案" | [workflows/model.md § 订阅平台预设](workflows/model.md) |
| "ProviderModelNotFoundError" / "模型不识别 / 不生效 / 报错 / 限额" | [workflows/model.md § 常见错误诊断](workflows/model.md) |
| "彻底卸载 pm-workflow" | [workflows/uninstall.md](workflows/uninstall.md) |
| "pmw doctor 报错" / "OpenCode 加载失败" / "mkdir 失败" | [troubleshooting/install.md](troubleshooting/install.md) |
| "切换列表显示太多" / "writer 跑不了 git log" / "commander 不调子代理" | [troubleshooting/agent-md.md](troubleshooting/agent-md.md) |
| "AI 不知道有什么主题" / "skill 没生效" | [troubleshooting/skill-load.md](troubleshooting/skill-load.md) |
| "preferred_session_id 警告" / "版本不一致" / "其他 plugin 错误" | [troubleshooting/general.md](troubleshooting/general.md) |
| 想看官方规范（agent / skill / config 字段） | [reference/](reference/)（按主题选择子文件） |

## 子目录导航

**workflows/** — 按场景的完整工作流

- [install.md](workflows/install.md) — 首次安装
- [upgrade.md](workflows/upgrade.md) — 升级
- [theme.md](workflows/theme.md) — 主题切换（5 套内置：default/sanguo/xiyou/marvel/workplace）
- [model.md](workflows/model.md) — 为 agent 分配模型 + 3 套订阅平台 preset（OpenAI / OpenCode-Go / bestool）+ 5 个常见错误诊断（ProviderModelNotFoundError / 用户 UI 手选覆盖 / fallback 不触发 / 路由器熔断 / JSON 语法错误）
- [uninstall.md](workflows/uninstall.md) — 完全卸载

**reference/** — 完整规范参考（OpenCode 官方文档摘要 + pm-workflow 标准）

- [agent-spec.md](reference/agent-spec.md) — OpenCode agent md 字段规范
- [skill-spec.md](reference/skill-spec.md) — OpenCode skill md 字段规范
- [agent-frontmatter.md](reference/agent-frontmatter.md) — pm-workflow 6 个 agent 标准 frontmatter
- [config.md](reference/config.md) — pm-workflow.config.json + opencode.json plugin 配置
- [file-paths.md](reference/file-paths.md) — 跨平台文件路径与目录结构（macOS/Linux/Windows）
- [cli-commands.md](reference/cli-commands.md) — pmw CLI 命令参考

**troubleshooting/** — 故障排查（按问题类型）

- [index.md](troubleshooting/index.md) — 12 个错误的索引 + 通用排查思路
- [install.md](troubleshooting/install.md) — T1-T2 安装与加载类
- [agent-md.md](troubleshooting/agent-md.md) — T3-T6 agent md 字段类
- [skill-load.md](troubleshooting/skill-load.md) — T7-T8 skill 加载类
- [general.md](troubleshooting/general.md) — T9-T12 其他类

**scripts/** — 可执行脚本（输出详细日志便于追溯）

- [check.sh](scripts/check.sh) — 综合健康检查（只读，无风险）
- [upgrade.sh](scripts/upgrade.sh) — 互动式升级（quit + 清 cache + 升 CLI + 验证）
- [reset-agents.sh](scripts/reset-agents.sh) — 重置 6 个 agent md 到当前主题（自动备份）
- [full-clean.sh](scripts/full-clean.sh) — 完全清理（必须 --confirm）

## 6 个固定 agent

pm-workflow 永远只有这 6 个语义 agent，ID 永不可改：

| ID | 职责 | mode |
|---|---|---|
| `commander` | 主控、决策、协调、分派 | **primary**（OpenCode UI 切换列表唯一显示它） |
| `advisor` | 调研、分析、拆解、决策顾问 | subagent |
| `backendcoder` | 后端代码（API、数据库、服务、性能） | subagent |
| `designer` | 设计 + 前端代码 + 交互原型 + 图像生成 | subagent |
| `fixer` | 测试 + 修复 + 打包 + 部署 + CI/CD | subagent |
| `writer` | 文档撰写 + 发布说明 + 注释 + ADR | subagent |

详细 frontmatter 与 permission 表见 [reference/agent-frontmatter.md](reference/agent-frontmatter.md)。

## 核心约束（每次操作前必查）

| 约束 | 验证 | 引入版本 |
|---|---|---|
| **模型配置写在 `opencode.json` 的 `agent` 段** | OpenCode 只读这里的 model 字段；写到 pm-workflow.config.json 的 agents.definitions[*].model 完全无效 | rc.12 强调 |
| **CLI 版本对齐** | `pmw --version` ≡ plugin cache 版本 | rc.4 |
| **Skill 子目录结构** | `~/.config/opencode/skills/<id>/SKILL.md` | rc.7 |
| **Agent md 完整字段** | 含 description / mode / temperature / tools / permission | rc.8 |
| **mode 严格约束** | commander = primary，其他 5 个 = subagent | rc.6 |
| **6 个固定 ID 永不可改** | commander / advisor / backendcoder / designer / fixer / writer | rc.6 |
| **跨平台兼容** | 用 `os.homedir()` / `os.tmpdir()` | rc.5 |

## 行为约束（AI 用此 skill 时必须遵守）

1. **先问后做**：模糊请求时最多问 3 个澄清问题再操作
2. **先 dry-run**：所有写盘操作（apply 主题、改 model、修 agent md）必须先预览
3. **不假设环境**：先跑 `scripts/check.sh` 再下结论
4. **按需读子文件**：不要把 reference/ 或 workflows/ 全量读进来，按用户问题选对应一个 .md 读取
5. **可回滚**：每步操作前告知用户回滚命令；高风险必须备份到 `.backup-<timestamp>/`
6. **输出过程日志**：跑脚本时把脚本的全部输出展示给用户

## 不可破坏的红线

- 6 个固定 agent ID 永不改（commander / advisor / backendcoder / designer / fixer / writer）
- skill 必须子目录结构 `<id>/SKILL.md`
- agent md 必须含完整 frontmatter 字段
- commander 必须 primary，其他 5 个必须 subagent
- 任何"清理 ~/.config/opencode/agents/" 操作前必须备份
- 任何"删 ~/.config/opencode/pm-workflow.config.json" 操作前必须问用户
- 任何 `pkill OpenCode` / `npm install -g` 操作前必须告知用户

## 版本历史

| 版本 | 修复内容 |
|---|---|
| rc.4 | OpenCode plugin 加载失败（projectDir 兜底） |
| rc.5 | 跨平台兼容（macOS/Linux/Windows） |
| rc.6 | 6 个 agent 重命名 + 角色合并 |
| rc.7 | OpenCode skill 必须子目录 + SKILL.md |
| rc.8 | agent md 完全符合 OpenCode 规范（temperature / tools / permission + 完整 body） |
| rc.9 | 新增 pm-workflow-config / agent-theme-config / agent-model-config 三个 skill |
| rc.10 | 三个 skill 合并为单一 `pm-workflow` skill（顶层 .md 平铺） |
| **rc.11** | **subdirectory 组织**：reference/ workflows/ troubleshooting/ scripts/ 四个子目录，SKILL.md 仅做导航；7 个顶层 .md 拆分为 16 个语义子文件，AI 按需读取 |

如果用户描述的症状与某个旧版本一致，**第一步永远是建议升级到最新版**：

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/upgrade.sh
```
