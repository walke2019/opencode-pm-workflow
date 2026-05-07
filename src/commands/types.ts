import type { TaskAnalysis } from "../core/types.js";

export type PmCommandLane = "quick" | "medium" | "full" | "debug";

export type PmLaneRisk = "low" | "moderate" | "high" | "debug";
export type PmLaneAutomation = "guided" | "assisted" | "elevated";
export type PmLaneTopologyVerbosity = "minimal" | "structured";
export type PmLaneReviewExpectation = "light" | "standard" | "strict";

export type ExecutionTopology = "single" | "sequential" | "parallel" | "hybrid";

export type PmLaneContext = {
  lane: PmCommandLane;
  risk: PmLaneRisk;
  automation: PmLaneAutomation;
  topologyVerbosity: PmLaneTopologyVerbosity;
  reviewExpectation: PmLaneReviewExpectation;
};

export type TodoPolicySummary = {
  shouldCreate: boolean;
  minimumStepCount: number;
  preferredShape: "none" | "default" | "phased" | "debug-4stage";
};

export type TopologySummary = {
  topology: ExecutionTopology;
  reason: string;
  specialistCount: number;
  expectedAgents: string[];
};

export type LaneAnalysisInput = Pick<
  TaskAnalysis,
  "complexity" | "executionMode" | "expectedNextAgents"
>;
