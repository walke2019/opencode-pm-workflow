/**
 * 0.7.0：声明式路由（permission.task）。
 *
 * 设计目标：
 * - 把 `pm_lead → specialist` 路由的真相从代码（`config.agents.dispatch_map`）迁到
 *   agent frontmatter，让用户改一份 markdown 就能定制路由，而不需要改代码。
 * - 完整向后兼容：有 frontmatter `permission.task` 时优先使用；没有则回退到
 *   现有 `dispatch_map`；都没有时回退到默认（self-route）。
 *
 * frontmatter 形式（与 OpenCode 1.15.x 官方约定保持一致）：
 *
 *   ---
 *   description: PM 主协调官
 *   mode: primary
 *   permission:
 *     task:
 *       pm_backend: allow
 *       pm_frontend: allow
 *       pm_reviewer: allow
 *       pm_researcher: deny
 *   ---
 *
 * 其中 value 为 `allow` / `deny` / `ask`：
 * - `allow`：该 primary 可以分派到这个 subagent；
 * - `deny`  / 缺省 false：禁止；
 * - `ask`：需要人工确认（pm-workflow 当前等价于 `allow`，由 OpenCode 自身确认面板拦截）。
 *
 * 不做的事情：
 * - 不解析任意复杂 YAML；只支持 `permission.task` 这一项简单 map。
 * - 不删除 `dispatch_map`；它仍是官方支持的运行时覆盖手段。
 */
export type TaskPermissionValue = "allow" | "deny" | "ask";
export type AgentTaskPermission = Partial<Record<string, TaskPermissionValue>>;
export type ResolvedAgentRouting = {
    /** primary agent id（即 frontmatter 来源的 agent，如 `pm_lead`） */
    primaryAgent: string;
    /** primary 允许分派的 subagent 列表（`allow` 与 `ask` 都计入） */
    allowedSubagents: string[];
    /** primary 明确禁止的 subagent 列表 */
    deniedSubagents: string[];
    /** frontmatter 完整的 permission.task map */
    taskPermission: AgentTaskPermission;
    /** 解析来源；当 frontmatter 缺失时为 `none` */
    source: "project" | "global" | "none";
    /** 原始 markdown 路径，便于排障 */
    filePath?: string;
};
/**
 * 把 frontmatter 解析为 `{ permission: { task: {...} } }`-like 对象。
 *
 * 算法：
 * - 一行 `key: value` → 顶层 `key` = value
 * - 一行 `key:` 后接缩进行 `  childKey: childValue` → `key` = { childKey: childValue }
 * - 进一步缩进的孙节点同理（仅支持到第三层）
 *
 * 容错：解析失败的行直接跳过，不抛异常；保证 markdown 编辑错误不会拖垮整个 dispatch。
 */
export declare function parseFrontmatterTaskPermission(raw: string): {
    taskPermission: AgentTaskPermission;
};
/**
 * 解析某个 primary agent（如 `pm_lead`）的声明式路由。
 *
 * 优先 project agents，再 global；都没有时返回 `source: "none"`，调用方应回退到
 * `dispatch_map` 或默认 self-route。
 */
export declare function resolveAgentTaskRouting(input: {
    projectDir: string;
    primaryAgent: string;
}): ResolvedAgentRouting;
/**
 * 综合判断 primary 是否被允许把任务委派给 candidate。
 *
 * 优先级：
 * 1. frontmatter `permission.task[candidate] === "deny"` → 拒绝
 * 2. frontmatter `permission.task[candidate] === "allow" | "ask"` → 允许
 * 3. frontmatter 没声明该 candidate → 由 fallbackAllow 决定（默认 true，保持向后兼容）
 *
 * 这样新增 frontmatter 是"显式规则"，旧项目无 frontmatter 时一切照旧。
 */
export declare function isSubagentAllowedByDeclarativeRouting(input: {
    routing: ResolvedAgentRouting;
    candidate: string;
    fallbackAllow?: boolean;
}): {
    allowed: boolean;
    reason: string;
};
