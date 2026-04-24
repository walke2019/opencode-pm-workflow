# opencode-pm-workflow

当前状态：已完成包内化，并已具备本地 `dist` 构建能力。

## 目的

为当前 `pm-workflow` 提供一个可发布、可迁移的 OpenCode 插件包实现。

## 当前状态

当前包已经完成**核心运行逻辑的包内化**，且已具备 `dist` 构建能力；当前不替换现有加载链路：

- `src/server.ts` → 已迁入包内真实实现
- `src/tui.ts` → 已迁入包内真实实现
- `src/shared.ts` → 已迁入完整共享运行逻辑，不再依赖 `plugins/pm-workflow-shared.ts`

这样做的目标是先把“包边界”固定下来，再逐步把实现从 `plugins/` 平滑迁入包内。

当前进度：

- server：已迁入包内
- tui：已迁入包内
- shared：已完成包内化
- dist：已可本地构建
- 当前运行入口：`plugins/*` 兼容壳已转发到 `dist/*`

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
    "@your-scope/opencode-pm-workflow@latest"
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

1. 先保持 `plugins/` 为运行真源。
2. 当前环境中，`plugins/` 兼容壳已经会把实际运行转发到 `packages/opencode-pm-workflow/dist/*`，因此**不要**再把 `./packages/opencode-pm-workflow/src/index.ts` 或 `./packages/opencode-pm-workflow/dist/index.js` 额外写入 `opencode.json` 或 `tui.json`，否则会有重复加载风险。
3. 只有在移除或停用 `plugins/pm-workflow-*.ts` 兼容壳之后，才应把 `plugin` 入口显式切到源码入口或 dist 入口。
4. 当前包已经具备本地 `dist` 构建能力，后续如要发布为 npm 包，只需补版本发布流程。
