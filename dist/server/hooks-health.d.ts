/**
 * 0.6.0：插件启动健康检查 + Hook 注册去重。
 *
 * 设计目标：
 * - 启动时验证 OpenCode 提供的能力是否满足 pm-workflow 最小要求；不满足时发出可见警告，
 *   而不是悄悄地"跑起来但很多功能不可用"。
 * - 防止 hot-reload 等场景下同一插件被重复装配，导致事件回调被多次触发。
 *
 * 不做的事情：
 * - 不抛异常阻止 OpenCode 启动；任何检查失败都退化为 log warn，让用户决定是否处理。
 * - 不对 OpenCode 内置能力做强约束；阈值都可以通过 plugin options 传入覆盖。
 */
import type { PluginContext } from "./runtime.js";
/**
 * 健康检查阈值。
 *
 * - `minAgents`：最少需要多少个 agent 已被解析（含 fallback）；低于则警告。
 * - `minTools`：最少需要多少个 pm-* tool 在装配（默认 5：state/dispatch/diagnostic/execution/admin）。
 * - `minMcps`：最少需要多少个 MCP 在线；默认 0（不强制 MCP 存在）。
 */
export type PluginHealthThresholds = {
    minAgents: number;
    minTools: number;
    minMcps: number;
};
export declare const DEFAULT_HEALTH_THRESHOLDS: PluginHealthThresholds;
export type PluginHealthInputs = {
    agentsCount: number;
    toolsCount: number;
    mcpsCount: number;
};
export type PluginHealthFinding = {
    severity: "info" | "warn" | "error";
    category: "agents" | "tools" | "mcps";
    expected: number;
    actual: number;
    message: string;
};
export type PluginHealthReport = {
    ok: boolean;
    findings: PluginHealthFinding[];
    thresholds: PluginHealthThresholds;
    inputs: PluginHealthInputs;
};
/**
 * 评估当前装配是否满足最小阈值。返回所有发现，不阻断启动。
 */
export declare function evaluatePluginHealth(input: {
    thresholds?: Partial<PluginHealthThresholds>;
    inputs: PluginHealthInputs;
}): PluginHealthReport;
/**
 * 在 ctx.client.app.log 上输出健康检查结果。
 *
 * 不会 toast，因为 server 插件没有 UI 上下文；TUI 插件可以单独读取并 toast。
 */
export declare function reportPluginHealth(ctx: PluginContext, report: PluginHealthReport): Promise<void>;
export type PluginActivationGuardResult = "first" | "duplicate";
export declare function guardPluginActivation(pluginId: string): PluginActivationGuardResult;
/** 释放 activation 哨兵，供 OpenCode plugin dispose / hot-reload 生命周期使用。 */
export declare function releasePluginActivation(pluginId: string): void;
/** 仅供测试使用：清空 activation 哨兵状态 */
export declare function _resetPluginActivationGuardForTesting(): void;
