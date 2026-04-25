# opencode-pm-workflow

当前状态：已完成包内化、模块化拆分，并已具备本地 `dist` 构建与发布前校验能力。

## 目的

为当前 `pm-workflow` 提供一个可发布、可迁移的 OpenCode 插件包实现。

## 当前状态

当前包已经完成**核心运行逻辑的包内化与模块化拆分**，且已具备 `dist` 构建能力；当前运行仍通过兼容壳接入已发布包：

- `src/server.ts` → 兼容转发入口，真实装配位于 `src/server/plugin.ts`
- `src/tui.ts` → 兼容转发入口，真实装配位于 `src/tui/plugin.ts`
- `src/shared.ts` → 纯 `re-export` 入口，真实逻辑已分散到 `core/*` 与 `orchestrator/*`

这样做的目标是先把“包边界”固定下来，再逐步把实现从 `plugins/` 平滑迁入包内。

当前进度：

- server：已完成模块化（`runtime/hooks/tools/plugin`）
- tui：已完成模块化（`plugin/toasts/commands`）
- shared：已收敛为纯导出入口
- dist：已可本地构建
- 当前运行入口：`plugins/*` 兼容壳已转发到已发布包子路径入口

当前兼容壳实际链路：

- `plugins/pm-workflow-plugin.ts` -> `@weekii/opencode-pm-workflow/server`
- `plugins/pm-workflow-plugin-tui.ts` -> `@weekii/opencode-pm-workflow/tui`
- `plugins/pm-workflow-shared.ts` -> `@weekii/opencode-pm-workflow/shared`

## 当前源码结构

当前源码已经按职责分层，后续排查时建议优先按下面的目录定位：

```text
src/
├─ core/
│  ├─ config.ts
│  ├─ doctor.ts
│  ├─ gates.ts
│  ├─ history.ts
│  ├─ migration.ts
│  ├─ project.ts
│  ├─ receipts.ts
│  ├─ recovery.ts
│  ├─ state.ts
│  └─ types.ts
├─ orchestrator/
│  ├─ plan.ts
│  ├─ prompts.ts
│  └─ safety.ts
├─ server/
│  ├─ plugin.ts
│  ├─ runtime.ts
│  ├─ hooks.ts
│  └─ tools/
│     ├─ admin-tools.ts
│     ├─ diagnostic-tools.ts
│     ├─ dispatch-tools.ts
│     ├─ execution-tools.ts
│     └─ state-tools.ts
├─ tui/
│  ├─ plugin.ts
│  ├─ toasts.ts
│  └─ commands.ts
├─ index.ts
├─ server.ts
├─ shared.ts
└─ tui.ts
```

说明：

- `src/server.ts` / `src/tui.ts` 现在是兼容转发入口
- `src/server/plugin.ts` / `src/tui/plugin.ts` 是实际装配入口
- `src/shared.ts` 是集中导出入口，不再承载内联实现

## 导出约定

当前包同时提供：

- 发布主入口：`dist/index.js`
- 发布子路径入口：`./server`、`./tui`、`./shared`
- 开发源码入口：`src/index.ts`
- 兼容导出：`default`

根入口会：

- 命名导出 `pmWorkflowServerPlugin`
- 命名导出 `pmWorkflowTuiPlugin`
- 保留 `default` 指向 server 入口，便于当前阶段兼容已有加载习惯

发布时实际暴露的是：

- `package.json#main -> ./dist/index.js`
- `package.json#exports -> ./dist/*`

因此：

- `src/*` 仅用于开发与本地调试
- `dist/*` 才是发布与消费入口

## 预期使用方式

未来可以按三种方式接入：

### 1. 当前开发态：源码入口

```json
{
  "plugin": [
    "./packages/opencode-pm-workflow/src/index.ts"
  ]
}
```

适用场景：

- 本地开发
- 调试包内源码
- 不依赖 `dist` 产物时

### 2. 本地构建态：dist 入口

先构建：

```bash
npm run --prefix packages/opencode-pm-workflow prepare-publish
```

然后使用构建产物：

```json
{
  "plugin": [
    "./packages/opencode-pm-workflow/dist/index.js"
  ]
}
```

### 3. 发布后按包名接入

```json
{
  "plugin": [
    "@weekii/opencode-pm-workflow@latest"
  ]
}
```

## 构建命令

```bash
npm run --prefix packages/opencode-pm-workflow typecheck
npm run --prefix packages/opencode-pm-workflow build
npm run --prefix packages/opencode-pm-workflow prepare-publish
npm run --prefix packages/opencode-pm-workflow verify-release
npm run --prefix packages/opencode-pm-workflow check-auth
```

如果未来执行真正的：

```bash
npm publish
```

当前包还会自动触发：

```text
prepublishOnly -> npm run verify-release
```

这样可以避免在发布前跳过本地校验。

## 发布前自检

当前已验证通过：

```bash
npm run --prefix packages/opencode-pm-workflow typecheck
npm run --prefix packages/opencode-pm-workflow build
npm pack --dry-run --prefix packages/opencode-pm-workflow
```

当前与第二阶段演进相关的只读能力也已具备：

- `pm-get-execution-plan`：返回 `ExecutionPlan v2` 草案（只读，不执行）
- `pm-dry-run-dispatch`：当前 dry-run 输出会附带 `ExecutionPlan v2` 预览
- `pm-dry-run-loop`：当前 dry-run loop 输出会附带 `ExecutionPlan v2` 预览

真正执行发布前，还应先检查当前机器的 npm 登录态：

```bash
npm run --prefix packages/opencode-pm-workflow check-auth
```

`npm pack --dry-run` 当前包含：

- `dist/index.js`
- `dist/server.js`
- `dist/shared.js`
- `dist/tui.js`
- `README.md`
- `package.json`
- `tsconfig.json`
- `tsconfig.build.json`

这说明当前包已经具备本地发布前的基本面貌。

## 后续迁移建议

1. 先保持 `plugins/` 兼容壳为当前环境的稳定接入层。
2. 当前环境中，`plugins/` 兼容壳已经会把实际运行转发到 `@weekii/opencode-pm-workflow` 的子路径入口，因此**不要**再把 `./packages/opencode-pm-workflow/src/index.ts`、`./packages/opencode-pm-workflow/dist/index.js` 或包根入口额外写入 `opencode.json` / `tui.json`，否则会有重复加载风险。
3. 只有在移除或停用 `plugins/pm-workflow-*.ts` 兼容壳之后，才应把 `plugin` 入口显式切到源码入口、dist 入口或包名入口。
4. 当前包已经具备本地 `dist` 构建能力，并已完成 `typecheck`、`npm test`、`verify-release` 与 `npm pack --dry-run` 验证。

## 第二阶段预览

当前已经开始第二阶段的低风险演进，但仍然保持“只读预览，不接管执行”：

- 已补齐 `DispatchPlan` / `DispatchCommand` / `ExecutionPlan` 显式类型
- 已提供 `buildExecutionPlan(projectDir, prompt?)`
- 已支持按 action 输出不同 step 模板：
  - `create-dev-plan`
  - `start-development`
  - `continue-development`
  - `run-code-review`
  - `prepare-release`
- 现阶段这些能力仅用于预览与 dry-run 展示，不会替换当前真实执行链路
