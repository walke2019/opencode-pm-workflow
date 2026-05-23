/**
 * pm-workflow 内置主题数据。
 *
 * 设计约束（与"稳定任务域"治理原则一致）：
 * - 6 个 agent 的语义 ID 永不可改：pm_lead / pm_advisor / pm_backend /
 *   pm_frontend / pm_reviewer / pm_researcher。
 * - 主题只换"皮肤"：display_name / description / body 文案；
 *   model / mode / permission / fallback_models 由 apply 时的 preserveExisting 守护。
 * - default 主题 = 中性专业表述，是其他主题缺漏角色时的兜底。
 *
 * 新增主题原则：
 * - 必须给齐全部 6 个 agent 的皮肤；少一个就退到 default。
 * - display_name ≤ 12 字；description ≤ 60 字；body 保留"职责 + 权限 + 边界"三段语义。
 * - 不引入歧视性、宗教冒犯性或政治敏感内容。
 */
import type { AgentThemeDefinition, AgentThemeId, DispatchAgent } from "./types.js";
/** pm-workflow 维护的固定 6 个语义 agent。 */
export declare const FIXED_AGENT_IDS: DispatchAgent[];
export declare function listBuiltinThemes(): AgentThemeDefinition[];
export declare function getBuiltinTheme(id: AgentThemeId): AgentThemeDefinition | undefined;
export declare function getDefaultTheme(): AgentThemeDefinition;
