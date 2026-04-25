import type { DispatchAgent, ReviewStatus, WorkflowStage, WorkflowState } from "./types.js";
export declare function detectDocs(projectDir: string): {
    product_spec: boolean;
    design_brief: boolean;
    dev_plan: boolean;
};
export declare function detectHasCode(projectDir: string): boolean;
export declare function defaultRetryState(): WorkflowState["retry"];
export declare function defaultFallbackState(): WorkflowState["fallback"];
export declare function inferStage(projectDir: string, reviewStatus?: ReviewStatus): WorkflowStage;
export declare function inferStageLabel(stage: WorkflowStage): "全新项目" | "Spec 已完成" | "Design 已完成" | "Plan 已完成" | "项目开发中" | "等待代码审查" | "准备发布" | "已发布" | "维护中";
export declare function inferNextStep(stage: WorkflowStage): "使用 pm-workflow 收集产品需求" | "生成 DEV-PLAN.md 或继续补设计规范" | "生成 DEV-PLAN.md 或开始设计图制作" | "开始执行开发" | "继续开发、审查、修复或发布" | "先完成 code review，再继续推进 phase 或 release" | "执行 release 检查并发布" | "进入维护或下一轮迭代" | "继续修复、迭代或规划下一阶段";
export declare function inferReviewStatus(projectDir: string): ReviewStatus;
export declare function createInitialState(projectDir: string): WorkflowState;
export declare function readState(projectDir: string): WorkflowState;
export declare function writeState(projectDir: string, state: WorkflowState): void;
export declare function syncState(projectDir: string, partial?: Partial<WorkflowState>): WorkflowState;
export declare function buildStateSummary(projectDir: string): {
    stageLabel: string;
    nextStep: string;
    version: number;
    project: {
        root: string;
        name: string;
    };
    stage: WorkflowStage;
    phase: {
        current: string | null;
        status: import("./types.js").PhaseStatus;
    };
    task: {
        current: string | null;
        status: import("./types.js").TaskStatus;
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
        status: import("./types.js").ReleaseStatus;
        last_check_at: string | null;
    };
    session: {
        preferred_session_id: string | null;
        last_agent: string | null;
    };
    retry: {
        status: import("./types.js").RetryStatus;
        action: import("./types.js").DispatchAction | null;
        attempts: number;
        max_attempts: number;
        last_error: string | null;
        last_exit_code: number | null;
    };
    fallback: {
        status: import("./types.js").FallbackStatus;
        from_agent: import("./types.js").ExecutableAgent | null;
        to_agent: import("./types.js").ExecutableAgent | null;
        action: import("./types.js").DispatchAction | null;
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
export declare function setPreferredSession(projectDir: string, sessionID: string): WorkflowState;
export declare function setLastAgent(projectDir: string, agent: DispatchAgent): WorkflowState;
