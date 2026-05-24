import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import type { AgentThemeBannerHelpers } from "./agent-theme-banner.js";
type TuiApi = Parameters<NonNullable<TuiPluginModule["tui"]>>[0];
type ToastHelpers = {
    showConfigToast: (duration?: number) => void;
    showDispatchToast: (duration?: number) => void;
    showDoctorToast: (duration?: number) => void;
    showDryRunDispatchToast: (duration?: number) => void;
    showDryRunLoopToast: (duration?: number) => void;
    showExecutePermissionToggleToast: (nextValue: boolean, duration?: number) => void;
    showExecutionReceiptsToast: (duration?: number) => void;
    showExecutionPlanToast: (duration?: number) => void;
    showExecutionSummaryToast: (duration?: number) => void;
    showHistoryToast: (duration?: number) => void;
    showLastExecutionToast: (duration?: number) => void;
    showMigrationReportToast: (duration?: number) => void;
    showModeToast: (duration?: number) => void;
    showPermissionsToast: (duration?: number) => void;
    showProjectStageToast: (duration?: number) => void;
    showRecoverySummaryToast: (duration?: number) => void;
    showReviewGateToast: (duration?: number) => void;
    showSafetyReportToast: (duration?: number) => void;
    showLaneToast: (lane: "quick" | "medium" | "full" | "debug", duration?: number) => void;
    switchModeToast: (nextMode: "off" | "observe" | "assist" | "strict", duration?: number) => void;
};
export declare function listPmWorkflowCommandSpecs(helpers: ToastHelpers, themeBanner?: AgentThemeBannerHelpers): {
    title: string;
    value: string;
    description: string;
    category: string;
    slash: {
        name: string;
    };
    onSelect: () => void;
}[];
/**
 * 注册 pm-workflow 的 TUI 命令。
 *
 * 兼容策略（OpenCode 1.14.x → 1.15.7 → v2）：
 * - 优先使用 `api.keymap.registerLayer({ commands })`（1.15.x 起的官方推荐 API，v2 唯一可用）。
 * - 回退到 `api.command.register(...)`（1.14.x 路径，1.15.x 已 @deprecated，v2 移除）。
 *
 * 通过 runtime 检测选择路径，避免引入额外的 peer 依赖类型，同时保证不同 OpenCode 版本下都能正常工作。
 */
export declare function registerPmWorkflowCommands(api: TuiApi, helpers: ToastHelpers, themeBanner?: AgentThemeBannerHelpers): void;
export {};
