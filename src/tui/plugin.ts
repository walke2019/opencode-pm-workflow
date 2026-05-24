import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { registerPmWorkflowCommands } from "./commands.js";
import { createToastHelpers } from "./toasts.js";

/**
 * 推断 TUI plugin 的项目目录。与 server runtime.getProjectDir 同样的兜底策略：
 * 跳过空字符串 / "/" / "\"，最终回退到 `<home>/.cache/pm-workflow/global`，
 * **永不返回 `/`**。跨平台用 Node `os.homedir()` 与 `os.tmpdir()`：
 *
 *   macOS:   /Users/<user>/.cache/pm-workflow/global
 *   Linux:   /home/<user>/.cache/pm-workflow/global
 *   Windows: C:\Users\<user>\.cache\pm-workflow\global
 *
 * 必要性：OpenCode TUI 在 system service 模式下 cwd 也可能是 `/`，旧版
 * `worktree || directory || process.cwd()` 会让所有依赖 projectDir 的 IO 操作
 * 失败（参见 1.0.0-rc.4 修复 server.runtime.getProjectDir 同样问题）。
 */
function getProjectDir(
  api: Parameters<NonNullable<TuiPluginModule["tui"]>>[0],
) {
  const candidates = [
    api.state.path.worktree,
    api.state.path.directory,
    process.cwd(),
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (trimmed === "/" || trimmed === "\\") continue;
    return trimmed;
  }
  const home = homedir();
  if (home && home !== "/" && home !== "\\") {
    return join(home, ".cache", "pm-workflow", "global");
  }
  return join(tmpdir(), "pm-workflow-global");
}

export const plugin: TuiPluginModule = {
  id: "pm-workflow-plugin-tui",
  tui: async (api) => {
    const projectDir = getProjectDir(api);
    const toasts = createToastHelpers(api, projectDir);

    // 注：rc.14 起的 agent 主题 banner 已搬到 server 侧（src/server/agent-theme-banner.ts）
    // 经 rc.15 实测：OpenCode 1.15 不支持外部 npm plugin 注册 TUI hook，
    // 所以本 TUI plugin 文件实际上不会被 OpenCode 加载——保留是为了兼容
    // 未来 OpenCode 升级支持外部 TUI plugin 时直接可用。

    setTimeout(() => {
      toasts.showProjectStageToast(4500);
      toasts.showReviewGateToast(5500);
      toasts.showDispatchToast(6500);
    }, 1500);

    registerPmWorkflowCommands(api, toasts);
  },
};

export default plugin;
