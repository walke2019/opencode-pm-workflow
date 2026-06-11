import serverPlugin from "./server.js";
import { plugin as pmWorkflowTuiPlugin } from "./tui.js";
export * from "./orchestrator/index.js";
export * from "./shared.js";
export declare const pmWorkflowServerPlugin: {
    id: string;
    server: import("@opencode-ai/plugin").Plugin;
};
export declare const pmWorkflowTuiPluginCompat: import("@opencode-ai/plugin/tui").TuiPluginModule;
export { pmWorkflowTuiPlugin };
export default serverPlugin;
