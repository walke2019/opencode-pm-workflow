# @walke/opencode-pm-workflow

`@walke/opencode-pm-workflow` 是一个可发布的 OpenCode 插件包，用于把项目任务从"长期停留在需求层"推进到可验证的开发执行闭环。

当前发布版本：`1.0.0-rc.9`。

## 适用场景

本工具有**两种使用模式**，请按你的需求选择：

| 模式 | 何时用 | 提供的能力 | 不提供的能力 |
| --- | --- | --- | --- |
| **OpenCode 内（在线）** | 你已装 OpenCode，想用多 agent 分派 + 自动续跑 + 模型降级编排开发 | 全部能力：dispatch / Auto-continue / ForegroundFallback / 量化分派 / 声明式路由 / Gate / Permission / 健康检查 | — |
| **OpenCode 外（离线 CLI）** | CI、服务器、没装 OpenCode 的环境，只需要诊断 / 审计 / 配置工具 | `pmw doctor` / `state` / `history` / `report` / `agents list/promote/doctor` / `docs check` / `models init` / `verify` | dispatch / Auto-continue / 任何依赖 LLM 的能力 |

> **关键边界**：真实多 agent 分派**必须**在 OpenCode 进程里运行。pm-workflow 本身不实现 LLM runtime / tool 协议 / 子进程编排，这些都来自 OpenCode。`pmw` CLI 提供"独立可用的诊断与审计工具子集"，不能脱离 OpenCode 完成 dispatch。

## 项目定位

`pm-workflow` 不只是一个提示词 Skill，而是一个 OpenCode 扩展运行时。它提供：

- **状态与阶段机**：自动判断项目当前所处阶段（idea/spec/plan/dev/review/release）
- **Gate 系统**：约束不安全推进，确保必要的 spec/plan/review 不被跳过
- **智能调度**：按任务特征自动分派到合适的专业 agent
- **执行编排**：PM 主协调，handoff 压缩，结果评估，受控自动续跑
- **诊断与工具**：状态查询、健康检查、执行回执、权限管理

## Command Lanes

插件提供 4 条 Command Lane 入口，用于不同审慎级别的调度预览：

| Lane | 用途 |
| --- | --- |
| `pm-quick` | 低风险快速推进 |
| `pm-medium` | 标准实现建议 |
| `pm-full` | 高审慎完整执行 |
| `pm-debug` | 排障优先建议 |

## 核心工作流原则

`pm-workflow` 采用**"稳定任务域 + 外部 agent 定义绑定"**的双层模型：

- `commander` 是统一主协调入口
- command lanes 是 UX facade，不是第二套 runtime
- Analyzer 负责语义判断，Registry 负责 agent 定义绑定，Runtime 负责执行编排
- 新增 agent 不等于新增语义角色

核心流转：

```text
需求压缩 → 开发实现 → 测试验证 → 发布摘要
```

## 安装

```bash
npm install @walke/opencode-pm-workflow
```

## OpenCode 接入

推荐使用 OpenCode 官方 npm plugin 配置方式：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@walke/opencode-pm-workflow"]
}
```

OpenCode 会在启动时自动安装并缓存 npm plugin。仅在需要本地调试包入口时，再使用本地插件文件引用 server / TUI 子路径：

```ts
// plugins/pm-workflow-plugin.ts
export { default } from "@walke/opencode-pm-workflow/server";
```

```ts
// plugins/pm-workflow-plugin-tui.ts
export { default } from "@walke/opencode-pm-workflow/tui";
```

> 注意：不要同时加载源码入口、dist 入口和兼容壳，避免插件重复注册。

## 初次模型配置

推荐让用户和 AI 通过模板完成配置：复制 `pm-workflow.models.example.json` 的内容，参考其中 `agent_profiles` 段对每个 agent 的 role / model_traits / fallback_traits 说明，填好 `default_model`、`default_fallback_model` 或各 agent 的模型映射。每个字段同时支持**完整模型 ID** 和**关键词**（含数组形式），例如 `["claude-opus", "gpt-5.5", "gpt-5.4"]`。然后让 AI 读取该模板：AI 会按 `_resolve_strategy` 把关键词解析为全局清单中存在的完整模型 ID（数组按顺序，第一个命中的关键词就停；多源命中时按 `provider_priority` tiebreak），并在写入前把展开结果展示给你确认，再合并到 `~/.config/opencode/pm-workflow.config.json` 或当前项目 `.pm-workflow/config.json`。

模板会指导 AI 只从 OpenCode 全局 `provider.*.models` 清单校验模型，并同步写入 agent `model`、`fallback_models` 与 `fallback.chains`。

## 当前文档结构

本项目的现行文档已收敛为 README + 4 篇主文档：

| 文档 | 内容 |
| --- | --- |
| [`README.md`](README.md) | 项目入口、安装接入、发布验证 |
| [`docs/01-技术架构.md`](docs/01-技术架构.md) | 核心任务域、分层职责、调度语义、agent 定义来源、架构图 |
| [`docs/02-业务功能与任务流转.md`](docs/02-业务功能与任务流转.md) | 阶段模型、dispatch、lane 业务语义、auto-continue、业务流程图 |
| [`docs/03-使用与运维手册.md`](docs/03-使用与运维手册.md) | 安装接入、配置、常用工具、诊断、发布、FAQ |
| [`docs/04-待办与演进清单.md`](docs/04-待办与演进清单.md) | 当前状态、已完成能力、边界约束、后续演进方向 |

## 发布前验证

```bash
npm run verify-release
```

## 发布

```bash
npm version patch --no-git-tag-version
npm run verify-release
npm publish --access public
```

发布后确认：

```bash
npm view @walke/opencode-pm-workflow version
```

## Change Log

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-05-23 | 1.0.0-rc.9 | **新增 `pm-workflow-config` skill**：插件全场景帮手（首次安装 / 升级 / 配置 / 诊断 / 排错 / 卸载），含 4 个支持文件（reference.md / troubleshooting.md / upgrade.md / uninstall.md）+ 4 个可执行脚本（check.sh / upgrade.sh / reset-agents.sh / full-clean.sh）；脚本输出详细过程日志便于追溯。**skill auto-install 升级为递归同步**：除 SKILL.md 外，自动同步 reference / troubleshooting / scripts/ 等 supporting files 与子目录；脚本类文件（.sh/.bash/.py 等）自动赋可执行权限；用户改过的文件不覆盖 |
| 2026-05-23 | 1.0.0-rc.8 | **agent md 完全符合 OpenCode 规范**：新增 `temperature` / `tools` / `permission` 字段；body 重写为完整系统 prompt（≥60 行）；不写 model 字段（让 `pmw models init` 单独管） |
| 2026-05-23 | 1.0.0-rc.7 | **修复 OpenCode skill 规范**：rc.3-rc.6 错误地把 SKILL.md 复制成扁平 `<id>.md`（OpenCode 不识别），rc.7 改为正确的子目录结构 `<id>/SKILL.md`；同时补全 skill frontmatter `name` 字段（OpenCode 必填）；agent-theme-config skill 内容更新对齐 6 个新 agent ID + mode 字段约束 |
| 2026-05-23 | 1.0.0-rc.6 | **6 个固定 agent 重命名 + 角色合并/拆分**：commander / advisor / backendcoder / designer / fixer / writer 替代旧 ID；advisor 合并旧 advisor + researcher；designer 合并旧 frontend + 新增设计/原型/图像生成；fixer 合并旧 reviewer 测试侧 + 新增 deployer 职责；writer 独立为文档撰写专门 agent。**修复 OpenCode UI bug**：主题渲染强制写 mode 字段（commander=primary，其他=subagent），切换列表只显示 commander |
| 2026-05-23 | 1.0.0-rc.5 | **跨平台兼容性修复**：fallback 路径从硬编码 `/tmp` 改为 Node `os.tmpdir()`（macOS/Linux/Windows 自动适配）；从 `process.env.HOME \|\| process.env.USERPROFILE` 改为 `os.homedir()`；`getConfigDir` 在 Windows 上改用 `%USERPROFILE%\.config\opencode` 与 OpenCode 官方规范对齐（不再用 `%APPDATA%`） |
| 2026-05-23 | 1.0.0-rc.4 | **修复 OpenCode 启动时插件加载失败**：getProjectDir 在 OpenCode server 进程（cwd === "/"）下返回 "/" 导致 mkdir('/.pm-workflow') ENOENT 让插件 abort；新增 resolveSafeProjectDir 跳过空字符串 / "/" / "\"，回退到 ~/.cache/pm-workflow/global；plugin 入口 try/catch 兜底 bootstrap；skill auto-install 移到激活判断之外；TUI plugin 与 28 处 tool 入口同步使用安全兜底 |
| 2026-05-23 | 1.0.0-rc.3 | Skill auto-install：插件首次激活时自动把包内 `skills/<id>/SKILL.md` 同步到 `~/.config/opencode/skills/<id>.md`，无需用户手动复制；用户改过的目标文件不覆盖 |
| 2026-05-23 | 1.0.0-rc.2 | 新增 Agent 主题（agent-theme）：5 套内置主题（default/sanguo/xiyou/marvel/workplace）+ `pmw agents theme list/preview/apply` CLI + 对话式入口模板/skill；修复 agent-registry 测试漏跑、Node 22+ 覆盖率守门假失败、SVG 三国残留 |
| 2026-05-23 | 1.0.0-rc.1 | 顶部新增"适用场景"段：明确 OpenCode 内（dispatch/Auto-continue 等需 OpenCode 进程）与 OpenCode 外（pmw CLI 诊断/审计/配置子集）两种使用模式 |
| 2026-05-23 | 1.0.0-rc.0 | 真实环境端到端验收框架（docs/sandbox/e2e-checklist.md + scripts/e2e-headless.mjs）；1.0.0 路线第 3 步 |
| 2026-05-23 | 0.13.0 | node_modules 从 git track 移除；测试覆盖率守门工具（Node 22 内置，6 个关键模块 ≥ 85%）（1.0.0 路线第 2 步） |
| 2026-05-23 | 0.12.0 | 公开 API 锁定（120 个符号快照）+ docs/05 公开 API 参考 + prepare-publish 集成 api-snapshot 与 docs check（1.0.0 路线第 1 步） |
| 2026-05-23 | 0.11.4 | 模型配置模板支持关键词数组与 provider 优先级；用户填关键词，AI 解析展开后用户确认再写入 |
| 2026-05-23 | 0.11.3 | 模型配置模板补全 agent 角色画像（agent_profiles），AI 校验时按 traits 给候选不静默替换 |
| 2026-05-23 | 0.11.2 | 新增模型配置模板，推荐用户填模板后由 AI 读取并自动合并配置 |
| 2026-05-23 | 0.11.1 | 新增 `pmw models init`，初次使用时可一次性配置 agent 主模型与回退模型 |
| 2026-05-23 | 0.11.0 | 新增 `pmw docs check` 文档治理检查，自动校验版本同步、主文档数量、Change Log 与旧路径引用 |
| 2026-05-22 | 0.10.1 | README 对齐当前版本、5 篇文档结构与 OpenCode npm plugin 接入方式 |
| 2026-05-09 | 0.2.0 | Agent 命名简化：弃用三国角色名，统一为通用短名称；合并 QA+Writer 为 fixer；移除硬编码模型 ID |
| 2026-05-09 | 0.1.18 | 文档收敛：将 30+ 篇分散文档合并为 5 篇主文档，删除历史 spec/plan/migration 文档，统一流程图到主文档正文 |
| 2026-05-08 | 0.1.17 | 新增 researcher 路由、Agent Definition Registry、compact handoff、mode-aware dispatch |
