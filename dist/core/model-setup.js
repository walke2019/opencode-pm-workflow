import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { defaultWorkflowConfig, getGlobalWorkflowConfigPath, readWorkflowConfig, } from "./config.js";
import { listGlobalOpenCodeModelKeys } from "./model-inventory.js";
import { ensureStateDir, getConfigPath } from "./project.js";
const DEFAULT_MODEL_AGENTS = [
    "commander",
    "advisor",
    "backendcoder",
    "designer",
    "fixer",
    "advisor",
];
function readJsonObject(path) {
    if (!existsSync(path))
        return {};
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
}
function uniqueNonEmpty(values) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
function validateModels(input) {
    const knownModels = listGlobalOpenCodeModelKeys();
    if (knownModels.length === 0 || input.allowUnknown)
        return [];
    return input.models.filter((model) => !knownModels.includes(model));
}
function ensureObjectField(source, key) {
    const current = source[key];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
        source[key] = {};
    }
    return source[key];
}
function applyModelSetupToConfigObject(config, agents, model, fallbackModel) {
    const agentsRoot = ensureObjectField(config, "agents");
    const definitions = ensureObjectField(agentsRoot, "definitions");
    const fallbackRoot = ensureObjectField(config, "fallback");
    const chains = ensureObjectField(fallbackRoot, "chains");
    for (const agentName of agents) {
        const existing = definitions[agentName];
        const agent = existing && typeof existing === "object" && !Array.isArray(existing)
            ? existing
            : {};
        agent.model = model;
        if (fallbackModel) {
            agent.fallback_models = [fallbackModel];
            chains[agentName] = [fallbackModel];
        }
        else {
            delete agent.fallback_models;
            delete chains[agentName];
        }
        definitions[agentName] = agent;
    }
}
/**
 * 初始化 pm-workflow agent 模型配置。
 *
 * 默认写入全局配置，便于初次安装后多个项目共享同一组模型；传 `scope:
 * "project"` 时只写当前项目的 `.pm-workflow/config.json`。
 */
export function configureWorkflowAgentModels(input) {
    const scope = input.scope || "global";
    const agents = uniqueNonEmpty(input.agents && input.agents.length > 0
        ? input.agents
        : DEFAULT_MODEL_AGENTS);
    const model = input.model.trim();
    const fallbackModel = input.fallbackModel?.trim() || undefined;
    const blockers = [];
    const warnings = [];
    if (!model)
        blockers.push("model 不能为空");
    if (agents.length === 0)
        blockers.push("至少需要一个 agent");
    const unknownModels = validateModels({
        models: fallbackModel ? [model, fallbackModel] : [model],
        allowUnknown: Boolean(input.allowUnknown),
    });
    if (unknownModels.length > 0) {
        blockers.push(`模型不在 OpenCode 全局 provider.models 清单中: ${unknownModels.join(", ")}`);
    }
    if (input.allowUnknown) {
        warnings.push("已跳过 OpenCode 全局模型清单校验");
    }
    const path = scope === "project"
        ? getConfigPath(input.projectDir)
        : getGlobalWorkflowConfigPath();
    if (blockers.length > 0) {
        return {
            ok: false,
            scope,
            path,
            agents,
            model,
            fallbackModel,
            updated: false,
            warnings,
            blockers,
        };
    }
    let config;
    if (scope === "project") {
        ensureStateDir(input.projectDir);
        config = readWorkflowConfig(input.projectDir);
    }
    else {
        config = existsSync(path) ? readJsonObject(path) : defaultWorkflowConfig();
    }
    applyModelSetupToConfigObject(config, agents, model, fallbackModel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
    return {
        ok: true,
        scope,
        path,
        agents,
        model,
        fallbackModel,
        updated: true,
        warnings,
        blockers,
    };
}
