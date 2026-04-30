import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { getConfigPath, getHistoryPath, ensureStateDir } from "./project.js";
const GLOBAL_CONFIG_FILENAME = "pm-workflow.config.json";
export function getGlobalWorkflowConfigPath() {
    const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(configHome, "opencode", GLOBAL_CONFIG_FILENAME);
}
function readJsonFile(path) {
    return JSON.parse(readFileSync(path, "utf-8"));
}
function nowIso() {
    return new Date().toISOString();
}
function appendConfigHistory(projectDir, payload) {
    ensureStateDir(projectDir);
    const historyPath = getHistoryPath(projectDir);
    const historyDir = historyPath.replace(/[\\/][^\\/]+$/, "");
    if (!existsSync(historyDir)) {
        mkdirSync(historyDir, { recursive: true });
    }
    const line = `${JSON.stringify({ at: nowIso(), ...payload })}\n`;
    writeFileSync(historyPath, existsSync(historyPath) ? readFileSync(historyPath, "utf-8") + line : line, "utf-8");
}
const WORKFLOW_AGENT_ORDER = [
    "pm",
    "plan",
    "build",
    "commander",
    "qa_engineer",
    "writer",
    "frontend",
    "backend",
];
const LEGACY_SEMANTIC_AGENT_NAMES = ["pm", "qa_engineer", "writer"];
const CLI_COMPATIBLE_SUBAGENTS = new Set([
    "pm_workflow_qa",
    "pm_workflow_writer",
    "pm_workflow_frontend",
    "pm_workflow_zhuge",
    "pm_workflow_diaochan",
    "pm_workflow_lvbu",
]);
const DEFAULT_WORKFLOW_AGENTS = {
    pm_workflow_caocao: {
        mode: "primary",
        description: "曹操 (Cao Cao)，pm-workflow 主协调官，负责全局统筹与风险把控。",
        prompt: "你是曹操（Cao Cao），pm-workflow 的主协调官。你取其决断、统筹、识人用人和风险判断之长：先辨形势，再定目标、边界、验收标准与推进路径。你表达直接、务实、清晰，重视结果与验证；不使用贬损、羞辱或嘲讽式表达。",
        permission: {
            edit: "ask",
            write: "ask",
            bash: "ask",
        },
    },
    pm_workflow_zhuge: {
        mode: "primary",
        description: "诸葛亮 (Zhuge Liang)，神机妙算的拆解顾问，擅长任务拆解、风险识别与顾问式支持。",
        prompt: "你是诸葛亮（Zhuge Liang），一位极具洞察力和全局观的拆解顾问。你擅长将复杂任务拆解为清晰的推进步骤，识别风险并为 PM 提供顾问式支持。你先澄清疑虑，再划定边界，最后给出合适的分派建议与推进顺序。你言语优雅、周密，但不取代 PM 的主协调职责。",
        permission: {
            edit: "allow",
            write: "allow",
            bash: "allow",
        },
    },
    pm_workflow_lvbu: {
        mode: "all",
        description: "吕布 (Lv Bu)，战力天花板的后端战将，负责攻克逻辑难点与架构性能。",
        prompt: "你是吕布（Lv Bu），一位勇猛无双的后端战将。你专注于攻克代码逻辑中的深水区，不论是 API、数据库还是高并发挑战。你追求极致的性能与力量。你说话狂放而自信，更看重代码的绝对掌控力。",
        permission: {
            edit: "allow",
            write: "allow",
            bash: "allow",
        },
    },
    pm_workflow_diaochan: {
        mode: "all",
        description: "貂蝉 (Diao Chan)，倾国倾城的前端视觉官，负责 UI/UX 与美学体验。",
        prompt: "你是貂蝉（Diao Chan），一位心思细腻、审美卓越的前端视觉官。你负责界面的灵动交互与极致美感。你不仅关注功能实现，更在乎用户与界面的每一次心动邂逅。你表达柔美、敏锐，追求艺术与技术的完美平衡。",
        permission: {
            edit: "allow",
            write: "allow",
            bash: "allow",
        },
    },
    pm_workflow_qa: {
        mode: "all",
        hidden: true,
        description: "赵云（Zhao Yun），pm-workflow QA/code-review agent，负责审查变更、控制回归风险并解除 review gate。",
        prompt: "你是赵云（Zhao Yun），pm-workflow 的 QA/code-review agent。你风格稳健、严谨、可靠。优先检查 bug、回归风险、安全问题和缺失测试，确保改动可验证、可回退；除非明确要求，不要直接修改代码。",
        permission: {
            edit: "ask",
            write: "ask",
            bash: "ask",
        },
    },
    pm_workflow_writer: {
        mode: "all",
        hidden: true,
        description: "陈琳（Chen Lin），pm-workflow 文档与发布 agent，负责发布说明、总结和交付文档。",
        prompt: "你是陈琳（Chen Lin），pm-workflow 的 writer agent。你文辞清晰、结构分明，负责整理发布说明、变更摘要、用户可读文档和交付检查清单。",
        permission: {
            edit: "ask",
            write: "ask",
            bash: "ask",
        },
    },
    pm_workflow_frontend: {
        mode: "all",
        hidden: true,
        description: "pm-workflow 前端/UI subagent，负责界面实现、交互、可访问性与视觉一致性。",
        prompt: "你是 pm-workflow 的 frontend subagent。负责前端实现、UI/UX、组件拆分、响应式布局、可访问性和视觉一致性。除非明确要求，不要直接修改代码；优先给出可执行建议、风险和验收点。",
        permission: {
            edit: "ask",
            write: "ask",
            bash: "ask",
        },
    },
};
export function defaultWorkflowConfig() {
    return {
        retry: {
            max_attempts: 2,
            retryable_actions: [
                "collect-spec",
                "create-design-brief",
                "create-dev-plan",
                "start-development",
                "run-code-review",
                "continue-development",
            ],
        },
        fallback: {
            max_attempts: 1,
            enabled_actions: [
                "collect-spec",
                "create-design-brief",
                "create-dev-plan",
                "start-development",
                "run-code-review",
                "continue-development",
            ],
            agent_map: {
                plan: "commander",
                build: "commander",
                pm: "pm",
                qa_engineer: "qa_engineer",
                writer: "writer",
                commander: "pm_workflow_zhuge",
                backend: "pm_workflow_lvbu",
                frontend: "pm_workflow_diaochan",
            },
        },
        agents: {
            enabled: true,
            default_mode: "subagent",
            dispatch_map: {
                plan: "commander",
                build: "commander",
                pm: "pm",
                qa_engineer: "qa_engineer",
                writer: "writer",
                frontend: "frontend",
                commander: "commander",
                backend: "backend",
            },
            definitions: DEFAULT_WORKFLOW_AGENTS,
        },
        permissions: {
            allow_execute_tools: true,
            allow_repair_tools: true,
            allow_release_actions: false,
        },
        confirm: {
            require_confirm_for_execute: false,
        },
        automation: {
            mode: "observe",
        },
        docs: {
            storage_mode: "project_scoped",
            read_legacy: true,
            write_legacy: false,
        },
    };
}
function mergeWorkflowConfig(base, overrides = {}) {
    const agentDefinitions = {
        ...base.agents.definitions,
    };
    for (const [agentName, agent] of Object.entries(overrides.agents?.definitions || {})) {
        agentDefinitions[agentName] = {
            ...(agentDefinitions[agentName] || {}),
            ...agent,
        };
    }
    const merged = {
        retry: {
            ...base.retry,
            ...(overrides.retry || {}),
        },
        fallback: {
            ...base.fallback,
            ...(overrides.fallback || {}),
            agent_map: {
                ...base.fallback.agent_map,
                ...(overrides.fallback?.agent_map || {}),
            },
        },
        agents: {
            ...base.agents,
            ...(overrides.agents || {}),
            dispatch_map: {
                ...base.agents.dispatch_map,
                ...(overrides.agents?.dispatch_map || {}),
            },
            definitions: agentDefinitions,
        },
        permissions: {
            ...base.permissions,
            ...(overrides.permissions || {}),
        },
        confirm: {
            ...base.confirm,
            ...(overrides.confirm || {}),
        },
        automation: {
            ...base.automation,
            ...(overrides.automation || {}),
        },
        docs: {
            ...base.docs,
            ...(overrides.docs || {}),
        },
    };
    for (const [agentName, agent] of Object.entries(merged.agents.definitions)) {
        if (agent?.fallback_models?.length &&
            !merged.fallback.agent_map[agentName]) {
            merged.fallback.agent_map[agentName] = `${agentName}_fallback_1`;
        }
    }
    return merged;
}
function normalizeAgentConfig(input) {
    if (!input || typeof input !== "object")
        return undefined;
    const source = input;
    const agent = {};
    if (typeof source.model === "string" || source.model === null) {
        agent.model = source.model;
    }
    if (Array.isArray(source.fallback_models)) {
        agent.fallback_models = source.fallback_models.filter((model) => typeof model === "string");
    }
    if (source.mode === "primary" ||
        source.mode === "subagent" ||
        source.mode === "all") {
        agent.mode = source.mode;
    }
    if (typeof source.hidden === "boolean") {
        agent.hidden = source.hidden;
    }
    if (typeof source.description === "string") {
        agent.description = source.description;
    }
    if (typeof source.prompt === "string") {
        agent.prompt = source.prompt;
    }
    if (typeof source.temperature === "number") {
        agent.temperature = source.temperature;
    }
    if (typeof source.top_p === "number") {
        agent.top_p = source.top_p;
    }
    if (typeof source.steps === "number") {
        agent.steps = source.steps;
    }
    if (source.permission && typeof source.permission === "object") {
        agent.permission = source.permission;
    }
    if (typeof source.disabled === "boolean") {
        agent.disabled = source.disabled;
    }
    return Object.keys(agent).length > 0 ? agent : undefined;
}
function normalizeWorkflowAgentMode(agentName, agent) {
    if (!agent)
        return agent;
    if (agent.mode === "subagent" && CLI_COMPATIBLE_SUBAGENTS.has(agentName)) {
        return {
            ...agent,
            // 这些 agent 既要保留委派能力，也要兼容当前 CLI 直调链路。
            mode: "all",
        };
    }
    return agent;
}
function normalizeWorkflowConfigModes(config) {
    const definitions = Object.fromEntries(Object.entries(config.agents.definitions).map(([agentName, agent]) => [
        agentName,
        normalizeWorkflowAgentMode(agentName, agent),
    ]));
    return {
        ...config,
        agents: {
            ...config.agents,
            definitions,
        },
    };
}
export function normalizeWorkflowConfigOverrides(input) {
    if (!input || typeof input !== "object")
        return undefined;
    const source = input;
    const configSource = source.config && typeof source.config === "object"
        ? source.config
        : source;
    const overrides = {};
    if (configSource.retry && typeof configSource.retry === "object") {
        const retry = configSource.retry;
        overrides.retry = {};
        if (typeof retry.max_attempts === "number") {
            overrides.retry.max_attempts = retry.max_attempts;
        }
        if (Array.isArray(retry.retryable_actions)) {
            overrides.retry.retryable_actions =
                retry.retryable_actions;
        }
    }
    if (configSource.fallback && typeof configSource.fallback === "object") {
        const fallback = configSource.fallback;
        overrides.fallback = {};
        if (typeof fallback.max_attempts === "number") {
            overrides.fallback.max_attempts = fallback.max_attempts;
        }
        if (Array.isArray(fallback.enabled_actions)) {
            overrides.fallback.enabled_actions =
                fallback.enabled_actions;
        }
        if (fallback.agent_map && typeof fallback.agent_map === "object") {
            overrides.fallback.agent_map =
                fallback.agent_map;
        }
    }
    if (configSource.agents && typeof configSource.agents === "object") {
        const agents = configSource.agents;
        overrides.agents = {};
        if (typeof agents.enabled === "boolean") {
            overrides.agents.enabled = agents.enabled;
        }
        if (agents.default_mode === "primary" ||
            agents.default_mode === "subagent" ||
            agents.default_mode === "all") {
            overrides.agents.default_mode = agents.default_mode;
        }
        if (agents.dispatch_map && typeof agents.dispatch_map === "object") {
            const dispatchMap = agents.dispatch_map;
            overrides.agents.dispatch_map = {};
            for (const agentName of WORKFLOW_AGENT_ORDER) {
                if (typeof dispatchMap[agentName] === "string") {
                    overrides.agents.dispatch_map[agentName] = dispatchMap[agentName];
                }
            }
        }
        if (agents.definitions && typeof agents.definitions === "object") {
            const definitions = agents.definitions;
            overrides.agents.definitions = {};
            for (const [agentName, agentConfig] of Object.entries(definitions)) {
                const normalized = normalizeAgentConfig(agentConfig);
                if (normalized) {
                    overrides.agents.definitions[agentName] = normalized;
                }
            }
        }
    }
    if (configSource.permissions &&
        typeof configSource.permissions === "object") {
        const permissions = configSource.permissions;
        overrides.permissions = {};
        for (const key of [
            "allow_execute_tools",
            "allow_repair_tools",
            "allow_release_actions",
        ]) {
            if (typeof permissions[key] === "boolean") {
                overrides.permissions[key] = permissions[key];
            }
        }
    }
    if (configSource.confirm && typeof configSource.confirm === "object") {
        const confirm = configSource.confirm;
        overrides.confirm = {};
        if (typeof confirm.require_confirm_for_execute === "boolean") {
            overrides.confirm.require_confirm_for_execute =
                confirm.require_confirm_for_execute;
        }
    }
    if (configSource.automation && typeof configSource.automation === "object") {
        const automation = configSource.automation;
        overrides.automation = {};
        if (automation.mode === "off" ||
            automation.mode === "observe" ||
            automation.mode === "assist" ||
            automation.mode === "strict") {
            overrides.automation.mode = automation.mode;
        }
    }
    if (configSource.docs && typeof configSource.docs === "object") {
        const docs = configSource.docs;
        overrides.docs = {};
        if (docs.storage_mode === "legacy" ||
            docs.storage_mode === "project_scoped") {
            overrides.docs.storage_mode = docs.storage_mode;
        }
        if (typeof docs.read_legacy === "boolean") {
            overrides.docs.read_legacy = docs.read_legacy;
        }
        if (typeof docs.write_legacy === "boolean") {
            overrides.docs.write_legacy = docs.write_legacy;
        }
    }
    return Object.keys(overrides).length > 0 ? overrides : undefined;
}
export function readGlobalWorkflowConfigOverrides() {
    const configPath = getGlobalWorkflowConfigPath();
    if (!existsSync(configPath))
        return undefined;
    try {
        const overrides = normalizeWorkflowConfigOverrides(readJsonFile(configPath));
        if (!overrides?.agents?.definitions)
            return overrides;
        const definitions = Object.fromEntries(Object.entries(overrides.agents.definitions).map(([agentName, agent]) => [
            agentName,
            normalizeWorkflowAgentMode(agentName, agent),
        ]));
        return {
            ...overrides,
            agents: {
                ...overrides.agents,
                definitions,
            },
        };
    }
    catch {
        return undefined;
    }
}
export function ensureGlobalWorkflowConfig(input) {
    const configPath = getGlobalWorkflowConfigPath();
    if (!existsSync(configPath)) {
        mkdirSync(dirname(configPath), { recursive: true });
        writeFileSync(configPath, JSON.stringify(mergeWorkflowConfig(defaultWorkflowConfig(), normalizeWorkflowConfigOverrides(input)), null, 2), "utf-8");
    }
    return configPath;
}
function buildDefaultWorkflowConfig(overrides) {
    const globalOverrides = readGlobalWorkflowConfigOverrides();
    return mergeWorkflowConfig(mergeWorkflowConfig(defaultWorkflowConfig(), globalOverrides), overrides);
}
export function readWorkflowConfig(projectDir, overrides) {
    ensureStateDir(projectDir);
    const configPath = getConfigPath(projectDir);
    const defaults = buildDefaultWorkflowConfig(overrides);
    if (!existsSync(configPath)) {
        writeFileSync(configPath, JSON.stringify(defaults, null, 2));
        appendConfigHistory(projectDir, {
            type: "config.init",
            path: configPath,
        });
        return defaults;
    }
    try {
        const parsed = readJsonFile(configPath);
        const merged = normalizeWorkflowConfigModes(mergeWorkflowConfig(defaults, parsed));
        const migrationTypes = [];
        if (!parsed.permissions)
            migrationTypes.push("config.migrate_permissions_v1");
        if (!parsed.confirm)
            migrationTypes.push("config.migrate_confirm_v1");
        if (!parsed.automation)
            migrationTypes.push("config.migrate_automation_v1");
        if (!parsed.agents)
            migrationTypes.push("config.migrate_agents_v1");
        if (!parsed.docs)
            migrationTypes.push("config.migrate_docs_v1");
        if (parsed.agents?.dispatch_map?.pm === "pm_workflow_pm") {
            merged.agents.dispatch_map.pm = "pm_workflow_caocao";
            delete merged.agents.definitions.pm_workflow_pm;
            migrationTypes.push("config.migrate_caocao_agent_v1");
        }
        for (const agentName of LEGACY_SEMANTIC_AGENT_NAMES) {
            if (parsed.agents?.definitions?.[agentName]) {
                delete merged.agents.definitions[agentName];
                migrationTypes.push("config.migrate_namespaced_agents_v1");
            }
        }
        for (const agentName of CLI_COMPATIBLE_SUBAGENTS) {
            if (parsed.agents?.definitions?.[agentName]?.mode === "subagent") {
                migrationTypes.push("config.migrate_cli_compatible_agent_modes_v1");
                break;
            }
        }
        if (migrationTypes.length > 0) {
            writeFileSync(configPath, JSON.stringify(merged, null, 2));
            for (const type of migrationTypes) {
                appendConfigHistory(projectDir, {
                    type,
                    permissions: merged.permissions,
                    confirm: merged.confirm,
                    automation: merged.automation,
                    agents: merged.agents,
                    docs: merged.docs,
                });
            }
        }
        return merged;
    }
    catch {
        appendConfigHistory(projectDir, {
            type: "config.read_failed",
            path: configPath,
        });
        return defaults;
    }
}
export function seedWorkflowConfig(projectDir, input) {
    ensureGlobalWorkflowConfig(input);
    return readWorkflowConfig(projectDir, normalizeWorkflowConfigOverrides(input));
}
function toOpenCodeAgentConfig(name, agent, defaultMode) {
    const output = {
        description: agent.description || `pm-workflow generated agent: ${name}`,
        mode: agent.mode || defaultMode,
    };
    if (agent.model)
        output.model = agent.model;
    if (agent.prompt)
        output.prompt = agent.prompt;
    if (typeof agent.temperature === "number") {
        output.temperature = agent.temperature;
    }
    if (typeof agent.top_p === "number")
        output.top_p = agent.top_p;
    if (typeof agent.steps === "number")
        output.steps = agent.steps;
    if (agent.permission)
        output.permission = agent.permission;
    if (typeof agent.disabled === "boolean")
        output.disable = agent.disabled;
    if (typeof agent.hidden === "boolean")
        output.hidden = agent.hidden;
    return output;
}
export function buildOpenCodeAgentConfig(config) {
    if (!config.agents.enabled)
        return {};
    const agents = {};
    for (const [agentName, agent] of Object.entries(config.agents.definitions)) {
        if (!agent)
            continue;
        if (LEGACY_SEMANTIC_AGENT_NAMES.includes(agentName))
            continue;
        agents[agentName] = toOpenCodeAgentConfig(agentName, agent, config.agents.default_mode);
        for (const [index, model] of (agent.fallback_models || []).entries()) {
            const fallbackName = `${agentName}_fallback_${index + 1}`;
            agents[fallbackName] = toOpenCodeAgentConfig(fallbackName, {
                ...agent,
                model,
                description: `${agent.description || agentName} fallback model ${index + 1}`,
                fallback_models: [],
                hidden: true,
            }, config.agents.default_mode);
        }
    }
    return agents;
}
export function getAutomationMode(projectDir) {
    return readWorkflowConfig(projectDir).automation.mode;
}
export function setPermission(projectDir, key, value) {
    const config = readWorkflowConfig(projectDir);
    const previous = config.permissions[key];
    const next = {
        ...config,
        permissions: {
            ...config.permissions,
            [key]: value,
        },
    };
    writeFileSync(getConfigPath(projectDir), JSON.stringify(next, null, 2));
    appendConfigHistory(projectDir, {
        type: "config.permission_updated",
        key,
        previous,
        next: value,
    });
    return next;
}
export function setAutomationMode(projectDir, mode) {
    const config = readWorkflowConfig(projectDir);
    const previous = config.automation.mode;
    const next = {
        ...config,
        automation: {
            ...config.automation,
            mode,
        },
    };
    writeFileSync(getConfigPath(projectDir), JSON.stringify(next, null, 2));
    appendConfigHistory(projectDir, {
        type: "config.automation_mode_updated",
        previous,
        next: mode,
    });
    return next;
}
