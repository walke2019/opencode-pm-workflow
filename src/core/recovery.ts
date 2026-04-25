import { readWorkflowConfig } from "./config.js";
import { appendHistory, getLastFailure, readHistory } from "./history.js";
import {
  buildStateSummary,
  defaultFallbackState,
  defaultRetryState,
  detectHasCode,
  inferReviewStatus,
  readState,
  writeState,
} from "./state.js";
import type {
  DispatchAction,
  DispatchAgent,
  ExecutableAgent,
  PhaseStatus,
  WorkflowConfig,
  WorkflowState,
} from "./types.js";

function nowIso() {
  return new Date().toISOString();
}

export function buildRecoverySummary(projectDir: string) {
  const events = readHistory(projectDir);
  const dispatchFailures = events.filter(
    (event) => event.type === "dispatch.executed" && event.exitCode !== 0,
  );
  const fallbackEvents = events.filter(
    (event) => event.type === "fallback.executed",
  );
  const stageTransitions = events.filter(
    (event) => event.type === "stage.transition",
  );
  const lastFailure = getLastFailure(projectDir);

  return {
    totalEvents: events.length,
    dispatchFailures: dispatchFailures.length,
    fallbackExecutions: fallbackEvents.length,
    stageTransitions: stageTransitions.length,
    lastFailure,
  };
}

export function buildRetryPlan(projectDir: string, action: DispatchAction) {
  const state = readState(projectDir);
  const config = readWorkflowConfig(projectDir);
  const retry = state.retry ?? defaultRetryState();
  const retryable = config.retry.retryable_actions.includes(action);
  const attempts = retry.action === action ? retry.attempts : 0;
  const maxAttempts = config.retry.max_attempts || retry.max_attempts || 1;
  const allowed = retryable && attempts < maxAttempts;

  return {
    retryable,
    allowed,
    attempts,
    maxAttempts,
    status: retry.status,
    lastError: retry.last_error,
  };
}

function getFallbackAgent(
  action: DispatchAction,
  executableAgent: ExecutableAgent,
  config: WorkflowConfig,
): ExecutableAgent | null {
  if (!config.fallback.enabled_actions.includes(action)) return null;
  return config.fallback.agent_map[executableAgent] || null;
}

export function buildFallbackPlan(
  projectDir: string,
  action: DispatchAction,
  executableAgent: ExecutableAgent,
) {
  const state = readState(projectDir);
  const config = readWorkflowConfig(projectDir);
  const fallback = state.fallback ?? defaultFallbackState();
  const fallbackAgent = getFallbackAgent(action, executableAgent, config);
  const fallbackable = Boolean(fallbackAgent);
  const attempts =
    fallback.action === action && fallback.from_agent === executableAgent
      ? fallback.attempts
      : 0;
  const maxAttempts =
    config.fallback.max_attempts || fallback.max_attempts || 1;
  const allowed = fallbackable && attempts < maxAttempts;

  return {
    fallbackable,
    allowed,
    fromAgent: executableAgent,
    toAgent: fallbackAgent,
    attempts,
    maxAttempts,
    status: fallback.status,
    lastError: fallback.last_error,
  };
}

export function recordFallbackExecution(
  projectDir: string,
  input: {
    action: DispatchAction;
    fromAgent: ExecutableAgent;
    toAgent: ExecutableAgent;
    exitCode: number;
    stdout?: string;
    stderr?: string;
  },
) {
  const previous = readState(projectDir);
  const config = readWorkflowConfig(projectDir);
  const success = input.exitCode === 0;
  const attempts =
    previous.fallback.action === input.action &&
    previous.fallback.from_agent === input.fromAgent
      ? previous.fallback.attempts + 1
      : 1;

  const next: WorkflowState = {
    ...previous,
    fallback: success
      ? defaultFallbackState()
      : {
          status:
            attempts >=
            (config.fallback.max_attempts ||
              previous.fallback.max_attempts ||
              1)
              ? "exhausted"
              : "used",
          from_agent: input.fromAgent,
          to_agent: input.toAgent,
          action: input.action,
          attempts,
          max_attempts:
            config.fallback.max_attempts || previous.fallback.max_attempts || 1,
          last_error:
            input.stderr?.slice(0, 1000) ||
            input.stdout?.slice(0, 1000) ||
            null,
          last_exit_code: input.exitCode,
        },
    timestamps: {
      ...previous.timestamps,
      updated_at: nowIso(),
    },
  };

  writeState(projectDir, next);
  appendHistory(projectDir, {
    type: "fallback.executed",
    action: input.action,
    from_agent: input.fromAgent,
    to_agent: input.toAgent,
    exitCode: input.exitCode,
    stdout: input.stdout?.slice(0, 2000) || "",
    stderr: input.stderr?.slice(0, 2000) || "",
  });

  return next;
}

export function recordDispatchExecution(
  projectDir: string,
  input: {
    agent: DispatchAgent;
    action: DispatchAction;
    exitCode: number;
    prompt: string;
    stdout?: string;
    stderr?: string;
  },
) {
  const previous = readState(projectDir);
  const config = readWorkflowConfig(projectDir);
  const success = input.exitCode === 0;
  const docs = buildStateSummary(projectDir).documents;

  let nextStage = previous.stage;
  let nextPhaseStatus: PhaseStatus = success
    ? previous.phase.status === "not_started"
      ? "in_progress"
      : previous.phase.status
    : "blocked";

  if (success) {
    if (input.action === "collect-spec" && docs.product_spec) {
      nextStage = docs.design_brief ? "design_ready" : "spec_ready";
      nextPhaseStatus = "completed";
    } else if (
      input.action === "create-design-brief" &&
      docs.product_spec &&
      docs.design_brief
    ) {
      nextStage = "design_ready";
      nextPhaseStatus = "completed";
    } else if (input.action === "create-dev-plan" && docs.dev_plan) {
      nextStage = "plan_ready";
      nextPhaseStatus = "completed";
    } else if (
      (input.action === "start-development" ||
        input.action === "continue-development") &&
      detectHasCode(projectDir)
    ) {
      nextStage =
        inferReviewStatus(projectDir) === "needs_review"
          ? "review_pending"
          : "development";
      nextPhaseStatus = "in_progress";
    } else if (input.action === "run-code-review") {
      const review = inferReviewStatus(projectDir);
      nextStage = review === "clean" ? "release_ready" : "development";
      nextPhaseStatus = review === "clean" ? "verified" : "in_progress";
    } else if (input.action === "prepare-release") {
      nextStage = "released";
      nextPhaseStatus = "completed";
    }
  }

  const next: WorkflowState = {
    ...previous,
    stage: nextStage,
    task: {
      current: input.action,
      status: success ? "done" : "blocked",
    },
    phase: {
      ...previous.phase,
      status: nextPhaseStatus,
    },
    session: {
      ...previous.session,
      last_agent: input.agent,
    },
    retry: success
      ? defaultRetryState()
      : {
          status:
            previous.retry.action === input.action &&
            previous.retry.attempts + 1 >= config.retry.max_attempts
              ? "exhausted"
              : "pending",
          action: input.action,
          attempts:
            previous.retry.action === input.action
              ? previous.retry.attempts + 1
              : 1,
          max_attempts:
            config.retry.max_attempts || previous.retry.max_attempts || 1,
          last_error:
            input.stderr?.slice(0, 1000) ||
            input.stdout?.slice(0, 1000) ||
            null,
          last_exit_code: input.exitCode,
        },
    fallback: success ? defaultFallbackState() : previous.fallback,
    timestamps: {
      ...previous.timestamps,
      updated_at: nowIso(),
      last_verified_at: success
        ? nowIso()
        : previous.timestamps.last_verified_at,
    },
  };

  writeState(projectDir, next);
  appendHistory(projectDir, {
    type: "dispatch.executed",
    agent: input.agent,
    action: input.action,
    exitCode: input.exitCode,
    prompt: input.prompt,
    stdout: input.stdout?.slice(0, 2000) || "",
    stderr: input.stderr?.slice(0, 2000) || "",
  });

  if (
    previous.stage !== next.stage ||
    previous.phase.status !== next.phase.status
  ) {
    appendHistory(projectDir, {
      type: "stage.transition",
      action: input.action,
      from_stage: previous.stage,
      to_stage: next.stage,
      from_phase_status: previous.phase.status,
      to_phase_status: next.phase.status,
      exitCode: input.exitCode,
    });
  }

  return next;
}

export function escapePrompt(prompt: string) {
  return prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

type FallbackDispatchInput = {
  preferredSession?: string | null;
  recommendedAgent: DispatchAgent;
  recommendedAction: DispatchAction;
  executableAgent: ExecutableAgent;
};

export function buildFallbackCommand<T extends FallbackDispatchInput>(
  projectDir: string,
  dispatch: T,
  fallbackAgent: ExecutableAgent,
  prompt?: string,
) {
  void projectDir;
  const sessionID = dispatch.preferredSession;
  const quotedPrompt = prompt?.trim() || "继续当前阶段的 fallback 动作";
  const fallbackPrompt = `原推荐 agent ${dispatch.recommendedAgent}/${dispatch.executableAgent} 执行失败，请以 fallback agent ${fallbackAgent} 处理 pm-workflow 动作 ${dispatch.recommendedAction}：${quotedPrompt}`;
  const command = sessionID
    ? `opencode run --session ${sessionID} --agent ${fallbackAgent} "${escapePrompt(fallbackPrompt)}"`
    : `opencode run --agent ${fallbackAgent} "${escapePrompt(fallbackPrompt)}"`;
  const commandArgs = sessionID
    ? ["run", "--session", sessionID, "--agent", fallbackAgent, fallbackPrompt]
    : ["run", "--agent", fallbackAgent, fallbackPrompt];

  return {
    ...dispatch,
    executableAgent: fallbackAgent,
    executablePrompt: fallbackPrompt,
    command,
    commandArgs,
  };
}
