import { type PluginContext, type TuiPromptOutput, type ToolInput, type ToolOutput } from "./runtime.js";
export declare function createPmWorkflowHooks(projectDir: string, ctx: PluginContext): {
    event: ({ event }: {
        event?: {
            type?: string;
        };
    }) => Promise<void>;
    "tui.prompt.append": (_input: unknown, output: TuiPromptOutput) => Promise<void>;
    "tool.execute.before": (input: ToolInput, output: ToolOutput) => Promise<void>;
    "tool.execute.after": (input: ToolInput, _output: ToolOutput) => Promise<void>;
};
