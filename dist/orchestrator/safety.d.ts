export declare function buildSafetyReport(projectDir: string, prompt?: string): {
    ok: boolean;
    safeToEnableExecute: boolean;
    permissions: {
        allow_execute_tools: boolean;
        allow_repair_tools: boolean;
        allow_release_actions: boolean;
    };
    doctor: {
        ok: boolean;
        warnings: string[];
        blockers: string[];
    };
    dispatch: {
        stage: string;
        recommendedAgent: import("../shared.js").DispatchAgent;
        executableAgent: string;
        recommendedAction: import("../shared.js").DispatchAction;
        permissionAllowed: boolean;
        permissionReasons: string[];
        gateAllowed: boolean;
        gateReasons: string[];
        retryAllowed: boolean;
        fallbackAllowed: boolean;
        command: string;
    };
    recovery: {
        totalEvents: number;
        dispatchFailures: number;
        fallbackExecutions: number;
        stageTransitions: number;
        lastFailure: import("../shared.js").WorkflowHistoryEvent | null;
    };
    recentHistory: import("../shared.js").WorkflowHistoryEvent[];
};
