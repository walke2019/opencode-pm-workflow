import type { DispatchAgent, HandoffPacket } from "../core/types.js";
export declare function getExecutableAgent(agent: DispatchAgent, dispatchMap?: Partial<Record<DispatchAgent, string>>): string;
export declare function renderAgentHandoffPrompt(agent: DispatchAgent, packet: HandoffPacket): string;
export declare function buildExecutablePrompt(agent: DispatchAgent, prompt: string, packet?: HandoffPacket): string;
export declare function buildDispatchCommandStrings(sessionID: string | null | undefined, executableAgent: ReturnType<typeof getExecutableAgent>, executablePrompt: string): {
    command: string;
    commandArgs: string[];
};
