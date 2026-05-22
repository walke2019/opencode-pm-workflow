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
export const DEFAULT_HEALTH_THRESHOLDS = {
    minAgents: 1,
    minTools: 5,
    minMcps: 0,
};
/**
 * 评估当前装配是否满足最小阈值。返回所有发现，不阻断启动。
 */
export function evaluatePluginHealth(input) {
    const thresholds = {
        ...DEFAULT_HEALTH_THRESHOLDS,
        ...(input.thresholds || {}),
    };
    const findings = [];
    if (input.inputs.agentsCount < thresholds.minAgents) {
        findings.push({
            severity: "warn",
            category: "agents",
            expected: thresholds.minAgents,
            actual: input.inputs.agentsCount,
            message: `pm-workflow expected at least ${thresholds.minAgents} agent(s) but found ${input.inputs.agentsCount}`,
        });
    }
    if (input.inputs.toolsCount < thresholds.minTools) {
        findings.push({
            severity: "warn",
            category: "tools",
            expected: thresholds.minTools,
            actual: input.inputs.toolsCount,
            message: `pm-workflow expected at least ${thresholds.minTools} tool(s) but found ${input.inputs.toolsCount}`,
        });
    }
    if (input.inputs.mcpsCount < thresholds.minMcps) {
        findings.push({
            severity: "info",
            category: "mcps",
            expected: thresholds.minMcps,
            actual: input.inputs.mcpsCount,
            message: `pm-workflow expected at least ${thresholds.minMcps} MCP(s) but found ${input.inputs.mcpsCount}`,
        });
    }
    return {
        ok: findings.every((f) => f.severity !== "error"),
        findings,
        thresholds,
        inputs: input.inputs,
    };
}
/**
 * 在 ctx.client.app.log 上输出健康检查结果。
 *
 * 不会 toast，因为 server 插件没有 UI 上下文；TUI 插件可以单独读取并 toast。
 */
export async function reportPluginHealth(ctx, report) {
    if (!ctx.client?.app?.log)
        return;
    for (const finding of report.findings) {
        await ctx.client.app.log({
            body: {
                service: "pm-workflow-plugin",
                level: finding.severity,
                message: `[health] ${finding.message}`,
                extra: {
                    category: finding.category,
                    expected: finding.expected,
                    actual: finding.actual,
                },
            },
        });
    }
    if (report.findings.length === 0) {
        await ctx.client.app.log({
            body: {
                service: "pm-workflow-plugin",
                level: "info",
                message: "[health] pm-workflow plugin assembly satisfies all thresholds",
                extra: {
                    inputs: report.inputs,
                    thresholds: report.thresholds,
                },
            },
        });
    }
}
/**
 * Hook 注册去重哨兵：在同一进程内同一 plugin id 只允许装配一次。
 *
 * OpenCode 的 hot-reload 机制可能在同一进程里多次重新加载插件；
 * 如果不去重，event hook 会被多次注册，session.created 等事件就会被重复处理，
 * 导致 sync_state / pre_commit_check 等动作被反复执行，浪费 token 和文件 IO。
 *
 * 实现：进程内 Set 记录已激活的 plugin id；首次激活返回 `first`，再次返回 `duplicate`。
 */
const ACTIVATED_PLUGIN_IDS = new Set();
export function guardPluginActivation(pluginId) {
    if (ACTIVATED_PLUGIN_IDS.has(pluginId)) {
        return "duplicate";
    }
    ACTIVATED_PLUGIN_IDS.add(pluginId);
    return "first";
}
/** 仅供测试使用：清空 activation 哨兵状态 */
export function _resetPluginActivationGuardForTesting() {
    ACTIVATED_PLUGIN_IDS.clear();
}
