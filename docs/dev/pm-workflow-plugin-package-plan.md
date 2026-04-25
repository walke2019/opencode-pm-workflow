# pm-workflow Plugin Package Plan

## 目的

为 `pm-workflow` 建立一套更接近标准插件包的实现形态，降低对“全局 plugins 目录自动加载”的依赖，提高可移植性、可审计性与后续发布能力。

## 当前现状

当前 `pm-workflow` 为混合架构：

- Skill：`skills/pm-workflow/`
- 插件：`plugins/pm-workflow-plugin.ts`
- TUI 插件：`plugins/pm-workflow-plugin-tui.ts`
- 共享逻辑：`plugins/pm-workflow-shared.ts`

当前运行链路可用，但主要依赖：

- `~/.config/opencode/plugins/` 自动加载
- 本地 TS 文件直接被环境消费

这对当前机器有效，但对迁移、复制到其他环境、后续发布为 npm 包都不够稳定。

## 当前包结构

```text
packages/opencode-pm-workflow/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts
    ├── server.ts
    ├── tui.ts
    └── shared.ts
```

当前策略是**先完成包内化，再决定是否切换入口**：

- `src/index.ts` 提供根入口与命名导出
- `src/server.ts` 已迁入包内真实实现
- `src/tui.ts` 已迁入包内真实实现
- `src/shared.ts` 已迁入完整共享运行逻辑，不再依赖现有 `plugins/pm-workflow-shared.ts`

## 为什么先做桥接

### 好处

1. 不破坏现有可运行链路
2. 能先建立“包边界”与未来导出入口
3. 后续迁移时可以按文件逐步搬迁，而不是一次性重构
4. 更容易补充 package-level 的 typecheck / build / publish 流程

### 当前不做的事

1. 不立即把 `opencode.json` 切到 `packages/` 入口
2. 不立即删除 `plugins/pm-workflow-*.ts`
3. 不立即切换到 `dist` 入口运行（但已补构建能力）

## 推荐迁移阶段

### Phase 1：桥接骨架（已完成）

- 建立 `packages/opencode-pm-workflow/`
- 建立根入口 `src/index.ts`
- 让包入口复用现有 `plugins/` 实现

### Phase 2：源码内聚

- 把 `pm-workflow-shared.ts` 迁入 `packages/opencode-pm-workflow/src/shared.ts`（已完成）
- 把 `pm-workflow-plugin.ts` 迁入 `packages/opencode-pm-workflow/src/server.ts`（已完成）
- 把 `pm-workflow-plugin-tui.ts` 迁入 `packages/opencode-pm-workflow/src/tui.ts`（已完成）

### Phase 3：切换加载入口

- 当前阶段不要同时做这两件事：
  - 保留旧 `plugins/` 文件作为兼容壳
  - 又在 `opencode.json` / `tui.json` 显式加载包入口
- 否则会产生重复加载风险。
- 正确切换顺序应为：
  - 先确认兼容壳稳定
  - 再移除或停用旧 `plugins/pm-workflow-*.ts`
  - 最后用 `plugin` 数组显式加载源码入口或 `dist/index.js` 包入口

### Phase 4：可发布化（已部分完成）

- 已补 `tsconfig.build.json`
- 已补 `dist` 导出配置
- 已补 `build / clean / prepare-publish` 脚本
- 已补 `verify-release` 一键发布前检查脚本
- 已通过 `npm pack --dry-run` 验证发布包内容
- 尚未补版本发布流程

## 风险与边界

### 风险 1：重复加载

如果未来同时保留：

- `plugins/pm-workflow-plugin.ts` 自动加载
- `opencode.json` 又显式加载包入口

则可能出现重复注册。

### 风险 2：相对路径桥接依赖当前仓库结构

当前骨架中的 `../../plugins/...` 只是桥接方案，适合当前仓库，不适合作为最终发布形态。

### 风险 3：TUI/server 入口需要最终统一

最终发布时，应明确：

- 包默认导出是否只给 server
- TUI 入口是否用独立子路径暴露

## 验收标准

### 当前阶段验收

1. `packages/opencode-pm-workflow/` 目录存在
2. 包入口文件存在，且已完成核心源码内聚（server / TUI / shared 均已迁入包内）
3. 不影响现有 `plugins/` 可运行状态
4. `opencode.json` / `tui.json` 当前不显式注册 pm-workflow 包入口，避免重复加载
5. 包已具备本地 `dist` 构建配置

### 后续阶段验收

1. 包可独立 typecheck
2. 包入口可被 `plugin` 数组显式加载
3. 旧 `plugins/` 入口可平滑退场

## 变更说明

- 本次已新增包化骨架与迁移文档
- 已将 server / TUI 入口迁入包内
- 已将 shared 的完整运行逻辑迁入包内
- 当前 `packages/opencode-pm-workflow/src/shared.ts` 已不再从 legacy shared 文件导入运行逻辑
- 当前实际运行链路为：`plugins/*` 兼容壳 -> `packages/opencode-pm-workflow/dist/*`
- 当前包已可通过 `npm run --prefix packages/opencode-pm-workflow build` 生成 `dist/*`，并已切换兼容壳到 dist 产物运行
- 当前包已通过 `npm pack --dry-run` 产物检查
- 当前包已补本地 `dist` 构建配置，且当前实际运行已切到 `dist/*`
- 未删除任何现有 pm-workflow 插件文件
