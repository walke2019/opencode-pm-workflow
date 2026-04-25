import { tool } from "@opencode-ai/plugin";
import {
  getAutomationMode,
  buildOpenCodeAgentConfig,
  migrateLegacyProjectArtifacts,
  seedWorkflowConfig,
  syncState,
} from "../shared.js";
import {
  getProjectDir,
  log,
  type PluginContext,
} from "./runtime.js";
import { createPmWorkflowHooks } from "./hooks.js";
import { createAdminTools } from "./tools/admin-tools.js";
import { createDiagnosticTools } from "./tools/diagnostic-tools.js";
import { createDispatchTools } from "./tools/dispatch-tools.js";
import { createExecutionTools } from "./tools/execution-tools.js";
import { createStateTools } from "./tools/state-tools.js";

export const PmWorkflowPlugin = async (
  ctx: PluginContext,
  options?: Record<string, unknown>,
) => {
  const projectDir = getProjectDir(ctx);
  const config = seedWorkflowConfig(projectDir, options);
  const migration = migrateLegacyProjectArtifacts(projectDir);
  const initialState = syncState(projectDir);
  const automationMode = config.automation.mode || getAutomationMode(projectDir);
  const adminTools = createAdminTools();
  const dispatchTools = createDispatchTools();
  const diagnosticTools = createDiagnosticTools();
  const executionTools = createExecutionTools();
  const stateTools = createStateTools();
  const hooks = createPmWorkflowHooks(projectDir, ctx);

  await log(ctx.client, "info", "pm-workflow plugin loaded", {
    projectDir,
    stage: initialState.stage,
    automationMode,
    migration,
    standalone: true,
  });

  return {
    config: async (input: Record<string, unknown>) => {
      if (!config.agents.enabled) return;
      const existingAgents =
        input.agent && typeof input.agent === "object"
          ? (input.agent as Record<string, unknown>)
          : {};
      input.agent = {
        ...buildOpenCodeAgentConfig(config),
        ...existingAgents,
      };
    },
    tool: {
      ...adminTools,
      ...dispatchTools,
      ...diagnosticTools,
      ...executionTools,
      ...stateTools,
    },
    ...hooks,
  };
};

export default {
  id: "local.pm-workflow-plugin",
  server: PmWorkflowPlugin,
};
