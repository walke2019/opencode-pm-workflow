import { tool } from "@opencode-ai/plugin";
import {
  buildDoctorReport,
  buildPermissionGate,
  buildRecoverySummary,
  buildSafetyReport,
  getLastFailure,
  getMigrationReport,
  repairDoctorState,
} from "../../shared.js";

export function createDiagnosticTools() {
  return {
    "pm-safety-report": tool({
      description:
        "只读汇总 pm-workflow 权限、doctor、最近 history 和 dry-run dispatch 安全状态。",
      args: {
        prompt: tool.schema
          .string()
          .optional()
          .describe("可选，用于 dry-run dispatch 的 prompt"),
      },
      async execute(args, context) {
        const projectPath = context.worktree || context.directory;
        const report = buildSafetyReport(projectPath, args.prompt);
        return [
          "pm-workflow safety report",
          `- ok: ${report.ok ? "yes" : "no"}`,
          `- safe_to_enable_execute: ${report.safeToEnableExecute ? "yes" : "no"}`,
          `- execute permission: ${report.permissions.allow_execute_tools}`,
          `- repair permission: ${report.permissions.allow_repair_tools}`,
          `- release permission: ${report.permissions.allow_release_actions}`,
          `- doctor ok: ${report.doctor.ok}`,
          `- recommended: ${report.dispatch.recommendedAgent}/${report.dispatch.executableAgent} -> ${report.dispatch.recommendedAction}`,
          `- permission allowed: ${report.dispatch.permissionAllowed}`,
          report.dispatch.permissionReasons.length
            ? `- permission reasons: ${report.dispatch.permissionReasons.join("；")}`
            : "- permission reasons: none",
          `- gate allowed: ${report.dispatch.gateAllowed}`,
          report.dispatch.gateReasons.length
            ? `- gate reasons: ${report.dispatch.gateReasons.join("；")}`
            : "- gate reasons: none",
          `- retry allowed: ${report.dispatch.retryAllowed}`,
          `- fallback allowed: ${report.dispatch.fallbackAllowed}`,
          `- recent history events: ${report.recentHistory.length}`,
        ].join("\n");
      },
    }),
    "pm-get-last-failure": tool({
      description: "查询 pm-workflow 最近一次失败事件。",
      args: {},
      async execute(_args, context) {
        const projectPath = context.worktree || context.directory;
        const failure = getLastFailure(projectPath);

        if (!failure) {
          return "pm-workflow 最近失败事件\n- 无失败事件";
        }

        return [
          "pm-workflow 最近失败事件",
          "```json",
          JSON.stringify(failure, null, 2),
          "```",
        ].join("\n");
      },
    }),
    "pm-get-recovery-summary": tool({
      description:
        "汇总 pm-workflow dispatch/retry/fallback/recovery 历史状态。",
      args: {},
      async execute(_args, context) {
        const projectPath = context.worktree || context.directory;
        const summary = buildRecoverySummary(projectPath);

        return [
          "pm-workflow 恢复历史摘要",
          "```json",
          JSON.stringify(summary, null, 2),
          "```",
        ].join("\n");
      },
    }),
    "pm-doctor": tool({
      description:
        "检查 pm-workflow runtime 状态、配置、历史、gate 和 recovery 健康度。",
      args: {},
      async execute(_args, context) {
        const projectPath = context.worktree || context.directory;
        const report = buildDoctorReport(projectPath);
        return [
          "pm-workflow doctor",
          `- ok: ${report.ok ? "yes" : "no"}`,
          `- stage: ${report.stage}`,
          "",
          "checks:",
          ...report.checks.map(
            (check) =>
              `- ${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`,
          ),
          report.warnings.length ? "" : "",
          report.warnings.length ? "warnings:" : "",
          ...report.warnings.map((warning) => `- ${warning}`),
          report.blockers.length ? "" : "",
          report.blockers.length ? "blockers:" : "",
          ...report.blockers.map((blocker) => `- ${blocker}`),
        ]
          .filter((line) => line !== "")
          .join("\n");
      },
    }),
    "pm-doctor-repair": tool({
      description:
        "安全修复 pm-workflow 自身运行状态文件：state/config/history 与字段迁移。",
      args: {},
      async execute(_args, context) {
        const projectPath = context.worktree || context.directory;
        const permission = buildPermissionGate(projectPath, {
          kind: "repair",
        });
        if (!permission.allowed) {
          return [
            "pm-workflow doctor repair 已被权限策略阻止",
            `- 原因: ${permission.reasons.join("；")}`,
          ].join("\n");
        }
        const result = repairDoctorState(projectPath);
        return [
          "pm-workflow doctor repair",
          result.repaired.length
            ? `- repaired: ${result.repaired.join("；")}`
            : "- repaired: none",
          `- before ok: ${result.before.ok ? "yes" : "no"}`,
          `- after ok: ${result.after.ok ? "yes" : "no"}`,
          result.after.warnings.length
            ? `- warnings: ${result.after.warnings.join("；")}`
            : "- warnings: none",
          result.after.blockers.length
            ? `- blockers: ${result.after.blockers.join("；")}`
            : "- blockers: none",
        ].join("\n");
      },
    }),
    "pm-get-migration-report": tool({
      description: "查看 pm-workflow 归档迁移报告（copied/conflicts）。",
      args: {},
      async execute(_args, context) {
        const projectPath = context.worktree || context.directory;
        const report = getMigrationReport(projectPath);
        return [
          "pm-workflow migration report",
          `- last_run_at: ${report.last_run_at}`,
          `- docs: copied=${report.docs.copied_count} conflicts=${report.docs.conflicts_count}`,
          `- feedback: copied=${report.feedback.copied_count} conflicts=${report.feedback.conflicts_count}`,
          "```json",
          JSON.stringify(report, null, 2),
          "```",
        ].join("\n");
      },
    }),
  };
}
