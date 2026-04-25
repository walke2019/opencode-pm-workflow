export declare function createExecutionTools(): {
    "pm-get-last-execution": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-get-execution-receipt": {
        description: string;
        args: {
            limit: import("zod").ZodOptional<import("zod").ZodString>;
            action: import("zod").ZodOptional<import("zod").ZodString>;
            agent: import("zod").ZodOptional<import("zod").ZodString>;
            success: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            limit?: string | undefined;
            action?: string | undefined;
            agent?: string | undefined;
            success?: string | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-get-execution-by-id": {
        description: string;
        args: {
            execution_id: import("zod").ZodString;
        };
        execute(args: {
            execution_id: string;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-get-execution-summary": {
        description: string;
        args: {
            limit: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            limit?: string | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
};
