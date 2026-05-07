import type { TaskAnalysis } from "../core/types.js";
import { buildTodoPolicySummary, resolveLaneContext } from "./lane-policy.js";
import { inferTopologyFromAnalysis } from "./topology.js";
import type { PmCommandLane } from "./types.js";

export function summarizeLaneDispatch({
  analysis,
  lane,
}: {
  analysis: TaskAnalysis;
  lane?: PmCommandLane;
}) {
  const laneContext = resolveLaneContext(lane);
  const topology = inferTopologyFromAnalysis(analysis);
  const todo = buildTodoPolicySummary(laneContext, analysis.suggestedStepCount);

  return { laneContext, topology, todo };
}
