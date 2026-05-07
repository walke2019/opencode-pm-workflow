import type { TaskAnalysis } from "../core/types.js";
import type { TopologySummary } from "./types.js";

export function inferTopologyFromAnalysis(
  analysis: TaskAnalysis,
): TopologySummary {
  if (analysis.complexity === "simple") {
    return {
      topology: "single",
      reason: "任务简单，单 specialist 即可完成。",
      specialistCount: analysis.specialistCount,
      expectedAgents: analysis.expectedNextAgents,
    };
  }

  if (analysis.executionMode === "advisor_then_dispatch") {
    return {
      topology: "hybrid",
      reason: "需要先由顾问/PM拆解，再串行交接给 specialist。",
      specialistCount: analysis.specialistCount,
      expectedAgents: analysis.expectedNextAgents,
    };
  }

  return {
    topology: "sequential",
    reason: "任务存在多步依赖，建议串行推进。",
    specialistCount: analysis.specialistCount,
    expectedAgents: analysis.expectedNextAgents,
  };
}
