import { tool } from "@opencode-ai/plugin";
import { buildExecutionPlan } from "../../shared.js";
import { buildFeedbackSignalSummary } from "../runtime.js";
export function createStateTools() {
    return {
        "pm-get-execution-plan": tool({
            description: "查看当前 ExecutionPlan v2 只读预览摘要。",
            args: {},
            async execute(_args, context) {
                const projectPath = context.worktree || context.directory;
                const plan = buildExecutionPlan(projectPath);
                return [
                    "pm-workflow execution plan",
                    "```json",
                    JSON.stringify(plan, null, 2),
                    "```",
                ].join("\n");
            },
        }),
        "pm-check-feedback-signal": tool({
            description: "检测一段用户消息是否包含明显的修正或反馈信号。",
            args: {
                message: tool.schema.string().describe("要检测的用户消息"),
            },
            async execute(args) {
                const result = buildFeedbackSignalSummary(args.message);
                return [
                    "pm-workflow feedback signal",
                    `- detected: ${result.detected ? "yes" : "no"}`,
                    `- message: ${result.message}`,
                    result.detail ? `- detail: ${result.detail}` : "- detail: 无",
                ].join("\n");
            },
        }),
    };
}
