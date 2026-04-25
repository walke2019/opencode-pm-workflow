import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { defaultWorkflowConfig } from "./config.js";
import { appendHistory, ensureHistoryBootstrap } from "./history.js";
import {
  REVIEW_MARKER_FILENAME,
  ensureStateDir,
  getHistoryPath,
  getStatePath,
  resolveDocReadPath,
} from "./project.js";
import type {
  DispatchAgent,
  ReviewStatus,
  WorkflowStage,
  WorkflowState,
} from "./types.js";

function nowIso() {
  return new Date().toISOString();
}

export function detectDocs(projectDir: string) {
  const productSpecPath = resolveDocReadPath(projectDir, "product_spec");
  const designBriefPath = resolveDocReadPath(projectDir, "design_brief");
  const devPlanPath = resolveDocReadPath(projectDir, "dev_plan");

  return {
    product_spec: existsSync(productSpecPath),
    design_brief: existsSync(designBriefPath),
    dev_plan: existsSync(devPlanPath),
  };
}

export function detectHasCode(projectDir: string) {
  return (
    existsSync(join(projectDir, "package.json")) ||
    existsSync(join(projectDir, "src"))
  );
}

export function defaultRetryState(): WorkflowState["retry"] {
  const defaults = defaultWorkflowConfig();
  return {
    status: "idle",
    action: null,
    attempts: 0,
    max_attempts: defaults.retry.max_attempts,
    last_error: null,
    last_exit_code: null,
  };
}

export function defaultFallbackState(): WorkflowState["fallback"] {
  const defaults = defaultWorkflowConfig();
  return {
    status: "idle",
    from_agent: null,
    to_agent: null,
    action: null,
    attempts: 0,
    max_attempts: defaults.fallback.max_attempts,
    last_error: null,
    last_exit_code: null,
  };
}

export function inferStage(
  projectDir: string,
  reviewStatus?: ReviewStatus,
): WorkflowStage {
  const docs = detectDocs(projectDir);
  const hasCode = detectHasCode(projectDir);
  const currentReview = reviewStatus ?? inferReviewStatus(projectDir);

  if (!docs.product_spec) return "idea";
  if (docs.product_spec && !docs.dev_plan && !hasCode && docs.design_brief)
    return "design_ready";
  if (docs.product_spec && !docs.dev_plan && !hasCode) return "spec_ready";
  if (docs.product_spec && docs.dev_plan && !hasCode) return "plan_ready";
  if (currentReview === "needs_review") return "review_pending";
  if (docs.product_spec && docs.dev_plan && hasCode) return "development";
  return "idea";
}

export function inferStageLabel(stage: WorkflowStage) {
  switch (stage) {
    case "idea":
      return "全新项目";
    case "spec_ready":
      return "Spec 已完成";
    case "design_ready":
      return "Design 已完成";
    case "plan_ready":
      return "Plan 已完成";
    case "development":
      return "项目开发中";
    case "review_pending":
      return "等待代码审查";
    case "release_ready":
      return "准备发布";
    case "released":
      return "已发布";
    case "maintenance":
      return "维护中";
  }
}

export function inferNextStep(stage: WorkflowStage) {
  switch (stage) {
    case "idea":
      return "使用 pm-workflow 收集产品需求";
    case "spec_ready":
      return "生成 DEV-PLAN.md 或继续补设计规范";
    case "design_ready":
      return "生成 DEV-PLAN.md 或开始设计图制作";
    case "plan_ready":
      return "开始执行开发";
    case "development":
      return "继续开发、审查、修复或发布";
    case "review_pending":
      return "先完成 code review，再继续推进 phase 或 release";
    case "release_ready":
      return "执行 release 检查并发布";
    case "released":
      return "进入维护或下一轮迭代";
    case "maintenance":
      return "继续修复、迭代或规划下一阶段";
  }
}

export function inferReviewStatus(projectDir: string): ReviewStatus {
  const markerPath = join(projectDir, REVIEW_MARKER_FILENAME);
  if (!existsSync(markerPath)) return "clean";

  try {
    const state = readFileSync(markerPath, "utf-8").trim();
    if (state === "clean") return "clean";
    if (state === "reviewing") return "reviewing";
    if (state === "blocked") return "blocked";
    return "needs_review";
  } catch {
    return "needs_review";
  }
}

export function createInitialState(projectDir: string): WorkflowState {
  const docs = detectDocs(projectDir);
  const reviewStatus = inferReviewStatus(projectDir);
  const stage = inferStage(projectDir, reviewStatus);

  return {
    version: 1,
    project: {
      root: projectDir,
      name: projectDir.split(/[\\/]/).filter(Boolean).pop() || "project",
    },
    stage,
    phase: {
      current: null,
      status: docs.dev_plan ? "in_progress" : "not_started",
    },
    task: {
      current: null,
      status: "idle",
    },
    documents: docs,
    review: {
      status: reviewStatus,
      marker_file: REVIEW_MARKER_FILENAME,
    },
    release: {
      status:
        reviewStatus === "clean" && docs.dev_plan ? "not_ready" : "blocked",
      last_check_at: null,
    },
    session: {
      preferred_session_id: null,
      last_agent: null,
    },
    retry: defaultRetryState(),
    fallback: defaultFallbackState(),
    timestamps: {
      updated_at: nowIso(),
      last_verified_at: null,
    },
  };
}

export function readState(projectDir: string): WorkflowState {
  const statePath = getStatePath(projectDir);
  const historyPath = getHistoryPath(projectDir);
  if (!existsSync(statePath)) {
    const initial = createInitialState(projectDir);
    writeState(projectDir, initial);
    appendHistory(projectDir, {
      type: "state.init",
      stage: initial.stage,
      review: initial.review.status,
    });
    return initial;
  }

  try {
    const parsed = JSON.parse(
      readFileSync(statePath, "utf-8"),
    ) as WorkflowState;
    const normalized: WorkflowState = {
      ...parsed,
      retry: parsed.retry ?? defaultRetryState(),
      fallback: parsed.fallback ?? defaultFallbackState(),
    };
    if (!existsSync(historyPath)) {
      appendHistory(projectDir, {
        type: "state.bootstrap_history",
        stage: normalized.stage,
        review: normalized.review.status,
      });
    }
    if (!parsed.retry) {
      writeState(projectDir, normalized);
      appendHistory(projectDir, {
        type: "state.migrate_retry_v1",
        retry: normalized.retry.status,
      });
    }
    if (!parsed.fallback) {
      writeState(projectDir, normalized);
      appendHistory(projectDir, {
        type: "state.migrate_fallback_v1",
        fallback: normalized.fallback.status,
      });
    }
    return normalized;
  } catch {
    const initial = createInitialState(projectDir);
    writeState(projectDir, initial);
    appendHistory(projectDir, {
      type: "state.recover_from_invalid_json",
      stage: initial.stage,
      review: initial.review.status,
    });
    return initial;
  }
}

export function writeState(projectDir: string, state: WorkflowState) {
  ensureStateDir(projectDir);
  const statePath = getStatePath(projectDir);
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

export function syncState(
  projectDir: string,
  partial?: Partial<WorkflowState>,
) {
  const previous = readState(projectDir);
  const docs = detectDocs(projectDir);
  const reviewStatus = inferReviewStatus(projectDir);
  const stage = inferStage(projectDir, reviewStatus);

  const next: WorkflowState = {
    ...previous,
    ...partial,
    stage,
    documents: docs,
    review: {
      ...previous.review,
      status: reviewStatus,
      marker_file: REVIEW_MARKER_FILENAME,
    },
    release: {
      ...previous.release,
      status:
        reviewStatus === "clean" && docs.dev_plan
          ? previous.release.status === "released"
            ? "released"
            : "not_ready"
          : "blocked",
    },
    timestamps: {
      ...previous.timestamps,
      updated_at: nowIso(),
    },
  };

  writeState(projectDir, next);
  ensureHistoryBootstrap(projectDir, next);

  if (
    previous.stage !== next.stage ||
    previous.review.status !== next.review.status
  ) {
    appendHistory(projectDir, {
      type: "state.sync",
      from_stage: previous.stage,
      to_stage: next.stage,
      from_review: previous.review.status,
      to_review: next.review.status,
    });
  }

  return next;
}

export function buildStateSummary(projectDir: string) {
  const state = syncState(projectDir);
  return {
    ...state,
    stageLabel: inferStageLabel(state.stage),
    nextStep: inferNextStep(state.stage),
  };
}

export function setPreferredSession(projectDir: string, sessionID: string) {
  const previous = readState(projectDir);
  const next: WorkflowState = {
    ...previous,
    session: {
      ...previous.session,
      preferred_session_id: sessionID,
    },
    timestamps: {
      ...previous.timestamps,
      updated_at: nowIso(),
    },
  };

  writeState(projectDir, next);
  appendHistory(projectDir, {
    type: "session.preferred.updated",
    previous: previous.session.preferred_session_id,
    next: sessionID,
  });

  return next;
}

export function setLastAgent(projectDir: string, agent: DispatchAgent) {
  const previous = readState(projectDir);
  const next: WorkflowState = {
    ...previous,
    session: {
      ...previous.session,
      last_agent: agent,
    },
    timestamps: {
      ...previous.timestamps,
      updated_at: nowIso(),
    },
  };

  writeState(projectDir, next);
  appendHistory(projectDir, {
    type: "session.last_agent.updated",
    previous: previous.session.last_agent,
    next: agent,
  });

  return next;
}
