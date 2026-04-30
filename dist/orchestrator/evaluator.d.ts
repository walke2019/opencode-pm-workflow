import type { EvaluationResult, HandoffPacket } from "../core/types.js";
export interface EvaluateDispatchResultInput {
    packet: HandoffPacket;
    exitCode: number;
    stdout: string;
    stderr: string;
}
export declare function evaluateDispatchResult(input: EvaluateDispatchResultInput): EvaluationResult;
