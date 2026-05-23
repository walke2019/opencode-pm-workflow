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
import { syncPackagedSkillsToOpenCode } from "./skill-installer.js";
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
    // Skill auto-install：把包内 skills/<id>/SKILL.md 同步到 ~/.config/opencode/skills/<id>.md。
    // 失败不阻断插件加载，只通过 log 让用户知道；目标已存在且不同时不覆盖（保护用户改动）。
    try {
      const skillSync = syncPackagedSkillsToOpenCode();
      const summary = {
        skillsDir: skillSync.skillsDir,
        total: skillSync.total,
        installed: skillSync.installed,
        skipped: skillSync.skipped,
        userModified: skillSync.userModified,
        failed: skillSync.failed,
      };
      const level =
        skillSync.failed > 0 ? "warn" : skillSync.installed > 0 ? "info" : "debug";
      await log(ctx.client, level, "pm-workflow skill auto-install", summary);
      // 任何 user-modified 的条目，单独打 info 提示，方便用户决定是否手动同步。
      for (const finding of skillSync.findings) {
        if (finding.outcome === "user-modified" && finding.message) {
          await log(ctx.client, "info", "pm-workflow skill kept user version", {
            skillId: finding.skillId,
            target: finding.target,
            note: finding.message,
          });
        }
        if (finding.outcome === "failed" && finding.message) {
          await log(ctx.client, "warn", "pm-workflow skill install failed", {
            skillId: finding.skillId,
            target: finding.target,
            note: finding.message,
          });
        }
      }
    } catch (err) {
      // 兜底：syncPackagedSkillsToOpenCode 内部已经把所有 IO 异常包成 finding，
      // 这里只接住意外错误（比如 fileURLToPath 路径计算失败）；不阻断加载。
      await log(ctx.client, "warn", "pm-workflow skill auto-install crashed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }

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
