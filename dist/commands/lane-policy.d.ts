import type { PmCommandLane, PmLaneContext, TodoPolicySummary } from "./types.js";
export declare function resolveLaneContext(lane: PmCommandLane | null | undefined): PmLaneContext;
export declare function shouldCreateTodoForLane(lane: PmLaneContext, inferredStepCount: number): boolean;
export declare function buildTodoPolicySummary(lane: PmLaneContext, inferredStepCount: number): TodoPolicySummary;
