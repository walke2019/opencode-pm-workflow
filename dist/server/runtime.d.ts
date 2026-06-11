import type { PluginInput } from "@opencode-ai/plugin";
import { buildDispatchCommand } from "../shared.js";
import type { DispatchCommand, EvaluationResult } from "../core/types.js";
import { type FallbackPlanRuntime } from "../core/fallback-runtime.js";
export type LogLevel = "debug" | "info" | "warn" | "error";
export type OpenCodeClient = {
    app?: {
        log?: (payload: {
            body: {
                service: string;
                level: LogLevel;
                message: string;
                extra?: Record<string, unknown>;
            };
        }) => Promise<unknown> | unknown;
    };
};
export type PluginContext = Partial<Pick<PluginInput, "project" | "client" | "directory" | "worktree" | "$" | "serverUrl">> & {
    client?: OpenCodeClient;
    directory?: string;
    worktree?: string;
};
export type EventPayload = {
    event?: {
        type?: string;
        properties?: Record<string, unknown>;
    };
};
export type ToolInput = {
    tool?: string;
    args?: Record<string, unknown>;
};
export type ToolOutput = {
    args?: Record<string, unknown>;
    title?: string;
    output?: string;
    metadata?: unknown;
    result?: unknown;
};
export type TuiPromptOutput = {
    prompt?: string;
};
export type DispatchExecutionResult = {
    status: number | null;
    stdout: string;
    stderr: string;
    /**
     * 当 ForegroundFallback 触发并切换到了备选模型时，会带上完整的降级链路记录。
     *
     * - `attempts`：所有尝试过的子进程结果（按时间顺序，含原始尝试与降级尝试）
     * - `usedFallback`：是否真正切到了备选 model（区别于"识别出限流但链路已耗尽"）
     * - `finalModel`：最后真正用于执行的 model id（如未切换则为 undefined）
     */
    fallback?: {
        usedFallback: boolean;
        finalModel?: string;
        attempts: Array<{
            model?: string;
            exitCode: number;
            plan: FallbackPlanRuntime;
        }>;
    };
};
export declare function executeDispatchCommand(projectPath: string, dispatch: ReturnType<typeof buildDispatchCommand>, prompt: string): DispatchExecutionResult;
export declare function buildAutoContinueDispatch(projectDir: string, prompt: string, evaluation: EvaluationResult): DispatchCommand | undefined;
/**
 * OpenCode 全局配置目录。
 *
 * 跨平台统一规则（与 OpenCode 官方文档对齐）：
 * - macOS/Linux: `~/.config/opencode/`
 * - Windows:    `%USERPROFILE%\.config\opencode\`
 *
 * 注意：OpenCode 在 Windows 上**不用** `%APPDATA%`，而是统一用 `%USERPROFILE%\.config\`，
 * 跟 Linux 风格一致。这与传统 Windows 应用习惯不同。
 *
 * 实现策略：用 Node `os.homedir()` 跨平台拿 home 目录（macOS = "/Users/...", Linux =
 * "/home/...", Windows = "C:\Users\..."），再 join `.config/opencode`，无需平台分支。
 */
export declare function getConfigDir(): string;
/**
 * 推断 plugin 工作的"项目目录"。
 *
 * OpenCode 的 PluginInput 在以下场景里会传入空字符串或根目录：
 * - 用户在非 git 目录启动 OpenCode（worktree 解析失败）
 * - `ctx.project.id === "global"`（OpenCode 文档明说会发生）
 * - OpenCode server 在系统服务模式下 cwd === "/"
 *
 * 简单 `ctx.worktree || ctx.directory || process.cwd()` 在以上场景里会得到 `/`，
 * 然后 `join("/", ".pm-workflow")` = `/.pm-workflow`，mkdir 立刻 ENOENT，整个插件
 * 装配 abort（参见 OpenCode log 中的 "mkdir '/.pm-workflow' failed to load plugin"）。
 *
 * 正确的兜底：
 * 1. ctx.worktree（非空且非 "/"）
 * 2. ctx.directory（非空且非 "/"）
 * 3. process.cwd()（非 "/"）
 * 4. fallback 到 ~/.cache/pm-workflow/global —— 这是个普通用户可写的目录，永不抛错
 */
export declare function getProjectDir(ctx: PluginContext): string;
/**
 * 通用安全 projectDir 解析。给 tool 入口（context.worktree / context.directory）
 * 与其他需要 projectDir 兜底的地方使用。
 *
 * 跨平台兼容：
 * - 跳过空字符串 / 纯空白 / "/"（POSIX 根） / "\"（Windows 根的早期形式） / 单字符
 * - 正常路径直接返回
 * - 都不可用时回退到 `<home>/.cache/pm-workflow/global`（Node `os.homedir()` 跨平台）
 * - 极端无 home 时用 `os.tmpdir()`（macOS = `/var/folders/...`, Linux = `/tmp`,
 *   Windows = `C:\Users\<user>\AppData\Local\Temp` 等系统标准临时目录）
 *
 * **永不返回 `/` 或 `\`**。
 */
export declare function resolveSafeProjectDir(...candidates: Array<string | undefined | null>): string;
export declare function log(client: OpenCodeClient | undefined, level: LogLevel, message: string, extra?: Record<string, unknown>): Promise<void>;
export declare function isCodePath(filePath: string): boolean;
export declare function writeReviewMarker(projectDir: string): void;
export declare function checkReviewGate(projectDir: string): {
    ok: boolean;
    message: string;
    markerPath: string;
};
export declare function runPreCommitCheck(projectDir: string): {
    ok: boolean;
    stdout: string;
    stderr: string;
};
export declare function extractChangedPathsFromPatch(patchText: string): string[];
export declare function buildStagePrompt(projectDir: string): string;
export declare function buildStageSummary(projectDir: string): {
    productSpec: string;
    designBrief: string;
    devPlan: string;
    stage: string;
    phase: string;
    reviewStatus: import("../shared.js").ReviewStatus;
    nextStep: string;
};
export declare function buildReviewGateSummary(projectDir: string): {
    state: string;
    message: string;
    markerPath: string;
};
export declare function buildFeedbackSignalSummary(message: string): {
    detected: boolean;
    message: string;
    detail: string;
};
