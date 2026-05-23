import type { AgentInvocationMode, DispatchAgent, DispatchInvocationSemantics, HandoffPacket } from "../core/types.js";
export declare function getExecutableAgent(agent: DispatchAgent, dispatchMap?: Partial<Record<DispatchAgent, string>>): string;
export declare function resolveAgentInvocationSemantics(_agentName: string, mode: AgentInvocationMode): DispatchInvocationSemantics;
export declare function renderAgentHandoffPrompt(agent: DispatchAgent | "advisor" | "commander" | "backendcoder" | "designer" | "fixer" | "advisor", packet: HandoffPacket): string;
export declare function buildExecutablePrompt(agent: DispatchAgent | "advisor" | "commander" | "backendcoder" | "designer" | "fixer" | "writer", prompt: string, packet?: HandoffPacket): string;
export declare function buildDispatchCommandStrings(sessionID: string | null | undefined, executableAgent: ReturnType<typeof getExecutableAgent>, executablePrompt: string, invocation?: DispatchInvocationSemantics): {
    command: string;
    commandArgs: string[];
};
