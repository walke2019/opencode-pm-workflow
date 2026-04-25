import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import { registerPmWorkflowCommands } from "./commands.js";
import { createToastHelpers } from "./toasts.js";

function getProjectDir() {
  return process.cwd();
}

export const plugin: TuiPluginModule = {
  id: "pm-workflow-plugin-tui",
  tui: async (api) => {
    const projectDir = getProjectDir();
    const toasts = createToastHelpers(api, projectDir);

    setTimeout(() => {
      toasts.showProjectStageToast(4500);
      toasts.showReviewGateToast(5500);
      toasts.showDispatchToast(6500);
    }, 1500);

    registerPmWorkflowCommands(api, toasts);
  },
};

export default plugin;
