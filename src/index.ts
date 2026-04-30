import serverPlugin from "./server.js";
import tuiPlugin, { plugin as pmWorkflowTuiPlugin } from "./tui.js";
export * from "./orchestrator/index.js";
export * from "./shared.js";

export const pmWorkflowServerPlugin = serverPlugin;
export const pmWorkflowTuiPluginCompat = tuiPlugin;
export { pmWorkflowTuiPlugin };

// 为未来按包名加载保留一个稳定根入口；当前默认仍指向 server 侧入口。
export default serverPlugin;
