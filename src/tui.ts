import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import {
  buildDispatchCommand,
  buildDispatchPlan,
  buildDoctorReport,
  buildExecutionSummary,
  buildExecutionGate,
  buildFallbackPlan,
  buildPermissionGate,
  buildRecoverySummary,
  buildRetryPlan,
  buildSafetyReport,
  buildStateSummary,
  getMigrationReport,
  getExecutionReceipts,
  getLastExecutionReceipt,
  queryHistory,
  readWorkflowConfig,
  setAutomationMode,
  setPermission,
} from "./shared.js";

function getProjectDir() {
  return process.cwd();
}

export const plugin: TuiPluginModule = {
  id: "pm-workflow-plugin-tui",
  tui: async (api) => {
    const projectDir = getProjectDir();

    const showProjectStageToast = (duration = 5000) => {
      const status = buildStateSummary(projectDir);
      api.ui.toast({
        variant: "info",
        title: `pm-workflow: ${status.stageLabel}`,
        message: `下一步: ${status.nextStep}`,
        duration,
      });
    };

    const showReviewGateToast = (duration = 5000) => {
      const state = buildStateSummary(projectDir);
      if (state.review.status === "needs_review") {
        api.ui.toast({
          variant: "warning",
          title: "pm-workflow review gate",
          message: "检测到待 review 的代码变更，请先完成 code review。",
          duration,
        });
        return;
      }

      api.ui.toast({
        variant: "success",
        title: "pm-workflow review gate",
        message: "当前没有待 review 的代码变更。",
        duration,
      });
    };

    const showDispatchToast = (duration = 6000) => {
      const dispatch = buildDispatchPlan(projectDir);
      api.ui.toast({
        variant: dispatch.blocked ? "warning" : "info",
        title: `pm-workflow dispatch: ${dispatch.recommendedAgent}`,
        message: `${dispatch.recommendedAction} | ${dispatch.reason}`,
        duration,
      });
    };

    const showDoctorToast = (duration = 7000) => {
      const report = buildDoctorReport(projectDir);
      api.ui.toast({
        variant: report.ok ? "success" : "warning",
        title: `pm-workflow doctor: ${report.ok ? "ok" : "warn"}`,
        message:
          report.blockers[0] || report.warnings[0] || `stage=${report.stage}`,
        duration,
      });
    };

    const showHistoryToast = (duration = 7000) => {
      const events = queryHistory(projectDir, { limit: 3 });
      api.ui.toast({
        variant: "info",
        title: "pm-workflow history",
        message: events.length
          ? events
              .map(
                (event) =>
                  `${event.type || "unknown"}${event.action ? `/${event.action}` : ""}`,
              )
              .join(" | ")
          : "当前没有历史事件。",
        duration,
      });
    };

    const showRecoverySummaryToast = (duration = 7000) => {
      const summary = buildRecoverySummary(projectDir);
      api.ui.toast({
        variant: summary.lastFailure ? "warning" : "success",
        title: "pm-workflow recovery",
        message: `failures=${summary.dispatchFailures} fallback=${summary.fallbackExecutions} transitions=${summary.stageTransitions}`,
        duration,
      });
    };

    const showConfigToast = (duration = 7000) => {
      const config = readWorkflowConfig(projectDir);
      api.ui.toast({
        variant: "info",
        title: "pm-workflow config",
        message:
          `mode=${config.automation.mode} storage=${config.docs.storage_mode} ` +
          `retry=${config.retry.max_attempts} fallback=${config.fallback.max_attempts} ` +
          `execute=${config.permissions.allow_execute_tools}`,
        duration,
      });
    };

    const showPermissionsToast = (duration = 7000) => {
      const permissions = readWorkflowConfig(projectDir).permissions;
      api.ui.toast({
        variant: permissions.allow_execute_tools ? "warning" : "success",
        title: "pm-workflow permissions",
        message: `execute=${permissions.allow_execute_tools} repair=${permissions.allow_repair_tools} release=${permissions.allow_release_actions}`,
        duration,
      });
    };

    const showModeToast = (duration = 7000) => {
      const mode = readWorkflowConfig(projectDir).automation.mode;
      api.ui.toast({
        variant: mode === "strict" ? "warning" : "info",
        title: "pm-workflow mode",
        message: `current=${mode} (off|observe|assist|strict)`,
        duration,
      });
    };

    const switchModeToast = (
      nextMode: "off" | "observe" | "assist" | "strict",
      duration = 7000,
    ) => {
      const next = setAutomationMode(projectDir, nextMode);
      api.ui.toast({
        variant: nextMode === "strict" ? "warning" : "success",
        title: "pm-workflow mode updated",
        message: `mode=${next.automation.mode} storage=${next.docs.storage_mode}`,
        duration,
      });
    };

    const showMigrationReportToast = (duration = 8000) => {
      const report = getMigrationReport(projectDir);
      api.ui.toast({
        variant:
          report.docs.conflicts_count > 0 || report.feedback.conflicts_count > 0
            ? "warning"
            : "info",
        title: "pm-workflow migration",
        message:
          `docs copied=${report.docs.copied_count} conflicts=${report.docs.conflicts_count} | ` +
          `feedback copied=${report.feedback.copied_count} conflicts=${report.feedback.conflicts_count}`,
        duration,
      });
    };

    const showDryRunDispatchToast = (duration = 8000) => {
      const dispatch = buildDispatchCommand(projectDir);
      const permission = buildPermissionGate(projectDir, {
        kind: "execute",
        action: dispatch.recommendedAction,
      });
      const gate = buildExecutionGate(projectDir, dispatch.recommendedAction);
      const retry = buildRetryPlan(projectDir, dispatch.recommendedAction);
      const fallback = buildFallbackPlan(
        projectDir,
        dispatch.recommendedAction,
        dispatch.executableAgent,
      );

      api.ui.toast({
        variant: permission.allowed && gate.allowed ? "info" : "warning",
        title: `pm-workflow dry-run: ${dispatch.recommendedAction}`,
        message: `permission=${permission.allowed} gate=${gate.allowed} retry=${retry.retryable} fallback=${fallback.allowed && Boolean(fallback.toAgent)}`,
        duration,
      });
    };

    const showDryRunLoopToast = (duration = 8000) => {
      const dispatch = buildDispatchCommand(projectDir);
      const permission = buildPermissionGate(projectDir, {
        kind: "execute",
        action: dispatch.recommendedAction,
      });
      const gate = buildExecutionGate(projectDir, dispatch.recommendedAction);

      api.ui.toast({
        variant: permission.allowed && gate.allowed ? "info" : "warning",
        title: "pm-workflow dry-run loop",
        message: `${dispatch.recommendedAgent}/${dispatch.executableAgent} -> ${dispatch.recommendedAction} | permission=${permission.allowed} gate=${gate.allowed}`,
        duration,
      });
    };

    const showSafetyReportToast = (duration = 8000) => {
      const report = buildSafetyReport(projectDir);
      api.ui.toast({
        variant: report.safeToEnableExecute ? "success" : "warning",
        title: "pm-workflow safety report",
        message:
          `execute=${report.permissions.allow_execute_tools} doctor=${report.doctor.ok} ` +
          `action=${report.dispatch.recommendedAction} safe=${report.safeToEnableExecute}`,
        duration,
      });
    };

    const showExecutePermissionToggleToast = (
      nextValue: boolean,
      duration = 8000,
    ) => {
      const report = buildSafetyReport(projectDir);
      const current =
        readWorkflowConfig(projectDir).permissions.allow_execute_tools;

      if (current === nextValue) {
        api.ui.toast({
          variant: "info",
          title: "pm-workflow execute permission",
          message: `allow_execute_tools 已经是 ${nextValue}`,
          duration,
        });
        return;
      }

      setPermission(projectDir, "allow_execute_tools", nextValue);

      api.ui.toast({
        variant: nextValue ? "warning" : "success",
        title: "pm-workflow execute permission",
        message: nextValue
          ? `已开启 allow_execute_tools；safe=${report.safeToEnableExecute}`
          : "已关闭 allow_execute_tools",
        duration,
      });
    };

    const showLastExecutionToast = (duration = 8000) => {
      const receipt = getLastExecutionReceipt(projectDir);
      api.ui.toast({
        variant: receipt
          ? receipt.exitCode === 0
            ? "success"
            : "warning"
          : "info",
        title: "pm-workflow last execution",
        message: receipt
          ? `${receipt.action} / ${receipt.executable_agent} / exit=${receipt.exitCode}`
          : "当前没有 execution receipt。",
        duration,
      });
    };

    const showExecutionReceiptsToast = (duration = 8000) => {
      const receipts = getExecutionReceipts(projectDir, { limit: 3 });
      api.ui.toast({
        variant: "info",
        title: "pm-workflow execution receipts",
        message: receipts.length
          ? receipts
              .map(
                (receipt) =>
                  `${receipt.action}/${receipt.executable_agent}/exit=${receipt.exitCode}`,
              )
              .join(" | ")
          : "当前没有 execution receipts。",
        duration,
      });
    };

    const showExecutionSummaryToast = (duration = 8000) => {
      const summary = buildExecutionSummary(projectDir, 10);
      api.ui.toast({
        variant: summary.failureCount > 0 ? "warning" : "info",
        title: "pm-workflow execution summary",
        message:
          summary.total > 0
            ? `total=${summary.total} success=${summary.successCount} failure=${summary.failureCount} last=${summary.lastAction || "none"}`
            : "当前没有 execution receipts。",
        duration,
      });
    };

    setTimeout(() => {
      showProjectStageToast(4500);
      showReviewGateToast(5500);
      showDispatchToast(6500);
    }, 1500);

    api.command.register(() => [
      {
        title: "pm-workflow 项目状态",
        value: "pm-workflow-status",
        description: "查看当前项目阶段与下一步建议",
        category: "pm-workflow",
        slash: { name: "pm-workflow-status" },
        onSelect: () => showProjectStageToast(6000),
      },
      {
        title: "pm-workflow review gate",
        value: "pm-workflow-review-gate",
        description: "查看当前是否仍有待 review 的代码变更",
        category: "pm-workflow",
        slash: { name: "pm-workflow-review-gate" },
        onSelect: () => showReviewGateToast(6000),
      },
      {
        title: "pm-workflow dispatch",
        value: "pm-workflow-dispatch",
        description: "查看当前推荐 agent 与动作",
        category: "pm-workflow",
        slash: { name: "pm-workflow-dispatch" },
        onSelect: () => showDispatchToast(6500),
      },
      {
        title: "pm-workflow /pm-dispatch",
        value: "pm-dispatch",
        description: "查看当前推荐 agent 与动作（短命令）",
        category: "pm-workflow",
        slash: { name: "pm-dispatch" },
        onSelect: () => showDispatchToast(6500),
      },
      {
        title: "pm-workflow doctor",
        value: "pm-doctor",
        description: "查看 pm-workflow runtime 健康状态",
        category: "pm-workflow",
        slash: { name: "pm-doctor" },
        onSelect: () => showDoctorToast(7000),
      },
      {
        title: "pm-workflow history",
        value: "pm-history",
        description: "查看最近几条 pm-workflow 历史事件",
        category: "pm-workflow",
        slash: { name: "pm-history" },
        onSelect: () => showHistoryToast(7000),
      },
      {
        title: "pm-workflow recovery summary",
        value: "pm-recovery-summary",
        description: "查看 dispatch/retry/fallback 恢复摘要",
        category: "pm-workflow",
        slash: { name: "pm-recovery-summary" },
        onSelect: () => showRecoverySummaryToast(7000),
      },
      {
        title: "pm-workflow config",
        value: "pm-config",
        description: "查看当前 pm-workflow 策略配置摘要",
        category: "pm-workflow",
        slash: { name: "pm-config" },
        onSelect: () => showConfigToast(7000),
      },
      {
        title: "pm-workflow permissions",
        value: "pm-permissions",
        description: "查看当前执行/修复/发布权限策略",
        category: "pm-workflow",
        slash: { name: "pm-permissions" },
        onSelect: () => showPermissionsToast(7000),
      },
      {
        title: "pm-workflow mode",
        value: "pm-mode",
        description: "查看当前自动介入模式",
        category: "pm-workflow",
        slash: { name: "pm-mode" },
        onSelect: () => showModeToast(7000),
      },
      {
        title: "pm-workflow mode off",
        value: "pm-mode-off",
        description: "切换为 off（禁用自动介入）",
        category: "pm-workflow",
        slash: { name: "pm-mode-off" },
        onSelect: () => switchModeToast("off", 7000),
      },
      {
        title: "pm-workflow mode observe",
        value: "pm-mode-observe",
        description: "切换为 observe（仅状态同步）",
        category: "pm-workflow",
        slash: { name: "pm-mode-observe" },
        onSelect: () => switchModeToast("observe", 7000),
      },
      {
        title: "pm-workflow mode assist",
        value: "pm-mode-assist",
        description: "切换为 assist（提示+标记，不阻断提交）",
        category: "pm-workflow",
        slash: { name: "pm-mode-assist" },
        onSelect: () => switchModeToast("assist", 7000),
      },
      {
        title: "pm-workflow mode strict",
        value: "pm-mode-strict",
        description: "切换为 strict（完整自动 gate）",
        category: "pm-workflow",
        slash: { name: "pm-mode-strict" },
        onSelect: () => switchModeToast("strict", 7000),
      },
      {
        title: "pm-workflow migration report",
        value: "pm-migration-report",
        description: "查看 legacy 到项目归档的迁移统计",
        category: "pm-workflow",
        slash: { name: "pm-migration-report" },
        onSelect: () => showMigrationReportToast(8000),
      },
      {
        title: "pm-workflow dry-run dispatch",
        value: "pm-dry-run-dispatch",
        description: "安全预览一次 dispatch 执行决策，不执行命令",
        category: "pm-workflow",
        slash: { name: "pm-dry-run-dispatch" },
        onSelect: () => showDryRunDispatchToast(8000),
      },
      {
        title: "pm-workflow dry-run loop",
        value: "pm-dry-run-loop",
        description: "安全预览 loop 首步决策，不执行命令",
        category: "pm-workflow",
        slash: { name: "pm-dry-run-loop" },
        onSelect: () => showDryRunLoopToast(8000),
      },
      {
        title: "pm-workflow safety report",
        value: "pm-safety-report",
        description: "查看执行权限开启前的安全审计摘要",
        category: "pm-workflow",
        slash: { name: "pm-safety-report" },
        onSelect: () => showSafetyReportToast(8000),
      },
      {
        title: "pm-workflow execute permission on",
        value: "pm-permission-execute-on",
        description: "受限开启 allow_execute_tools",
        category: "pm-workflow",
        slash: { name: "pm-permission-execute-on" },
        onSelect: () => showExecutePermissionToggleToast(true, 8000),
      },
      {
        title: "pm-workflow execute permission off",
        value: "pm-permission-execute-off",
        description: "受限关闭 allow_execute_tools",
        category: "pm-workflow",
        slash: { name: "pm-permission-execute-off" },
        onSelect: () => showExecutePermissionToggleToast(false, 8000),
      },
      {
        title: "pm-workflow last execution",
        value: "pm-last-execution",
        description: "查看最近一次 execution receipt 摘要",
        category: "pm-workflow",
        slash: { name: "pm-last-execution" },
        onSelect: () => showLastExecutionToast(8000),
      },
      {
        title: "pm-workflow execution receipts",
        value: "pm-execution-receipts",
        description: "查看最近几次 execution receipt 摘要",
        category: "pm-workflow",
        slash: { name: "pm-execution-receipts" },
        onSelect: () => showExecutionReceiptsToast(8000),
      },
      {
        title: "pm-workflow execution summary",
        value: "pm-execution-summary",
        description: "查看 execution receipt 成功率与最近执行摘要",
        category: "pm-workflow",
        slash: { name: "pm-execution-summary" },
        onSelect: () => showExecutionSummaryToast(8000),
      },
    ]);
  },
};

export default plugin;
