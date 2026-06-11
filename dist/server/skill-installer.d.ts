/**
 * Skill auto-install：把 npm 包内的 skills/*\/SKILL.md 同步到 OpenCode 标准目录
 * `~/.config/opencode/skills/<skill-id>/SKILL.md`，让 OpenCode 在启动时能自动发现并把
 * skill 注入给 AI。
 *
 * 设计原则：
 * - 一次性、幂等：内容相同就跳过；不存在就复制；已存在但内容不同**不覆盖**（避免
 *   覆盖用户自己改过的版本）。
 * - 失败不阻断插件加载：写 warning log，但不抛错。
 * - 不动 OpenCode runtime / 不写 history.jsonl / 不写 state.json；这是纯 UX 增强。
 *
 * 不做的事情：
 * - 不删除用户已有的 skill 文件，即使从 npm 包里删除了同名 skill。
 * - 不引入 yaml 依赖；只做按字节对比与拷贝。
 * - 递归同步 skill supporting files（reference/、workflows/、scripts/ 等）。
 */
export type SkillSyncOutcome = "skipped-equal" | "installed" | "user-modified" | "failed";
export interface SkillSyncFinding {
    skillId: string;
    source: string;
    target: string;
    outcome: SkillSyncOutcome;
    message?: string;
}
export interface SkillSyncReport {
    skillsDir: string;
    total: number;
    installed: number;
    skipped: number;
    userModified: number;
    failed: number;
    findings: SkillSyncFinding[];
}
/** OpenCode 标准 skill 目录：`$XDG_CONFIG_HOME/opencode/skills`，未设则 `~/.config/opencode/skills`。 */
export declare function resolveOpenCodeSkillsDir(): string;
/** 定位 npm 包内的 skills 源目录。运行时通常在 `dist/server/` 下，向上回溯到包根。 */
export declare function resolvePackageSkillsDir(): string;
/**
 * 同步包内 skills 到 OpenCode 标准目录。返回 SkillSyncReport 供 plugin 装配时打 log。
 *
 * 调用时机：plugin 首次激活（first activation）时调一次。重复装配（hot-reload）
 * 由 plugin 层的 guardPluginActivation 兜底跳过。
 */
export declare function syncPackagedSkillsToOpenCode(input?: {
    skillsSourceDir?: string;
    skillsTargetDir?: string;
}): SkillSyncReport;
