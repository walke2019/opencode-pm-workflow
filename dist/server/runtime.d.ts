import { buildDispatchCommand } from "../shared.js";
import type { DispatchCommand, EvaluationResult } from "../core/types.js";
export type LogLevel = "debug" | "info" | "warn" | "error";
export type OpenCodeClient = {
    app?: {
        log?: (payload: {
            body: {
                service: string;
                level: LogLevel;
                message: string;
                extra?: Record<string, unknown>;
            };
        }) => Promise<void> | void;
    };
};
export type PluginContext = {
    project?: {
        name?: string;
    };
    client?: OpenCodeClient;
    directory?: string;
    worktree?: string;
};
export type EventPayload = {
    event?: {
        type?: string;
        properties?: Record<string, unknown>;
    };
};
export type ToolInput = {
    tool?: string;
    args?: Record<string, unknown>;
};
export type ToolOutput = {
    args?: Record<string, unknown>;
    result?: unknown;
};
export type TuiPromptOutput = {
    prompt?: string;
};
export declare function executeDispatchCommand(projectPath: string, dispatch: ReturnType<typeof buildDispatchCommand>, prompt: string): import("child_process").SpawnSyncReturns<string>;
export declare function buildAutoContinueDispatch(projectDir: string, prompt: string, evaluation: EvaluationResult): DispatchCommand | undefined;
export declare function getConfigDir(): string;
export declare function getProjectDir(ctx: PluginContext): string;
export declare function log(client: OpenCodeClient | undefined, level: LogLevel, message: string, extra?: Record<string, unknown>): Promise<void>;
export declare function isCodePath(filePath: string): boolean;
export declare function writeReviewMarker(projectDir: string): void;
export declare function checkReviewGate(projectDir: string): {
    ok: boolean;
    message: string;
    markerPath: string;
};
export declare function runPreCommitCheck(projectDir: string): {
    ok: boolean;
    stdout: string;
    stderr: string;
};
export declare function extractChangedPathsFromPatch(patchText: string): string[];
export declare function buildStagePrompt(projectDir: string): string;
export declare function buildStageSummary(projectDir: string): {
    productSpec: string;
    designBrief: string;
    devPlan: string;
    stage: string;
    phase: string;
    reviewStatus: import("../shared.js").ReviewStatus;
    nextStep: string;
};
export declare function buildReviewGateSummary(projectDir: string): {
    state: string;
    message: string;
    markerPath: string;
};
export declare function buildFeedbackSignalSummary(message: string): {
    detected: boolean;
    message: string;
    detail: string;
};
