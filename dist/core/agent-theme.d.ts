/**
 * Agent 主题（agent-theme）：把 6 个固定语义 agent 包装成不同"皮肤"显示名。
 *
 * 关键约束（与"稳定任务域"治理原则一致）：
 * - 主题只影响 frontmatter `description` / `display_name` / `theme` 与 body 文案。
 * - 永不影响语义 ID（commander / backendcoder / ...）、dispatch 路由、history 记录、
 *   permission 规则、retry/fallback 链路。
 * - 用户已配置的 model / mode / permission / fallback_models / temperature 字段
 *   在 apply 时默认保留（preserveExisting）。
 *
 * 不做的事情：
 * - 不引入网络请求；主题数据全部内置。
 * - 不修改 dispatch_map；主题切换不破坏路由锚点。
 * - 不写 history.jsonl；主题切换是 UX 层动作。
 *
 * 该模块是 1.0.0-rc.2 的核心新增能力，与 0.10.0 的 agent-library 共存：
 * - agent-library 负责"agent 维度的工具"（list / promote / doctor）。
 * - agent-theme 负责"主题维度的工具"（list / preview / apply）。
 */
import type { AgentThemeId, AgentThemePreserveExisting, AgentThemeWriteScope, ApplyAgentThemeInput, ApplyAgentThemeResult, DispatchAgent, RenderedAgentMd } from "./types.js";
export interface AgentThemeOverrideInput {
    projectDir: string;
    scope: AgentThemeWriteScope;
    names: Partial<Record<DispatchAgent, string>>;
    targetDirOverride?: string;
    dryRun?: boolean;
}
export interface AgentThemeOverrideResult {
    scope: AgentThemeWriteScope;
    targetDir: string;
    dryRun: boolean;
    updated: Array<{
        agent: DispatchAgent;
        filePath: string;
        displayName: string;
        exists: boolean;
        content?: string;
    }>;
    skipped: Array<{
        agent: string;
        reason: string;
    }>;
}
export interface IRepairAgentInstallInput {
    projectDir: string;
    scope: AgentThemeWriteScope;
    themeId?: AgentThemeId;
    targetDirOverride?: string;
    dryRun?: boolean;
}
export interface IRepairAgentInstallResult {
    ok: boolean;
    scope: AgentThemeWriteScope;
    themeId: AgentThemeId;
    targetDir: string;
    legacyDir: string;
    backupDir: string;
    dryRun: boolean;
    backedUp: Array<{
        filePath: string;
        backupPath: string;
        reason: string;
    }>;
    removed: string[];
    written: RenderedAgentMd[];
    skipped: Array<{
        agent: DispatchAgent;
        reason: string;
    }>;
    warnings: string[];
}
/** 列出所有内置主题的元数据（id / label / summary）。 */
export declare function listAgentThemes(): Array<{
    id: AgentThemeId;
    label: string;
    summary: string;
    roleCount: number;
}>;
/**
 * 推导某 scope 对应的目标目录。
 * - global → ~/.config/opencode/agents（XDG_CONFIG_HOME 优先）
 * - project → <projectDir>/.opencode/agents
 */
export declare function resolveThemeTargetDir(scope: AgentThemeWriteScope, projectDir: string): string;
/**
 * 应用主题：渲染 6 个 agent 的 md 文件，按 scope 写入目标目录。
 *
 * 默认行为：
 * - dryRun = false：渲染并写文件；返回 written/skipped 列表。
 * - dryRun = true：渲染但不写；返回的 written 列表里 content 字段可被前端预览。
 *
 * 错误处理：
 * - 主题不存在 → throw（CLI 层捕获并展示候选）。
 * - 写文件失败 → 该 agent 进 skipped，附带 reason，其他 agent 继续。
 */
export declare function applyAgentTheme(input: ApplyAgentThemeInput): ApplyAgentThemeResult;
/**
 * 预览主题：纯计算，不写盘。等价于 applyAgentTheme({ dryRun: true })，
 * 但更适合 CLI / UI 直接渲染。
 */
export declare function previewAgentTheme(input: ApplyAgentThemeInput): ApplyAgentThemeResult;
/**
 * 修复已安装用户的 agent 残留：
 * - 备份旧 ID（pm_lead 等）与 legacy `.opencode/agent` / `~/.config/opencode/agent` 残留；
 * - 用当前主题重写 6 个官方 agent md；
 * - 清掉 md frontmatter 内的 model / fallback_models，避免覆盖 OpenCode 官方
 *   `opencode.json.agent.<id>.model` 配置。
 */
export declare function repairAgentInstall(input: IRepairAgentInstallInput): IRepairAgentInstallResult;
/** 单纯渲染一个 agent 的内容文本（测试与展示用，不写盘）。 */
export declare function renderAgentMdForTheme(input: {
    agent: DispatchAgent;
    themeId: AgentThemeId;
    filePath?: string;
    preserveExisting?: Partial<AgentThemePreserveExisting>;
}): RenderedAgentMd;
/**
 * 局部覆盖已有 agent md 的 `display_name`。用于"只改几个人物名"的场景，
 * 不重渲染整套主题，也不改语义 ID / mode / permission / model。
 */
export declare function applyAgentThemeOverrides(input: AgentThemeOverrideInput): AgentThemeOverrideResult;
