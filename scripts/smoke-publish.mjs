const checks = [
  {
    path: "../dist/index.js",
    validate: (mod) =>
      typeof mod.default?.server === "function" &&
      typeof mod.pmWorkflowServerPlugin?.server === "function",
  },
  {
    path: "../dist/server.js",
    validate: (mod) =>
      typeof mod.default?.server === "function" &&
      typeof mod.PmWorkflowPlugin === "function",
  },
  {
    path: "../dist/tui.js",
    validate: (mod) =>
      typeof mod.default?.tui === "function" &&
      typeof mod.plugin?.tui === "function",
  },
  {
    path: "../dist/shared.js",
    validate: (mod) =>
      typeof mod.buildDispatchPlan === "function" &&
      typeof mod.readWorkflowConfig === "function",
  },
];

for (const check of checks) {
  const mod = await import(new URL(check.path, import.meta.url));
  if (!check.validate(mod)) {
    throw new Error(`smoke check failed for ${check.path}`);
  }
}

console.log("publish smoke checks passed");
