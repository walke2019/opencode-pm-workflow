/**
 * pm-workflow 内置主题数据。
 *
 * 设计约束（与"稳定任务域"治理原则一致）：
 * - 6 个 agent 的语义 ID 永不可改：commander / advisor / backendcoder /
 *   designer / fixer / writer。
 * - 主题只换"皮肤"：display_name / description / body 文案；
 *   model / mode / permission / fallback_models 由 apply 时的 preserveExisting 守护。
 *   但 mode 字段本身**由主题数据强制声明**——commander = primary，其他 = subagent，
 *   防止 OpenCode 切换列表显示全部 6 个 agent（rc.6 关键 UI 修复）。
 * - default 主题 = 中性专业表述，是其他主题缺漏角色时的兜底。
 *
 * 新增主题原则：
 * - 必须给齐全部 6 个 agent 的皮肤；少一个就退到 default。
 * - display_name ≤ 12 字；description ≤ 60 字；body 保留"职责 + 权限 + 边界"三段语义。
 * - 不引入歧视性、宗教冒犯性或政治敏感内容。
 *
 * 6 个 agent 的能力边界：
 * - commander    主控、决策、协调、分派 (primary)
 * - advisor      调研、分析、拆解、决策顾问 (subagent)
 * - backendcoder 后端代码：API、数据库、服务、性能 (subagent)
 * - designer     设计 + 前端代码 + 交互原型 + 图像生成 (subagent)
 * - fixer        测试 + 修复 + 打包 + 部署 + CI/CD (subagent)
 * - writer       文档撰写 + 发布说明 + 注释 + ADR (subagent)
 */
import type { AgentThemeDefinition, AgentThemeId, DispatchAgent } from "./types.js";
/** pm-workflow 维护的固定 6 个语义 agent。 */
export declare const FIXED_AGENT_IDS: DispatchAgent[];
export declare function listBuiltinThemes(): AgentThemeDefinition[];
export declare function getBuiltinTheme(id: AgentThemeId): AgentThemeDefinition | undefined;
export declare function getDefaultTheme(): AgentThemeDefinition;
