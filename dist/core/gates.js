import { readWorkflowConfig } from "./config.js";
import { buildStateSummary } from "./state.js";
export function buildPermissionGate(projectDir, input) {
    const config = readWorkflowConfig(projectDir);
    const reasons = [];
    if (input.kind === "execute" && !config.permissions.allow_execute_tools) {
        reasons.push("配置禁止执行型工具：permissions.allow_execute_tools=false");
    }
    if (input.kind === "repair" && !config.permissions.allow_repair_tools) {
        reasons.push("配置禁止修复型工具：permissions.allow_repair_tools=false");
    }
    if ((input.kind === "release" || input.action === "prepare-release") &&
        !config.permissions.allow_release_actions) {
        reasons.push("配置禁止发布动作：permissions.allow_release_actions=false");
    }
    return {
        allowed: reasons.length === 0,
        reasons,
    };
}
export function buildConfirmGate(projectDir, confirmValue) {
    const config = readWorkflowConfig(projectDir);
    if (!config.confirm.require_confirm_for_execute) {
        return {
            allowed: true,
            reasons: [],
        };
    }
    return {
        allowed: confirmValue === "YES",
        reasons: confirmValue === "YES"
            ? []
            : ['执行型工具需要显式确认：请传入 confirm="YES"（大写）'],
    };
}
export function buildGateSummary(projectDir) {
    const state = buildStateSummary(projectDir);
    const specGate = state.documents.product_spec;
    const planGate = state.documents.dev_plan;
    const reviewGate = state.review.status === "clean";
    const releaseGate = state.review.status === "clean" &&
        (state.phase.status === "verified" || state.phase.status === "completed");
    return {
        specGate,
        planGate,
        reviewGate,
        releaseGate,
        blockedReasons: [
            !specGate ? "缺少 Product-Spec.md" : null,
            !planGate ? "缺少 DEV-PLAN.md" : null,
            !reviewGate ? "仍有待 review 的代码变更" : null,
            !releaseGate ? "未满足 release gate（review 或 phase 未完成）" : null,
        ].filter(Boolean),
    };
}
export function buildExecutionGate(projectDir, action) {
    const state = buildStateSummary(projectDir);
    const gates = buildGateSummary(projectDir);
    const reasons = [];
    if (action === "collect-spec") {
        return { allowed: true, reasons };
    }
    if (action === "create-design-brief" && !gates.specGate) {
        reasons.push("缺少 Product-Spec.md，不能生成 Design-Brief.md。");
    }
    if (action === "create-dev-plan" && !gates.specGate) {
        reasons.push("缺少 Product-Spec.md，不能生成 DEV-PLAN.md。");
    }
    if ((action === "start-development" || action === "continue-development") &&
        !gates.planGate) {
        reasons.push("缺少 DEV-PLAN.md，不能进入开发执行。");
    }
    if ((action === "start-development" || action === "continue-development") &&
        !gates.reviewGate) {
        reasons.push("当前存在待 review 的代码变更，应先执行 code review。");
    }
    if (action === "run-code-review" && !state.documents.product_spec) {
        reasons.push("缺少 Product-Spec.md，无法按需求基准执行 code review。");
    }
    if (action === "prepare-release" && !gates.releaseGate) {
        reasons.push("Release Gate 未通过，不能进入发布执行。");
    }
    return {
        allowed: reasons.length === 0,
        reasons,
    };
}
