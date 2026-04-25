import { tool } from "@opencode-ai/plugin";
import { buildExecutionSummary, getExecutionReceiptById, getExecutionReceipts, getLastExecutionReceipt, } from "../../shared.js";
export function createExecutionTools() {
    return {
        "pm-get-last-execution": tool({
            description: "查询最近一次 execution receipt。",
            args: {},
            async execute(_args, context) {
                const projectPath = context.worktree || context.directory;
                const receipt = getLastExecutionReceipt(projectPath);
                if (!receipt) {
                    return "pm-workflow 最近执行回执\n- 无 execution receipt";
                }
                return [
                    "pm-workflow 最近执行回执",
                    "```json",
                    JSON.stringify(receipt, null, 2),
                    "```",
                ].join("\n");
            },
        }),
        "pm-get-execution-receipt": tool({
            description: "查询 execution receipts 列表。",
            args: {
                limit: tool.schema
                    .string()
                    .optional()
                    .describe("可选，返回条数，默认 10，最大 100"),
                action: tool.schema
                    .string()
                    .optional()
                    .describe("可选，按 action 过滤"),
                agent: tool.schema
                    .string()
                    .optional()
                    .describe("可选，按 executable_agent 过滤"),
                success: tool.schema
                    .string()
                    .optional()
                    .describe('可选，传 "true" 或 "false" 按成功/失败过滤'),
            },
            async execute(args, context) {
                const projectPath = context.worktree || context.directory;
                const receipts = getExecutionReceipts(projectPath, {
                    limit: Number.parseInt(args.limit || "10", 10) || 10,
                    action: args.action || undefined,
                    agent: args.agent || undefined,
                    success: args.success === "true" || args.success === "false"
                        ? args.success
                        : undefined,
                });
                return [
                    "pm-workflow execution receipts",
                    `- 数量: ${receipts.length}`,
                    "```json",
                    JSON.stringify(receipts, null, 2),
                    "```",
                ].join("\n");
            },
        }),
        "pm-get-execution-by-id": tool({
            description: "按 execution_id 精确查询 execution receipt。",
            args: {
                execution_id: tool.schema
                    .string()
                    .describe("execution.receipt 的 execution_id"),
            },
            async execute(args, context) {
                const projectPath = context.worktree || context.directory;
                const receipt = getExecutionReceiptById(projectPath, args.execution_id);
                if (!receipt) {
                    return [
                        "pm-workflow execution receipt by id",
                        `- execution_id: ${args.execution_id}`,
                        "- 结果: 未找到",
                    ].join("\n");
                }
                return [
                    "pm-workflow execution receipt by id",
                    "```json",
                    JSON.stringify(receipt, null, 2),
                    "```",
                ].join("\n");
            },
        }),
        "pm-get-execution-summary": tool({
            description: "汇总 execution receipts 的成功率、最近 action 和最近 agent。",
            args: {
                limit: tool.schema
                    .string()
                    .optional()
                    .describe("可选，统计最近 N 条 receipt，默认 10，最大 100"),
            },
            async execute(args, context) {
                const projectPath = context.worktree || context.directory;
                const summary = buildExecutionSummary(projectPath, Number.parseInt(args.limit || "10", 10) || 10);
                return [
                    "pm-workflow execution summary",
                    "```json",
                    JSON.stringify(summary, null, 2),
                    "```",
                ].join("\n");
            },
        }),
    };
}
