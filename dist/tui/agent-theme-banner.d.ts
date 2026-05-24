import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
type TuiApi = Parameters<NonNullable<TuiPluginModule["tui"]>>[0];
export interface AgentThemeBannerHelpers {
    /**
     * 启动 toast — 显示当前主题与 6 个 agent 的角色名映射。
     * 5 秒展示。
     */
    showStartupBanner: (duration?: number) => void;
    /**
     * 用户主动查询 toast — 列出全部 6 个 agent 的 display_name。
     * 8 秒展示，便于阅读。
     */
    showAgentRosterToast: (duration?: number) => void;
    /**
     * 单个 agent 信息 toast — 用户 hover / 关注某个 agent 时调用。
     */
    showSingleAgentToast: (agentId: string, duration?: number) => void;
}
/**
 * 创建 agent 主题名 banner / toast 工具集。
 * 由 src/tui/plugin.ts 在 plugin 装配阶段调用，注入到 commands 里供用户触发。
 */
export declare function createAgentThemeBanner(api: TuiApi): AgentThemeBannerHelpers;
export {};
