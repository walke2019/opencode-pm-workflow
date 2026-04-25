import { tool } from "@opencode-ai/plugin";
import {
  getAutomationMode,
  migrateLegacyProjectArtifacts,
  syncState,
} from "../shared.js";
import {
  getProjectDir,
  getSkillDir,
  log,
  type PluginContext,
} from "./runtime.js";
import { createPmWorkflowHooks } from "./hooks.js";
import { createAdminTools } from "./tools/admin-tools.js";
import { createDiagnosticTools } from "./tools/diagnostic-tools.js";
import { createDispatchTools } from "./tools/dispatch-tools.js";
import { createExecutionTools } from "./tools/execution-tools.js";
import { createStateTools } from "./tools/state-tools.js";

export const PmWorkflowPlugin = async (ctx: PluginContext) => {
  const projectDir = getProjectDir(ctx);
  const migration = migrateLegacyProjectArtifacts(projectDir);
  const initialState = syncState(projectDir);
  const automationMode = getAutomationMode(projectDir);
  const adminTools = createAdminTools();
  const dispatchTools = createDispatchTools();
  const diagnosticTools = createDiagnosticTools();
  const executionTools = createExecutionTools();
  const stateTools = createStateTools();
  const hooks = createPmWorkflowHooks(projectDir, ctx);

  await log(ctx.client, "info", "pm-workflow plugin loaded", {
    projectDir,
    skillDir: getSkillDir(),
    stage: initialState.stage,
    automationMode,
    migration,
  });

  return {
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
