import serverPlugin from "./server.js";
import { plugin as pmWorkflowTuiPlugin } from "./tui.js";
export * from "./orchestrator/index.js";
export declare const pmWorkflowServerPlugin: {
    id: string;
    server: (ctx: import("./server/runtime.js").PluginContext, options?: Record<string, unknown>) => Promise<{
        event: ({ event }: {
            event?: {
                type?: string;
            };
        }) => Promise<void>;
        "tui.prompt.append": (_input: unknown, output: import("./server/runtime.js").TuiPromptOutput) => Promise<void>;
        "tool.execute.before": (input: import("./server/runtime.js").ToolInput, output: import("./server/runtime.js").ToolOutput) => Promise<void>;
        "tool.execute.after": (input: import("./server/runtime.js").ToolInput, _output: import("./server/runtime.js").ToolOutput) => Promise<void>;
        config: (input: Record<string, unknown>) => Promise<void>;
        tool: {
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
    }>;
};
export declare const pmWorkflowTuiPluginCompat: import("@opencode-ai/plugin/tui").TuiPluginModule;
export { pmWorkflowTuiPlugin };
export default serverPlugin;
