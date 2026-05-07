export const PM_LANE_REGISTRY = {
    quick: {
        lane: "quick",
        risk: "low",
        automation: "guided",
        topologyVerbosity: "minimal",
        reviewExpectation: "light",
    },
    medium: {
        lane: "medium",
        risk: "moderate",
        automation: "assisted",
        topologyVerbosity: "structured",
        reviewExpectation: "standard",
    },
    full: {
        lane: "full",
        risk: "high",
        automation: "elevated",
        topologyVerbosity: "structured",
        reviewExpectation: "strict",
    },
    debug: {
        lane: "debug",
        risk: "debug",
        automation: "assisted",
        topologyVerbosity: "structured",
        reviewExpectation: "standard",
    },
};
