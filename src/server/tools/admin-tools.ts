import { tool } from "@opencode-ai/plugin";
import {
  buildDispatchPlan,
  buildGateSummary,
  buildStateSummary,
  queryHistory,
  readWorkflowConfig,
  setAutomationMode,
  setPermission,
  setPreferredSession,
  type AutomationMode,
  type PermissionKey,
} from "../../shared.js";
import { buildReviewGateSummary, buildStageSummary } from "../runtime.js";

const PERMISSION_KEYS: PermissionKey[] = [
  "allow_execute_tools",
  "allow_repair_tools",
  "allow_release_actions",
];

const AUTOMATION_MODES: AutomationMode[] = [
  "off",
  "observe",
  "assist",
  "strict",
];

export function createAdminTools() {
  return {
    "pm-get-state": tool({
      description: "返回 pm-workflow 当前状态文件中的核心状态快照。",
      args: {},
      async execute(_args, context) {
        const summary = buildStateSummary(
          context.worktree || context.directory,
        );
        return JSON.stringify(
          {
            stage: summary.stage,
            stageLabel: summary.stageLabel,
            phase: summary.phase,
            review: summary.review,
            release: summary.release,
            documents: summary.documents,
            preferredSession: summary.session.preferred_session_id,
            nextStep: summary.nextStep,
          },
          null,
          2,
        );
      },
    }),
    "pm-check-project-state": tool({
      description: "检查当前项目所处的 pm-workflow 阶段，并返回下一步建议。",
      args: {},
      async execute(_args, context) {
        const summary = buildStageSummary(
          context.worktree || context.directory,
        );
        return [
          "pm-workflow 项目状态",
          `- Product Spec: ${summary.productSpec}`,
          `- Design Brief: ${summary.designBrief}`,
          `- DEV-PLAN: ${summary.devPlan}`,
          `- 当前阶段: ${summary.stage}`,
          `- 当前 Phase: ${summary.phase}`,
          `- Review 状态: ${summary.reviewStatus}`,
          `- 下一步: ${summary.nextStep}`,
        ].join("\n");
      },
    }),
    "pm-check-gates": tool({
      description: "检查 pm-workflow 的 spec/plan/review/release gate 状态。",
      args: {},
      async execute(_args, context) {
        const projectPath = context.worktree || context.directory;
        const gates = buildGateSummary(projectPath);
        return [
          "pm-workflow gates 状态",
          `- Spec Gate: ${gates.specGate ? "pass" : "blocked"}`,
          `- Plan Gate: ${gates.planGate ? "pass" : "blocked"}`,
          `- Review Gate: ${gates.reviewGate ? "pass" : "blocked"}`,
          `- Release Gate: ${gates.releaseGate ? "pass" : "blocked"}`,
          gates.blockedReasons.length
            ? `- 阻塞原因: ${gates.blockedReasons.join("；")}`
            : "- 阻塞原因: 无",
        ].join("\n");
      },
    }),
    "pm-check-review-gate": tool({
      description: "检查当前项目是否仍有待 review 的代码变更。",
      args: {},
      async execute(_args, context) {
        const summary = buildReviewGateSummary(
          context.worktree || context.directory,
        );
        return [
          "pm-workflow review gate 状态",
          `- 状态: ${summary.state}`,
          `- 标记文件: ${summary.markerPath}`,
          `- 说明: ${summary.message}`,
        ].join("\n");
      },
    }),
    "pm-set-preferred-session": tool({
      description: "设置 pm-workflow 当前项目优先复用的 session_id。",
      args: {
        sessionID: tool.schema.string().describe("要写入的 session_id"),
      },
      async execute(args, context) {
        const projectPath = context.worktree || context.directory;
        const state = setPreferredSession(projectPath, args.sessionID);
        return [
          "pm-workflow preferred session 已更新",
          `- session_id: ${state.session.preferred_session_id}`,
          `- stage: ${state.stage}`,
        ].join("\n");
      },
    }),
    "pm-get-next-step": tool({
      description: "根据当前 pm-workflow 阶段返回下一步最合理的动作建议。",
      args: {},
      async execute(_args, context) {
        const summary = buildStageSummary(
          context.worktree || context.directory,
        );
        return [
          "pm-workflow 下一步建议",
          `- 当前阶段: ${summary.stage}`,
          `- 建议动作: ${summary.nextStep}`,
        ].join("\n");
      },
    }),
    "pm-get-dispatch-plan": tool({
      description:
        "基于 pm-workflow 当前 state/gates 返回推荐 agent、动作和阻塞原因。",
      args: {},
      async execute(_args, context) {
        const projectPath = context.worktree || context.directory;
        const plan = buildDispatchPlan(projectPath);
        return [
          "pm-workflow 调度建议",
          `- 当前阶段: ${plan.stageLabel}`,
          `- 推荐 Agent: ${plan.recommendedAgent}`,
          `- 推荐动作: ${plan.recommendedAction}`,
          `- preferred session: ${plan.preferredSession || "未设置"}`,
          `- 说明: ${plan.reason}`,
          plan.blockedReasons.length
            ? `- 阻塞原因: ${plan.blockedReasons.join("；")}`
            : "- 阻塞原因: 无",
        ].join("\n");
      },
    }),
    "pm-get-history": tool({
      description:
        "查询 pm-workflow history.jsonl 事件，可按 type/action/agent 过滤。",
      args: {
        type: tool.schema.string().optional().describe("可选，按事件类型过滤"),
        action: tool.schema
          .string()
          .optional()
          .describe("可选，按 action 过滤"),
        agent: tool.schema.string().optional().describe("可选，按 agent 过滤"),
        limit: tool.schema
          .string()
          .optional()
          .describe("可选，返回条数，默认 20，最大 100"),
      },
      async execute(args, context) {
        const projectPath = context.worktree || context.directory;
        const events = queryHistory(projectPath, {
          type: args.type || undefined,
          action: args.action || undefined,
          agent: args.agent || undefined,
          limit: Number.parseInt(args.limit || "20", 10) || 20,
        });
        return [
          "pm-workflow history",
          `- 数量: ${events.length}`,
          "```json",
          JSON.stringify(events, null, 2),
          "```",
        ].join("\n");
      },
    }),
    "pm-get-config": tool({
      description: "读取当前 .pm-workflow/config.json 配置。",
      args: {},
      async execute(_args, context) {
        const config = readWorkflowConfig(
          context.worktree || context.directory,
        );
        return [
          "pm-workflow config",
          "```json",
          JSON.stringify(config, null, 2),
          "```",
        ].join("\n");
      },
    }),
    "pm-check-permissions": tool({
      description: "查看 pm-workflow permissions 策略当前状态。",
      args: {},
      async execute(_args, context) {
        const projectPath = context.worktree || context.directory;
        const permissions = readWorkflowConfig(projectPath).permissions;
        return [
          "pm-workflow permissions",
          ...PERMISSION_KEYS.map((key) => `- ${key}: ${permissions[key]}`),
        ].join("\n");
      },
    }),
    "pm-set-permission": tool({
      description:
        "安全修改 pm-workflow permissions 中的单个布尔开关，并写入 history。",
      args: {
        key: tool.schema
          .string()
          .describe(
            "权限 key，仅支持 allow_execute_tools / allow_repair_tools / allow_release_actions",
          ),
        value: tool.schema
          .string()
          .describe('布尔值字符串，仅支持 "true" 或 "false"'),
      },
      async execute(args, context) {
        if (!PERMISSION_KEYS.includes(args.key as PermissionKey)) {
          return [
            "pm-workflow permission update failed",
            `- key: ${args.key}`,
            `- 原因: 仅支持 ${PERMISSION_KEYS.join(" / ")}`,
          ].join("\n");
        }
        if (args.value !== "true" && args.value !== "false") {
          return [
            "pm-workflow permission update failed",
            `- key: ${args.key}`,
            "- 原因: value 仅支持 true 或 false",
          ].join("\n");
        }

        const projectPath = context.worktree || context.directory;
        const next = setPermission(
          projectPath,
          args.key as PermissionKey,
          args.value === "true",
        );
        return [
          "pm-workflow permission updated",
          `- key: ${args.key}`,
          `- value: ${next.permissions[args.key as PermissionKey]}`,
        ].join("\n");
      },
    }),
    "pm-set-mode": tool({
      description:
        "设置 pm-workflow 自动介入模式（off/observe/assist/strict）。",
      args: {
        mode: tool.schema
          .string()
          .describe('自动介入模式："off" / "observe" / "assist" / "strict"'),
      },
      async execute(args, context) {
        if (!AUTOMATION_MODES.includes(args.mode as AutomationMode)) {
          return [
            "pm-workflow mode update failed",
            `- mode: ${args.mode}`,
            "- 原因: mode 仅支持 off / observe / assist / strict",
          ].join("\n");
        }

        const projectPath = context.worktree || context.directory;
        const next = setAutomationMode(
          projectPath,
          args.mode as AutomationMode,
        );
        return [
          "pm-workflow automation mode updated",
          `- mode: ${next.automation.mode}`,
        ].join("\n");
      },
    }),
  };
}
