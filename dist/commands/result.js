import { buildTodoPolicySummary, resolveLaneContext } from "./lane-policy.js";
import { inferTopologyFromAnalysis } from "./topology.js";
export function summarizeLaneDispatch({ analysis, lane, }) {
    const laneContext = resolveLaneContext(lane);
    const topology = inferTopologyFromAnalysis(analysis);
    const todo = buildTodoPolicySummary(laneContext, analysis.suggestedStepCount);
    return { laneContext, topology, todo };
}
