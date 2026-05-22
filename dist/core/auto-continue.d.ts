import type { DispatchAction, WorkflowConfig } from "./types.js";
/**
 * Auto-continue 安全门评估结果。
 *
 * 每个字段说明哪条额外约束导致 `allowed=false`，便于上层把原因合并进
 * dispatch tool 的回执，让用户立刻看到"为什么没自动续跑"。
 */
export type AutoContinueGuardDecision = {
    allowed: boolean;
    reasons: string[];
    /**
     * 距离允许下一次自动续跑还差多少毫秒。仅在被冷却阻断时设置。
     * dispatch tool 可以据此决定 sleep 时长或直接放弃。
     */
    cooldownRemainingMs?: number;
};
export type AutoContinueGuardInput = {
    projectDir: string;
    config: WorkflowConfig;
    /** 当前已经在本次链路里成功执行过几步（不含原始 dispatch 步） */
    stepsAlreadyDone: number;
    /** 当前 dispatch action，仅用于日志归因 */
    action?: DispatchAction;
    /** 注入时间源便于测试，默认 Date.now() */
    now?: () => number;
};
/**
 * 检查最近一次 dispatch 输出是否携带"用户型停止信号"。
 *
 * 用于在长链路中允许用户通过自然语言反馈即时打断自动续跑：
 * 当被 dispatch 的 specialist agent 把"用户说停下"原文输出回来时，本检查命中即停止链路。
 */
export declare function detectFeedbackStopSignal(text: string | undefined | null): {
    matched: string;
    source: string;
} | undefined;
/**
 * 在 dispatch 真正发起之前对自动续跑做最终安全校验。
 *
 * 检查顺序（先轻后重，便于早返回）：
 * 1. `auto_continue.enabled` 总开关
 * 2. `permissions.allow_auto_continue` 总开关
 * 3. `auto_continue.max_steps` 步数上限
 * 4. `auto_continue.cooldown_ms` 冷却
 * 5. `auto_continue.require_clean_tree` 工作树干净
 *
 * 任一失败就 `allowed=false` 并附原因；不做硬性 throw，让上层决定是否记录到回执。
 */
export declare function evaluateAutoContinueGuard(input: AutoContinueGuardInput): AutoContinueGuardDecision;
/**
 * 标记自动续跑链路启动，重置 `steps_used` / `aborted_reason`，并写 history。
 * 由 dispatch tool 在原始 dispatch 完成、准备进入续跑前调用。
 */
export declare function markAutoContinueChainStart(projectDir: string, context: {
    initialAction?: DispatchAction;
}): {
    last_step_at: string | null;
    steps_used: number;
    aborted_reason: string | null;
};
/**
 * 记录一次成功的自动续跑步骤；写 `auto_continue.step` 历史，更新 state。
 */
export declare function recordAutoContinueStep(projectDir: string, context: {
    stepIndex: number;
    action?: DispatchAction;
    agent?: string;
    exitCode: number;
}): {
    last_step_at: string | null;
    steps_used: number;
    aborted_reason: string | null;
};
/**
 * 标记自动续跑链路终止；可被 Gate 阻断、用户停止信号、max_steps 用尽等场景调用。
 */
export declare function markAutoContinueAborted(projectDir: string, reason: string, extra?: Record<string, unknown>): void;
