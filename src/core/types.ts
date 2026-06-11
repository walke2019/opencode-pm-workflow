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

/**
 * pm-workflow 的 6 个固定语义 agent。
 *
 * 命名规则（1.0.0-rc.6 起）：
 * - `commander`    主控、决策、协调、分派（唯一 primary，OpenCode 切换列表只显示它）
 * - `advisor`      调研、分析、拆解、决策顾问（合并自旧 advisor + researcher）
 * - `backendcoder` 后端代码（API、数据库、服务）
 * - `designer`     设计 + 前端代码 + 交互原型 + 图像生成（合并自旧 frontend + 新增 designer 职责）
 * - `fixer`        测试 + 修复 + 打包 + 部署（合并自旧 reviewer 测试侧 + 新增 deployer 职责）
 * - `writer`       文档撰写 + 发布说明 + 注释（合并自旧 reviewer 文档侧）
 *
 * 旧 ID（pm_lead / pm_advisor / pm_backend / pm_frontend / pm_reviewer / pm_researcher）
 * 在 1.0.0-rc.6 中被废弃；config / state 自动 migration（详见 src/core/agent-id-migrate.ts）。
 */
export type DispatchAgent =
  | "commander"
  | "advisor"
  | "backendcoder"
  | "designer"
  | "fixer"
  | "writer";
export type ExecutableAgent = string;

/**
 * Agent 主题：把 6 个固定语义 agent 包装成不同"皮肤"显示名。
 *
 * 关键约束（与"稳定任务域"治理原则一致）：
 * - 主题只影响 frontmatter `description` / `display_name` / `theme` 与 body 的角色称呼；
 * - 永不影响语义 ID（commander / backendcoder / ...）、dispatch 路由、history 记录、permission 规则；
 * - 用户配置的 `model` / `mode` / `permission` / `fallback_models` 字段在 apply 时默认保留（preserve_existing）。
 */
export type AgentThemeId = string;

export interface AgentThemeRoleSkin {
  /** 该 agent 在该主题下的展示名（如"诸葛亮"），不超过 12 字。 */
  display_name: string;
  /** 主题化后的角色一句话描述，进 frontmatter description。不超过 60 字。 */
  description: string;
  /** 主题化后的 body 正文。完整系统 prompt：核心职责 / 工作流程 / 输出格式 / 边界 / 错误处理。 */
  body: string;
  /**
   * OpenCode mode 字段。
   *
   * - `commander` 永远是 `primary`（OpenCode 切换列表只显示它，符合主代理设计）
   * - 其他 5 个固定 agent 永远是 `subagent`（不进切换列表，通过 task tool 被 commander 调用）
   *
   * 1.0.0-rc.6 起所有内置主题必须显式声明 mode；未声明会触发渲染时校验失败。
   * 这是核心 UX 修复——之前主题不写 mode 导致 OpenCode 默认当作 `all`，6 个 agent 全部出现在切换列表。
   */
  mode: "primary" | "subagent";
  /**
   * OpenCode temperature 字段。0.0-1.0，控制 LLM 响应的随机性。
   *
   * 1.0.0-rc.8 起按角色调优：
   * - commander 0.2（决策类，确定性优先）
   * - advisor 0.3（调研类，平衡）
   * - backendcoder 0.2（代码类，确定性）
   * - designer 0.4（设计类，需要创造力）
   * - fixer 0.1（测试类，最高确定性）
   * - writer 0.3（文档类，平衡可读性）
   */
  temperature: number;
  /** @deprecated OpenCode 1.17 起推荐只写 `permission`，新主题不再生成 `tools`。 */
  tools?: {
    write?: boolean;
    edit?: boolean;
    bash?: boolean;
    webfetch?: boolean;
    task?: boolean;
  };
  /**
   * OpenCode permission 字段。比 tools 更细粒度。
   *
   * - commander：edit/bash ask，webfetch allow，task 严格白名单
   * - advisor：edit deny（不动代码），bash/webfetch allow
   * - backendcoder/designer/fixer：edit/bash allow，webfetch ask
   * - writer：edit allow（仅文档），bash 细粒度（git log/diff/npm run docs:* allow，其他 deny），webfetch allow
   */
  permission: {
    read?: "allow" | "ask" | "deny";
    edit?: "allow" | "ask" | "deny";
    glob?: "allow" | "ask" | "deny";
    grep?: "allow" | "ask" | "deny";
    list?: "allow" | "ask" | "deny";
    bash?: "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">;
    external_directory?: "allow" | "ask" | "deny";
    todowrite?: "allow" | "ask" | "deny";
    webfetch?: "allow" | "ask" | "deny";
    websearch?: "allow" | "ask" | "deny";
    lsp?: "allow" | "ask" | "deny";
    skill?: "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">;
    question?: "allow" | "ask" | "deny";
    doom_loop?: "allow" | "ask" | "deny";
    /** 仅 commander 设；按 OpenCode glob 模式控制可调用的 subagent 白名单 */
    task?: Record<string, "allow" | "ask" | "deny">;
  };
  /**
   * OpenCode steps 字段（1.0.1 起按角色限制内部 LLM 迭代次数）。
   *
   * 防止 LLM"演戏"——commander 不调用 task tool 而在 stream 里假装多角色对话，
   * stream 累积过长被 OpenCode 服务端 terminated。
   *
   * 推荐值：
   * - commander 20（给复杂编排更多余量，同时避免无限迭代）
   * - 其他 subagent 不设（它们有具体活要干，不限制）
   *
   * 不设此字段时 OpenCode 不限步数，LLM 自由迭代到模型主动停止或 stream 超时。
   */
  steps?: number;
}

export interface AgentThemeDefinition {
  id: AgentThemeId;
  /** 主题中文名（如"三国"）。 */
  label: string;
  /** 给用户的一句话主题简介。 */
  summary: string;
  /** 6 个固定 agent 的皮肤映射；缺漏即为该 agent 走 default 兜底。 */
  roles: Partial<Record<DispatchAgent, AgentThemeRoleSkin>>;
}

/**
 * apply 时需要保留的"已有用户配置"字段集合。
 * 默认全部为 true，避免主题切换覆盖用户的模型/权限。
 */
export interface AgentThemePreserveExisting {
  model: boolean;
  mode: boolean;
  permission: boolean;
  fallback_models: boolean;
  temperature: boolean;
}

export type AgentThemeWriteScope = "global" | "project";

export interface ApplyAgentThemeInput {
  projectDir: string;
  themeId: AgentThemeId;
  scope: AgentThemeWriteScope;
  /** 默认 6 个全部应用；可指定子集只主题化部分 agent。 */
  agents?: DispatchAgent[];
  preserveExisting?: Partial<AgentThemePreserveExisting>;
  /** dry-run 模式下不写文件，只返回渲染结果。 */
  dryRun?: boolean;
  /** 覆盖目标目录（测试用，正式调用应从 scope 推导）。 */
  targetDirOverride?: string;
}

export interface RenderedAgentMd {
  agent: DispatchAgent;
  filePath: string;
  /** 完整 md 文本（含 frontmatter + body）。 */
  content: string;
  /** 目标文件已存在；apply 会写入并覆盖（保留 preserve 字段）。 */
  exists: boolean;
  /** 该 agent 在主题里没定义皮肤，走的 default 兜底。 */
  fellBackToDefault: boolean;
}

export interface ApplyAgentThemeResult {
  themeId: AgentThemeId;
  scope: AgentThemeWriteScope;
  targetDir: string;
  written: RenderedAgentMd[];
  skipped: Array<{ agent: DispatchAgent; reason: string }>;
  dryRun: boolean;
}

export type AgentDefinitionSource = "project" | "global" | "fallback";

export type AgentDirectoryKind = "agents" | "agent" | "fallback";

export interface ResolvedAgentDefinition {
  id: string;
  model?: string;
  mode?: string;
  description?: string;
  /** 主题展示名（来自 frontmatter `display_name`）。pm-workflow 自定义字段，OpenCode 忽略。 */
  displayName?: string;
  /** 主题 ID（来自 frontmatter `theme`）。pm-workflow 自定义字段，仅供展示与诊断。 */
  theme?: string;
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
 * - `speed` / `cost` / `quality`：相对于 commander 主协调的相对值（multiplier），
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
  /**
   * 自动续跑链路状态。
   *
   * - `last_step_at`：上一次自动续跑步骤完成的 ISO 时间，用于冷却判断。
   * - `steps_used`：当前链路已用步数，每次新链路启动重置为 0。
   * - `aborted_reason`：链路被强制终止的原因（用户反馈信号、Gate 阻断、超过 max_steps 等），
   *   下次启动会清零。
   */
  auto_continue: {
    last_step_at: string | null;
    steps_used: number;
    aborted_reason: string | null;
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
     * key 使用 semantic agent 名称（如 `commander`、`backendcoder`）或具体 model id。
     * value 为按优先级排列的备用模型 id 列表。
     *
     * 当上游模型出现限流（429 / rate-limit）、超时或上下文溢出错误时，
     * dispatch runtime 会自动按链路切换到下一备选 model，避免循环重试浪费 token。
     */
    chains?: Partial<Record<string, string[]>>;
  };
  /**
   * 自动续跑（Auto-continue）受控配置。
   *
   * 与 oh-my-opencode-slim 的"无 Gate 自动续跑"不同，pm-workflow 的自动续跑
   * 必须经过 Gate / Permission / Confirm 全部前置检查；任一不满足就停。
   * 这里的字段控制"在 Gate 之上还需要满足的额外约束"：
   *
   * - `enabled`：总开关；默认 `false`，必须显式打开。
   * - `max_steps`：单次连续自动推进的最大步数（含原始步）。建议 ≤ 5。
   * - `cooldown_ms`：步骤之间的最小间隔，避免瞬间烧 token。建议 ≥ 2000。
   * - `require_clean_tree`：开启时只在 git 工作树干净时自动续跑，避免覆盖未提交改动。
   * - `stop_on_feedback_signal`：检测到用户反馈型停止词（如"停下"、"不要再"）时立刻终止链路。
   */
  auto_continue: {
    enabled: boolean;
    max_steps: number;
    cooldown_ms: number;
    require_clean_tree: boolean;
    stop_on_feedback_signal: boolean;
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
    /**
     * 是否允许在 dispatch 完成后自动续跑下一步。
     * 默认 `false`：必须用户显式 `pm-set-permission allow_auto_continue true` 才生效。
     * 即便打开，仍受 `auto_continue.enabled` 与 Gate / Confirm 全部约束。
     */
    allow_auto_continue: boolean;
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
