/**
 * Server-side agent 主题 banner（1.0.0-rc.16 起）
 *
 * rc.14 在 src/tui/agent-theme-banner.ts 实现 toast banner，但需要
 * OpenCode TUI plugin 注册——经 rc.15 实测，OpenCode 1.15 当前**不支持**
 * 外部 npm plugin 注册 TUI hook（所有 service=tui.plugin 都是 internal:*）。
 *
 * rc.16 改用 server plugin 的 SDK 调用：`client.tui.showToast({...})`
 * 直接从 server 侧 push toast 到 OpenCode TUI。这条路径已在 OpenCode 1.15
 * 验证可用（v1 SDK 的 client.tui.showToast 是公开 API）。
 *
 * 设计原则：
 * - 只读：从 ~/.config/opencode/agents/<id>.md 读 frontmatter，不修改
 * - 容错：agent md 不存在 / 字段缺失时优雅降级（不弹 banner）
 * - 不阻塞：toast 调用失败也不影响 plugin 加载
 */
interface AgentDisplayInfo {
    /** agent ID，例如 commander / designer */
    id: string;
    /** frontmatter display_name，例如 "诸葛亮" / "主协调官"；缺则等于 id */
    displayName: string;
    /** frontmatter theme，例如 "sanguo" / "default"；缺则空字符串 */
    theme: string;
}
/**
 * 读取 6 个固定 agent 的 display_name + theme。
 * 缺失文件 / 缺字段时优雅降级（不抛错）。
 */
export declare function readGlobalAgentsDisplayInfo(): AgentDisplayInfo[];
/**
 * 构造 banner toast 内容。
 *
 * 行为：
 * - 6 个 agent 全部存在 + 全有 display_name → 显示 "主题：X" + 6 个角色名映射
 * - 任意一个 display_name 与 id 相同（说明该 agent 没主题化）→ 仍显示，但只列出有主题的部分
 * - infos 为空（agents 目录不存在 / 6 个 md 都没装）→ 返回 null（不弹 banner）
 */
export declare function buildAgentThemeBannerContent(infos: AgentDisplayInfo[]): {
    title: string;
    message: string;
} | null;
/**
 * Server-side banner 调用入口：在 plugin first activation 后调一次。
 *
 * 接受任意带 `tui.showToast` 方法的 client（OpenCode SDK v1 client 类型，
 * 我们不强类型化避免 plugin 包体绑定 SDK 版本）。
 *
 * 行为：
 * - 读 agent md → 构造内容 → 调 showToast
 * - 任何一步失败都静默吞掉（不阻塞 plugin 加载）
 * - 6 个 agent md 不存在时直接返回，不弹 banner（避免新装用户被空 banner 打扰）
 */
export declare function showAgentThemeBanner(input: {
    client: {
        tui: {
            showToast: (params: {
                directory?: string;
                workspace?: string;
                title?: string;
                message?: string;
                variant?: "info" | "success" | "warning" | "error";
                duration?: number;
            }) => Promise<unknown>;
        };
    };
    /** 默认 6500ms。toast 自动消失时间。 */
    duration?: number;
}): Promise<{
    shown: boolean;
    reason?: string;
}>;
export {};
