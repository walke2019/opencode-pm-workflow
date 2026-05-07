import type { PmCommandLane } from "../commands/types.js";
import type { DispatchCommand, DispatchPlan, ExecutionPlan } from "../core/types.js";
export declare function buildDispatchPlan(projectDir: string): DispatchPlan;
export declare function buildDispatchCommand(projectDir: string, prompt?: string, lane?: PmCommandLane): DispatchCommand;
export declare function buildExecutionPlan(projectDir: string, prompt?: string, lane?: PmCommandLane): ExecutionPlan;
