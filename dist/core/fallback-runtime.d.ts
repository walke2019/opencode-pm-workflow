/**
 * ForegroundFallback：运行时模型降级。
 *
 * 设计目标：
 * - 当 dispatch 子进程返回限流 / 超时 / 上下文溢出等可降级错误时，
 *   按 `WorkflowConfig.fallback.chains` 配置的链路切换到下一备选模型，
 *   避免在同一模型上做无效重试，直接节省 token 与等待时间。
 * - 不取代 OpenCode 自身的 provider fallback；只在外层 dispatch 层做"看得见的降级"，
 *   产出审计可见的回执，便于排障。
 *
 * 不做的事情：
 * - 不主动切换 agent 角色（角色切换走 fallback.agent_map）。
 * - 不在执行成功时做任何调整。
 * - 不引入额外网络请求；仅基于子进程 exit code / stdout / stderr 做判定。
 */
import type { DispatchAgent, WorkflowConfig } from "./types.js";
export type FallbackTriggerKind = "rate_limit" | "timeout" | "context_overflow" | "model_unavailable";
export interface FallbackTriggerSignal {
    kind: FallbackTriggerKind;
    matchedPattern: string;
    source: "stdout" | "stderr" | "exit_code";
}
/**
 * 判断子进程结果是否触发了"前台模型降级"。
 *
 * 仅在 exit code 非 0 的失败场景下检查，避免误判。
 * 命中任意一类模式即视为可降级；返回的 signal 会写入 receipt，便于事后审计。
 */
export declare function detectFallbackTrigger(input: {
    exitCode: number;
    stdout?: string;
    stderr?: string;
}): FallbackTriggerSignal | undefined;
/**
 * 解析 fallback chain：按 semantic agent 名称、然后按当前 model id 查找。
 *
 * 设计要点：
 * - 多源合并去重，按"先按 agent 配置、再按 model 配置"的顺序拼接。
 * - **保留** currentModel 的位置（如果它出现在链路里），便于 pickNextFallbackModel
 *   按位置往后走；这样可以避免当 currentModel 已在链路尾时被错误地"折回"链路开头。
 * - 仅当 currentModel 既不出现在 byAgent、也不出现在 byModel 链路时，
 *   才认为它是"链路外"模型，pickNextFallbackModel 会从头开始。
 */
export declare function resolveFallbackChain(input: {
    config: WorkflowConfig;
    semanticAgent: DispatchAgent;
    currentModel?: string;
}): string[];
/**
 * 计算"下一个可用备选模型"。
 *
 * - 当前 model 不在链路里时，返回链路第一个。
 * - 当前 model 在链路里时，返回它后面的下一个；用尽则返回 undefined。
 */
export declare function pickNextFallbackModel(input: {
    chain: string[];
    currentModel?: string;
}): string | undefined;
export interface FallbackPlanRuntime {
    triggered: boolean;
    signal?: FallbackTriggerSignal;
    /** 整个降级链路（不含 currentModel） */
    chain: string[];
    /** 立即可切到的下一个 model；undefined = 链路用尽 */
    nextModel?: string;
    /** 给回执 / 日志使用的人类可读原因 */
    reason: string;
}
/**
 * 一次性决定"是否需要触发前台降级 + 切到哪个 model"。
 *
 * dispatch 层只需要看 `triggered === true && nextModel` 就可以决定是否重试，
 * 看 `triggered === true && nextModel === undefined` 就知道链路已耗尽，停止重试。
 */
export declare function buildForegroundFallbackPlan(input: {
    config: WorkflowConfig;
    semanticAgent: DispatchAgent;
    currentModel?: string;
    exitCode: number;
    stdout?: string;
    stderr?: string;
}): FallbackPlanRuntime;
