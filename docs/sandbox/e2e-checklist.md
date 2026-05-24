# pm-workflow End-to-End 验收清单（1.0.0-rc.0 起）

> 本文件不是主文档，是 1.0.0 发布前的**真实环境验收脚本**。
>
> 主文档由 `pmw docs check` 守门，限定为 `README.md` + `docs/01..05`；本目录 `docs/sandbox/` 不参与文档治理校验。

## 目的

1.0.0 SemVer 承诺正式生效之前，必须把 0.4.0 → 0.13.0 累计落地的能力放进真实 OpenCode 工作区跑一遍，把"仅通过单元测试"的风险降到 0。

每个场景必须**在你本地手动跑通**才能升 1.0.0；AI 不能替你跑。

## 前置准备

```bash
# 1. 确保本仓库 build & verify 都绿
npm run prepare-publish     # typecheck + build + api-snapshot:check + docs:check

# 2. 链接到一个真实 OpenCode 工作区（本地开发态）
cd ~/path/to/some-test-project
npm install /Users/macop/Preojects/opencode-pm-workflow

# 3. 在该工作区的 .opencode/opencode.json 增加 plugin 引用
#    {
#      "plugin": ["@walke/opencode-pm-workflow"]
#    }

# 4. 启动 OpenCode TUI / server
opencode
```

## 验收场景

### 场景 1：pmw doctor 在新项目跑通

**目的**：验证 0.8.0 离线 CLI + 0.11.0 docs check 在真实项目可用。

```bash
mkdir -p /tmp/e2e-pmw-1 && cd /tmp/e2e-pmw-1
git init
echo '{}' > package.json
pmw doctor
pmw doctor --json | jq '.blockers'
```

**期望**：
- 自动初始化 `.pm-workflow/state.json` 与 `config.json`
- doctor 输出 ≥ 8 项 check，无 blockers
- `--json` 模式 blockers 字段为空数组
- `.pm-workflow/history.jsonl` 含 `state.init` / `config.init` 事件

**实际**（执行时填）：
- ☐ 跑通日期：
- ☐ 实际 ok 数：
- ☐ 实际 warnings：
- ☐ 截图：

### 场景 2：dispatch 真实执行（非 dry-run）

**目的**：验证 0.4.0 dispatch 主链路 + 0.4.0 量化分派指引（多候选场景注入 agentStats）+ history 写入。

```bash
# 在真实 OpenCode 会话里
> /pm-execute-dispatch
> prompt: 帮我实现一个简单的字符串反转函数并写测试
> confirm: YES
```

**期望**：
- pm-workflow 输出推荐 agent / action / 执行命令
- OpenCode 真实 spawn `opencode` 子进程执行 dispatch
- `pm-get-last-execution` 显示 exitCode=0
- `pm-get-history` 含 `dispatch.executed` 事件，含 stdout / stderr 截断版本

**实际**：
- ☐ 跑通日期：
- ☐ recommendedAgent：
- ☐ exitCode：
- ☐ history 事件类型：

### 场景 3：ForegroundFallback 触发（mock 限流）

**目的**：验证 0.4.0 ForegroundFallback 在真实限流场景下自动切换 model + 写 history。

**前置**：在 `.pm-workflow/config.json` 配置 chains：

```json
{
  "fallback": {
    "chains": {
      "commander": ["bestool-route-cx/cx/gpt-5.4"]
    }
  }
}
```

然后用一个**故意会触发 429** 的方法，比如配置一个限流非常严格的 provider，或暂时改本地 mock：

```bash
# 方式 A：让当前 model 返回 stderr 含 "rate limit"
# 方式 B：临时 patch 测试用例确认逻辑（推荐方式 B 在 Chunk 4 跑过单元测试）
```

**期望**：
- `pm-execute-dispatch` 第一次失败后自动切到 `bestool-route-cx/cx/gpt-5.4` 重试
- `pm-get-history` 含 `fallback.foreground_switch` 事件，trigger_kind=`rate_limit`
- 最终 exitCode=0（如果备选模型可用）

**实际**：
- ☐ 跑通日期：
- ☐ 触发方式：
- ☐ 切换前 model：
- ☐ 切换后 model：

### 场景 4：Auto-continue 链路 + Guard 拒绝路径

**目的**：验证 0.5.0 Auto-continue 真实跑通 + 双总开关默认拒绝。

**子场景 4a：默认拒绝**

```json
// .pm-workflow/config.json 默认（permissions.allow_auto_continue=false）
```

```
> /pm-execute-dispatch
> prompt: 修复登录接口 401 并验证回归
```

**期望**：
- dispatch 完成后**不**自动进入续跑
- `pm-get-history` **没有** `auto_continue.chain_start` 事件

**子场景 4b：双开关打开后正常续跑**

```json
{
  "permissions": { "allow_auto_continue": true },
  "auto_continue": {
    "enabled": true,
    "max_steps": 3,
    "cooldown_ms": 2000,
    "require_clean_tree": false,
    "stop_on_feedback_signal": true
  }
}
```

**期望**：
- dispatch 完成 → 自动续跑下一步（最多 3 步）
- 步骤间至少 2000ms 间隔
- `pm-get-history` 含 `auto_continue.chain_start` + 多个 `auto_continue.step` + 终止时一个 `auto_continue.aborted` 或自然完成

**子场景 4c：反馈停止信号**

让某次 specialist 输出包含"停下"或"stop"，验证立即终止。

**期望**：
- `auto_continue.aborted` 事件，reason=`feedback-stop`，matched=`停下`/`stop`

**实际**：
- ☐ 子场景 4a 跑通日期：
- ☐ 子场景 4b 跑通日期 + 实际 step 数：
- ☐ 子场景 4c 跑通日期 + matched 词：

### 场景 5：声明式路由（routing.denied）

**目的**：验证 0.7.0 frontmatter `permission.task` 真的能拒绝 dispatch。

**前置**：在 `.opencode/agents/commander.md` 写：

```yaml
---
description: PM 主协调官
mode: primary
permission:
  task:
    advisor: deny
---
```

```
# 在会话里发一个明显应路由到 advisor 的请求
> 帮我调研 OpenCode 1.16.0 的官方 release notes 与 1.15.7 的差异
```

**期望**：
- pm-workflow 不会 dispatch 到 `advisor`
- `pm-get-history` 含 `routing.denied` 事件，candidate_agent=`advisor`
- 实际链路落到次优候选（advisor 或 commander 自己处理）

**实际**：
- ☐ 跑通日期：
- ☐ candidate_agent：
- ☐ 实际命中的 agent：

### 场景 6：hot-reload activation: duplicate

**目的**：验证 0.6.0 Hook 注册去重防 hot-reload 重复触发。

```bash
# 在 OpenCode 服务运行中，触发 plugin 重新加载
# 通常方式：保存 .opencode/opencode.json / 重新打开 TUI
```

**期望**：
- 第一次装配：log `pm-workflow plugin loaded` + `activation: first`
- 重新加载：log `activation: duplicate`，且 `syncState` / `writeReviewMarker` 不被多触发
- `app.log` 中 `[health]` finding 仅出现一次（不是每次 reload 都出）

**实际**：
- ☐ 跑通日期：
- ☐ duplicate 出现条件：

### 场景 7：pmw report 生成 dashboard

**目的**：验证 0.9.0 报告功能在真实 history 数据上能渲染。

```bash
# 跑过场景 1-6 后
cd /tmp/e2e-pmw-1   # 或选一个已经跑过 dispatch 的项目
pmw report
open .pm-workflow/report.html
```

**期望**：
- 浏览器打开能看到 dashboard
- 关键指标卡片（dispatch / fallback / auto-continue / routing 拒绝）数字与场景 2-5 跑过的次数一致
- 事件流可筛选；点击"展开"能看到原 JSON
- 体积 < 100 KB（事件数量少时通常 < 30 KB）

**实际**：
- ☐ 跑通日期：
- ☐ 事件总数：
- ☐ HTML 体积：
- ☐ 浏览器（chrome / firefox / safari）：

## 全部场景跑通后

把本文件的所有"实际"字段填好，然后：

```bash
# 1. commit verification log
git add docs/sandbox/e2e-checklist.md docs/sandbox/screenshots/
git commit -m "docs(1.0.0): e2e checklist 7 个场景全部跑通"
```

## 1.0.0 发布前置条件（再次确认）

- [ ] 7 个场景全部跑通且 verification log 入库
- [ ] `pmw verify` 全绿（含 api-snapshot:check + docs:check）
- [ ] `npm run test:coverage` 6 个关键模块全部 ≥ 85%
- [ ] CHANGELOG `1.0.0` 段写明"语义版本承诺正式生效"
- [ ] 5 篇主文档底部 Change Log 同步
- [ ] `git tag v1.0.0` annotated tag
- [ ] `gh release create v1.0.0` GitHub Release（用 `scripts/release-notes.mjs` 自动生成 notes，如已实现）

## Change Log

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-05-23 | 1.0.0-rc.0 | 新建：7 个真实 OpenCode 端到端验收场景框架 |
