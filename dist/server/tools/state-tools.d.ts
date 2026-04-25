export declare function createStateTools(): {
    "pm-get-execution-plan": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-check-feedback-signal": {
        description: string;
        args: {
            message: import("zod").ZodString;
        };
        execute(args: {
            message: string;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
};
