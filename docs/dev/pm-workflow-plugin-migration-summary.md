# pm-workflow Plugin Migration Summary

## 目的

记录 `pm-workflow` 从本地散装插件实现迁移到 `package-first` 结构后的最终状态、运行链路、验证方法、回滚方式与后续发布步骤，避免后续维护时重复判断当前架构。

## 前提

在阅读或操作本方案前，默认满足以下条件：

- 工作区根目录为 `C:\Users\HK-2024\.config\opencode`
- 当前 `pm-workflow` 的包目录已存在：`packages/opencode-pm-workflow/`
- 当前兼容壳目录已存在：`plugins/pm-workflow-*.ts`
- 本机 Node.js / npm 可用
- 包依赖已安装完成：`packages/opencode-pm-workflow/node_modules/`

## 当前状态

当前迁移已经完成到以下状态：

- `server` 已迁入包内并完成模块化拆分
- `tui` 已迁入包内并完成模块化拆分
- `shared` 已收敛为纯 `re-export` 入口
- 包已支持本地 `dist/` 构建
- 旧 `plugins/` 文件仍保留，但只作为兼容壳使用

当前运行链路为：

```text
plugins/* 兼容壳
-> @walke/opencode-pm-workflow/server|tui|shared
```

这意味着：

- 当前环境仍依赖 `~/.config/opencode/plugins/` 自动加载
- 但真实运行代码已经来自已发布包的子路径入口
- 当前不需要在 `opencode.json` 或 `tui.json` 显式再注册 `packages/opencode-pm-workflow/dist/index.js`、`src/index.ts` 或包根入口

## 关键文件

核心包文件：

```text
packages/opencode-pm-workflow/package.json
packages/opencode-pm-workflow/tsconfig.json
packages/opencode-pm-workflow/tsconfig.build.json
packages/opencode-pm-workflow/src/index.ts
packages/opencode-pm-workflow/src/server.ts
packages/opencode-pm-workflow/src/server/plugin.ts
packages/opencode-pm-workflow/src/server/runtime.ts
packages/opencode-pm-workflow/src/server/hooks.ts
packages/opencode-pm-workflow/src/server/tools/*.ts
packages/opencode-pm-workflow/src/tui.ts
packages/opencode-pm-workflow/src/tui/plugin.ts
packages/opencode-pm-workflow/src/tui/toasts.ts
packages/opencode-pm-workflow/src/tui/commands.ts
packages/opencode-pm-workflow/src/shared.ts
packages/opencode-pm-workflow/dist/index.js
packages/opencode-pm-workflow/dist/server.js
packages/opencode-pm-workflow/dist/tui.js
packages/opencode-pm-workflow/dist/shared.js
```

兼容壳文件：

```text
plugins/pm-workflow-plugin.ts
plugins/pm-workflow-plugin-tui.ts
plugins/pm-workflow-shared.ts
```

验证与说明文件：

```text
test/plugin-contract.test.mjs
packages/opencode-pm-workflow/README.md
docs/dev/pm-workflow-plugin-package-plan.md
docs/dev/pm-workflow-plugin-migration-summary.md
```

## 步骤

### 1. 验证当前包内实现

运行：

```bash
npm run --prefix packages/opencode-pm-workflow typecheck
```

期望：无 TypeScript 报错。

### 2. 重新生成构建产物

运行：

```bash
npm run --prefix packages/opencode-pm-workflow build
```

期望：生成以下文件：

```text
packages/opencode-pm-workflow/dist/index.js
packages/opencode-pm-workflow/dist/server.js
packages/opencode-pm-workflow/dist/tui.js
packages/opencode-pm-workflow/dist/shared.js
```

### 3. 一键执行发布前校验

运行：

```bash
npm run --prefix packages/opencode-pm-workflow verify-release
```

期望：串行完成以下动作：

```text
typecheck -> build -> npm pack --dry-run
```

适用场景：

- 提交前快速确认包仍处于可发布状态
- 修改 `package.json`、`exports`、`dist`、兼容壳后做统一回归

### 4. 验证兼容壳是否仍指向已发布 package 子路径入口

检查：

```text
plugins/pm-workflow-plugin.ts
plugins/pm-workflow-plugin-tui.ts
plugins/pm-workflow-shared.ts
```

期望：

- `plugins/pm-workflow-plugin.ts` -> `@walke/opencode-pm-workflow/server`
- `plugins/pm-workflow-plugin-tui.ts` -> `@walke/opencode-pm-workflow/tui`
- `plugins/pm-workflow-shared.ts` -> `@walke/opencode-pm-workflow/shared`

### 5. 运行契约测试

运行：

```bash
npm test
```

当前期望结果：

```text
tests 13
pass 13
fail 0
```

## 示例

### 示例 1：仅更新构建产物

```bash
npm run --prefix packages/opencode-pm-workflow build
```

适用场景：

- 已修改 `src/*`
- 只想刷新 `dist/*`
- 不切配置入口

### 示例 2：发布前完整检查

```bash
npm run --prefix packages/opencode-pm-workflow prepare-publish
npm test
```

### 示例 3：一键发布前校验

```bash
npm run --prefix packages/opencode-pm-workflow verify-release
```

适用场景：

- 想用单条命令确认当前包还能发布
- 不想手动分别执行 `typecheck`、`build`、`npm pack --dry-run`

适用场景：

- 准备提交或发布前
- 想确认包自身可构建且兼容壳契约未破坏

## FAQ

### 为什么不直接在 `opencode.json` 里写 `./packages/opencode-pm-workflow/dist/index.js`？

因为当前环境已经通过 `plugins/*` 自动加载兼容壳，再显式加一次包入口会造成重复加载风险。

### 当前到底是运行 `src/*`、`dist/*` 还是已发布包？

当前开发构建产物仍来自：

```text
dist/*
```

但当前工作区的兼容壳已经转发到已发布包子路径入口：

```text
@walke/opencode-pm-workflow/server|tui|shared
```

因此可以同时认为：

- `src/*` 是源码入口
- `dist/*` 是发布产物与打包基础
- 当前工作区实际加载层通过 package 子路径入口接入

### 现在还能不能继续保留 `plugins/*`？

可以。当前就是这种模式：

- `plugins/*` 保留自动加载兼容性
- `dist/*` 承担真实运行逻辑

### 什么情况下才应该改 `opencode.json`？

只有在你决定：

- 移除或停用 `plugins/pm-workflow-*.ts` 兼容壳
- 改为显式声明式加载

时，才应该把入口写入 `opencode.json`。

## Troubleshooting

### 构建时报 Node 类型缺失

现象：

```text
Cannot find module 'fs'
Cannot find type definition file for 'node'
```

处理：

```bash
cd packages/opencode-pm-workflow
npm install
```

确认：

- `package.json` 中已包含 `@types/node`
- `tsconfig.json` 中已配置 `types: ["node"]`

### `npm test` 失败但实现本身没坏

优先检查：

- 契约测试是否仍然匹配旧阶段描述
- 兼容壳是否已从 `src/*` 切到 `dist/*`
- 文档与测试是否仍写着旧入口路径

### 出现重复加载风险

检查是否同时满足：

- `plugins/pm-workflow-*.ts` 还在自动加载目录里
- `opencode.json` 或 `tui.json` 又显式写了 `packages/opencode-pm-workflow/src/index.ts` 或 `dist/index.js`

如果是，删掉显式注册项，保留一种入口即可。

## 回滚

如果要从当前状态回滚到“兼容壳转发 `src/*`”的旧模式：

1. 修改以下文件：

```text
plugins/pm-workflow-plugin.ts
plugins/pm-workflow-plugin-tui.ts
plugins/pm-workflow-shared.ts
```

2. 将导入从：

```text
../packages/opencode-pm-workflow/dist/*
```

改回：

```text
../packages/opencode-pm-workflow/src/*
```

3. 重新运行：

```bash
npm test
```

如果要进一步回滚到“完全使用旧 `plugins/*` 实现”的阶段，则需要恢复这些文件的历史版本：

```text
plugins/pm-workflow-plugin.ts
plugins/pm-workflow-plugin-tui.ts
plugins/pm-workflow-shared.ts
```

## 后续发布步骤

如果后续要正式发布为 npm 包，建议顺序如下：

1. 固定包名与版本策略
2. 增加发布脚本
3. 确认 `dist/*` 为最终消费入口
4. 明确是否保留 `default` 导出兼容
5. 决定是否移除 `plugins/*` 兼容壳
6. 以 `npm run --prefix packages/opencode-pm-workflow verify-release` 作为发布前最后一道本地检查

如果需要准备 changelog、发布公告或提交摘要，可直接参考：

```text
docs/dev/pm-workflow-plugin-release-notes-draft.md
```

## 变更记录

- 2026-04-24: 完成 `pm-workflow` 的 package-first 改造，旧 `plugins/*` 变为兼容壳
- 2026-04-24: 完成 `dist/*` 构建链打通，并验证 `npm test` 13/13 通过
- 2026-04-24: 新增本迁移总结文档，统一记录当前运行链路、验证与回滚方式
