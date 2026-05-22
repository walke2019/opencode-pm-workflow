import { buildDispatchCommand } from "../shared.js";
import type { DispatchCommand, EvaluationResult } from "../core/types.js";
import { type FallbackPlanRuntime } from "../core/fallback-runtime.js";
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
export type DispatchExecutionResult = {
    status: number | null;
    stdout: string;
    stderr: string;
    /**
     * 当 ForegroundFallback 触发并切换到了备选模型时，会带上完整的降级链路记录。
     *
     * - `attempts`：所有尝试过的子进程结果（按时间顺序，含原始尝试与降级尝试）
     * - `usedFallback`：是否真正切到了备选 model（区别于"识别出限流但链路已耗尽"）
     * - `finalModel`：最后真正用于执行的 model id（如未切换则为 undefined）
     */
    fallback?: {
        usedFallback: boolean;
        finalModel?: string;
        attempts: Array<{
            model?: string;
            exitCode: number;
            plan: FallbackPlanRuntime;
        }>;
    };
};
export declare function executeDispatchCommand(projectPath: string, dispatch: ReturnType<typeof buildDispatchCommand>, prompt: string): DispatchExecutionResult;
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
