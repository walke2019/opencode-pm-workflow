import type { DispatchAgent, HandoffPacket, TaskAnalysis } from "../core/types.js";
export interface BuildHandoffPacketInput {
    prompt: string;
    analysis: TaskAnalysis;
    targetAgent?: DispatchAgent;
}
export declare function buildHandoffPacket(input: BuildHandoffPacketInput): HandoffPacket;
