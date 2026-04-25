# pm-workflow Plugin Publish Checklist

## 目的

把 `packages/opencode-pm-workflow/` 从“本地可构建、可测试、可打包”推进到“可正式发布到 npm”时需要完成的动作列成清单，避免后续发布时遗漏关键步骤。

## 前提

开始前默认满足以下条件：

- `npm test` 已通过
- `npm run --prefix packages/opencode-pm-workflow verify-release` 已通过
- `packages/opencode-pm-workflow/dist/*` 已重新生成
- 当前运行链路为：`plugins/*` 兼容壳 -> `@weekii/opencode-pm-workflow/server|tui|shared`

## 当前发布阻塞

当前代码与包结构已经可以发布到 npm；若继续发新版本，主要还需要确认的是版本策略与发布说明，而不是包结构本身。

## 步骤

### 1. 确认本次发布版本策略

需要决定：

- 是否延续当前包名 `@weekii/opencode-pm-workflow`
- 本次是否只做补丁版本发布
- changelog / release note 如何记录模块化重构内容

建议检查项：

- 名称是否已被 npm 占用
- 名称是否与 OpenCode 插件用途匹配
- 名称是否与 README 中示例一致

### 2. 确认 `package.json` 发布元数据仍与现状一致

当前应保持：

```json
{
  "name": "@weekii/opencode-pm-workflow",
  "private": false,
  "publishConfig": {
    "access": "public"
  }
}
```

如果要发布新版本，只需调整 `version`，并同步检查相关文档与 lockfile。

### 3. 确认发布入口策略

需要明确二选一：

- 继续保留 `plugins/*` 兼容壳，仅把 npm 包作为对外发布物
- 或者未来停用兼容壳，改为显式 `plugin` 入口加载包入口或 `dist/index.js`

如果要切显式入口，必须避免与兼容壳同时启用。

### 4. 确认导出策略

发布前建议再次确认：

- `main -> ./dist/index.js`
- `exports["."] -> ./dist/index.js`
- `exports["./server"] -> ./dist/server.js`
- `exports["./tui"] -> ./dist/tui.js`
- `exports["./shared"] -> ./dist/shared.js`

### 5. 执行发布前检查

运行：

```bash
npm run --prefix packages/opencode-pm-workflow check-auth
npm test
npm run --prefix packages/opencode-pm-workflow verify-release
```

期望：

- `npm whoami` 可返回当前发布身份
- 契约测试全绿
- `typecheck` 通过
- `build` 通过
- `npm pack --dry-run` 通过
- `prepublishOnly` 已配置为自动执行 `verify-release`

### 6. 审查打包内容

运行：

```bash
npm pack --dry-run --prefix packages/opencode-pm-workflow
```

当前应至少包含：

```text
CHANGELOG.md
README.md
package.json
dist/index.js
dist/server.js
dist/shared.js
dist/tui.js
tsconfig.json
tsconfig.build.json
```

### 7. 准备变更说明

发布前建议准备：

- 本次版本变更摘要
- 是否包含 breaking change
- 使用方式示例
- 兼容壳是否仍建议保留

### 8. 补齐推荐元数据

正式发布前建议补齐但不强制阻塞本地验证的字段：

- `repository`
- `homepage`
- `bugs`
- 明确的 `license`

这些字段不决定包能否构建，但决定包在 npm 页面上的完整度。

## 示例

### 示例 1：改正式包名并解除 private

```json
{
  "name": "@weekii/opencode-pm-workflow",
  "private": false,
  "version": "0.1.1"
}
```

### 示例 2：发布前完整本地检查

```bash
npm test
npm run --prefix packages/opencode-pm-workflow verify-release
npm pack --dry-run --prefix packages/opencode-pm-workflow
```

## FAQ

### 现在能不能直接 `npm publish`？

可以，从包结构和验证结果上已经具备发布条件；发布前主要再确认版本号、changelog 与 npm 登录态。

### 现在是不是已经可以提交代码？

可以。当前代码、构建、测试、文档都已经闭环，完全可以先提交，再单独做发布准备。

### 要不要先移除 `plugins/*` 兼容壳？

不一定。只要你不同时显式注册 `dist/index.js`，兼容壳可以继续保留。是否移除，应作为单独的运行入口策略决策。

## Troubleshooting

### `npm pack --dry-run` 内容不对

检查：

- `files` 是否包含 `dist`
- `dist/*` 是否是最新构建产物
- `README.md` 是否同步到当前运行形态

### `verify-release` 失败

优先检查：

- `npm test`
- `typecheck`
- `build`
- `dist/*` 是否仍能被 Node ESM 直接加载

### 发布后用户无法加载子路径入口

优先检查：

- `package.json#exports`
- `dist/*` 中的相对导入是否带 `.js` 扩展名

## 回滚

如果这份发布清单与最终策略不一致，只需要更新以下文件：

```text
packages/opencode-pm-workflow/package.json
packages/opencode-pm-workflow/README.md
docs/dev/pm-workflow-plugin-release-readiness.md
docs/dev/pm-workflow-plugin-publish-checklist.md
```

## 变更记录

- 2026-04-24: 新增正式发布检查清单，明确从“本地可发布前状态”到“正式 npm 发布”所需步骤
- 2026-04-24: 同步到当前真实 package-first + 模块化结构与已发布包名状态
