import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import {
  defaultWorkflowConfig,
  getGlobalWorkflowConfigPath,
  readWorkflowConfig,
} from "./config.js";
import { listGlobalOpenCodeModelKeys } from "./model-inventory.js";
import { ensureStateDir, getConfigPath } from "./project.js";
import type { DispatchAgent, WorkflowConfig } from "./types.js";

const DEFAULT_MODEL_AGENTS: DispatchAgent[] = [
  "commander",
  "advisor",
  "backendcoder",
  "designer",
  "fixer",
  "writer",
];

const DEFAULT_OPENCODE_MODEL_AGENTS = [
  ...DEFAULT_MODEL_AGENTS,
  "explore",
];

export type ModelSetupScope = "global" | "project";

export interface IModelSetupInput {
  projectDir: string;
  model: string;
  fallbackModel?: string;
  agents?: string[];
  scope?: ModelSetupScope;
  allowUnknown?: boolean;
}

export interface IModelSetupResult {
  ok: boolean;
  scope: ModelSetupScope;
  path: string;
  agents: string[];
  model: string;
  fallbackModel?: string;
  updated: boolean;
  warnings: string[];
  blockers: string[];
}

export type OpenCodeAgentModelScope = "global" | "project";

export interface IOpenCodeAgentModelAssignment {
  agent: string;
  model: string;
}

export interface IOpenCodeAgentModelInput {
  projectDir: string;
  assignments: IOpenCodeAgentModelAssignment[];
  scope?: OpenCodeAgentModelScope;
  allowUnknown?: boolean;
}

export interface IOpenCodeAgentModelResult {
  ok: boolean;
  scope: OpenCodeAgentModelScope;
  path: string;
  assignments: IOpenCodeAgentModelAssignment[];
  updated: boolean;
  warnings: string[];
  blockers: string[];
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function validateModels(input: {
  models: string[];
  allowUnknown: boolean;
}): string[] {
  const knownModels = listGlobalOpenCodeModelKeys();
  if (knownModels.length === 0 || input.allowUnknown) return [];
  return input.models.filter((model) => !knownModels.includes(model));
}

function ensureObjectField(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const current = source[key];
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    source[key] = {};
  }
  return source[key] as Record<string, unknown>;
}

function applyModelSetupToConfigObject(
  config: Record<string, unknown>,
  agents: string[],
  model: string,
  fallbackModel?: string,
) {
  const agentsRoot = ensureObjectField(config, "agents");
  const definitions = ensureObjectField(agentsRoot, "definitions");
  const fallbackRoot = ensureObjectField(config, "fallback");
  const chains = ensureObjectField(fallbackRoot, "chains");

  for (const agentName of agents) {
    const existing = definitions[agentName];
    const agent =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    agent.model = model;
    if (fallbackModel) {
      agent.fallback_models = [fallbackModel];
      chains[agentName] = [fallbackModel];
    } else {
      delete agent.fallback_models;
      delete chains[agentName];
    }
    definitions[agentName] = agent;
  }
}

function getProjectOpenCodeConfigPath(projectDir: string): string {
  return join(projectDir, "opencode.json");
}

function getOpenCodeConfigPath(scope: OpenCodeAgentModelScope, projectDir: string) {
  return scope === "project"
    ? getProjectOpenCodeConfigPath(projectDir)
    : join(
        process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
        "opencode",
        "opencode.json",
      );
}

function applyAssignmentsToOpenCodeConfig(
  config: Record<string, unknown>,
  assignments: IOpenCodeAgentModelAssignment[],
) {
  const agentRoot = ensureObjectField(config, "agent");
  for (const assignment of assignments) {
    const existing = agentRoot[assignment.agent];
    const agent =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    agent.model = assignment.model;
    agentRoot[assignment.agent] = agent;
  }
}

/**
 * 写入 OpenCode 官方 `opencode.json.agent.<id>.model` 配置。
 *
 * 与 `configureWorkflowAgentModels` 不同，这个函数写 OpenCode 自己读取的 agent
 * 配置，而不是 pm-workflow 的内部 fallback metadata。默认 scope=global。
 */
export function configureOpenCodeAgentModels(
  input: IOpenCodeAgentModelInput,
): IOpenCodeAgentModelResult {
  const scope = input.scope || "global";
  const assignments = input.assignments
    .map((assignment) => ({
      agent: assignment.agent.trim(),
      model: assignment.model.trim(),
    }))
    .filter((assignment) => assignment.agent && assignment.model);
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (assignments.length === 0) {
    blockers.push("至少需要一个 agent=model 分配");
  }

  const unknownModels = validateModels({
    models: assignments.map((assignment) => assignment.model),
    allowUnknown: Boolean(input.allowUnknown),
  });
  if (unknownModels.length > 0) {
    blockers.push(
      `模型不在 OpenCode 全局 provider.models 清单中: ${Array.from(new Set(unknownModels)).join(", ")}`,
    );
  }
  if (input.allowUnknown) {
    warnings.push("已跳过 OpenCode 全局模型清单校验");
  }

  const path = getOpenCodeConfigPath(scope, input.projectDir);
  if (blockers.length > 0) {
    return {
      ok: false,
      scope,
      path,
      assignments,
      updated: false,
      warnings,
      blockers,
    };
  }

  const config = existsSync(path) ? readJsonObject(path) : {};
  applyAssignmentsToOpenCodeConfig(config, assignments);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");

  return {
    ok: true,
    scope,
    path,
    assignments,
    updated: true,
    warnings,
    blockers,
  };
}

/** 构建 6 个 pm-workflow agent + explore 的同模型分配。 */
export function buildDefaultOpenCodeAgentModelAssignments(
  model: string,
): IOpenCodeAgentModelAssignment[] {
  return DEFAULT_OPENCODE_MODEL_AGENTS.map((agent) => ({ agent, model }));
}

/**
 * 初始化 pm-workflow agent 模型配置。
 *
 * 默认写入全局配置，便于初次安装后多个项目共享同一组模型；传 `scope:
 * "project"` 时只写当前项目的 `.pm-workflow/config.json`。
 */
export function configureWorkflowAgentModels(
  input: IModelSetupInput,
): IModelSetupResult {
  const scope = input.scope || "global";
  const agents = uniqueNonEmpty(
    input.agents && input.agents.length > 0
      ? input.agents
      : DEFAULT_MODEL_AGENTS,
  );
  const model = input.model.trim();
  const fallbackModel = input.fallbackModel?.trim() || undefined;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!model) blockers.push("model 不能为空");
  if (agents.length === 0) blockers.push("至少需要一个 agent");

  const unknownModels = validateModels({
    models: fallbackModel ? [model, fallbackModel] : [model],
    allowUnknown: Boolean(input.allowUnknown),
  });
  if (unknownModels.length > 0) {
    blockers.push(
      `模型不在 OpenCode 全局 provider.models 清单中: ${unknownModels.join(", ")}`,
    );
  }
  if (input.allowUnknown) {
    warnings.push("已跳过 OpenCode 全局模型清单校验");
  }

  const path =
    scope === "project"
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

  let config: Record<string, unknown>;
  if (scope === "project") {
    ensureStateDir(input.projectDir);
    config = readWorkflowConfig(input.projectDir) as unknown as Record<
      string,
      unknown
    >;
  } else {
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
