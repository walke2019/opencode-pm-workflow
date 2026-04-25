import type { WorkflowHistoryEvent, WorkflowState } from "./types.js";
export declare function appendHistory(projectDir: string, payload: Record<string, unknown>): void;
export declare function readHistory(projectDir: string): WorkflowHistoryEvent[];
export declare function queryHistory(projectDir: string, options?: {
    type?: string;
    action?: string;
    agent?: string;
    limit?: number;
}): WorkflowHistoryEvent[];
export declare function getLastFailure(projectDir: string): WorkflowHistoryEvent | null;
export declare function ensureHistoryBootstrap(projectDir: string, state: WorkflowState): void;
