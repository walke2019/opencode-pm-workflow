import { readWorkflowConfig } from "../core/config.js";
import { buildDoctorReport } from "../core/doctor.js";
import { buildExecutionGate, buildPermissionGate } from "../core/gates.js";
import { queryHistory } from "../core/history.js";
import { buildRecoverySummary, buildRetryPlan, buildFallbackPlan, } from "../core/recovery.js";
import { buildDispatchCommand } from "./plan.js";
export function buildSafetyReport(projectDir, prompt) {
    const config = readWorkflowConfig(projectDir);
    const doctor = buildDoctorReport(projectDir);
    const recovery = buildRecoverySummary(projectDir);
    const dispatch = buildDispatchCommand(projectDir, prompt);
    const recentHistory = queryHistory(projectDir, { limit: 5 });
    const permission = buildPermissionGate(projectDir, {
        kind: "execute",
        action: dispatch.recommendedAction,
    });
    const gate = buildExecutionGate(projectDir, dispatch.recommendedAction);
    const retry = buildRetryPlan(projectDir, dispatch.recommendedAction);
    const fallback = buildFallbackPlan(projectDir, dispatch.recommendedAction, dispatch.executableAgent);
    const safeToEnableExecute = doctor.ok &&
        gate.allowed &&
        !config.permissions.allow_execute_tools &&
        dispatch.recommendedAction !== "prepare-release" &&
        recovery.dispatchFailures === 0;
    return {
        ok: doctor.ok && permission.allowed && gate.allowed,
        safeToEnableExecute,
        permissions: config.permissions,
        doctor: {
            ok: doctor.ok,
            warnings: doctor.warnings,
            blockers: doctor.blockers,
        },
        dispatch: {
            stage: dispatch.stageLabel,
            recommendedAgent: dispatch.recommendedAgent,
            executableAgent: dispatch.executableAgent,
            recommendedAction: dispatch.recommendedAction,
            permissionAllowed: permission.allowed,
            permissionReasons: permission.reasons,
            gateAllowed: gate.allowed,
            gateReasons: gate.reasons,
            retryAllowed: retry.allowed,
            fallbackAllowed: fallback.allowed,
            command: dispatch.command,
        },
        recovery,
        recentHistory,
    };
}
