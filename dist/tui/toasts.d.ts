import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
type TuiApi = Parameters<NonNullable<TuiPluginModule["tui"]>>[0];
export declare function formatLaneToast(input: {
    laneContext?: {
        lane: "quick" | "medium" | "full" | "debug";
        risk: string;
        automation: string;
        reviewExpectation: string;
    };
    recommendedAgent: string;
    recommendedAction: string;
    blocked: boolean;
}): {
    readonly variant: "info" | "warning";
    readonly title: "pm-workflow quick lane" | "pm-workflow medium lane" | "pm-workflow full lane" | "pm-workflow debug lane";
    readonly message: string;
};
export declare function createToastHelpers(api: TuiApi, projectDir: string): {
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
    showLaneToast: (lane: "quick" | "medium" | "full" | "debug", duration?: number) => void;
    showLastExecutionToast: (duration?: number) => void;
    showMigrationReportToast: (duration?: number) => void;
    showModeToast: (duration?: number) => void;
    showPermissionsToast: (duration?: number) => void;
    showProjectStageToast: (duration?: number) => void;
    showRecoverySummaryToast: (duration?: number) => void;
    showReviewGateToast: (duration?: number) => void;
    showSafetyReportToast: (duration?: number) => void;
    switchModeToast: (nextMode: "off" | "observe" | "assist" | "strict", duration?: number) => void;
};
export {};
