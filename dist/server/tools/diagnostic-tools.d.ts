export declare function createDiagnosticTools(): {
    "pm-safety-report": {
        description: string;
        args: {
            prompt: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            prompt?: string | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-get-last-failure": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-get-recovery-summary": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-doctor": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-doctor-repair": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-get-migration-report": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
};
