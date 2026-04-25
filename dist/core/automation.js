export function isAutomationCapabilityEnabled(mode, capability) {
    if (mode === "off")
        return false;
    if (mode === "strict")
        return true;
    if (mode === "observe") {
        return capability === "event_sync";
    }
    return (capability === "event_sync" ||
        capability === "prompt_inject" ||
        capability === "review_marker");
}
