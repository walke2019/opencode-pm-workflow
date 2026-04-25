import type { DispatchAction, DispatchAgent, ExecutableAgent, WorkflowState } from "./types.js";
export declare function buildRecoverySummary(projectDir: string): {
    totalEvents: number;
    dispatchFailures: number;
    fallbackExecutions: number;
    stageTransitions: number;
    lastFailure: import("./types.js").WorkflowHistoryEvent | null;
};
export declare function buildRetryPlan(projectDir: string, action: DispatchAction): {
    retryable: boolean;
    allowed: boolean;
    attempts: number;
    maxAttempts: number;
    status: import("./types.js").RetryStatus;
    lastError: string | null;
};
export declare function buildFallbackPlan(projectDir: string, action: DispatchAction, executableAgent: ExecutableAgent): {
    fallbackable: boolean;
    allowed: boolean;
    fromAgent: string;
    toAgent: string | null;
    attempts: number;
    maxAttempts: number;
    status: import("./types.js").FallbackStatus;
    lastError: string | null;
};
export declare function recordFallbackExecution(projectDir: string, input: {
    action: DispatchAction;
    fromAgent: ExecutableAgent;
    toAgent: ExecutableAgent;
    exitCode: number;
    stdout?: string;
    stderr?: string;
}): WorkflowState;
export declare function recordDispatchExecution(projectDir: string, input: {
    agent: DispatchAgent;
    action: DispatchAction;
    exitCode: number;
    prompt: string;
    stdout?: string;
    stderr?: string;
}): WorkflowState;
export declare function escapePrompt(prompt: string): string;
type FallbackDispatchInput = {
    preferredSession?: string | null;
    recommendedAgent: DispatchAgent;
    recommendedAction: DispatchAction;
    executableAgent: ExecutableAgent;
};
export declare function buildFallbackCommand<T extends FallbackDispatchInput>(projectDir: string, dispatch: T, fallbackAgent: ExecutableAgent, prompt?: string): T & {
    executableAgent: string;
    executablePrompt: string;
    command: string;
    commandArgs: string[];
};
export {};
