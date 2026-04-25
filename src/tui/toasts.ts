import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import {
  buildDispatchCommand,
  buildDispatchPlan,
  buildDoctorReport,
  buildExecutionPlan,
  buildExecutionSummary,
  buildExecutionGate,
  buildFallbackPlan,
  buildPermissionGate,
  buildRecoverySummary,
  buildRetryPlan,
  buildSafetyReport,
  buildStateSummary,
  getExecutionReceipts,
  getLastExecutionReceipt,
  getMigrationReport,
  queryHistory,
  readWorkflowConfig,
  setAutomationMode,
  setPermission,
} from "../shared.js";

type TuiApi = Parameters<NonNullable<TuiPluginModule["tui"]>>[0];

function formatDispatchToast(dispatch: ReturnType<typeof buildDispatchPlan>) {
  const blockedSuffix = dispatch.blocked
    ? ` 当前受 gate 限制：${dispatch.blockedReasons[0] || "请先完成前置条件。"}`
    : "";

  switch (dispatch.recommendedAction) {
    case "collect-spec":
      return {
        title: "pm-workflow 阶段引导：需求收集",
        message: `当前建议先补齐 Product-Spec.md。${dispatch.reason}${blockedSuffix}`,
      };
    case "create-design-brief":
      return {
        title: "pm-workflow 阶段引导：设计规范",
        message: `当前建议整理设计规范或视觉基线。${dispatch.reason}${blockedSuffix}`,
      };
    case "create-dev-plan":
      return {
        title: "pm-workflow 阶段引导：开发计划",
        message: `当前建议先生成 DEV-PLAN.md，再进入开发。${dispatch.reason}${blockedSuffix}`,
      };
    case "start-development":
      return {
        title: "pm-workflow 阶段引导：开始开发",
        message: `计划已就绪，可以开始当前 phase 的实现。${dispatch.reason}${blockedSuffix}`,
      };
    case "continue-development":
      return {
        title: "pm-workflow 阶段引导：继续开发",
        message: `当前处于开发阶段，继续推进当前 phase / task。${dispatch.reason}${blockedSuffix}`,
      };
    case "run-code-review":
      return {
        title: "pm-workflow 阶段引导：代码审查",
        message: `检测到待 review 变更，建议先完成 code review 再继续。${dispatch.reason}${blockedSuffix}`,
      };
    case "prepare-release":
      return {
        title: "pm-workflow 阶段引导：发布准备",
        message: `当前已接近交付，可进入发布准备与校验。${dispatch.reason}${blockedSuffix}`,
      };
    case "blocked":
      return {
        title: "pm-workflow 阶段引导：当前阻塞",
        message: `当前阶段暂时无法推进。${dispatch.reason}${blockedSuffix}`,
      };
    default:
      return {
        title: `pm-workflow dispatch: ${dispatch.recommendedAgent}`,
        message: `${dispatch.recommendedAction} | ${dispatch.reason}`,
      };
  }
}

export function createToastHelpers(api: TuiApi, projectDir: string) {
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
    const content = formatDispatchToast(dispatch);
    api.ui.toast({
      variant: dispatch.blocked ? "warning" : "info",
      title: content.title,
      message: content.message,
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

  const showExecutionPlanToast = (duration = 8000) => {
    const plan = buildExecutionPlan(projectDir);
    api.ui.toast({
      variant: "info",
      title: "pm-workflow execution plan",
      message: `${plan.primaryAction} | steps=${plan.steps.length} | mode=${plan.mode}`,
      duration,
    });
  };

  return {
    showConfigToast,
    showDispatchToast,
    showDoctorToast,
    showDryRunDispatchToast,
    showDryRunLoopToast,
    showExecutePermissionToggleToast,
    showExecutionReceiptsToast,
    showExecutionPlanToast,
    showExecutionSummaryToast,
    showHistoryToast,
    showLastExecutionToast,
    showMigrationReportToast,
    showModeToast,
    showPermissionsToast,
    showProjectStageToast,
    showRecoverySummaryToast,
    showReviewGateToast,
    showSafetyReportToast,
    switchModeToast,
  };
}
