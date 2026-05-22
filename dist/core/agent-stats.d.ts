/**
 * Agent 量化分派指引数据。
 *
 * 这是一份**精简的、面向 handoff 多候选场景**的量化能力卡片，灵感取自
 * oh-my-opencode-slim 的 orchestrator AGENT_DESCRIPTIONS（其使用类似
 * "2x faster, 1/2 cost" 的相对量化方式提升 LLM 分派准确率）。
 *
 * 我们的卡片以 `pm_lead` 主协调为基准（相对 1x），其他 agent 用相对值描述
 * 速度/成本/质量；并补充 delegate-when / don't-delegate-when 边界，
 * 让被 handoff 的 agent 能精准决定"是否需要再委派"。
 *
 * 这些卡片只在 handoff packet 存在多候选 agent 时被注入到 prompt，
 * 避免在单候选场景浪费 token。
 */
import type { AgentStatsCard, DispatchAgent } from "./types.js";
export declare const AGENT_STATS_LIBRARY: Readonly<Record<DispatchAgent, AgentStatsCard>>;
/**
 * 选取 handoff 量化指引。
 *
 * 规则：
 * - target agent 总是放第一张卡片（让被 handoff 的 agent 立刻看到"我自己的边界"）。
 * - fallback agents 取前 2 个加进来，凑成最多 3 张卡片。
 * - 单候选场景（fallbackAgents 为空）返回 undefined，避免无意义 token 注入。
 */
export declare function pickAgentStats(input: {
    targetAgent: DispatchAgent;
    fallbackAgents: ReadonlyArray<DispatchAgent>;
}): AgentStatsCard[] | undefined;
