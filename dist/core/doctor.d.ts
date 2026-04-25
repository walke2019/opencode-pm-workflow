export declare function buildDoctorReport(projectDir: string): {
    ok: boolean;
    checks: {
        name: string;
        ok: boolean;
        detail: string;
    }[];
    warnings: string[];
    blockers: string[];
    stage: import("./types.js").WorkflowStage;
    gates: {
        specGate: boolean;
        planGate: boolean;
        reviewGate: boolean;
        releaseGate: boolean;
        blockedReasons: (string | null)[];
    };
    recovery: {
        totalEvents: number;
        dispatchFailures: number;
        fallbackExecutions: number;
        stageTransitions: number;
        lastFailure: import("./types.js").WorkflowHistoryEvent | null;
    };
};
export declare function repairDoctorState(projectDir: string): {
    repaired: string[];
    before: {
        ok: boolean;
        checks: {
            name: string;
            ok: boolean;
            detail: string;
        }[];
        warnings: string[];
        blockers: string[];
        stage: import("./types.js").WorkflowStage;
        gates: {
            specGate: boolean;
            planGate: boolean;
            reviewGate: boolean;
            releaseGate: boolean;
            blockedReasons: (string | null)[];
        };
        recovery: {
            totalEvents: number;
            dispatchFailures: number;
            fallbackExecutions: number;
            stageTransitions: number;
            lastFailure: import("./types.js").WorkflowHistoryEvent | null;
        };
    };
    after: {
        ok: boolean;
        checks: {
            name: string;
            ok: boolean;
            detail: string;
        }[];
        warnings: string[];
        blockers: string[];
        stage: import("./types.js").WorkflowStage;
        gates: {
            specGate: boolean;
            planGate: boolean;
            reviewGate: boolean;
            releaseGate: boolean;
            blockedReasons: (string | null)[];
        };
        recovery: {
            totalEvents: number;
            dispatchFailures: number;
            fallbackExecutions: number;
            stageTransitions: number;
            lastFailure: import("./types.js").WorkflowHistoryEvent | null;
        };
    };
};
