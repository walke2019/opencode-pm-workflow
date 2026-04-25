import type { DispatchAction } from "./types.js";
export declare function buildPermissionGate(projectDir: string, input: {
    kind: "execute" | "repair" | "release";
    action?: DispatchAction;
}): {
    allowed: boolean;
    reasons: string[];
};
export declare function buildConfirmGate(projectDir: string, confirmValue?: string): {
    allowed: boolean;
    reasons: string[];
};
export declare function buildGateSummary(projectDir: string): {
    specGate: boolean;
    planGate: boolean;
    reviewGate: boolean;
    releaseGate: boolean;
    blockedReasons: (string | null)[];
};
export declare function buildExecutionGate(projectDir: string, action: DispatchAction): {
    allowed: boolean;
    reasons: string[];
};
