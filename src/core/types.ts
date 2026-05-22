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

export type DispatchAgent =
  | "pm_lead"
  | "pm_advisor"
  | "pm_backend"
  | "pm_frontend"
  | "pm_reviewer"
  | "pm_researcher";
export type ExecutableAgent = string;

export type AgentDefinitionSource = "project" | "global" | "fallback";

export type AgentDirectoryKind = "agents" | "agent" | "fallback";

export interface ResolvedAgentDefinition {
  id: string;
  model?: string;
  mode?: string;
  description?: string;
  source: AgentDefinitionSource;
  directoryKind?: AgentDirectoryKind;
  filePath?: string;
  shadowedGlobal: boolean;
  usedFallback: boolean;
  fallbackReason?:
    | "missing-agent"
    | "missing-description"
    | "missing-model"
    | "missing-mode"
    | "parse-failed";
}

export interface ResolveWorkflowAgentInput {
  projectDir: string;
  semanticAgent: DispatchAgent;
}

export type DispatchAction =
  | "collect-spec"
  | "create-design-brief"
  | "create-dev-plan"
  | "start-development"
  | "run-code-review"
  | "prepare-release"
  | "continue-development"
  | "blocked";

export type TaskDomain =
  | "pm"
  | "backend"
  | "frontend"
  | "writer"
  | "qa_engineer"
  | "researcher"
  | "orchestration";

export type TaskComplexity = "simple" | "multi_step" | "composite";

export type DispatchExecutionMode =
  | "pm_direct"
  | "single_agent"
  | "serial_handoff"
  | "advisor_then_dispatch";

export type AgentInvocationMode = "primary" | "subagent" | "all";

export type DispatchInvocationSemantics = {
  mode: AgentInvocationMode;
  supportsDirectRun: boolean;
  requiresTaskPermission: boolean;
};

export interface TaskAnalysis {
  domain: TaskDomain;
  complexity: TaskComplexity;
  recommendedAgent: DispatchAgent;
  fallbackAgents: DispatchAgent[];
  executionMode: DispatchExecutionMode;
  needsDecomposition: boolean;
  rationale: string[];
  risks: string[];
  expectedNextAgents: DispatchAgent[];
  suggestedStepCount: number;
  specialistCount: number;
}

/**
 * Agent 量化能力卡片：用于 handoff packet 的"角色对比"段。
 *
 * 字段语义：
 * - `speed` / `cost` / `quality`：相对于 pm_lead 主协调的相对值（multiplier），
 *   纯文字描述（如 `"1x"` / `"2x faster"` / `"1/2 cost"`），方便 LLM 直接拿到
 *   做"是否值得再委派"的对比。
 * - `delegateWhen` / `dontDelegateWhen`：触发与禁忌条件，便于被 handoff 的角色
 *   判断"我应不应该把当前任务再分派给这个角色"。
 *
 * 这套字段仅在 handoff 多候选时注入，单候选场景不会出现，避免无意义 token 消耗。
 */
export interface AgentStatsCard {
  agent: DispatchAgent;
  role: string;
  speed: string;
  cost: string;
  quality: string;
  delegateWhen: string[];
  dontDelegateWhen: string[];
  ruleOfThumb: string;
}

export interface HandoffPacket {
  mission: string;
  context: string[];
  taskType: string;
  targetAgent: DispatchAgent;
  scope: {
    do: string[];
    dont: string[];
  };
  artifacts: string[];
  constraints: string[];
  acceptance: string[];
  deliverables: string[];
  responseFormat: string[];
  nextStepHint?: string;
  /**
   * 候选 agent 的量化对比卡片（仅在多候选场景注入）。
   * 含 1-3 张卡片，按相关性优先排序。
   */
  agentStats?: AgentStatsCard[];
}

export type EvaluationStatus =
  | "done"
  | "partial"
  | "misaligned"
  | "needs_verification";

export interface EvaluationResult {
  status: EvaluationStatus;
  summary: string;
  matchedDeliverables: string[];
  missingDeliverables: string[];
  gaps: string[];
  recommendedNextAgent?: DispatchAgent;
  recommendedNextAction?: DispatchAction;
  canAutoContinue?: boolean;
  autoContinueSafe?: boolean;
  nextAutoAction?: DispatchAction;
}

export type DispatchPlan = {
  stage: WorkflowStage;
  stageLabel: string;
  recommendedAgent: DispatchAgent;
  recommendedAction: DispatchAction;
  reason: string;
  blocked: boolean;
  blockedReasons: string[];
  preferredSession: string | null;
  nextStep: string;
  analysis?: TaskAnalysis;
};

export type DispatchCommand = DispatchPlan & {
  laneContext?: import("../commands/types.js").PmLaneContext;
  topologySummary?: import("../commands/types.js").TopologySummary;
  todoPolicy?: import("../commands/types.js").TodoPolicySummary;
  invocation?: DispatchInvocationSemantics;
  resolvedAgent?: ResolvedAgentDefinition;
  executableAgent: ExecutableAgent;
  executablePrompt: string;
  command: string;
  commandArgs: string[];
  handoffPacket?: HandoffPacket;
};

export type ExecutionMode = "local" | "single-subagent" | "parallel-subagents";

export type ExecutionAggregationStrategy =
  | "primary-wins"
  | "collect-all"
  | "first-success";

export type ExecutionPlanStep = {
  id: string;
  title: string;
  action: DispatchAction;
  agent: DispatchAgent | null;
  mode: ExecutionMode;
  dependsOn?: string[];
  parallelGroup?: string;
  timeoutMs?: number;
  retryable?: boolean;
  maxRetries?: number;
  fallbackAgent?: DispatchAgent | null;
  writesState?: boolean;
  touchesFiles?: boolean;
};

export type ExecutionPlan = {
  version: "v2";
  goal: string;
  primaryAction: DispatchAction;
  mode: ExecutionMode;
  steps: ExecutionPlanStep[];
  aggregation: {
    strategy: ExecutionAggregationStrategy;
  };
  constraints?: {
    maxParallelSubagents?: number;
    allowFallback?: boolean;
    allowRetry?: boolean;
  };
};

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
    agent_map: Partial<Record<string, string>>;
    /**
     * 运行时模型降级链（ForegroundFallback）。
     *
     * key 使用 semantic agent 名称（如 `pm_lead`、`pm_backend`）或具体 model id。
     * value 为按优先级排列的备用模型 id 列表。
     *
     * 当上游模型出现限流（429 / rate-limit）、超时或上下文溢出错误时，
     * dispatch runtime 会自动按链路切换到下一备选 model，避免循环重试浪费 token。
     */
    chains?: Partial<Record<string, string[]>>;
  };
  agents: {
    enabled: boolean;
    default_mode: "primary" | "subagent" | "all";
    dispatch_map: Partial<Record<DispatchAgent, ExecutableAgent>>;
    definitions: Partial<Record<string, WorkflowAgentConfig>>;
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

export type WorkflowAgentConfig = {
  model?: string | null;
  fallback_models?: string[];
  mode?: "primary" | "subagent" | "all";
  description?: string;
  prompt?: string;
  temperature?: number;
  top_p?: number;
  steps?: number;
  permission?: Record<string, unknown>;
  disabled?: boolean;
  hidden?: boolean;
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
