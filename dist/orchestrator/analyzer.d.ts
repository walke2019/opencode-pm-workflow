import type { DispatchAgent, TaskAnalysis, WorkflowStage } from "../core/types.js";
export interface AnalyzeDispatchTaskInput {
    prompt: string;
    stage: WorkflowStage;
    blockedReasons?: string[];
    preferredAgent?: DispatchAgent | null;
}
export declare function analyzeDispatchTask(input: AnalyzeDispatchTaskInput): TaskAnalysis;
