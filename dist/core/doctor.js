import { existsSync } from "fs";
import { appendHistory, ensureHistoryBootstrap, readHistory, } from "./history.js";
import { buildGateSummary } from "./gates.js";
import { getConfigPath, getHistoryPath, getStatePath } from "./project.js";
import { buildRecoverySummary } from "./recovery.js";
import { readState } from "./state.js";
import { readWorkflowConfig } from "./config.js";
const LEGACY_AGENT_IDS = [
    "pm_lead",
    "pm_advisor",
    "pm_backend",
    "pm_frontend",
    "pm_reviewer",
    "pm_researcher",
];
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
    // 检测 config 中是否残留旧版 pm_* agent ID
    const legacyAgentIds = Object.keys(config.agents.definitions).filter((key) => LEGACY_AGENT_IDS.includes(key));
    if (legacyAgentIds.length > 0) {
        warnings.push(`检测到旧版 agent ID 残留：${legacyAgentIds.join("、")}。运行 pmw doctor 将自动迁移。`);
    }
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
        ok: true,
        detail: state.session.preferred_session_id ||
            "可选：未设置；仅影响可选 session 复用，不影响 dispatch / gate / 主题核心功能。",
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
        warnings.push("缺少 .pm-workflow/docs/Product-Spec.md，当前仍处于需求收集阶段。");
    if (!gates.planGate)
        warnings.push("缺少 .pm-workflow/docs/DEV-PLAN.md，当前不能进入开发主流程。");
    if (!gates.reviewGate)
        blockers.push("存在待 review 的代码变更。");
    if (!state.session.preferred_session_id)
        warnings.push("未设置 preferred_session_id；仅影响可选 session 复用，不影响 dispatch / gate / 主题核心功能。");
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
