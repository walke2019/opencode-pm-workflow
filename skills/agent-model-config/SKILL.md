---
description: Analyze a new project and configure Claude Code/OpenCode agents with models selected only from the global OpenCode provider model list.
allowed-tools: Read, Write, Edit, Bash
---

# Agent Model Config

Use this Skill when starting or onboarding a project and the user asks to configure agents, subagents, model routing, or OpenCode/Claude Code project-local agent files.

## Trigger phrases

- “初始化 agent 和模型”
- “帮这个项目配置 Claude/OpenCode agents”
- “新项目 agent-model-config”
- “按前端/后端/测试/文档分配模型”
- “自动识别项目类型并配置 agents”
- “从全局 OpenCode 模型配置里选择模型”
- “读取模型模板并配置 pm-workflow”
- “我填好了 pm-workflow.models.example.json”

## Hard rules

1. Ask the user for the target project path if it is not already clear.
2. The authoritative model inventory is only:
   `/Users/walke-mac/.config/opencode/opencode.json`
3. Extract models from `provider.*.models` and write the model key only.
   - Correct: `cx/gpt-5.5`
   - Wrong unless explicitly requested: `bestool-route-cx/cx/gpt-5.5`
4. Do not invent model IDs.
5. Project `.opencode/opencode.json` or `.opencode/opencode.jsonc` may define plugins, permissions, commands, and project overrides, but must not be treated as the authoritative model inventory.
6. Before writing files, present the detected project type, proposed agents, and proposed model mapping. Ask whether the user wants changes unless the user has already explicitly requested automatic creation/update.
7. Preserve existing user content. Edit/merge instead of overwriting when files already exist.
8. If the user provides a model template (`pm-workflow.models.example.json`, `.pm-workflow/model-profile.json`, or pasted JSON with `default_model` / `agent_models`), treat it as the preferred source of intent. Read it, validate models, then merge into pm-workflow config.
9. The template's `agent_profiles` block describes each agent's role, `model_traits`, `fallback_traits`, and `model_examples`. Use it to:
   - Validate user-filled `agent_models` / `agent_fallback_models` against the trait expectations and the global OpenCode model inventory.
   - When a field is empty or the chosen model clearly violates `model_traits` (e.g. picking a coding-only model for `pm_lead`), present 1-3 candidates from `model_examples` that exist in the global inventory and ask the user to confirm.
   - Never silently substitute a different model. Always confirm with the user.
10. `agent_profiles` is read-only metadata. Do not write it to `pm-workflow.config.json` or `agents.definitions.*`.

## Project type detection

Inspect the target project:

| Detected file/path | Meaning |
| --- | --- |
| `.opencode/opencode.json` or `.opencode/opencode.jsonc` | OpenCode project |
| `.opencode/plugins/*` | OpenCode extension/plugin project |
| `.opencode/agent/*.md` or `.opencode/agents/*.md` | OpenCode agents exist |
| `.opencode/skills/**/SKILL.md` | OpenCode skills exist |
| `.claude/settings.json` or `.claude/settings.local.json` | Claude Code project-local config exists |
| `.claude/agents/*.md` | Claude Code custom agents exist |
| `CLAUDE.md` | Claude Code project instructions exist |
| both `.opencode/` and `.claude/` | mixed OpenCode + Claude Code project |

Classify as one of: `opencode-extension`, `opencode`, `claude-code`, `mixed`, or `plain`.

## Built-in pm agent profiles

The pm-workflow built-in agents have stable roles. When the user fills the model template, **always cross-check** the chosen model against these role requirements before writing config:

| Agent | Mode | Role | Model traits to look for | Fallback traits |
| --- | --- | --- | --- | --- |
| `pm_lead` | primary | 主协调官：分析决策、规划分派、收敛验收 | 强推理、长上下文、决策稳健、中文优先 | 低成本但保留中文与结构化输出 |
| `pm_advisor` | primary | 拆解顾问：把复杂任务拆成清晰步骤、识别风险 | 结构化拆解、风险识别、中文优先 | 低成本但结构化输出不丢 |
| `pm_backend` | subagent | 后端执行：API、数据库、服务、性能 | 编码能力强、调试推理、理解复杂依赖 | 仍能写出可运行代码、保留类型/接口 |
| `pm_frontend` | subagent | 前端执行：页面、组件、交互、响应式、可访问性 | UI 直觉、CSS/样式准确、组件拆分清晰 | 保留响应式与可访问性 |
| `pm_reviewer` | subagent (hidden) | 审查与文档：测试、回归、code review、发布说明 | 细致审查、找 bug/安全问题、文档语感 | 仍能完成检查表与发布说明 |
| `pm_researcher` | subagent (hidden) | 调研：资料检索、官方方案、事实核查 | 检索能力、概要提炼、中英双语 | 保留检索与提炼能力 |

If the user picks a model that violates these traits (e.g. choosing a coding-only model for `pm_lead`, or a heavy reasoning model for `pm_researcher` when budget matters), surface 1-3 alternatives from the global inventory and ask the user to confirm. Never silently substitute.

## Default role mapping

Choose from available global OpenCode model keys. Prefer these mappings when present:

| Role | Preferred model |
| --- | --- |
| main/orchestrator | `cx/gpt-5.5` |
| backend/plugin/API | `cx/gpt-5.3-codex` |
| frontend/UI | `antigravity/gemini-3-flash-preview` |
| docs/light work | `kr/claude-haiku-4.5` |
| testing/QA/review | `kr/claude-sonnet-4.5` |
| architecture/review | `cx/gpt-5.4` |

If a preferred model is not in the global inventory, pick the closest available model and explain why.

## Files to create/update

### pm-workflow template-first configuration

When a user fills a model template, merge it into one of:

- Global: `~/.config/opencode/pm-workflow.config.json` when `write_target` is `global` or omitted.
- Project: `.pm-workflow/config.json` when `write_target` is `project`.

Apply fields as follows:

| Template field | Target config |
| --- | --- |
| `default_model` | `agents.definitions.<agent>.model` for any built-in pm agent without explicit `agent_models` override |
| `default_fallback_model` | `agents.definitions.<agent>.fallback_models[0]` and `fallback.chains.<agent>[0]` when no explicit fallback override exists |
| `agent_models.<agent>` | `agents.definitions.<agent>.model` |
| `agent_fallback_models.<agent>` | `agents.definitions.<agent>.fallback_models[0]` and `fallback.chains.<agent>[0]` |

Supported built-in pm agents: `pm_lead`, `pm_advisor`, `pm_backend`, `pm_frontend`, `pm_reviewer`, `pm_researcher`.

Do not require the user to run a CLI command for this flow. The CLI can be mentioned only as an optional fallback for scripted setup.

### Claude Code

- `.claude/agents/dev-orchestrator.md`
- `.claude/agents/backend-dev.md`
- `.claude/agents/frontend-dev.md`
- `.claude/agents/test-engineer.md`
- `.claude/agents/docs-writer.md`
- `.claude/agents/architect-reviewer.md`
- `.claude/settings.local.json` for local default agent/model and `modelOverrides` if needed.

### OpenCode

- `.opencode/agent/<agent>.md` or `.opencode/agents/<agent>.md`, following the project’s existing convention.
- Project OpenCode config only when needed to reference plugins or enable local project behavior.
- Do not copy provider secrets into project files.

## Execution standard

Generated orchestrator prompts must make the main agent a decision/command expert. Subagents are dispatched by role and trait. Workflow is the execution standard:

1. requirements compression
2. development implementation
3. testing verification
4. release summary

Todo completion is the task termination standard: every todo must be completed or marked blocked with a reason.
