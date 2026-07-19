import type { PluginContext } from "./runtime.js";
export interface SelfUpdateResult {
    status: "up-to-date" | "updated" | "fetch-failed" | "update-failed";
    currentVersion: string | null;
    latestVersion: string | null;
    detail?: string;
}
/** 供 plugin.ts 调用的非阻塞检查+自动更新入口 */
export declare function checkAndLogSelfUpdate(ctx: PluginContext): Promise<void>;
export declare function checkSelfUpdate(): SelfUpdateResult;
