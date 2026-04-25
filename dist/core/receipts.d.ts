import type { DispatchAction, ExecutionReceipt, WorkflowStage } from "./types.js";
export declare function recordExecutionReceipt(projectDir: string, input: {
    action: DispatchAction;
    executableAgent: string;
    prompt: string;
    commandArgs: string[];
    exitCode: number;
    retryUsed: boolean;
    fallbackUsed: boolean;
    stageBefore: WorkflowStage;
    stageAfter: WorkflowStage;
}): ExecutionReceipt;
export declare function getExecutionReceipts(projectDir: string, options?: {
    limit?: number;
    action?: string;
    agent?: string;
    success?: "true" | "false";
}): ExecutionReceipt[];
export declare function getLastExecutionReceipt(projectDir: string): ExecutionReceipt;
export declare function getExecutionReceiptById(projectDir: string, executionId: string): ExecutionReceipt | null;
export declare function buildExecutionSummary(projectDir: string, limit?: number): {
    total: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    lastAction: "blocked" | "collect-spec" | "create-design-brief" | "create-dev-plan" | "start-development" | "run-code-review" | "prepare-release" | "continue-development";
    lastAgent: string | null;
    lastExitCode: number | null;
};
