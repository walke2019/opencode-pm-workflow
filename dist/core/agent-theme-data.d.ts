/**
 * pm-workflow 内置主题数据。
 *
 * 设计约束（与"稳定任务域"治理原则一致）：
 * - 6 个 agent 的语义 ID 永不可改：commander / advisor / backendcoder /
 *   designer / fixer / writer。
 * - 主题只换"皮肤"：display_name / description / body 文案；
 *   model 由 pmw models init 单独管，主题不写 model 字段。
 * - 但 mode / temperature / permission 由主题数据**强制声明**：
 *   - mode：commander = primary，其他 = subagent（OpenCode 切换列表只显示 commander）
 *   - temperature：按角色调优
 *   - permission：按角色控制 edit/bash/webfetch/task 的细粒度权限
 *   这些都是 pm-workflow 路由设计的核心，preserveExisting 不影响。
 *
 * 6 个 agent 的能力边界与权限（rc.8 起）：
 *
 * | Agent        | mode      | temp | edit  | bash | webfetch | task            |
 * |--------------|-----------|------|-------|------|----------|-----------------|
 * | commander    | primary   | 0.2  | ask   | ask  | allow    | 严格白名单      |
 * | advisor      | subagent  | 0.3  | deny  | allow| allow    | -               |
 * | backendcoder | subagent  | 0.2  | allow | allow| ask      | -               |
 * | designer     | subagent  | 0.4  | allow | allow| ask      | -               |
 * | fixer        | subagent  | 0.1  | allow | allow| ask      | -               |
 * | writer       | subagent  | 0.3  | allow | 细粒度| allow   | -               |
 *
 * commander 的 task 白名单（防止 LLM 调用 6 个固定 agent 之外的任意 agent）：
 *   "*": deny
 *   advisor / backendcoder / designer / fixer / writer: allow（pm-workflow 6 个固定）
 *   explore / scout: allow（OpenCode 内置只读子代理，增强体验）
 *
 * 新增主题原则：
 * - 必须给齐全部 6 个 agent 的皮肤；少一个就退到 default。
 * - display_name ≤ 12 字；description ≤ 60 字。
 * - body 完整系统 prompt（≥ 60 行），含核心职责 / 工作流程 / 输出格式 / 边界 / 错误处理。
 * - 不引入歧视性、宗教冒犯性或政治敏感内容。
 */
import type { AgentThemeDefinition, AgentThemeId, DispatchAgent } from "./types.js";
/** pm-workflow 维护的固定 6 个语义 agent。 */
export declare const FIXED_AGENT_IDS: DispatchAgent[];
export declare function listBuiltinThemes(): AgentThemeDefinition[];
export declare function getBuiltinTheme(id: AgentThemeId): AgentThemeDefinition | undefined;
export declare function getDefaultTheme(): AgentThemeDefinition;
