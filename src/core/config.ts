import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { getConfigPath, getHistoryPath, ensureStateDir } from "./project.js";
import { readGlobalOpenCodeModelInventory } from "./model-inventory.js";
import type {
  AutomationMode,
  DispatchAgent,
  DispatchAction,
  PermissionKey,
  WorkflowAgentConfig,
  WorkflowConfig,
} from "./types.js";

const GLOBAL_CONFIG_FILENAME = "pm-workflow.config.json";

export function getGlobalWorkflowConfigPath() {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "opencode", GLOBAL_CONFIG_FILENAME);
}

function readJsonFile(path: string) {
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function nowIso() {
  return new Date().toISOString();
}

function appendConfigHistory(
  projectDir: string,
  payload: Record<string, unknown>,
) {
  ensureStateDir(projectDir);
  const historyPath = getHistoryPath(projectDir);
  const historyDir = historyPath.replace(/[\\/][^\\/]+$/, "");
  if (!existsSync(historyDir)) {
    mkdirSync(historyDir, { recursive: true });
  }
  const line = `${JSON.stringify({ at: nowIso(), ...payload })}\n`;
  writeFileSync(
    historyPath,
    existsSync(historyPath) ? readFileSync(historyPath, "utf-8") + line : line,
    "utf-8",
  );
}

export type WorkflowConfigOverrides = {
  retry?: Partial<WorkflowConfig["retry"]>;
  fallback?: Partial<WorkflowConfig["fallback"]>;
  permissions?: Partial<WorkflowConfig["permissions"]>;
  confirm?: Partial<WorkflowConfig["confirm"]>;
  automation?: Partial<WorkflowConfig["automation"]>;
  auto_continue?: Partial<WorkflowConfig["auto_continue"]>;
  agents?: Partial<WorkflowConfig["agents"]>;
  docs?: Partial<WorkflowConfig["docs"]>;
};

const WORKFLOW_AGENT_ORDER: DispatchAgent[] = [
  "commander",
  "advisor",
  "backendcoder",
  "designer",
  "fixer",
  "writer",
];

// 旧版 agent ID → 新版 agent ID 映射表
const LEGACY_TO_CURRENT: Record<string, string> = {
  pm_lead: "commander",
  pm_advisor: "advisor",
  pm_backend: "backendcoder",
  pm_frontend: "designer",
  pm_reviewer: "fixer",
  pm_researcher: "writer",
};

const DEFAULT_WORKFLOW_AGENTS: Partial<Record<string, WorkflowAgentConfig>> = {
  commander: {
    mode: "primary",
    description:
      "pm-workflow 主协调官，负责分析决策、规划分派、收敛验收。",
    prompt:
      "你是 pm-workflow 的主协调官。负责快速压缩需求，确定目标、边界、todo、验收标准与分派路径；随后直接推进开发、测试、发布摘要。你表达直接、务实、清晰，重视结果与验证。",
    permission: {
      edit: "ask",
      write: "ask",
      bash: "ask",
    },
  },
  advisor: {
    mode: "subagent",
    description:
      "调研、分析、拆解、决策顾问；负责检索资料、比对方案、识别风险、给出推进建议。",
    prompt:
      "你是 pm-workflow 的调研拆解顾问。负责调研资料、对比方案、识别风险、把复杂任务拆成清晰的推进步骤，并给出可被 commander 直接拿来分派的拆解结果与决策建议。先澄清疑虑，再划定边界，最后输出拆解 + 风险 + 建议三段。不直接承担实现工作。",
    permission: {
      edit: "ask",
      write: "ask",
      bash: "allow",
    },
  },
  backendcoder: {
    mode: "subagent",
    description: "后端执行，负责 API、数据库、服务、性能。",
    prompt:
      "你是 pm-workflow 的后端 agent。专注于 API、数据库、服务逻辑与性能优化。追求代码质量与架构清晰。",
    permission: {
      edit: "allow",
      write: "allow",
      bash: "allow",
    },
  },
  designer: {
    mode: "subagent",
    description: "前端执行，负责 UI、交互、组件、响应式。",
    prompt:
      "你是 pm-workflow 的前端 agent。负责前端实现、UI/UX、组件拆分、响应式布局、可访问性和视觉一致性。",
    permission: {
      edit: "allow",
      write: "allow",
      bash: "allow",
    },
  },
  fixer: {
    mode: "subagent",
    hidden: true,
    description:
      "测试与发布，负责测试、回归、修复、打包、部署、CI/CD。",
    prompt:
      "你是 pm-workflow 的 fixer agent。优先跑测试、type check、回归验证；遇到失败要定位并修复 bug；同时负责打包、版本号、构建产物、CI/CD 与发布前验收。完成后产出 summary / verification / risk 三段反馈。",
    permission: {
      edit: "ask",
      write: "ask",
      bash: "allow",
    },
  },
  writer: {
    mode: "subagent",
    hidden: true,
    description:
      "文档撰写，负责 README / API 文档 / 注释 / 发布说明 / ADR。",
    prompt:
      "你是 pm-workflow 的 writer agent。负责文档撰写、README、API 文档、代码注释、发布说明、ADR、用户可读说明。表达清晰、结构稳定、术语一致；只动文档与注释，不动业务代码。",
    permission: {
      edit: "allow",
      write: "allow",
      bash: "ask",
    },
  },
};

export function defaultWorkflowConfig(): WorkflowConfig {
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
        commander: "commander",
        advisor: "advisor",
        backendcoder: "backendcoder",
        designer: "designer",
        fixer: "fixer",
        writer: "writer",
      },
      chains: {},
    },
    agents: {
      enabled: true,
      default_mode: "subagent",
      dispatch_map: {
        commander: "commander",
        advisor: "advisor",
        backendcoder: "backendcoder",
        designer: "designer",
        fixer: "fixer",
        writer: "writer",
      },
      definitions: DEFAULT_WORKFLOW_AGENTS,
    },
    permissions: {
      allow_execute_tools: true,
      allow_repair_tools: true,
      allow_release_actions: false,
      allow_auto_continue: false,
    },
    confirm: {
      require_confirm_for_execute: false,
    },
    automation: {
      mode: "observe",
    },
    auto_continue: {
      enabled: false,
      max_steps: 3,
      cooldown_ms: 2000,
      require_clean_tree: false,
      stop_on_feedback_signal: true,
    },
    docs: {
      storage_mode: "project_scoped",
      read_legacy: true,
      write_legacy: false,
    },
  };
}

export function getConfiguredExecutableAgent(
  semanticAgent: DispatchAgent,
  config: WorkflowConfig,
): string {
  return config.agents.dispatch_map[semanticAgent] || semanticAgent;
}

function mergeWorkflowConfig(
  base: WorkflowConfig,
  overrides: WorkflowConfigOverrides = {},
): WorkflowConfig {
  const agentDefinitions: WorkflowConfig["agents"]["definitions"] = {
    ...base.agents.definitions,
  };
  for (const [agentName, agent] of Object.entries(
    overrides.agents?.definitions || {},
  )) {
    agentDefinitions[agentName] = {
      ...(agentDefinitions[agentName] || {}),
      ...agent,
    };
  }

  const merged: WorkflowConfig = {
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
      chains: {
        ...(base.fallback.chains || {}),
        ...(overrides.fallback?.chains || {}),
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
    auto_continue: {
      ...base.auto_continue,
      ...(overrides.auto_continue || {}),
    },
    docs: {
      ...base.docs,
      ...(overrides.docs || {}),
    },
  };

  for (const [agentName, agent] of Object.entries(merged.agents.definitions)) {
    if (
      agent?.fallback_models?.length &&
      !merged.fallback.agent_map[agentName]
    ) {
      merged.fallback.agent_map[agentName] = `${agentName}_fallback_1`;
    }
  }

  return merged;
}

function normalizeAgentConfig(input: unknown): WorkflowAgentConfig | undefined {
  if (!input || typeof input !== "object") return undefined;
  const source = input as Record<string, unknown>;
  const agent: WorkflowAgentConfig = {};

  if (typeof source.model === "string" || source.model === null) {
    agent.model = source.model;
  }
  if (Array.isArray(source.fallback_models)) {
    agent.fallback_models = source.fallback_models.filter(
      (model): model is string => typeof model === "string",
    );
  }
  if (
    source.mode === "primary" ||
    source.mode === "subagent" ||
    source.mode === "all"
  ) {
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
    agent.permission = source.permission as Record<string, unknown>;
  }
  if (typeof source.disabled === "boolean") {
    agent.disabled = source.disabled;
  }

  return Object.keys(agent).length > 0 ? agent : undefined;
}

export function normalizeWorkflowConfigOverrides(
  input?: unknown,
): WorkflowConfigOverrides | undefined {
  if (!input || typeof input !== "object") return undefined;

  const source = input as Record<string, unknown>;
  const configSource =
    source.config && typeof source.config === "object"
      ? (source.config as Record<string, unknown>)
      : source;
  const overrides: WorkflowConfigOverrides = {};

  if (configSource.retry && typeof configSource.retry === "object") {
    const retry = configSource.retry as Record<string, unknown>;
    overrides.retry = {};
    if (typeof retry.max_attempts === "number") {
      overrides.retry.max_attempts = retry.max_attempts;
    }
    if (Array.isArray(retry.retryable_actions)) {
      overrides.retry.retryable_actions =
        retry.retryable_actions as DispatchAction[];
    }
  }

  if (configSource.fallback && typeof configSource.fallback === "object") {
    const fallback = configSource.fallback as Record<string, unknown>;
    overrides.fallback = {};
    if (typeof fallback.max_attempts === "number") {
      overrides.fallback.max_attempts = fallback.max_attempts;
    }
    if (Array.isArray(fallback.enabled_actions)) {
      overrides.fallback.enabled_actions =
        fallback.enabled_actions as DispatchAction[];
    }
    if (fallback.agent_map && typeof fallback.agent_map === "object") {
      overrides.fallback.agent_map =
        fallback.agent_map as WorkflowConfig["fallback"]["agent_map"];
    }
    if (fallback.chains && typeof fallback.chains === "object") {
      const chains: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(
        fallback.chains as Record<string, unknown>,
      )) {
        if (typeof key !== "string" || !key.trim()) continue;
        if (!Array.isArray(value)) continue;
        const models = value.filter(
          (model): model is string =>
            typeof model === "string" && model.trim().length > 0,
        );
        if (models.length > 0) {
          chains[key] = models;
        }
      }
      overrides.fallback.chains = chains;
    }
  }

  if (configSource.agents && typeof configSource.agents === "object") {
    const agents = configSource.agents as Record<string, unknown>;
    overrides.agents = {};
    if (typeof agents.enabled === "boolean") {
      overrides.agents.enabled = agents.enabled;
    }
    if (
      agents.default_mode === "primary" ||
      agents.default_mode === "subagent" ||
      agents.default_mode === "all"
    ) {
      overrides.agents.default_mode = agents.default_mode;
    }
    if (agents.dispatch_map && typeof agents.dispatch_map === "object") {
      const dispatchMap = agents.dispatch_map as Record<string, unknown>;
      overrides.agents.dispatch_map = {};
      for (const agentName of WORKFLOW_AGENT_ORDER) {
        if (typeof dispatchMap[agentName] === "string") {
          overrides.agents.dispatch_map[agentName] = dispatchMap[
            agentName
          ] as string;
        }
      }
    }
    if (agents.definitions && typeof agents.definitions === "object") {
      const definitions = agents.definitions as Record<string, unknown>;
      overrides.agents.definitions = {};
      for (const [agentName, agentConfig] of Object.entries(definitions)) {
        const normalized = normalizeAgentConfig(agentConfig);
        if (normalized) {
          overrides.agents.definitions[agentName] = normalized;
        }
      }
    }
  }

  if (
    configSource.permissions &&
    typeof configSource.permissions === "object"
  ) {
    const permissions = configSource.permissions as Record<string, unknown>;
    overrides.permissions = {};
    for (const key of [
      "allow_execute_tools",
      "allow_repair_tools",
      "allow_release_actions",
      "allow_auto_continue",
    ] as const) {
      if (typeof permissions[key] === "boolean") {
        overrides.permissions[key] = permissions[key];
      }
    }
  }

  if (configSource.confirm && typeof configSource.confirm === "object") {
    const confirm = configSource.confirm as Record<string, unknown>;
    overrides.confirm = {};
    if (typeof confirm.require_confirm_for_execute === "boolean") {
      overrides.confirm.require_confirm_for_execute =
        confirm.require_confirm_for_execute;
    }
  }

  if (configSource.automation && typeof configSource.automation === "object") {
    const automation = configSource.automation as Record<string, unknown>;
    overrides.automation = {};
    if (
      automation.mode === "off" ||
      automation.mode === "observe" ||
      automation.mode === "assist" ||
      automation.mode === "strict"
    ) {
      overrides.automation.mode = automation.mode;
    }
  }

  if (
    configSource.auto_continue &&
    typeof configSource.auto_continue === "object"
  ) {
    const autoContinue = configSource.auto_continue as Record<string, unknown>;
    overrides.auto_continue = {};
    if (typeof autoContinue.enabled === "boolean") {
      overrides.auto_continue.enabled = autoContinue.enabled;
    }
    if (
      typeof autoContinue.max_steps === "number" &&
      Number.isFinite(autoContinue.max_steps) &&
      autoContinue.max_steps >= 1
    ) {
      overrides.auto_continue.max_steps = Math.floor(autoContinue.max_steps);
    }
    if (
      typeof autoContinue.cooldown_ms === "number" &&
      Number.isFinite(autoContinue.cooldown_ms) &&
      autoContinue.cooldown_ms >= 0
    ) {
      overrides.auto_continue.cooldown_ms = Math.floor(
        autoContinue.cooldown_ms,
      );
    }
    if (typeof autoContinue.require_clean_tree === "boolean") {
      overrides.auto_continue.require_clean_tree =
        autoContinue.require_clean_tree;
    }
    if (typeof autoContinue.stop_on_feedback_signal === "boolean") {
      overrides.auto_continue.stop_on_feedback_signal =
        autoContinue.stop_on_feedback_signal;
    }
  }

  if (configSource.docs && typeof configSource.docs === "object") {
    const docs = configSource.docs as Record<string, unknown>;
    overrides.docs = {};
    if (
      docs.storage_mode === "legacy" ||
      docs.storage_mode === "project_scoped"
    ) {
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
  if (!existsSync(configPath)) return undefined;

  try {
    const overrides = normalizeWorkflowConfigOverrides(
      readJsonFile(configPath),
    );
    if (!overrides?.agents?.definitions) return overrides;

    const definitions = Object.fromEntries(
      Object.entries(overrides.agents.definitions).map(([agentName, agent]) => [
        agentName,
        agent,
      ]),
    );

    return {
      ...overrides,
      agents: {
        ...overrides.agents,
        definitions,
      },
    };
  } catch {
    return undefined;
  }
}

export function ensureGlobalWorkflowConfig(input?: unknown) {
  const configPath = getGlobalWorkflowConfigPath();
  if (!existsSync(configPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        mergeWorkflowConfig(
          defaultWorkflowConfig(),
          normalizeWorkflowConfigOverrides(input),
        ),
        null,
        2,
      ),
      "utf-8",
    );
  }
  return configPath;
}

function buildDefaultWorkflowConfig(overrides?: WorkflowConfigOverrides) {
  const globalOverrides = readGlobalWorkflowConfigOverrides();
  return mergeWorkflowConfig(
    mergeWorkflowConfig(defaultWorkflowConfig(), globalOverrides),
    overrides,
  );
}


function validateAgentModelsFromGlobalOpenCodeConfig(config: WorkflowConfig) {
  const inventory = readGlobalOpenCodeModelInventory();
  const validModels = new Set(
    inventory.models.flatMap((entry) => {
      if (entry.model.includes("/")) return [entry.model];
      return [entry.model, `${entry.provider}/${entry.model}`];
    }),
  );
  if (validModels.size === 0) return config;

  const definitions: WorkflowConfig["agents"]["definitions"] = {};
  for (const [agentName, agent] of Object.entries(config.agents.definitions)) {
    if (!agent) continue;
    definitions[agentName] = {
      ...agent,
      model: agent.model && validModels.has(agent.model) ? agent.model : undefined,
      fallback_models: (agent.fallback_models || []).filter((model) =>
        validModels.has(model),
      ),
    };
  }

  return {
    ...config,
    agents: {
      ...config.agents,
      definitions,
    },
  };
}

export function validateWorkflowConfigAgentModels(config: WorkflowConfig) {
  return validateAgentModelsFromGlobalOpenCodeConfig(config);
}

export function readWorkflowConfig(
  projectDir: string,
  overrides?: WorkflowConfigOverrides,
): WorkflowConfig {
  ensureStateDir(projectDir);
  const configPath = getConfigPath(projectDir);
  const defaults = validateAgentModelsFromGlobalOpenCodeConfig(
    buildDefaultWorkflowConfig(overrides),
  );

  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(defaults, null, 2));
    appendConfigHistory(projectDir, {
      type: "config.init",
      path: configPath,
    });
    return defaults;
  }

  try {
    const parsed = readJsonFile(configPath) as Partial<WorkflowConfig>;
    const merged = validateAgentModelsFromGlobalOpenCodeConfig(
      mergeWorkflowConfig(defaults, parsed),
    );
    const migrationTypes: string[] = [];
    if (!parsed.permissions)
      migrationTypes.push("config.migrate_permissions_v1");
    if (!parsed.confirm) migrationTypes.push("config.migrate_confirm_v1");
    if (!parsed.automation) migrationTypes.push("config.migrate_automation_v1");
    if (!parsed.agents) migrationTypes.push("config.migrate_agents_v1");
    if (!parsed.docs) migrationTypes.push("config.migrate_docs_v1");

    const hasLegacyDefs = Object.keys(merged.agents.definitions).some(
      (key) => key in LEGACY_TO_CURRENT,
    );
    const hasLegacyDispatch = Object.keys(merged.agents.dispatch_map).some(
      (key) => key in LEGACY_TO_CURRENT,
    );
    const hasLegacyFallback = Object.keys(merged.fallback.agent_map).some(
      (key) => key in LEGACY_TO_CURRENT,
    );

    if (hasLegacyDefs || hasLegacyDispatch || hasLegacyFallback) {
      for (const [oldId, newId] of Object.entries(LEGACY_TO_CURRENT)) {
        // 迁移 definitions
        if (merged.agents.definitions[oldId]) {
          merged.agents.definitions[newId] = {
            ...merged.agents.definitions[newId],
            ...merged.agents.definitions[oldId],
          };
          delete merged.agents.definitions[oldId];
        }

        // 迁移 dispatch_map
        const oldDispatchId = oldId as DispatchAgent;
        const newDispatchId = newId as DispatchAgent;
        if (merged.agents.dispatch_map[oldDispatchId]) {
          merged.agents.dispatch_map[newDispatchId] =
            merged.agents.dispatch_map[oldDispatchId];
          delete merged.agents.dispatch_map[oldDispatchId];
        }

        // 迁移 fallback.agent_map
        if (merged.fallback.agent_map[oldId]) {
          merged.fallback.agent_map[newId] = merged.fallback.agent_map[oldId];
          delete merged.fallback.agent_map[oldId];
        }
      }

      migrationTypes.push("config.migrate_legacy_agent_ids");
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
  } catch {
    appendConfigHistory(projectDir, {
      type: "config.read_failed",
      path: configPath,
    });
    return defaults;
  }
}

export function seedWorkflowConfig(projectDir: string, input?: unknown) {
  ensureGlobalWorkflowConfig(input);
  return readWorkflowConfig(
    projectDir,
    normalizeWorkflowConfigOverrides(input),
  );
}

function toOpenCodeAgentConfig(
  name: string,
  agent: WorkflowAgentConfig,
  defaultMode: "primary" | "subagent" | "all",
) {
  const output: Record<string, unknown> = {
    description: agent.description || `pm-workflow generated agent: ${name}`,
    mode: agent.mode || defaultMode,
  };

  if (agent.model) output.model = agent.model;
  if (agent.prompt) output.prompt = agent.prompt;
  if (typeof agent.temperature === "number") {
    output.temperature = agent.temperature;
  }
  if (typeof agent.top_p === "number") output.top_p = agent.top_p;
  if (typeof agent.steps === "number") output.steps = agent.steps;
  if (agent.permission) output.permission = agent.permission;
  if (typeof agent.disabled === "boolean") output.disable = agent.disabled;
  if (typeof agent.hidden === "boolean") output.hidden = agent.hidden;

  return output;
}

export function buildOpenCodeAgentConfig(config: WorkflowConfig) {
  if (!config.agents.enabled) return {};

  const FIXED_IDS = new Set(WORKFLOW_AGENT_ORDER);
  const agents: Record<string, Record<string, unknown>> = {};
  for (const [agentName, agent] of Object.entries(config.agents.definitions)) {
    if (!agent || !FIXED_IDS.has(agentName as DispatchAgent)) continue;
    agents[agentName] = toOpenCodeAgentConfig(
      agentName,
      agent,
      config.agents.default_mode,
    );

    for (const [index, model] of (agent.fallback_models || []).entries()) {
      const fallbackName = `${agentName}_fallback_${index + 1}`;
      agents[fallbackName] = toOpenCodeAgentConfig(
        fallbackName,
        {
          ...agent,
          model,
          description: `${agent.description || agentName} fallback model ${index + 1}`,
          fallback_models: [],
          hidden: true,
        },
        config.agents.default_mode,
      );
    }
  }

  return agents;
}

export function getAutomationMode(projectDir: string) {
  return readWorkflowConfig(projectDir).automation.mode;
}

export function setPermission(
  projectDir: string,
  key: PermissionKey,
  value: boolean,
) {
  const config = readWorkflowConfig(projectDir);
  const previous = config.permissions[key];
  const next: WorkflowConfig = {
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

export function setAutomationMode(projectDir: string, mode: AutomationMode) {
  const config = readWorkflowConfig(projectDir);
  const previous = config.automation.mode;
  const next: WorkflowConfig = {
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
