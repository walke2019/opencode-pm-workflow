import { existsSync } from "fs";
import { appendHistory, ensureHistoryBootstrap, readHistory, } from "./history.js";
import { buildGateSummary } from "./gates.js";
import { getConfigPath, getHistoryPath, getStatePath } from "./project.js";
import { buildRecoverySummary } from "./recovery.js";
import { readState } from "./state.js";
import { readWorkflowConfig } from "./config.js";
export function buildDoctorReport(projectDir) {
    const checks = [];
    const warnings = [];
    const blockers = [];
    const statePath = getStatePath(projectDir);
    const configPath = getConfigPath(projectDir);
    const historyPath = getHistoryPath(projectDir);
    const state = readState(projectDir);
    const config = readWorkflowConfig(projectDir);
    const history = readHistory(projectDir);
    const gates = buildGateSummary(projectDir);
    const recovery = buildRecoverySummary(projectDir);
    checks.push({
        name: "state.json",
        ok: existsSync(statePath),
        detail: statePath,
    });
    checks.push({
        name: "config.json",
        ok: existsSync(configPath),
        detail: configPath,
    });
    checks.push({
        name: "history.jsonl",
        ok: existsSync(historyPath),
        detail: historyPath,
    });
    checks.push({
        name: "preferred_session_id",
        ok: Boolean(state.session.preferred_session_id),
        detail: state.session.preferred_session_id || "未设置",
    });
    checks.push({
        name: "retry policy",
        ok: config.retry.max_attempts >= 1 &&
            config.retry.retryable_actions.length > 0,
        detail: `max_attempts=${config.retry.max_attempts}, actions=${config.retry.retryable_actions.length}`,
    });
    checks.push({
        name: "fallback policy",
        ok: config.fallback.max_attempts >= 0,
        detail: `max_attempts=${config.fallback.max_attempts}, actions=${config.fallback.enabled_actions.length}`,
    });
    checks.push({
        name: "history parse",
        ok: !history.some((event) => event.type === "history.parse_failed"),
        detail: `events=${history.length}`,
    });
    checks.push({
        name: "review gate",
        ok: gates.reviewGate,
        detail: gates.reviewGate
            ? "review gate pass"
            : gates.blockedReasons.join("；"),
    });
    checks.push({
        name: "recovery failures",
        ok: recovery.dispatchFailures === 0,
        detail: `dispatchFailures=${recovery.dispatchFailures}, fallbackExecutions=${recovery.fallbackExecutions}`,
    });
    if (!gates.specGate)
        warnings.push("缺少 Product-Spec.md，当前仍处于需求收集阶段。");
    if (!gates.planGate)
        warnings.push("缺少 DEV-PLAN.md，当前不能进入开发主流程。");
    if (!gates.reviewGate)
        blockers.push("存在待 review 的代码变更。");
    if (!state.session.preferred_session_id)
        warnings.push("未设置 preferred_session_id，session workaround 不稳定。");
    if (recovery.lastFailure)
        warnings.push("存在历史失败事件，可运行 pm-get-last-failure 查看。");
    return {
        ok: checks.every((check) => check.ok) && blockers.length === 0,
        checks,
        warnings,
        blockers,
        stage: state.stage,
        gates,
        recovery,
    };
}
export function repairDoctorState(projectDir) {
    const before = buildDoctorReport(projectDir);
    const repaired = [];
    const statePath = getStatePath(projectDir);
    const configPath = getConfigPath(projectDir);
    const historyPath = getHistoryPath(projectDir);
    const hadState = existsSync(statePath);
    const hadConfig = existsSync(configPath);
    const hadHistory = existsSync(historyPath);
    const state = readState(projectDir);
    readWorkflowConfig(projectDir);
    ensureHistoryBootstrap(projectDir, state);
    if (!hadState && existsSync(statePath))
        repaired.push("created state.json");
    if (!hadConfig && existsSync(configPath))
        repaired.push("created config.json");
    if (!hadHistory && existsSync(historyPath))
        repaired.push("created history.jsonl");
    if (!hadState || !hadConfig || !hadHistory) {
        appendHistory(projectDir, {
            type: "doctor.repair",
            repaired,
        });
    }
    const after = buildDoctorReport(projectDir);
    return {
        repaired,
        before,
        after,
    };
}
