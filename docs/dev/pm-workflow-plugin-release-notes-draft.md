# pm-workflow Plugin Release Notes Draft

## 目的

为 `pm-workflow` 的 package-first 改造提供一份可直接复用的发布说明草稿，便于后续整理 changelog、发布公告或提交说明。

## 建议标题

```text
pm-workflow: complete package-first migration and modular plugin runtime
```

## 建议摘要

```text
完成 pm-workflow 的 package-first 改造。server、tui、shared 已全部迁入 packages/opencode-pm-workflow，并进一步拆分为 `core/*`、`orchestrator/*`、`server/*`、`tui/*` 模块。当前运行链路通过 legacy plugin shims 转发到已发布包子路径入口，构建、测试、打包与 Node ESM 直载均已通过验证。
```

## 建议变更点

### 1. 包结构完成

- 新增 `packages/opencode-pm-workflow/`
- 包含 `src/`、`dist/`、`package.json`、`tsconfig.json`、`tsconfig.build.json`
- 统一 `server / tui / shared` 的包级边界

### 2. 运行逻辑完成包内化

- `server` 已迁入包内真实实现
- `tui` 已迁入包内真实实现
- `shared` 已迁入包内真实实现
- `shared` 不再依赖 legacy shared 运行逻辑

### 3. 当前运行切到 package 子路径入口

- `plugins/pm-workflow-plugin.ts` 转发到 `@walke/opencode-pm-workflow/server`
- `plugins/pm-workflow-plugin-tui.ts` 转发到 `@walke/opencode-pm-workflow/tui`
- `plugins/pm-workflow-shared.ts` 转发到 `@walke/opencode-pm-workflow/shared`
- 当前实际运行链路为：`plugins/*` -> `@walke/opencode-pm-workflow/*`

### 4. 模块化结构已落地

- `src/server.ts` / `src/tui.ts` 已收敛为兼容转发入口
- `src/server/plugin.ts` / `src/tui/plugin.ts` 承接真实装配逻辑
- `src/shared.ts` 已收敛为纯 `re-export` 入口
- `server/tools/*`、`server/hooks.ts`、`server/runtime.ts` 已分层
- `tui/toasts.ts`、`tui/commands.ts` 已分层

### 5. 本地发布前链路打通

- `typecheck` 通过
- `build` 通过
- `verify-release` 通过
- `check-auth` 可用于检查 npm 登录态
- `prepublishOnly` 已配置为自动执行 `verify-release`
- `npm pack --dry-run` 通过
- `dist/*` 可被 Node ESM 直接 `import()`
- `CHANGELOG.md` 已纳入发布包内容

### 5. 契约测试已覆盖关键状态

- 兼容壳转发到 package 实现
- 当前配置中不显式重复注册 package 入口
- package 导出与脚本保持可发布形态
- `dist/*` 可直接被 Node ESM 加载

## 建议验证结果写法

```text
npm test -> 13/13 passed
npm run --prefix packages/opencode-pm-workflow verify-release -> passed
```

## 建议附带命令

```bash
npm test
npm run --prefix packages/opencode-pm-workflow check-auth
npm run --prefix packages/opencode-pm-workflow verify-release
```

## 建议风险说明

```text
当前仍保留 plugins/* 兼容壳，因此不要在 opencode.json / tui.json 中再显式注册 packages/opencode-pm-workflow/src/index.ts 或 dist/index.js，否则会产生重复加载风险。
```

```text
正式发布前还需要先解决 npm 登录态，以及将 package.json 中的 private/local 占位配置改为正式发布配置。
```

## 建议后续事项

### 适合下一步继续推进的内容

- 提交当前 pm-workflow 相关变更
- 改正式包名与版本策略
- 视需要移除 `plugins/*` 兼容壳并切到显式 package 入口

### 当前不建议混入本次说明的内容

- 无关技能或插件改动
- 未确认的 npm 正式包名
- 未确认的 breaking change 结论

## 精简版 Changelog 条目

```text
- package pm-workflow as a dist-backed OpenCode plugin
- move server, tui, and shared runtime into packages/opencode-pm-workflow
- route legacy plugin shims to published package subpaths
- split server/tui runtime into modular plugin, hooks, tools, commands, and toasts layers
- add build, verify-release, check-auth, prepublishOnly, dry-run pack, and Node ESM smoke verification
- include CHANGELOG.md in publishable package contents
```

## 变更记录

- 2026-04-24: 新增发布说明草稿，收敛 package-first 改造的对外说明文案
