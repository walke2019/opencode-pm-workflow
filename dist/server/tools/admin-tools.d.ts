export declare function createAdminTools(): {
    "pm-get-state": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-check-project-state": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-check-gates": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-check-review-gate": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-set-preferred-session": {
        description: string;
        args: {
            sessionID: import("zod").ZodString;
        };
        execute(args: {
            sessionID: string;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-get-next-step": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-get-dispatch-plan": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-get-history": {
        description: string;
        args: {
            type: import("zod").ZodOptional<import("zod").ZodString>;
            action: import("zod").ZodOptional<import("zod").ZodString>;
            agent: import("zod").ZodOptional<import("zod").ZodString>;
            limit: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            type?: string | undefined;
            action?: string | undefined;
            agent?: string | undefined;
            limit?: string | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-get-config": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-check-permissions": {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-set-permission": {
        description: string;
        args: {
            key: import("zod").ZodString;
            value: import("zod").ZodString;
        };
        execute(args: {
            key: string;
            value: string;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    "pm-set-mode": {
        description: string;
        args: {
            mode: import("zod").ZodString;
        };
        execute(args: {
            mode: string;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
};
