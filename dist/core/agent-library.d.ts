/**
 * 0.10.0：跨项目共享 agent 库（长期路线 §7.3）。
 *
 * 设计目标：
 * - 在已有的"项目 .opencode/agents/* > 全局 ~/.config/opencode/agents/* > legacy > fallback"
 *   四级解析体系上，提供三件套工具：list / promote / doctor，方便用户
 *   维护跨项目共享的 agent 库。
 * - 完全本地操作；不引入网络分发；不触碰 OpenCode 主循环。
 *
 * 提供能力：
 * - `listAgentLibrary`：列出项目级与全局级所有 agent，识别"项目覆盖全局"关系。
 * - `promoteProjectAgentToGlobal`：把项目级 agent 复制到全局，便于跨项目复用。
 * - `doctorAgentLibrary`：检查 frontmatter 完整性（description / mode / model /
 *   permission.task），返回结构化 findings。
 *
 * 不做的事情：
 * - 不实现 agent 名称重命名 / 删除。删除是用户决定的事。
 * - 不发布到任何远端 marketplace；这是本地工具增强。
 * - 不修改 dispatch_map；agent 库与运行时路由互不依赖。
 */
export type AgentLibraryEntry = {
    /** agent id（不含 .md 扩展名） */
    id: string;
    /** 解析后绝对路径 */
    filePath: string;
    /** 来源：项目级或全局级 */
    source: "project" | "global";
    /** frontmatter 关键字段（缺则 undefined） */
    description?: string;
    mode?: string;
    model?: string;
    /** frontmatter 是否声明了 permission.task */
    hasTaskPermission: boolean;
    /** frontmatter 完整性 finding（空数组表示完整） */
    findings: AgentLibraryFinding[];
};
export type AgentLibraryFinding = {
    severity: "warn" | "info";
    field: "description" | "mode" | "model" | "permission.task";
    message: string;
};
export type AgentLibraryReport = {
    /** 全部 agent，按 id 排序 */
    agents: AgentLibraryEntry[];
    /** 项目级 agent id（与 global 同名时优先项目） */
    projectAgents: string[];
    /** 全局级 agent id */
    globalAgents: string[];
    /** 项目覆盖了全局的 agent id */
    shadowedGlobals: string[];
};
/**
 * 列出项目级 + 全局级所有 agent。同名时按"项目优先"原则归类，并标注 shadow。
 */
export declare function listAgentLibrary(projectDir: string): AgentLibraryReport;
export type PromoteAgentResult = {
    ok: true;
    from: string;
    to: string;
    overwritten: boolean;
} | {
    ok: false;
    reason: string;
};
/**
 * 把项目级 agent 复制到全局，便于跨项目复用。
 *
 * 安全规则：
 * - 项目级文件不存在 → 拒绝；不会创建空的全局 agent。
 * - 全局已有同名 → 默认拒绝；要求显式 `overwrite: true` 才覆盖。
 * - 不删除项目级原文件；让用户自己决定是否在 project 保留覆盖版本。
 */
export declare function promoteProjectAgentToGlobal(input: {
    projectDir: string;
    agentId: string;
    overwrite?: boolean;
}): PromoteAgentResult;
export type AgentLibraryDoctorReport = {
    totalAgents: number;
    totalFindings: number;
    agentsWithFindings: number;
    byField: Record<string, number>;
    bySeverity: Record<string, number>;
    details: Array<{
        id: string;
        source: "project" | "global";
        findings: AgentLibraryFinding[];
    }>;
};
/**
 * 检查所有 agent 的 frontmatter 完整性，返回聚合 + 明细两部分。
 *
 * 默认严格度：缺 description / mode 为 warn；缺 model 与 primary 缺
 * permission.task 为 info（不强制）。findings 是诊断建议，**不是错误**。
 */
export declare function doctorAgentLibrary(projectDir: string): AgentLibraryDoctorReport;
