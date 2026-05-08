# AGENTS.md - pm-workflow 开发指南

## OpenCode 规范遵循

### 强制要求

**每次变更前，必须先阅读并了解最新版本 OpenCode 开源仓库的更新内容。**

所有任务必须先与 OpenCode 仓库确认，确保：

1. **遵循 OpenCode 的扩展插件开发机制**
2. **遵循 OpenCode 的 API 规范与接口标准**
3. **不自行发明与 OpenCode 冲突的机制**
4. **不跑偏到非官方支持的开发模式**

### 开发前必查内容

- OpenCode 官方文档最新版本的插件开发指南
- OpenCode 官方仓库的 hooks、tools、agents 接口定义
- OpenCode 官方发布的 breaking changes 与新特性
- OpenCode 官方推荐的插件结构与导出方式

### 禁止事项

- ❌ 不查 OpenCode 最新文档就直接写代码
- ❌ 自行发明与 OpenCode 官方机制冲突的实现
- ❌ 忽略 OpenCode 的 breaking changes 继续用旧 API
- ❌ 脱离 OpenCode 插件体系独立开发

### 正确做法

- ✅ 先查 OpenCode 官方文档/仓库确认接口规范
- ✅ 按 OpenCode 官方推荐的插件结构开发
- ✅ 遇到不确定的能力，先验证 OpenCode 是否支持
- ✅ 跟随 OpenCode 版本更新同步调整本插件

## 架构认知

### 系统分层

```
用户请求 → Analyzer(语义判断) → Registry(执行绑定) → Runtime(执行编排) → Evaluator(结果评估) → Gate(安全约束)
```

- **Analyzer**：只判断"这是什么工作"，不决定用哪个 agent 文件
- **Registry**：只解析"这个工作落到哪个真实 agent"，不发明新语义
- **Runtime**：只负责"怎么执行"，不做二次语义分类

### 核心任务域（固定少量）

`commander` / `plan` / `frontend` / `backend` / `researcher` / `writer` / `qa_engineer` / `tech-lead`

**新增 agent ≠ 新增语义角色**。新 agent 先进入 Registry，只有满足高频/稳定/边界清晰/自动分派收益显著才考虑进入核心。

### 关键设计决策

- `pm_workflow_caocao` 是唯一 primary orchestrator
- command lanes 是 UX facade，不是第二套 runtime
- specialist agent 若为 subagent，必须走 subagent-safe 路径
- 项目级 `.opencode/agents/*.md` 优先于全局 `~/.config/opencode/agents/*.md`
- 复合任务通过主 agent 编排解决，不通过新增角色解决

## 开发流程

### 1. 改代码
- 小步修改，频繁提交
- 测试先行（TDD）
- 遵循现有代码风格与模块边界

### 2. 跑验证
```bash
PATH="/opt/homebrew/bin:$PATH" npm run build && PATH="/opt/homebrew/bin:$PATH" npm test
```

### 3. 同步文档
- 改哪层就更新对应文档
- 更新 CHANGELOG.md
- 更新文档底部 Change Log
- **现行文档仅 5 篇，禁止新建**

### 4. 提交并推送
```bash
git add .
git commit -m "feat/fix/docs: 简明描述"
git push origin main
```

### 5. npm 发版
每次变更（含文档更新）完成后，必须发布新版本：

```bash
# 1. 升版本号（patch/minor/major）
npm version patch --no-git-tag-version

# 2. 发布前验证
PATH="/opt/homebrew/bin:$PATH" npm run verify-release

# 3. 发布到 npm
npm publish --access public

# 4. 确认发布成功
npm view @walke/opencode-pm-workflow version
```

## 代码规范

### TypeScript
- 严格模式，禁止 `any`
- 接口命名以 `I` 开头（如 `IWorkflowState`）
- 导出函数/类必须有 JSDoc 注释

### 测试
- 测试文件放在 `test/` 目录
- 文件名以 `.test.mjs` 结尾
- 新增功能必须有对应测试
- 修复 bug 必须有回归测试

### 提交信息
- 格式：`type: 简明描述`
- type 可选：`feat` / `fix` / `docs` / `refactor` / `test` / `chore`
- 描述用中文，简明扼要

## 文档同步规则

### 现行文档仅 5 篇

| 文档 | 职责 |
| --- | --- |
| `README.md` | 项目总入口 |
| `docs/01-技术架构.md` | 架构、分层、调度、agent 定义来源 |
| `docs/02-业务功能与任务流转.md` | 阶段、dispatch、lane、auto-continue |
| `docs/03-使用与运维手册.md` | 接入、配置、工具、诊断、发布 |
| `docs/04-待办与演进清单.md` | 状态、已完成、边界、todo |

### 变更同步矩阵

| 变更类型 | 更新目标 |
| --- | --- |
| 新增功能 | 对应文档章节 + CHANGELOG.md |
| 修改机制 | 对应文档描述/流程图 + CHANGELOG.md |
| 删除功能 | 从对应文档移除 + CHANGELOG.md 标注 |
| 新增角色 | 01-技术架构.md 角色表 + 02-业务功能.md 边界表 + CHANGELOG.md |
| 修改流程图 | 直接改对应文档 Mermaid 图 |
| 新增工具 | 03-使用运维.md 工具表 + CHANGELOG.md |

### 禁止事项

- ❌ 创建第 6 篇现行主文档
- ❌ 新建 `docs/dev/`、`docs/runbooks/`、`docs/specs/` 等旧目录
- ❌ 新建 spec/plan/migration/audit 类文档
- ❌ 文档与代码不同步

## 版本记录

### CHANGELOG.md

每次变更必须更新：

```markdown
## X.Y.Z

- 做了什么、为什么做
- 影响的文档/模块
```

### 文档底部 Change Log

每篇主文档末尾必须有：

```markdown
## Change Log

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| YYYY-MM-DD | X.Y.Z | 变更说明 |
```

## 提交检查清单

- [ ] 代码变更完成
- [ ] 测试通过
- [ ] 对应文档已更新
- [ ] CHANGELOG.md 已更新
- [ ] 未新建文档（仅修改现有 5 篇）
- [ ] 流程图与正文一致
- [ ] 已提交并推送到 git 仓库
- [ ] 已完成 npm 发版
