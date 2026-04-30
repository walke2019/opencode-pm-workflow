import { buildExecutionGate, buildGateSummary } from "../core/gates.js";
import { readWorkflowConfig } from "../core/config.js";
import { buildStateSummary } from "../core/state.js";
import type {
  DispatchAction,
  DispatchAgent,
  DispatchCommand,
  DispatchPlan,
  ExecutionPlan,
} from "../core/types.js";
import {
  buildDispatchCommandStrings,
  buildExecutablePrompt,
  getExecutableAgent,
} from "./prompts.js";
import { analyzeDispatchTask } from "./analyzer.js";
import { buildHandoffPacket } from "./handoff.js";

function buildExecutionPlanSteps(
  dispatch: DispatchCommand,
): ExecutionPlan["steps"] {
  if (dispatch.recommendedAction === "blocked") {
    return [
      {
        id: "blocked-summary",
        title: "等待阻塞项解除",
        action: "blocked",
        agent: null,
        mode: "local",
        retryable: false,
        maxRetries: 0,
        fallbackAgent: null,
        writesState: false,
        touchesFiles: false,
      },
    ];
  }

  if (dispatch.recommendedAction === "collect-spec") {
    return [
      {
        id: "spec-collect",
        title: "收集需求并生成 Product-Spec",
        action: "collect-spec",
        agent: dispatch.recommendedAgent,
        mode: "single-subagent",
        timeoutMs: 120000,
        retryable: true,
        maxRetries: 1,
        fallbackAgent: null,
        writesState: true,
        touchesFiles: true,
      },
      {
        id: "spec-summary",
        title: "汇总需求收集结果",
        action: "collect-spec",
        agent: null,
        mode: "local",
        dependsOn: ["spec-collect"],
        writesState: false,
        touchesFiles: false,
      },
    ];
  }

  if (dispatch.recommendedAction === "create-dev-plan") {
    return [
      {
        id: "plan-primary",
        title: "生成开发计划",
        action: "create-dev-plan",
        agent: dispatch.recommendedAgent,
        mode: "single-subagent",
        timeoutMs: 120000,
        retryable: true,
        maxRetries: 1,
        fallbackAgent: "pm",
        writesState: true,
        touchesFiles: true,
      },
      {
        id: "plan-summary",
        title: "汇总计划结果",
        action: "create-dev-plan",
        agent: null,
        mode: "local",
        dependsOn: ["plan-primary"],
        writesState: false,
        touchesFiles: false,
      },
    ];
  }

  if (
    dispatch.recommendedAction === "start-development" ||
    dispatch.recommendedAction === "continue-development"
  ) {
    return [
      {
        id: "build-primary",
        title:
          dispatch.recommendedAction === "start-development"
            ? "开始实现当前计划"
            : "继续当前开发任务",
        action: dispatch.recommendedAction,
        agent: dispatch.recommendedAgent,
        mode: "single-subagent",
        timeoutMs: 120000,
        retryable: true,
        maxRetries: 1,
        fallbackAgent: "plan",
        writesState: true,
        touchesFiles: true,
      },
      {
        id: "build-review-seed",
        title: "准备后续 review",
        action: "run-code-review",
        agent: null,
        mode: "local",
        dependsOn: ["build-primary"],
        writesState: false,
        touchesFiles: false,
      },
    ];
  }

  if (dispatch.recommendedAction === "run-code-review") {
    return [
      {
        id: "review-primary",
        title: "执行代码审查",
        action: "run-code-review",
        agent: dispatch.recommendedAgent,
        mode: "single-subagent",
        timeoutMs: 120000,
        retryable: true,
        maxRetries: 1,
        fallbackAgent: "build",
        writesState: true,
        touchesFiles: true,
      },
      {
        id: "review-summary",
        title: "汇总审查结果",
        action: "run-code-review",
        agent: null,
        mode: "local",
        dependsOn: ["review-primary"],
        writesState: false,
        touchesFiles: false,
      },
    ];
  }

  if (dispatch.recommendedAction === "prepare-release") {
    return [
      {
        id: "release-prepare",
        title: "准备发布产物",
        action: "prepare-release",
        agent: dispatch.recommendedAgent,
        mode: "single-subagent",
        timeoutMs: 120000,
        retryable: true,
        maxRetries: 1,
        fallbackAgent: "writer",
        writesState: true,
        touchesFiles: true,
      },
      {
        id: "release-summary",
        title: "整理发布摘要",
        action: "prepare-release",
        agent: "writer",
        mode: "single-subagent",
        dependsOn: ["release-prepare"],
        timeoutMs: 90000,
        retryable: false,
        fallbackAgent: null,
        writesState: false,
        touchesFiles: true,
      },
    ];
  }

  switch (dispatch.recommendedAction) {
    default:
      return [
        {
          id: "primary-dispatch",
          title: dispatch.reason,
          action: dispatch.recommendedAction,
          agent: dispatch.recommendedAgent,
          mode: "single-subagent",
          timeoutMs: 120000,
          retryable: true,
          maxRetries: 1,
          fallbackAgent:
            dispatch.executableAgent === "build"
              ? "plan"
              : dispatch.recommendedAgent,
          writesState: true,
          touchesFiles: true,
        },
      ];
  }
}

export function buildDispatchPlan(projectDir: string): DispatchPlan {
  const state = buildStateSummary(projectDir);
  const gates = buildGateSummary(projectDir);

  let recommendedAgent: DispatchAgent = "pm";
  let recommendedAction: DispatchAction = "collect-spec";
  let reason = "当前缺少 Product-Spec.md，应先进入需求收集阶段。";

  if (!gates.specGate) {
    recommendedAgent = "pm";
    recommendedAction = "collect-spec";
    reason = "Spec Gate 未通过，必须先生成 Product-Spec.md。";
  } else if (state.documents.product_spec && !state.documents.dev_plan) {
    recommendedAgent = "plan";
    recommendedAction = "create-dev-plan";
    reason = "已具备 Product-Spec.md，但缺少 DEV-PLAN.md，应先生成开发计划。";
  } else if (state.stage === "review_pending" || !gates.reviewGate) {
    recommendedAgent = "qa_engineer";
    recommendedAction = "run-code-review";
    reason = "当前存在待 review 代码变更，应先完成 code review。";
  } else if (state.stage === "plan_ready") {
    recommendedAgent = "pm";
    recommendedAction = "start-development";
    reason = "计划已就绪，应先由 PM 判断下一步执行策略并分派给相应专业 agent。";
  } else if (state.stage === "development") {
    recommendedAgent = "pm";
    recommendedAction = "continue-development";
    reason = "当前处于开发阶段，应继续由 PM 协调实现、修复或完善当前 phase。";
  } else if (state.stage === "release_ready" && gates.releaseGate) {
    recommendedAgent = "writer";
    recommendedAction = "prepare-release";
    reason = "当前已满足 release gate，由文档专家 writer 进入发布准备流程。";
  } else if (state.stage === "released" || state.stage === "maintenance") {
    recommendedAgent = "pm";
    recommendedAction = "collect-spec";
    reason = "当前已发布或处于维护状态，建议根据新需求进入下一轮规划。";
  } else if (!gates.planGate) {
    recommendedAgent = "plan";
    recommendedAction = "create-dev-plan";
    reason = "Plan Gate 未通过，应先生成或补齐 DEV-PLAN.md。";
  }

  const actionGate = buildExecutionGate(projectDir, recommendedAction);
  const blocked = !actionGate.allowed;
  const blockedReasons = actionGate.reasons;

  return {
    stage: state.stage,
    stageLabel: state.stageLabel,
    recommendedAgent,
    recommendedAction,
    preferredSession: state.session.preferred_session_id,
    reason,
    blocked,
    blockedReasons,
    nextStep: state.nextStep,
  };
}

export function buildDispatchCommand(
  projectDir: string,
  prompt?: string,
): DispatchCommand {
  const plan = buildDispatchPlan(projectDir);
  const config = readWorkflowConfig(projectDir);
  const sessionID = plan.preferredSession;
  const quotedPrompt = prompt?.trim() || "继续当前阶段的推荐动作";
  const analysis = analyzeDispatchTask({
    prompt: quotedPrompt,
    stage: plan.stage,
    blockedReasons: plan.blockedReasons,
    preferredAgent: plan.recommendedAgent,
  });
  const handoffPacket = buildHandoffPacket({
    prompt: quotedPrompt,
    analysis,
    targetAgent: plan.recommendedAgent,
  });
  const executableAgent = getExecutableAgent(
    plan.recommendedAgent,
    config.agents.dispatch_map,
  );
  const executablePrompt = buildExecutablePrompt(
    plan.recommendedAgent,
    quotedPrompt,
    handoffPacket,
  );
  const { command, commandArgs } = buildDispatchCommandStrings(
    sessionID,
    executableAgent,
    executablePrompt,
  );

  return {
    ...plan,
    analysis,
    executableAgent,
    executablePrompt,
    command,
    commandArgs,
    handoffPacket,
  };
}

export function buildExecutionPlan(
  projectDir: string,
  prompt?: string,
): ExecutionPlan {
  const dispatch = buildDispatchCommand(projectDir, prompt);

  return {
    version: "v2",
    goal: prompt || dispatch.reason,
    primaryAction: dispatch.recommendedAction,
    mode: "single-subagent",
    steps: buildExecutionPlanSteps(dispatch),
    aggregation: {
      strategy: "primary-wins",
    },
    constraints: {
      maxParallelSubagents: 1,
      allowFallback: true,
      allowRetry: true,
    },
  };
}
