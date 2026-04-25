import type { DispatchAgent } from "../core/types.js";
export declare function getExecutableAgent(agent: DispatchAgent, dispatchMap?: Partial<Record<DispatchAgent, string>>): string;
export declare function buildExecutablePrompt(agent: DispatchAgent, prompt: string): string;
export declare function buildDispatchCommandStrings(sessionID: string | null | undefined, executableAgent: ReturnType<typeof getExecutableAgent>, executablePrompt: string): {
    command: string;
    commandArgs: string[];
};
