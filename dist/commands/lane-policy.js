import { PM_LANE_REGISTRY } from "./registry.js";
export function resolveLaneContext(lane) {
    return PM_LANE_REGISTRY[lane || "medium"];
}
export function shouldCreateTodoForLane(lane, inferredStepCount) {
    if (lane.lane === "full" || lane.lane === "debug")
        return true;
    if (lane.lane === "medium")
        return inferredStepCount >= 3;
    return inferredStepCount >= 3;
}
export function buildTodoPolicySummary(lane, inferredStepCount) {
    if (lane.lane === "debug") {
        return {
            shouldCreate: true,
            minimumStepCount: 2,
            preferredShape: "debug-4stage",
        };
    }
    if (lane.lane === "full") {
        return {
            shouldCreate: true,
            minimumStepCount: 2,
            preferredShape: "phased",
        };
    }
    if (lane.lane === "medium") {
        return {
            shouldCreate: shouldCreateTodoForLane(lane, inferredStepCount),
            minimumStepCount: 3,
            preferredShape: "default",
        };
    }
    return {
        shouldCreate: shouldCreateTodoForLane(lane, inferredStepCount),
        minimumStepCount: 3,
        preferredShape: "none",
    };
}
