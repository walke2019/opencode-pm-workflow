import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { createHash } from "crypto";
import { dirname, join, relative } from "path";
export type WorkflowStage =
  | "idea"
  | "spec_ready"
  | "design_ready"
  | "plan_ready"
  | "development"
  | "review_pending"
  | "release_ready"
  | "released"
  | "maintenance";

export type PhaseStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "verified"
  | "completed";

export type TaskStatus = "idle" | "in_progress" | "blocked" | "done";
export type ReviewStatus = "clean" | "needs_review" | "reviewing" | "blocked";
export type ReleaseStatus = "not_ready" | "blocked" | "ready" | "released";
export type RetryStatus = "idle" | "pending" | "exhausted";
export type FallbackStatus = "idle" | "used" | "exhausted";
export type AutomationMode = "off" | "observe" | "assist" | "strict";
export type DocsStorageMode = "legacy" | "project_scoped";
export type AutomationCapability =
  | "event_sync"
  | "prompt_inject"
  | "commit_gate"
  | "review_marker";

export type DispatchAgent = "pm" | "plan" | "build" | "qa_engineer" | "writer";
export type ExecutableAgent = "plan" | "build";

export type DispatchAction =
  | "collect-spec"
  | "create-design-brief"
  | "create-dev-plan"
  | "start-development"
  | "run-code-review"
  | "prepare-release"
  | "continue-development"
  | "blocked";

export type WorkflowState = {
  version: number;
  project: {
    root: string;
    name: string;
  };
  stage: WorkflowStage;
  phase: {
    current: string | null;
    status: PhaseStatus;
  };
  task: {
    current: string | null;
    status: TaskStatus;
  };
  documents: {
    product_spec: boolean;
    design_brief: boolean;
    dev_plan: boolean;
  };
  review: {
    status: ReviewStatus;
    marker_file: string;
  };
  release: {
    status: ReleaseStatus;
    last_check_at: string | null;
  };
  session: {
    preferred_session_id: string | null;
    last_agent: string | null;
  };
  retry: {
    status: RetryStatus;
    action: DispatchAction | null;
    attempts: number;
    max_attempts: number;
    last_error: string | null;
    last_exit_code: number | null;
  };
  fallback: {
    status: FallbackStatus;
    from_agent: ExecutableAgent | null;
    to_agent: ExecutableAgent | null;
    action: DispatchAction | null;
    attempts: number;
    max_attempts: number;
    last_error: string | null;
    last_exit_code: number | null;
  };
  timestamps: {
    updated_at: string;
    last_verified_at: string | null;
  };
};

export type WorkflowConfig = {
  retry: {
    max_attempts: number;
    retryable_actions: DispatchAction[];
  };
  fallback: {
    max_attempts: number;
    enabled_actions: DispatchAction[];
    agent_map: Partial<Record<ExecutableAgent, ExecutableAgent>>;
  };
  permissions: {
    allow_execute_tools: boolean;
    allow_repair_tools: boolean;
    allow_release_actions: boolean;
  };
  confirm: {
    require_confirm_for_execute: boolean;
  };
  automation: {
    mode: AutomationMode;
  };
  docs: {
    storage_mode: DocsStorageMode;
    read_legacy: boolean;
    write_legacy: boolean;
  };
};

export type PermissionKey = keyof WorkflowConfig["permissions"];

export type WorkflowHistoryEvent = {
  at?: string;
  type?: string;
  action?: DispatchAction;
  agent?: DispatchAgent;
  exitCode?: number;
  [key: string]: unknown;
};

export type ExecutionReceipt = WorkflowHistoryEvent & {
  type: "execution.receipt";
  execution_id: string;
  action: DispatchAction;
  executable_agent: string;
  exitCode: number;
};

export const REVIEW_MARKER_FILENAME = ".needs-review";
const STATE_DIRNAME = ".pm-workflow";
const STATE_FILENAME = "state.json";
const HISTORY_FILENAME = "history.jsonl";
const CONFIG_FILENAME = "config.json";
const MIGRATION_MANIFEST_FILENAME = "migration-manifest.json";
const PROJECT_DOCS_DIRNAME = "docs";
const PROJECT_FEEDBACK_DIRNAME = "feedback";

const DOC_FILENAMES = {
  product_spec: "Product-Spec.md",
  design_brief: "Design-Brief.md",
  dev_plan: "DEV-PLAN.md",
} as const;

type WorkflowDocName = keyof typeof DOC_FILENAMES;

function nowIso() {
  return new Date().toISOString();
}

export function getStateDir(projectDir: string) {
  return join(projectDir, STATE_DIRNAME);
}

export function getStatePath(projectDir: string) {
  return join(getStateDir(projectDir), STATE_FILENAME);
}

export function getHistoryPath(projectDir: string) {
  return join(getStateDir(projectDir), HISTORY_FILENAME);
}

export function getConfigPath(projectDir: string) {
  return join(getStateDir(projectDir), CONFIG_FILENAME);
}

export function getMigrationManifestPath(projectDir: string) {
  return join(getStateDir(projectDir), MIGRATION_MANIFEST_FILENAME);
}

export function getProjectDocsDir(projectDir: string) {
  return join(getStateDir(projectDir), PROJECT_DOCS_DIRNAME);
}

export function getProjectFeedbackDir(projectDir: string) {
  return join(getStateDir(projectDir), PROJECT_FEEDBACK_DIRNAME);
}

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function ensureProjectStorageDirs(projectDir: string) {
  ensureDir(getProjectDocsDir(projectDir));
  ensureDir(getProjectFeedbackDir(projectDir));
}

export function ensureStateDir(projectDir: string) {
  const stateDir = getStateDir(projectDir);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
}

function getLegacyDocPath(projectDir: string, docName: WorkflowDocName) {
  return join(projectDir, DOC_FILENAMES[docName]);
}

export function getProjectScopedDocPath(
  projectDir: string,
  docName: WorkflowDocName,
) {
  return join(getProjectDocsDir(projectDir), DOC_FILENAMES[docName]);
}

export function resolveDocReadPath(
  projectDir: string,
  docName: WorkflowDocName,
) {
  const config = readWorkflowConfig(projectDir);
  const projectScoped = getProjectScopedDocPath(projectDir, docName);
  const legacy = getLegacyDocPath(projectDir, docName);

  if (config.docs.storage_mode === "project_scoped") {
    if (existsSync(projectScoped)) return projectScoped;
    if (config.docs.read_legacy && existsSync(legacy)) return legacy;
    return projectScoped;
  }

  if (existsSync(legacy)) return legacy;
  if (config.docs.read_legacy && existsSync(projectScoped))
    return projectScoped;
  return legacy;
}

export function resolveDocWritePath(
  projectDir: string,
  docName: WorkflowDocName,
) {
  const config = readWorkflowConfig(projectDir);
  if (config.docs.storage_mode === "legacy" && config.docs.write_legacy) {
    return getLegacyDocPath(projectDir, docName);
  }
  return getProjectScopedDocPath(projectDir, docName);
}

export function getFeedbackReadRoots(projectDir: string) {
  const config = readWorkflowConfig(projectDir);
  const roots = [getProjectFeedbackDir(projectDir)];
  if (config.docs.read_legacy) {
    roots.push(join(projectDir, "feedback"));
    roots.push(join(projectDir, ".claude", "feedback"));
  }
  return roots;
}

export function hashFileSha256(path: string) {
  const content = readFileSync(path);
  return createHash("sha256").update(content).digest("hex");
}

export function listFilesRecursively(path: string): string[] {
  if (!existsSync(path)) return [];
  const results: string[] = [];
  const entries = readdirSync(path);
  for (const entry of entries) {
    const fullPath = join(path, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...listFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

type MigrationManifest = {
  version: number;
  last_run_at: string;
  docs: {
    copied: Array<{ source: string; target: string }>;
    conflicts: Array<{ source: string; target: string }>;
  };
  feedback: {
    copied: Array<{ source: string; target: string }>;
    conflicts: Array<{ source: string; target: string }>;
  };
};

function dedupeMigrationPairs(list: Array<{ source: string; target: string }>) {
  const seen = new Set<string>();
  const result: Array<{ source: string; target: string }> = [];
  for (const item of list) {
    const key = `${item.source}::${item.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function readMigrationManifest(projectDir: string): MigrationManifest {
  const path = getMigrationManifestPath(projectDir);
  if (!existsSync(path)) {
    return {
      version: 1,
      last_run_at: nowIso(),
      docs: { copied: [], conflicts: [] },
      feedback: { copied: [], conflicts: [] },
    };
  }

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as MigrationManifest;
  } catch {
    return {
      version: 1,
      last_run_at: nowIso(),
      docs: { copied: [], conflicts: [] },
      feedback: { copied: [], conflicts: [] },
    };
  }
}

function writeMigrationManifest(
  projectDir: string,
  manifest: MigrationManifest,
) {
  const path = getMigrationManifestPath(projectDir);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

export function migrateLegacyProjectArtifacts(projectDir: string) {
  const config = readWorkflowConfig(projectDir);
  ensureStateDir(projectDir);
  ensureProjectStorageDirs(projectDir);

  if (config.docs.storage_mode !== "project_scoped") {
    return {
      migrated: false,
      reason: "docs.storage_mode is not project_scoped",
    };
  }

  const manifest = readMigrationManifest(projectDir);
  manifest.last_run_at = nowIso();

  for (const docName of Object.keys(DOC_FILENAMES) as WorkflowDocName[]) {
    const source = getLegacyDocPath(projectDir, docName);
    const target = getProjectScopedDocPath(projectDir, docName);
    if (!existsSync(source)) continue;

    ensureDir(getProjectDocsDir(projectDir));
    if (!existsSync(target)) {
      copyFileSync(source, target);
      manifest.docs.copied.push({ source, target });
      continue;
    }

    if (hashFileSha256(source) !== hashFileSha256(target)) {
      manifest.docs.conflicts.push({ source, target });
    }
  }

  const feedbackSources = [
    join(projectDir, "feedback"),
    join(projectDir, ".claude", "feedback"),
  ];

  const feedbackTargetRoot = getProjectFeedbackDir(projectDir);
  ensureDir(feedbackTargetRoot);

  for (const sourceRoot of feedbackSources) {
    if (!existsSync(sourceRoot)) continue;
    for (const source of listFilesRecursively(sourceRoot)) {
      const relativePath = relative(sourceRoot, source);
      const target = join(feedbackTargetRoot, relativePath);
      ensureDir(dirname(target));

      if (!existsSync(target)) {
        copyFileSync(source, target);
        manifest.feedback.copied.push({ source, target });
        continue;
      }

      if (hashFileSha256(source) !== hashFileSha256(target)) {
        manifest.feedback.conflicts.push({ source, target });
      }
    }
  }

  manifest.docs.copied = dedupeMigrationPairs(manifest.docs.copied);
  manifest.docs.conflicts = dedupeMigrationPairs(manifest.docs.conflicts);
  manifest.feedback.copied = dedupeMigrationPairs(manifest.feedback.copied);
  manifest.feedback.conflicts = dedupeMigrationPairs(
    manifest.feedback.conflicts,
  );

  writeMigrationManifest(projectDir, manifest);

  if (manifest.docs.copied.length || manifest.feedback.copied.length) {
    appendHistory(projectDir, {
      type: "docs.migrate_legacy_to_project_scoped",
      docs_copied: manifest.docs.copied.length,
      docs_conflicts: manifest.docs.conflicts.length,
      feedback_copied: manifest.feedback.copied.length,
      feedback_conflicts: manifest.feedback.conflicts.length,
    });
  }

  return {
    migrated: true,
    docsCopied: manifest.docs.copied.length,
    docsConflicts: manifest.docs.conflicts.length,
    feedbackCopied: manifest.feedback.copied.length,
    feedbackConflicts: manifest.feedback.conflicts.length,
  };
}

export function getMigrationReport(projectDir: string) {
  const manifest = readMigrationManifest(projectDir);
  return {
    last_run_at: manifest.last_run_at,
    docs: {
      ...manifest.docs,
      copied_count: manifest.docs.copied.length,
      conflicts_count: manifest.docs.conflicts.length,
    },
    feedback: {
      ...manifest.feedback,
      copied_count: manifest.feedback.copied.length,
      conflicts_count: manifest.feedback.conflicts.length,
    },
  };
}

function detectDocs(projectDir: string) {
  const productSpecPath = resolveDocReadPath(projectDir, "product_spec");
  const designBriefPath = resolveDocReadPath(projectDir, "design_brief");
  const devPlanPath = resolveDocReadPath(projectDir, "dev_plan");

  return {
    product_spec: existsSync(productSpecPath),
    design_brief: existsSync(designBriefPath),
    dev_plan: existsSync(devPlanPath),
  };
}

function detectHasCode(projectDir: string) {
  return (
    existsSync(join(projectDir, "package.json")) ||
    existsSync(join(projectDir, "src"))
  );
}

function defaultWorkflowConfig(): WorkflowConfig {
  return {
    retry: {
      max_attempts: 2,
      retryable_actions: [
        "collect-spec",
        "create-design-brief",
        "create-dev-plan",
        "start-development",
        "run-code-review",
        "continue-development",
      ],
    },
    fallback: {
      max_attempts: 1,
      enabled_actions: [
        "collect-spec",
        "create-design-brief",
        "create-dev-plan",
        "start-development",
        "run-code-review",
        "continue-development",
      ],
      agent_map: {
        plan: "build",
        build: "plan",
      },
    },
    permissions: {
      allow_execute_tools: false,
      allow_repair_tools: true,
      allow_release_actions: false,
    },
    confirm: {
      require_confirm_for_execute: true,
    },
    automation: {
      mode: "observe",
    },
    docs: {
      storage_mode: "project_scoped",
      read_legacy: true,
      write_legacy: false,
    },
  };
}

export function readWorkflowConfig(projectDir: string): WorkflowConfig {
  ensureStateDir(projectDir);
  const configPath = getConfigPath(projectDir);
  const defaults = defaultWorkflowConfig();

  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(defaults, null, 2));
    appendHistory(projectDir, {
      type: "config.init",
      path: configPath,
    });
    return defaults;
  }

  try {
    const parsed = JSON.parse(
      readFileSync(configPath, "utf-8"),
    ) as Partial<WorkflowConfig>;
    const merged: WorkflowConfig = {
      retry: {
        ...defaults.retry,
        ...(parsed.retry || {}),
      },
      fallback: {
        ...defaults.fallback,
        ...(parsed.fallback || {}),
        agent_map: {
          ...defaults.fallback.agent_map,
          ...(parsed.fallback?.agent_map || {}),
        },
      },
      permissions: {
        ...defaults.permissions,
        ...(parsed.permissions || {}),
      },
      confirm: {
        ...defaults.confirm,
        ...(parsed.confirm || {}),
      },
      automation: {
        ...defaults.automation,
        ...(parsed.automation || {}),
      },
      docs: {
        ...defaults.docs,
        ...(parsed.docs || {}),
      },
    };
    const migrationTypes: string[] = [];
    if (!parsed.permissions)
      migrationTypes.push("config.migrate_permissions_v1");
    if (!parsed.confirm) migrationTypes.push("config.migrate_confirm_v1");
    if (!parsed.automation) migrationTypes.push("config.migrate_automation_v1");
    if (!parsed.docs) migrationTypes.push("config.migrate_docs_v1");

    if (migrationTypes.length > 0) {
      writeFileSync(configPath, JSON.stringify(merged, null, 2));
      for (const type of migrationTypes) {
        appendHistory(projectDir, {
          type,
          permissions: merged.permissions,
          confirm: merged.confirm,
          automation: merged.automation,
          docs: merged.docs,
        });
      }
    }
    return merged;
  } catch {
    appendHistory(projectDir, {
      type: "config.read_failed",
      path: configPath,
    });
    return defaults;
  }
}

function defaultRetryState(): WorkflowState["retry"] {
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

function defaultFallbackState(): WorkflowState["fallback"] {
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
      preferred_session_id: "ses_2536bfb2affekTj1q0a1HswoVx",
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

export function appendHistory(
  projectDir: string,
  payload: Record<string, unknown>,
) {
  ensureStateDir(projectDir);
  const historyPath = getHistoryPath(projectDir);
  appendFileSync(
    historyPath,
    `${JSON.stringify({ at: nowIso(), ...payload })}\n`,
    "utf-8",
  );
}

export function readHistory(projectDir: string): WorkflowHistoryEvent[] {
  const historyPath = getHistoryPath(projectDir);
  if (!existsSync(historyPath)) return [];

  return readFileSync(historyPath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as WorkflowHistoryEvent;
      } catch {
        return { type: "history.parse_failed", raw: line };
      }
    });
}

export function queryHistory(
  projectDir: string,
  options: {
    type?: string;
    action?: string;
    agent?: string;
    limit?: number;
  } = {},
) {
  const limit = Math.max(1, Math.min(100, options.limit || 20));
  const events = readHistory(projectDir).filter((event) => {
    if (options.type && event.type !== options.type) return false;
    if (options.action && event.action !== options.action) return false;
    if (options.agent && event.agent !== options.agent) return false;
    return true;
  });

  return events.slice(-limit).reverse();
}

export function getLastFailure(projectDir: string) {
  const events = readHistory(projectDir).reverse();
  return (
    events.find(
      (event) => typeof event.exitCode === "number" && event.exitCode !== 0,
    ) || null
  );
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

function createExecutionId() {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function recordExecutionReceipt(
  projectDir: string,
  input: {
    action: DispatchAction;
    executableAgent: string;
    prompt: string;
    commandArgs: string[];
    exitCode: number;
    retryUsed: boolean;
    fallbackUsed: boolean;
    stageBefore: WorkflowStage;
    stageAfter: WorkflowStage;
  },
) {
  const receipt: ExecutionReceipt = {
    at: nowIso(),
    type: "execution.receipt",
    execution_id: createExecutionId(),
    action: input.action,
    executable_agent: input.executableAgent,
    prompt_summary: input.prompt.slice(0, 200),
    command_args: input.commandArgs,
    exitCode: input.exitCode,
    retry_used: input.retryUsed,
    fallback_used: input.fallbackUsed,
    stage_before: input.stageBefore,
    stage_after: input.stageAfter,
  };

  appendHistory(projectDir, receipt);
  return receipt;
}

export function getExecutionReceipts(
  projectDir: string,
  options: {
    limit?: number;
    action?: string;
    agent?: string;
    success?: "true" | "false";
  } = {},
) {
  const limit = options.limit || 10;
  return queryHistory(projectDir, {
    type: "execution.receipt",
    limit,
  }).filter((event) => {
    const receipt = event as ExecutionReceipt;
    if (options.action && receipt.action !== options.action) return false;
    if (options.agent && receipt.executable_agent !== options.agent)
      return false;
    if (options.success === "true" && receipt.exitCode !== 0) return false;
    if (options.success === "false" && receipt.exitCode === 0) return false;
    return true;
  }) as ExecutionReceipt[];
}

export function getLastExecutionReceipt(projectDir: string) {
  const receipts = getExecutionReceipts(projectDir, { limit: 1 });
  return receipts[0] || null;
}

export function getExecutionReceiptById(
  projectDir: string,
  executionId: string,
) {
  return (readHistory(projectDir).find(
    (event) =>
      event.type === "execution.receipt" && event.execution_id === executionId,
  ) || null) as ExecutionReceipt | null;
}

export function buildExecutionSummary(projectDir: string, limit = 10) {
  const receipts = getExecutionReceipts(projectDir, { limit });
  const successCount = receipts.filter(
    (receipt) => receipt.exitCode === 0,
  ).length;
  const failureCount = receipts.length - successCount;
  const last = receipts[0] || null;

  return {
    total: receipts.length,
    successCount,
    failureCount,
    successRate: receipts.length
      ? Number((successCount / receipts.length).toFixed(2))
      : 0,
    lastAction: last?.action || null,
    lastAgent: last?.executable_agent || null,
    lastExitCode: typeof last?.exitCode === "number" ? last.exitCode : null,
  };
}

export function buildDoctorReport(projectDir: string) {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  const statePath = getStatePath(projectDir);
  const configPath = getConfigPath(projectDir);
  const historyPath = getHistoryPath(projectDir);

  const state = readState(projectDir);
  const config = readWorkflowConfig(projectDir);
  const history = readHistory(projectDir);
  const gates = buildGateSummary(projectDir);
  const recovery = buildRecoverySummary(projectDir);

  checks.push({
    name: "state.json",
    ok: existsSync(statePath),
    detail: statePath,
  });
  checks.push({
    name: "config.json",
    ok: existsSync(configPath),
    detail: configPath,
  });
  checks.push({
    name: "history.jsonl",
    ok: existsSync(historyPath),
    detail: historyPath,
  });
  checks.push({
    name: "preferred_session_id",
    ok: Boolean(state.session.preferred_session_id),
    detail: state.session.preferred_session_id || "未设置",
  });
  checks.push({
    name: "retry policy",
    ok:
      config.retry.max_attempts >= 1 &&
      config.retry.retryable_actions.length > 0,
    detail: `max_attempts=${config.retry.max_attempts}, actions=${config.retry.retryable_actions.length}`,
  });
  checks.push({
    name: "fallback policy",
    ok: config.fallback.max_attempts >= 0,
    detail: `max_attempts=${config.fallback.max_attempts}, actions=${config.fallback.enabled_actions.length}`,
  });
  checks.push({
    name: "history parse",
    ok: !history.some((event) => event.type === "history.parse_failed"),
    detail: `events=${history.length}`,
  });
  checks.push({
    name: "review gate",
    ok: gates.reviewGate,
    detail: gates.reviewGate
      ? "review gate pass"
      : gates.blockedReasons.join("；"),
  });
  checks.push({
    name: "recovery failures",
    ok: recovery.dispatchFailures === 0,
    detail: `dispatchFailures=${recovery.dispatchFailures}, fallbackExecutions=${recovery.fallbackExecutions}`,
  });

  if (!gates.specGate)
    warnings.push("缺少 Product-Spec.md，当前仍处于需求收集阶段。");
  if (!gates.planGate)
    warnings.push("缺少 DEV-PLAN.md，当前不能进入开发主流程。");
  if (!gates.reviewGate) blockers.push("存在待 review 的代码变更。");
  if (!state.session.preferred_session_id)
    warnings.push("未设置 preferred_session_id，session workaround 不稳定。");
  if (recovery.lastFailure)
    warnings.push("存在历史失败事件，可运行 pm-get-last-failure 查看。");

  return {
    ok: checks.every((check) => check.ok) && blockers.length === 0,
    checks,
    warnings,
    blockers,
    stage: state.stage,
    gates,
    recovery,
  };
}

export function repairDoctorState(projectDir: string) {
  const before = buildDoctorReport(projectDir);
  const repaired: string[] = [];

  const statePath = getStatePath(projectDir);
  const configPath = getConfigPath(projectDir);
  const historyPath = getHistoryPath(projectDir);

  const hadState = existsSync(statePath);
  const hadConfig = existsSync(configPath);
  const hadHistory = existsSync(historyPath);

  const state = readState(projectDir);
  readWorkflowConfig(projectDir);
  ensureHistoryBootstrap(projectDir, state);

  if (!hadState && existsSync(statePath)) repaired.push("created state.json");
  if (!hadConfig && existsSync(configPath))
    repaired.push("created config.json");
  if (!hadHistory && existsSync(historyPath))
    repaired.push("created history.jsonl");

  if (!hadState || !hadConfig || !hadHistory) {
    appendHistory(projectDir, {
      type: "doctor.repair",
      repaired,
    });
  }

  const after = buildDoctorReport(projectDir);

  return {
    repaired,
    before,
    after,
  };
}

function ensureHistoryBootstrap(projectDir: string, state: WorkflowState) {
  const historyPath = getHistoryPath(projectDir);
  if (existsSync(historyPath)) return;

  appendHistory(projectDir, {
    type: "state.bootstrap_history",
    stage: state.stage,
    review: state.review.status,
  });
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

export function buildPermissionGate(
  projectDir: string,
  input: { kind: "execute" | "repair" | "release"; action?: DispatchAction },
) {
  const config = readWorkflowConfig(projectDir);
  const reasons: string[] = [];

  if (input.kind === "execute" && !config.permissions.allow_execute_tools) {
    reasons.push("配置禁止执行型工具：permissions.allow_execute_tools=false");
  }

  if (input.kind === "repair" && !config.permissions.allow_repair_tools) {
    reasons.push("配置禁止修复型工具：permissions.allow_repair_tools=false");
  }

  if (
    (input.kind === "release" || input.action === "prepare-release") &&
    !config.permissions.allow_release_actions
  ) {
    reasons.push("配置禁止发布动作：permissions.allow_release_actions=false");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

export function buildConfirmGate(projectDir: string, confirmValue?: string) {
  const config = readWorkflowConfig(projectDir);
  if (!config.confirm.require_confirm_for_execute) {
    return {
      allowed: true,
      reasons: [] as string[],
    };
  }

  return {
    allowed: confirmValue === "YES",
    reasons:
      confirmValue === "YES"
        ? []
        : ['执行型工具需要显式确认：请传入 confirm="YES"（大写）'],
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

export function buildExecutionGate(projectDir: string, action: DispatchAction) {
  const state = buildStateSummary(projectDir);
  const gates = buildGateSummary(projectDir);
  const reasons: string[] = [];

  if (action === "collect-spec") {
    return { allowed: true, reasons };
  }

  if (action === "create-design-brief" && !gates.specGate) {
    reasons.push("缺少 Product-Spec.md，不能生成 Design-Brief.md。");
  }

  if (action === "create-dev-plan" && !gates.specGate) {
    reasons.push("缺少 Product-Spec.md，不能生成 DEV-PLAN.md。");
  }

  if (
    (action === "start-development" || action === "continue-development") &&
    !gates.planGate
  ) {
    reasons.push("缺少 DEV-PLAN.md，不能进入开发执行。");
  }

  if (
    (action === "start-development" || action === "continue-development") &&
    !gates.reviewGate
  ) {
    reasons.push("当前存在待 review 的代码变更，应先执行 code review。");
  }

  if (action === "run-code-review" && !state.documents.product_spec) {
    reasons.push("缺少 Product-Spec.md，无法按需求基准执行 code review。");
  }

  if (action === "prepare-release" && !gates.releaseGate) {
    reasons.push("Release Gate 未通过，不能进入发布执行。");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
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
  const docs = detectDocs(projectDir);

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

export function buildDispatchPlan(projectDir: string) {
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
    recommendedAgent = "build";
    recommendedAction = "start-development";
    reason = "计划已就绪，下一步应由 build agent 开始开发。";
  } else if (state.stage === "development") {
    recommendedAgent = "build";
    recommendedAction = "continue-development";
    reason = "当前处于开发阶段，应继续实现、修复或完善当前 phase。";
  } else if (state.stage === "release_ready" && gates.releaseGate) {
    recommendedAgent = "build";
    recommendedAction = "prepare-release";
    reason = "当前已满足 release gate，可进入发布准备流程。";
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

function getExecutableAgent(agent: DispatchAgent): ExecutableAgent {
  if (agent === "build") return "build";
  return "plan";
}

function buildExecutablePrompt(agent: DispatchAgent, prompt: string) {
  if (agent === "pm") {
    return `以产品经理视角处理以下 pm-workflow 任务；如需要，可在当前会话中委派给 pm subagent：${prompt}`;
  }

  if (agent === "qa_engineer") {
    return `以 QA/code-review 视角处理以下 pm-workflow 任务；如需要，可在当前会话中委派给 qa_engineer subagent：${prompt}`;
  }

  if (agent === "writer") {
    return `以文档写作者视角处理以下 pm-workflow 任务；如需要，可在当前会话中委派给 writer subagent：${prompt}`;
  }

  return prompt;
}

function escapePrompt(prompt: string) {
  return prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildDispatchCommand(projectDir: string, prompt?: string) {
  const plan = buildDispatchPlan(projectDir);
  const sessionID = plan.preferredSession;
  const quotedPrompt = prompt?.trim() || "继续当前阶段的推荐动作";
  const executableAgent = getExecutableAgent(plan.recommendedAgent);
  const executablePrompt = buildExecutablePrompt(
    plan.recommendedAgent,
    quotedPrompt,
  );

  const command = sessionID
    ? `opencode run --session ${sessionID} --agent ${executableAgent} "${escapePrompt(executablePrompt)}"`
    : `opencode run --agent ${executableAgent} "${escapePrompt(executablePrompt)}"`;
  const commandArgs = sessionID
    ? [
        "run",
        "--session",
        sessionID,
        "--agent",
        executableAgent,
        executablePrompt,
      ]
    : ["run", "--agent", executableAgent, executablePrompt];

  return {
    ...plan,
    executableAgent,
    executablePrompt,
    command,
    commandArgs,
  };
}

export function buildSafetyReport(projectDir: string, prompt?: string) {
  const config = readWorkflowConfig(projectDir);
  const doctor = buildDoctorReport(projectDir);
  const recovery = buildRecoverySummary(projectDir);
  const recentHistory = queryHistory(projectDir, { limit: 5 });
  const dispatch = buildDispatchCommand(projectDir, prompt);
  const permission = buildPermissionGate(projectDir, {
    kind: "execute",
    action: dispatch.recommendedAction,
  });
  const gate = buildExecutionGate(projectDir, dispatch.recommendedAction);
  const retry = buildRetryPlan(projectDir, dispatch.recommendedAction);
  const fallback = buildFallbackPlan(
    projectDir,
    dispatch.recommendedAction,
    dispatch.executableAgent,
  );
  const safeToEnableExecute =
    doctor.ok &&
    gate.allowed &&
    !config.permissions.allow_execute_tools &&
    dispatch.recommendedAction !== "prepare-release" &&
    recovery.dispatchFailures === 0;

  return {
    ok: doctor.ok && permission.allowed && gate.allowed,
    safeToEnableExecute,
    permissions: config.permissions,
    doctor: {
      ok: doctor.ok,
      warnings: doctor.warnings,
      blockers: doctor.blockers,
    },
    dispatch: {
      stage: dispatch.stageLabel,
      recommendedAgent: dispatch.recommendedAgent,
      executableAgent: dispatch.executableAgent,
      recommendedAction: dispatch.recommendedAction,
      permissionAllowed: permission.allowed,
      permissionReasons: permission.reasons,
      gateAllowed: gate.allowed,
      gateReasons: gate.reasons,
      retryAllowed: retry.allowed,
      fallbackAllowed: fallback.allowed,
      command: dispatch.command,
    },
    recovery,
    recentHistory,
  };
}

export function isAutomationCapabilityEnabled(
  mode: AutomationMode,
  capability: AutomationCapability,
) {
  if (mode === "off") return false;
  if (mode === "strict") return true;

  if (mode === "observe") {
    return capability === "event_sync";
  }

  return (
    capability === "event_sync" ||
    capability === "prompt_inject" ||
    capability === "review_marker"
  );
}

export function getAutomationMode(projectDir: string) {
  return readWorkflowConfig(projectDir).automation.mode;
}

export function setPermission(
  projectDir: string,
  key: PermissionKey,
  value: boolean,
) {
  const config = readWorkflowConfig(projectDir);
  const previous = config.permissions[key];
  const next: WorkflowConfig = {
    ...config,
    permissions: {
      ...config.permissions,
      [key]: value,
    },
  };

  writeFileSync(getConfigPath(projectDir), JSON.stringify(next, null, 2));
  appendHistory(projectDir, {
    type: "config.permission_updated",
    key,
    previous,
    next: value,
  });

  return next;
}

export function setAutomationMode(projectDir: string, mode: AutomationMode) {
  const config = readWorkflowConfig(projectDir);
  const previous = config.automation.mode;
  const next: WorkflowConfig = {
    ...config,
    automation: {
      ...config.automation,
      mode,
    },
  };

  writeFileSync(getConfigPath(projectDir), JSON.stringify(next, null, 2));
  appendHistory(projectDir, {
    type: "config.automation_mode_updated",
    previous,
    next: mode,
  });

  return next;
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

export function buildGateSummary(projectDir: string) {
  const state = buildStateSummary(projectDir);

  const specGate = state.documents.product_spec;
  const planGate = state.documents.dev_plan;
  const reviewGate = state.review.status === "clean";
  const releaseGate =
    state.review.status === "clean" &&
    (state.phase.status === "verified" || state.phase.status === "completed");

  return {
    specGate,
    planGate,
    reviewGate,
    releaseGate,
    blockedReasons: [
      !specGate ? "缺少 Product-Spec.md" : null,
      !planGate ? "缺少 DEV-PLAN.md" : null,
      !reviewGate ? "仍有待 review 的代码变更" : null,
      !releaseGate ? "未满足 release gate（review 或 phase 未完成）" : null,
    ].filter(Boolean),
  };
}

export function buildFallbackCommand(
  projectDir: string,
  dispatch: ReturnType<typeof buildDispatchCommand>,
  fallbackAgent: ExecutableAgent,
  prompt?: string,
) {
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
