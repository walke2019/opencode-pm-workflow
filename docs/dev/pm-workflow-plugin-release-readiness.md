# pm-workflow Plugin Release Readiness

## 目的

记录 `packages/opencode-pm-workflow/` 当前距离“正式发布为 npm 包”还差哪些条件，避免把“本地可构建”误判成“可直接发布”。

## 当前已完成

以下能力已经具备：

- 包结构已建立完成
- `server / tui / shared` 已完成包内化与模块化拆分
- `dist/*` 构建已打通
- `plugins/*` 兼容壳已转发到 `@weekii/opencode-pm-workflow/server|tui|shared`
- `npm test` 已通过
- `npm run --prefix packages/opencode-pm-workflow typecheck` 已通过
- `npm run --prefix packages/opencode-pm-workflow build` 已通过
- `npm run --prefix packages/opencode-pm-workflow verify-release` 已通过
- `npm pack --dry-run --prefix packages/opencode-pm-workflow` 已通过
- `dist/*` 已通过 Node ESM 直接 `import()` 烟雾验证
- `npm test` 当前已通过 13/13
- 包名、发布可见性与构建产物均已对齐到当前真实状态

## 当前发布结论

当前包的状态应定义为：

```text
本地发布前链路已打通，且包结构已达到可直接发布到 npm 的状态；正式发布前主要只需确认版本号、changelog 与当前机器的 npm 登录态。
```

## 已通过的本地检查

### 类型检查

```bash
npm run --prefix packages/opencode-pm-workflow typecheck
```

### 构建

```bash
npm run --prefix packages/opencode-pm-workflow build
```

### 一键发布前校验

```bash
npm run --prefix packages/opencode-pm-workflow verify-release
```

当前还额外具备一层发布保护：

```text
prepublishOnly -> npm run verify-release
```

这意味着未来如果直接执行 `npm publish`，也会先自动执行本地发布前校验。

### npm 认证状态检查

```bash
npm run --prefix packages/opencode-pm-workflow check-auth
```

如果未登录，会得到 `ENEEDAUTH`。这属于正式发布前必须先解决的环境阻塞，而不是包实现问题。

### 打包预演

```bash
npm pack --dry-run --prefix packages/opencode-pm-workflow
```

当前打包结果已包含：

- `CHANGELOG.md`
- `README.md`
- `dist/*`

说明当前包已经具备基础发布说明文件，而不只是代码产物。

### Node ESM 烟雾验证

已验证以下入口可被 Node 直接 `import()`：

```text
packages/opencode-pm-workflow/dist/index.js
packages/opencode-pm-workflow/dist/server.js
packages/opencode-pm-workflow/dist/tui.js
packages/opencode-pm-workflow/dist/shared.js
```

这说明当前 `dist/*` 不只是“能构建”，而且已经满足 Node ESM 直接加载要求。

## 当前待确认项

### 1. 版本策略尚未最终定义

当前配置：

```json
"version": "0.1.0"
```

影响：

- 当前版本号可用于本地迭代
- 但还没有正式发布节奏、变更级别、changelog 策略

### 2. 发布目标与兼容策略未最终确认

仍待明确：

- 是否长期保留 `default` 导出兼容
- 是否长期保留 `plugins/*` 兼容壳
- 是否未来改为仅支持显式 `plugin` 入口

## 推荐补充项（不阻塞本地校验）

以下字段当前不是本地验证的硬阻塞，但在正式发布前建议补齐：

- `repository`
- `homepage`
- `bugs`
- 明确的 `license`

这些字段属于 npm 官方推荐元数据，缺少它们不会影响 `typecheck`、`build`、`npm pack --dry-run`，但会影响包的对外可读性与维护体验。

## 包名/版本变更同步提醒

后续如果你决定修改：

```json
"name"
"version"
```

除了 `package.json`，还应同步刷新：

```text
packages/opencode-pm-workflow/package-lock.json
```

否则 lockfile 中会继续保留旧的占位包名或旧版本号，造成元数据漂移。

## 建议发布前决策

在真正执行 npm 发布前，建议先明确以下事项：

1. 正式包名
2. 下一次版本号
3. 是否长期保留 `plugins/*` 兼容壳
4. 是否需要补 changelog / release note

## 推荐下一步

如果目标是“先把当前成果稳定保存”，推荐顺序：

1. 提交当前 `pm-workflow` 相关变更
2. 再单独进行包名/版本/发布策略决策
3. 最后才执行真实发布

如果目标是“继续推进到可发布”，推荐顺序：

1. 明确版本号和 changelog 策略
2. 再次执行 `verify-release`
3. 检查 `npm whoami`
4. 最后执行真实发布

如需整理对外说明文案，可直接复用：

```text
docs/dev/pm-workflow-plugin-release-notes-draft.md
```

## 回滚说明

这份文档本身不影响运行逻辑。

如果后续发布准备方向改变，只需要更新：

```text
packages/opencode-pm-workflow/package.json
docs/dev/pm-workflow-plugin-release-readiness.md
docs/dev/pm-workflow-plugin-release-notes-draft.md
```

## 变更记录

- 2026-04-24: 新增发布就绪报告，区分“本地可构建”与“可正式发布”两种状态
