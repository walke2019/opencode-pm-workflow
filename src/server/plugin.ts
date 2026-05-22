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
import {
  evaluatePluginHealth,
  guardPluginActivation,
  reportPluginHealth,
  type PluginHealthThresholds,
} from "./hooks-health.js";
import { createAdminTools } from "./tools/admin-tools.js";
import { createDiagnosticTools } from "./tools/diagnostic-tools.js";
import { createDispatchTools } from "./tools/dispatch-tools.js";
import { createExecutionTools } from "./tools/execution-tools.js";
import { createStateTools } from "./tools/state-tools.js";

const PLUGIN_ID = "local.pm-workflow-plugin";

export const PmWorkflowPlugin = async (
  ctx: PluginContext,
  options?: Record<string, unknown> & {
    health?: Partial<PluginHealthThresholds>;
  },
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

  // Hook 注册去重：防止 hot-reload 场景下同一进程多次装配导致事件回调被重复触发。
  // 重复装配时仍返回完整的 tool / config 集合（无副作用），但跳过 hooks 与 health log，
  // 避免 syncState / 写 review marker 等动作被错误地执行多遍。
  const activation = guardPluginActivation(PLUGIN_ID);
  const hooks =
    activation === "first"
      ? createPmWorkflowHooks(projectDir, ctx)
      : ({} as ReturnType<typeof createPmWorkflowHooks>);

  await log(ctx.client, "info", "pm-workflow plugin loaded", {
    projectDir,
    stage: initialState.stage,
    automationMode,
    migration,
    standalone: true,
    activation,
  });

  if (activation === "first") {
    const toolsCount =
      Object.keys(adminTools).length +
      Object.keys(dispatchTools).length +
      Object.keys(diagnosticTools).length +
      Object.keys(executionTools).length +
      Object.keys(stateTools).length;
    const agentsCount = Object.keys(config.agents.definitions).length;
    const health = evaluatePluginHealth({
      thresholds: options?.health,
      inputs: {
        agentsCount,
        toolsCount,
        // server 侧没有 mcp 计数能力；保留 0，由 TUI 侧未来补全。
        mcpsCount: 0,
      },
    });
    await reportPluginHealth(ctx, health);
  }

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
  id: PLUGIN_ID,
  server: PmWorkflowPlugin,
};
