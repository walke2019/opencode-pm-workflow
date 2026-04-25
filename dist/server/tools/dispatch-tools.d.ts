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
