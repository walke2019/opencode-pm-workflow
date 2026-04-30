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
