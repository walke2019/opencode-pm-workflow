import type { TaskAnalysis } from "../core/types.js";
import type { PmCommandLane } from "./types.js";
export declare function summarizeLaneDispatch({ analysis, lane, }: {
    analysis: TaskAnalysis;
    lane?: PmCommandLane;
}): {
    laneContext: import("./types.js").PmLaneContext;
    topology: import("./types.js").TopologySummary;
    todo: import("./types.js").TodoPolicySummary;
};
