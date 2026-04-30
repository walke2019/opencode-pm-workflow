import { type EvaluationResult, type HandoffPacket, type TaskAnalysis, buildDispatchCommand } from "../../shared.js";
type AutoContinueCollectionInput = {
    projectPath: string;
    prompt: string;
    firstEvaluation?: EvaluationResult;
    subsequentEvaluations?: Array<EvaluationResult | undefined>;
    maxAutoSteps?: number;
};
type AutoContinueGateDecision = {
    allowed: boolean;
    reasons: string[];
};
type AutoContinueExecutionInput = {
    projectPath: string;
    prompt: string;
    firstEvaluation?: EvaluationResult;
    maxAutoSteps?: number;
    canExecute: (dispatch: ReturnType<typeof buildDispatchCommand>) => AutoContinueGateDecision;
    runDispatch: (dispatch: ReturnType<typeof buildDispatchCommand>) => {
        dispatch: ReturnType<typeof buildDispatchCommand>;
        result: {
            status?: number | null;
            stdout?: string;
            stderr?: string;
        };
        evaluation?: EvaluationResult;
    };
};
export declare function collectAutoContinueDispatches({ projectPath, prompt, firstEvaluation, subsequentEvaluations, maxAutoSteps, }: AutoContinueCollectionInput): import("../../shared.js").DispatchCommand[];
export declare function executeAutoContinueChain({ projectPath, prompt, firstEvaluation, maxAutoSteps, canExecute, runDispatch, }: AutoContinueExecutionInput): {
    executions: {
        dispatch: ReturnType<typeof buildDispatchCommand>;
        result: {
            status?: number | null;
            stdout?: string;
            stderr?: string;
        };
        evaluation?: EvaluationResult;
    }[];
    stopReason: "completed" | "no-auto-continue" | "gate-blocked" | "execution-failed" | "max-steps-reached";
};
export declare function formatTaskAnalysisLines(analysis?: TaskAnalysis): string[];
export declare function formatHandoffPacketLines(packet?: HandoffPacket): string[];
export declare function formatEvaluationLines(evaluation?: EvaluationResult): string[];
export declare function formatNextDispatchHintLines(evaluation?: EvaluationResult): string[];
export declare function formatLoopEvaluationLines(evaluation?: EvaluationResult): string[];
export declare function createDispatchTools(): {
    "pm-run-dispatch": {
        description: string;
        args: {
            prompt: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            prompt?: string | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-dry-run-dispatch": {
        description: string;
        args: {
            prompt: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            prompt?: string | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-execute-dispatch": {
        description: string;
        args: {
            prompt: import("zod").ZodString;
            confirm: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            prompt: string;
            confirm?: string | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-dry-run-loop": {
        description: string;
        args: {
            steps: import("zod").ZodString;
            prompt: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            steps: string;
            prompt?: string | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-run-loop": {
        description: string;
        args: {
            steps: import("zod").ZodString;
            prompt: import("zod").ZodString;
            confirm: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            steps: string;
            prompt: string;
            confirm?: string | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
};
export {};
