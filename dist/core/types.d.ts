export type WorkflowStage = "idea" | "spec_ready" | "design_ready" | "plan_ready" | "development" | "review_pending" | "release_ready" | "released" | "maintenance";
export type PhaseStatus = "not_started" | "in_progress" | "blocked" | "verified" | "completed";
export type TaskStatus = "idle" | "in_progress" | "blocked" | "done";
export type ReviewStatus = "clean" | "needs_review" | "reviewing" | "blocked";
export type ReleaseStatus = "not_ready" | "blocked" | "ready" | "released";
export type RetryStatus = "idle" | "pending" | "exhausted";
export type FallbackStatus = "idle" | "used" | "exhausted";
export type AutomationMode = "off" | "observe" | "assist" | "strict";
export type DocsStorageMode = "legacy" | "project_scoped";
export type AutomationCapability = "event_sync" | "prompt_inject" | "commit_gate" | "review_marker";
export type DispatchAgent = "pm" | "plan" | "build" | "qa_engineer" | "writer";
export type ExecutableAgent = string;
export type DispatchAction = "collect-spec" | "create-design-brief" | "create-dev-plan" | "start-development" | "run-code-review" | "prepare-release" | "continue-development" | "blocked";
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
};
export type DispatchCommand = DispatchPlan & {
    executableAgent: ExecutableAgent;
    executablePrompt: string;
    command: string;
    commandArgs: string[];
};
export type ExecutionMode = "local" | "single-subagent" | "parallel-subagents";
export type ExecutionAggregationStrategy = "primary-wins" | "collect-all" | "first-success";
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
    };
    agents: {
        enabled: boolean;
        default_mode: "primary" | "subagent";
        definitions: Partial<Record<DispatchAgent, WorkflowAgentConfig>>;
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
    mode?: "primary" | "subagent";
    description?: string;
    prompt?: string;
    temperature?: number;
    top_p?: number;
    steps?: number;
    permission?: Record<string, unknown>;
    disabled?: boolean;
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
