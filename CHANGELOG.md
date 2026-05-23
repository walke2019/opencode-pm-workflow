# Changelog

## 1.0.0-rc.12

### 修复：commander 自己揽下任务不分派给子代理

之前的实测发现：用户问"做一个登录页"时，commander 直接开始写 HTML/CSS/JS，**不分派给 designer**。这违背了 pm-workflow 的核心设计——commander 是协调员，不该亲自动代码。

### 根因

之前 commander 配置：
- `tools.write: true` / `tools.edit: true` ← 允许 commander 写文件
- `permission.edit: ask` ← 仅询问，不阻止
- body "边界" 段写"不直接做大块代码实现" ← 软约束，强模型容易自己揽下

### 修复（双重约束）

**A. 物理约束**（OpenCode 层面阻止）：

```yaml
tools:
  write: false    # commander 工具集里直接没有 write
  edit: false     # commander 工具集里直接没有 edit
  task: true      # 唯一能调度子代理的工具
permission:
  edit: deny      # 即使不知怎么绕过 tools，permission 也强制 deny
```

OpenCode 看到 commander 不能 write/edit 文件，**物理上**就只能 task→subagent。

**B. Prompt 强约束**（让 LLM 自己理解）：

body 第一段加 `## 强制约束（不可违反）`：
- "你绝不亲自写代码"
- "任何涉及代码生成、UI 实现、API 实现、文档撰写、测试编写、部署的任务必须 task 委派"
- "简单任务也必须分派——'用户请求做 HTML 登录页'看起来简单但**这是 designer 的工作**"

任务路由原则改成 `→ task → designer`（明确写出动词），不再是 `→ designer`（容易被理解为"我作为 designer 思考方式"）。

### 影响

- **现有用户升级**：清 plugin cache + 重启 OpenCode 后，新版 commander.md 自动写入，commander 物理上不能写代码，必须分派
- **行为变化**：用户请求"做登录页"时 commander 应该 task→designer，由 designer 输出代码
- **commander 边界**：现在只能跑 bash（且 bash 仍是 ask）+ webfetch + task 子代理

### 测试

- 19 个测试全过
- 主题约束测试自动验证 commander 的新 tools/permission

## 1.0.0-rc.11

### skill 子目录组织（按 OpenCode/Claude Code 标准）

rc.10 把 7 个 .md 文件全堆在 `pm-workflow/` 顶层，不符合 OpenCode/Claude Code 推荐的 supporting files 子目录组织规范，且让 AI 一次加载所有内容浪费 token。

rc.11 按语义拆分为 4 个子目录：

```
skills/pm-workflow/
├── SKILL.md                           主入口（仅导航 + 触发词，从 12.4KB 精简到 7.6KB）
├── reference/                         规范参考（按需查询）
│   ├── agent-spec.md                  OpenCode agent md 字段规范
│   ├── skill-spec.md                  OpenCode skill md 字段规范
│   ├── agent-frontmatter.md           pm-workflow 6 个 agent 标准 frontmatter
│   ├── config.md                      pm-workflow.config.json + opencode.json plugin 配置
│   ├── file-paths.md                  跨平台文件路径与目录结构
│   └── cli-commands.md                pmw CLI 命令参考
├── workflows/                         场景化工作流
│   ├── install.md                     首次安装
│   ├── upgrade.md                     升级
│   ├── theme.md                       主题切换（5 套内置）
│   ├── model.md                       为 agent 分配模型
│   └── uninstall.md                   完全卸载
├── troubleshooting/                   故障排查（按问题类型）
│   ├── index.md                       12 错误索引 + 通用排查思路
│   ├── install.md                     T1-T2 安装与加载类
│   ├── agent-md.md                    T3-T6 agent md 字段类
│   ├── skill-load.md                  T7-T8 skill 加载类
│   └── general.md                     T9-T12 其他类
└── scripts/                           可执行脚本
    ├── check.sh
    ├── upgrade.sh
    ├── reset-agents.sh
    └── full-clean.sh
```

### SKILL.md 精简到只做"导航 + 触发词"

`SKILL.md` 现在只包含：

- 触发词与流程导航表（10 种用户原话 → 走哪个文件）
- 子目录索引（4 个目录 + 16 个 .md + 4 个 .sh）
- 6 个固定 agent 速查表
- 核心约束 6 条
- 行为约束（**新增**：按需读子文件，不要一次性 Read 全部）
- 不可破坏的红线
- 版本历史

详细工作流、规范、错误诊断都拆到子目录，AI 在用户提问时按对应触发词选**一个**子文件 Read。

### token 节省

之前一次加载 12.4KB SKILL.md（包含全部内容）；现在 SKILL.md 只 7.6KB（仅导航），AI 根据用户问题再读 1-2 个子文件（每个 1-9KB）。典型对话节省 70%+ skill content token。

### 测试更新

- `test/skill-installer.test.mjs` 改为期望 `pm-workflow/reference/agent-spec.md` 子目录路径
- skill auto-install 的递归同步已支持子目录（rc.9 引入）+ 嵌套子目录（rc.9 引入），无代码改动
- 19 个测试文件全过

### 迁移

```bash
# 1. 升级
npm install -g @walke/opencode-pm-workflow@rc

# 2. 清旧 cache 让 OpenCode 拉新版
pkill -9 -f OpenCode
rm -rf ~/.cache/opencode/packages/@walke/opencode-pm-workflow@rc

# 3. （可选）清旧顶层 .md 让 plugin 重写为子目录结构
rm -f ~/.config/opencode/skills/pm-workflow/{theme,model,reference,troubleshooting,upgrade,uninstall}.md

# 4. 双击启动 OpenCode，plugin auto-install 会递归同步新结构

# 5. 验证
ls ~/.config/opencode/skills/pm-workflow/
# 应看到：SKILL.md  reference/  workflows/  troubleshooting/  scripts/
```

## 1.0.0-rc.10

### 重大变更：3 个 skill 合并为单一 `pm-workflow` skill

之前 rc.9 引入的 3 个独立 skill：

```
skills/
├── pm-workflow-config/   ← 全场景帮手
├── agent-theme-config/   ← 主题专项
└── agent-model-config/   ← 模型专项
```

设计冗余且分散触发词。当用户问"pm-workflow 怎么用"时 AI 可能命中 pm-workflow-config，但说"切三国主题"又要切到 agent-theme-config，跨 skill 跳转 OpenCode 不一定能可靠完成。

rc.10 合并为唯一 skill：

```
skills/
└── pm-workflow/
    ├── SKILL.md            ← 唯一入口（全部触发词都在 description）
    ├── reference.md        ← 完整规范参考
    ├── theme.md            ← 主题工作流（合并自旧 agent-theme-config）
    ├── model.md            ← 模型工作流（合并自旧 agent-model-config）
    ├── troubleshooting.md  ← 12 种错误诊断
    ├── upgrade.md          ← 升级流程
    ├── uninstall.md        ← 卸载流程
    └── scripts/
        ├── check.sh
        ├── upgrade.sh
        ├── reset-agents.sh
        └── full-clean.sh
```

### 触发词集中

`pm-workflow/SKILL.md` 的 description 包含全部触发场景：

- pm-workflow / pmw / @walke
- 6 个固定 agent ID（commander / advisor / backendcoder / designer / fixer / writer）
- 主题切换（"切三国" / "回滚到默认主题"）
- 模型分配（"给 commander 配 Opus"）
- 切换列表 / 权限 / skill 加载等问题
- 安装 / 升级 / 卸载

AI 在用户提到任一关键词时主动加载这一个 skill，按 SKILL.md 流程导航分发到 supporting file（theme.md / model.md / troubleshooting.md 等）。

### 不再跨 skill 跳转

之前"AI 在 pm-workflow-config 里调 agent-theme-config"是间接触发，OpenCode 不保证可靠。现在主题问题直接读 supporting file，AI 加载 SKILL.md 时已经知道 theme.md 的存在与位置，按需 Read 即可，不依赖二次 skill 触发。

### 旧 skill 目录处理

| 用户来源 | 旧 skill 目录 | rc.10 plugin 行为 |
|---|---|---|
| rc.6 ~ rc.8 用户 | `agent-theme-config/` + `agent-model-config/` | 不再生成；用户旧目录留在 `~/.config/opencode/skills/`，需手动清 |
| rc.9 用户 | + `pm-workflow-config/` | 同上 |

清理建议（在 rc.10 升级后）：

```bash
rm -rf ~/.config/opencode/skills/{agent-theme-config,agent-model-config,pm-workflow-config}
```

不清理也不影响 rc.10 工作（OpenCode 仍会加载它们但不再被 plugin 维护）。

### 测试更新

- `test/skill-installer.test.mjs`：`testResolvePackageSkillsDirPointsToPackageRoot` 改为期望 `pm-workflow/SKILL.md` 而非旧的 `agent-theme-config/` + `agent-model-config/`
- 19 个测试文件全过

### 迁移建议

```bash
# 1. 升级
npm install -g @walke/opencode-pm-workflow@rc

# 2. 完全 quit + 重启 OpenCode
pkill -9 -f OpenCode
rm -rf ~/.cache/opencode/packages/@walke/opencode-pm-workflow@rc

# 3. （可选）清旧 skill 目录
rm -rf ~/.config/opencode/skills/{agent-theme-config,agent-model-config,pm-workflow-config}

# 4. 双击启动 OpenCode（plugin auto-install 会写入新的 pm-workflow skill）

# 5. 验证
ls ~/.config/opencode/skills/pm-workflow/
# 应看到 SKILL.md / theme.md / model.md / reference.md / troubleshooting.md / upgrade.md / uninstall.md / scripts/
```

## 1.0.0-rc.9

### 新增：`pm-workflow-config` skill — 插件全场景帮手

之前 rc.7 修了 skill 子目录结构、rc.8 修了 agent md 规范，但用户在 OpenCode 内遇到 pm-workflow 相关问题（怎么装/怎么升/为什么没生效）时，没有一个统一的"AI 入口"来帮忙。rc.9 补上这块。

### 新 skill：`skills/pm-workflow-config/`

完整目录结构（OpenCode/Claude Code 标准 skill 形态）：

```
skills/pm-workflow-config/
├── SKILL.md              主入口（200+ 行）— 触发词 + 流程导航
├── reference.md          完整规范参考 — agent / skill / config 字段
├── troubleshooting.md    错误诊断目录 — 12 种常见问题诊断树
├── upgrade.md            升级流程详解
├── uninstall.md          完全卸载流程
└── scripts/              可执行脚本（带详细日志输出）
    ├── check.sh          综合健康检查（Node/CLI/cache/skills/agents/log）
    ├── upgrade.sh        互动式升级（quit + 清 cache + 升 CLI + 验证）
    ├── reset-agents.sh   重置 6 个 agent md 到当前主题最新版（自动备份）
    └── full-clean.sh     完全清理（带 --confirm 守护，每步备份）
```

### 触发场景（10 种用户原话）

skill description 包含全部触发词，AI 在用户提到下列任一场景时主动加载：

- "怎么装 pm-workflow" / "升级到最新版" / "pmw doctor 报错"
- "切三国主题" / "给 commander 配 Opus" / "切换列表显示太多"
- "writer 跑不了 git log" / "AI 不知道有什么主题"
- "彻底卸载 pm-workflow" / 任何含 "pm-workflow" / "pmw" / "@walke" 的报错

### 行为约束

- **委派而非揽**：主题问题转 `agent-theme-config` skill，模型问题转 `agent-model-config`
- **先 dry-run**：所有写盘操作先预览，破坏性操作必须备份
- **输出过程日志**：每个脚本都输出详细步骤，便于 AI/用户追溯
- **不假设环境**：先跑 `check.sh` 看真实状态再下结论

### Skill auto-install 升级为递归同步

之前（rc.7-rc.8）只把 `skills/<id>/SKILL.md` 同步到目标。rc.9 起递归同步整个 skill 目录：

- **`SKILL.md`**：主入口（保留原有逻辑）
- **`reference.md` / `troubleshooting.md` / 等顶层文档**：递归同步
- **`scripts/` 子目录**：递归处理子文件与孙子目录
- **脚本类文件**（`.sh` / `.bash` / `.zsh` / `.py` / `.mjs` / `.js`）：自动赋可执行权限（0o755）
- **用户改过的文件**：保留不覆盖（user-modified outcome）
- **目标比源多的文件**：保留（不删用户自加的脚本）
- **chmod 失败**：记录但不阻断主流程（容器环境可能没 chmod 权限）

### 测试

- `test/skill-installer.test.mjs` 新增 3 个用例：
  - `testRecursivelyCopiesSupportingFiles`：reference.md / scripts/ / 嵌套子目录都被同步 + 脚本可执行权限
  - `testSupportingFilesPreserveUserChanges`：用户改过的 reference.md 不被覆盖
  - `testSupportingFilesSkipIdentical`：内容相同时跳过，不报错
- 19 个测试文件全过

### 影响

- **新用户**：装完 plugin 后，OpenCode 会自动同步 `pm-workflow-config` 完整目录到 `~/.config/opencode/skills/pm-workflow-config/`
- **AI 行为**：在 OpenCode 内问"怎么装 pm-workflow"等问题，AI 会自动加载 skill 并按流程执行（含跑诊断脚本）
- **现有用户升级**：完全 quit + 重启 OpenCode，plugin auto-install 会写入新 skill；现有用户改过的 SKILL.md / reference.md 等不会被覆盖

## 1.0.0-rc.8

### agent md 完全符合 OpenCode 规范

之前 rc.6/rc.7 写出的 agent md 过于简洁——OpenCode 官方规范支持的 `temperature` / `tools` / `permission` 字段全部缺失，body 也只有 10 行左右。rc.8 全面重写。

### 新增 frontmatter 字段（按 [OpenCode 官方规范](https://opencode.ai/docs/agents)）

```yaml
---
description: <30-60 字>            # 必填
mode: primary | subagent           # commander=primary，其他=subagent
temperature: 0.1 ~ 0.4             # 按角色调优
tools:                             # 工具集合
  write: bool
  edit: bool
  bash: bool
  webfetch: bool
  task: bool                       # 仅 commander
permission:                        # 细粒度权限
  edit: allow | ask | deny
  bash: allow | ask | deny | { glob: action }
  webfetch: allow | ask | deny
  task: { ... }                    # 仅 commander
display_name: <展示名>             # pm-workflow 自定义
theme: <theme-id>                  # pm-workflow 自定义
---
```

**不写 `model` 字段**——让 `pmw models init` 单独管 `opencode.json`，主题切换不影响模型配置（OpenCode 默认行为：subagent 自动继承 primary 的模型）。

### 6 个 agent 的标准配置

| Agent | mode | temp | edit | bash | webfetch | task |
|---|---|---|---|---|---|---|
| **commander** | primary | 0.2 | ask | ask | allow | 严格白名单 |
| **advisor** | subagent | 0.3 | deny | allow | allow | — |
| **backendcoder** | subagent | 0.2 | allow | allow | ask | — |
| **designer** | subagent | 0.4 | allow | allow | ask | — |
| **fixer** | subagent | 0.1 | allow | allow | ask | — |
| **writer** | subagent | 0.3 | allow | 细粒度 | allow | — |

**commander 的 task 严格白名单**（保证 pm-workflow 路由设计不被 LLM 临时起意破坏）：

```yaml
task:
  "*": deny
  advisor: allow
  backendcoder: allow
  designer: allow
  fixer: allow
  writer: allow
  explore: allow      # OpenCode 内置只读探索
  scout: allow        # OpenCode 内置只读调研
```

**writer 的 bash 细粒度**（writer 只动文档，但偶尔需要整理材料）：

```yaml
bash:
  "*": deny
  "git log*": allow
  "git diff*": allow
  "git status*": allow
  "npm run docs:*": allow
```

### body 重写为完整系统 prompt

每个 agent body ≥ 60 行，含 5 段：
- **核心职责**：5-6 个具体任务
- **工作流程**：4 步执行模板（理解 → 拆解 → 执行 → 反馈）
- **输出格式**（5 个子代理强制）：summary / verification / risk 三段反馈，commander 自动收敛
- **边界**：不该做什么 + 必交场景
- **错误处理**：常见错误的应对模式

### 主题强制约束的字段

`mode` / `temperature` / `tools` / `permission` 都由主题强制写入，不受 `preserveExisting` 影响。理由：

- 这些是 OpenCode UI 行为（mode 控切换列表）和 pm-workflow 路由设计（task 白名单）的核心
- 用户自定义这些字段会破坏整体设计
- 如真要改，应该手动改 md 文件，而非通过主题切换

### 测试改进

- `testApplyPreservesNestedPermissionBlock` 改为 `testApplyForcesThemePermissionOverUserCustom`：验证主题**覆盖**用户原 permission（包括移除用户自定义 task 白名单条目）
- 已有的 model / mode 保留测试更新：mode 仍保留（用户主动选 primary/subagent 是合理的），temperature 改为强制覆盖

### 影响

- **用户**：升级 rc.8 + 重启 OpenCode 后，6 个 agent 的工具能力按官方规范配置；commander 不会乱调用第三方 agent；writer 不会乱跑 bash 命令；OpenCode UI 切换列表只显示 commander
- **agent 行为**：每个 agent 的系统 prompt 完整，子代理会按"summary / verification / risk"三段格式回报，commander 容易自动评估
- **不兼容**：用户已 apply 过的 agent md 里手动改的 permission（如 commander 的 task 白名单）会被覆盖；如需保留自定义 permission，请在 apply 后再手动改

## 1.0.0-rc.7

### 修复：OpenCode skill 规范不符合官方标准

**根因**：rc.3 引入的 skill auto-install 把包内 `skills/<id>/SKILL.md` 复制到 `~/.config/opencode/skills/<id>.md`（扁平结构）。但 [OpenCode 官方 skill 规范](https://opencode.ai/docs/skills) 要求 **子目录 + 大写 SKILL.md**：

```
~/.config/opencode/skills/
├── agent-theme-config/
│   └── SKILL.md          ✓ 正确（rc.7 起）
└── agent-theme-config.md  ✗ 错误（rc.3-rc.6）
```

OpenCode 看不到扁平的 `.md` 文件，所以 rc.3-rc.6 的对话式 skill 入口**从未真正生效**。

### 修复

- **`src/server/skill-installer.ts`**：复制目标改为 `<targetDir>/<id>/SKILL.md`（子目录结构）；写入前自动创建子目录
- **`skills/agent-theme-config/SKILL.md`**：重写内容对齐 rc.6 新 6 个 agent ID（commander / advisor / backendcoder / designer / fixer / writer）+ mode 字段约束 + frontmatter 补全 `name` / `license` / `compatibility` 字段
- **`skills/agent-model-config/SKILL.md`**：补全 `name` 字段；旧 ID `advisor`（重复）改正为 `writer`
- **`test/skill-installer.test.mjs`**：测试断言改为子目录结构

### 测试修复（自动化测试隔离环境改进）

- `test/permission-task-routing.test.mjs`：case 6 / case 10 增加 `XDG_CONFIG_HOME` 隔离，避免命中真实 `~/.config/opencode/agents/commander.md`
- `test/agent-theme.test.mjs`：`testRegistryHandlesAgentWithoutDisplayName` 增加 XDG 隔离
- `test/mode-aware-dispatch.test.mjs`：测试用 `XDG_CONFIG_HOME` 而不是 `process.env.HOME` mock 全局目录（rc.5 改用 `os.homedir()` 后 HOME mock 失效）

### 影响

- **用户**：升级到 rc.7 + 重启 OpenCode 后，skill auto-install 会写到正确路径；之前 rc.3-rc.6 写入的扁平 `~/.config/opencode/skills/<id>.md` 仍存在但被忽略，可手动删除
- **AI 对话式入口**：rc.7 起 OpenCode AI 真正能读到 skill 并主动调用 `pmw agents theme apply` 等命令
- **OpenCode skill 规范一致**：与 [官方文档](https://opencode.ai/docs/skills) 对齐

## 1.0.0-rc.6

### 重大变更：6 个固定 agent 重命名 + 角色合并/拆分

**ID 映射**：

| 旧 ID | 新 ID | 关系 |
|---|---|---|
| pm_lead | **commander** | 重命名（唯一 primary） |
| pm_advisor + pm_researcher | **advisor** | **2:1 合并**（调研 + 拆解 + 决策顾问） |
| pm_backend | **backendcoder** | 重命名 |
| pm_frontend | **designer** | 重命名 + **职责扩展**（设计 + 前端代码 + 交互原型 + 图像生成） |
| pm_reviewer（测试侧） | **fixer** | 拆分 + **职责扩展**（测试 + 修复 + 打包 + 部署 + CI/CD） |
| pm_reviewer（文档侧） | **writer** | 拆分（独立的文档撰写 agent） |

### 关键 UI 修复：OpenCode 切换列表只显示 commander

之前所有 6 个 agent 都出现在 OpenCode 的 agent 切换列表里——根因是主题渲染时**没写 mode 字段**，OpenCode 默认当作 `all` 处理。

修复：

- `src/core/types.ts` `AgentThemeRoleSkin` 增加必填字段 `mode: "primary" | "subagent"`
- `src/core/agent-theme-data.ts` 5 套内置主题（default / sanguo / xiyou / marvel / workplace）每个 skin 显式声明 mode：
  - `commander` = `primary`（唯一显示在 OpenCode 切换列表）
  - 其他 5 个 = `subagent`（通过 task tool 被 commander 调用，不进切换列表）
- `src/core/agent-theme.ts` 渲染时强制写入 mode 到 frontmatter；preserveExisting.mode 不再影响这个写入（mode 是主题强约束）

### 业务语义变化

- **advisor**：合并 pm_advisor（拆解顾问）+ pm_researcher（资料调研）的全部职责
- **designer**：在 pm_frontend（前端代码 + UI/UX）基础上新增"设计草图、原型、高保真页面、图像生成"等设计师职责
- **fixer**：在 pm_reviewer（测试 + 修复）基础上新增"打包 + 部署 + 版本号 + CI/CD"等 deployer 职责
- **writer**：从 pm_reviewer 中独立出来，专注 README / API 文档 / 注释 / 发布说明 / ADR
- **commander** = primary，其他 5 个 = subagent，OpenCode UI 切换列表只显示 commander

### 影响范围

- 719 处旧 ID 引用全部替换为新 ID（src / test / scripts / skills / docs / 顶层 .json 与 .md）
- 19 个测试文件全部更新；测试新增"writer 独立路由"用例
- 5 套内置主题完全重写 + 6 个 agent 角色完整覆盖（之前 default 主题只有 5 个，1.0.0-rc.6 起补齐 writer）
- 5 篇主文档（docs/01-04 + 05-公开-API-参考）同步重命名

### 不兼容（破坏性变更）

- 所有用户已有的 `~/.config/opencode/agents/<old-id>.md` 文件将不再被 pm-workflow registry 识别——用户需要重新跑 `pmw agents theme apply <theme>` 写入新 ID
- 项目级 `<projectDir>/.opencode/agents/<old-id>.md` 同上
- `~/.config/opencode/pm-workflow.config.json` 里 dispatch_map / agent_map 等若包含旧 ID 会被 readWorkflowConfig 自动填充新默认值（不会丢用户其他配置）
- history.jsonl 旧记录里的 `agent: "pm_lead"` 等仍可读但不会再生成

### 升级建议

```bash
# 1. 升级全局 CLI
npm install -g @walke/opencode-pm-workflow@rc

# 2. 完全 quit OpenCode，清旧 plugin cache
pkill -f "OpenCode" && sleep 2
rm -rf ~/.cache/opencode/packages/@walke/opencode-pm-workflow@rc

# 3. （可选但建议）清旧的 agent md 文件，让新主题写入新 ID
rm -f ~/.config/opencode/agents/pm_*.md

# 4. 重启 OpenCode（plugin auto-install + skill 同步会自动跑）

# 5. 在终端重新应用主题
pmw agents theme apply default --scope global   # 中性命名
# 或
pmw agents theme apply sanguo --scope global    # 三国主题
```

## 1.0.0-rc.5

### 修复：跨平台兼容性（macOS / Linux / Windows）

1.0.0-rc.4 在 macOS 上工作正常，但代码里有几处硬编码 POSIX 假设，在 Windows 上会失败：

- **`/tmp` 硬编码**：`resolveSafeProjectDir` 与 `plugin.ts` / `tui/plugin.ts` fallback 用 `process.env.TMPDIR || "/tmp"`。Windows 没有 `/tmp` 目录，且 `TMPDIR` 是 macOS/Linux 环境变量名，Windows 用 `TMP` / `TEMP`
- **`process.env.HOME || process.env.USERPROFILE`**：手工拼接 home 探测，逻辑虽对但脆弱；不如直接用 Node `os.homedir()`
- **`getConfigDir` 在 Windows 上用 `%APPDATA%`**：但 OpenCode 官方文档明确 Windows 上配置目录是 `%USERPROFILE%\.config\opencode\`，不是 `%APPDATA%`。这个函数当前没被调用（死代码），但仍要修对避免后续误用

**修复**：

- `src/server/runtime.ts`：`resolveSafeProjectDir` 改用 `os.homedir()` + `os.tmpdir()`；`getConfigDir` 改用 `homedir() + ".config/opencode"`，与 OpenCode 官方规范对齐
- `src/server/plugin.ts`：bootstrap fallback 路径同样改用 `homedir()` / `tmpdir()`
- `src/tui/plugin.ts`：相同改造

**跨平台路径示例**（fallback 触发时）：

| 平台 | fallback projectDir |
|---|---|
| macOS | `/Users/<user>/.cache/pm-workflow/global` |
| Linux | `/home/<user>/.cache/pm-workflow/global` |
| Windows | `C:\Users\<user>\.cache\pm-workflow\global` |
| 极端 sandbox（无 home） | macOS: `/var/folders/.../T/pm-workflow-global`; Linux: `/tmp/pm-workflow-global`; Windows: `C:\Users\<user>\AppData\Local\Temp\pm-workflow-global` |

### 测试

- `test/runtime-project-dir.test.mjs` 13 个用例（新增 1 个跨平台 fallback 路径结构验证）
- 测试用 `os.homedir()` 与 `process.platform` 自动适配运行环境，而不是 mock 环境变量

### 影响

- **macOS 用户**：行为不变（`os.tmpdir()` 在 macOS 返回 `/var/folders/...`，但 fallback 几乎不会触发，因为 home 永远存在）
- **Linux 用户**：行为不变（`os.tmpdir()` 返回 `/tmp`，fallback 几乎不会触发）
- **Windows 用户**：现在能正常工作；之前如果触发 fallback 会因为 `/tmp` 不存在而失败

## 1.0.0-rc.4

### 修复：OpenCode 启动时插件加载失败（关键 bug）

**根因**：1.0.0-rc.2 / rc.3 在 OpenCode 内启动时一直 abort，因为 `getProjectDir` 兜底逻辑不够强：

```
ERROR service=plugin path=@walke/opencode-pm-workflow@rc 
      error=ENOENT: no such file or directory, mkdir '/.pm-workflow' 
      failed to load plugin
```

OpenCode server 在 system service 模式下传给 plugin 的 `ctx.worktree` / `ctx.directory` 可能是空字符串，`process.cwd()` 也可能是 `/`。旧版 `ctx.worktree || ctx.directory || process.cwd()` 会得到 `/`，后续 `mkdir(join("/", ".pm-workflow"))` 在系统根目录写无权限，立刻 ENOENT。

整个 plugin 完全没起来——dispatch / Gate / Auto-continue / 主题 badge 在 OpenCode 内全部失效（即便用户已经 npm install plugin）。

**修复**：

- **`getProjectDir` 替换为 `resolveSafeProjectDir`**（src/server/runtime.ts）：跳过空字符串、纯空白、`/`、`\`；候选都不可用时回退到 `~/.cache/pm-workflow/global`；HOME 也异常时回退到 `$TMPDIR/pm-workflow-global`。**永不返回 `/`**
- **plugin 入口 try/catch 防御**（src/server/plugin.ts）：bootstrap（seedConfig / migrateLegacy / syncState）抛错时不让插件 abort，改用 fallback projectDir 重 seed config，保证 tools 注册 + skill 同步能完成
- **Skill auto-install 移到激活判断之外**（src/server/plugin.ts）：之前在 `if (activation === "first")` 分支内，前置代码任何异常都让 skill 装不上；现在每次激活都跑（幂等，相同内容跳过；用户改过不覆盖）
- **TUI plugin 同步修复**（src/tui/plugin.ts）：相同的兜底逻辑，避免 OpenCode TUI 在 cwd === "/" 时撞同问题
- **28 处 tool 入口替换为 `resolveSafeProjectDir`**（src/server/tools/*.ts）：之前 `context.worktree || context.directory` 也有相同隐患，统一用 helper

### 新增公开 API

- `resolveSafeProjectDir(...candidates)`（server 内部使用）

### 测试

- `test/runtime-project-dir.test.mjs` 13 个用例覆盖：优先候选、跳过空字符串/根目录/无效字符、HOME 回退、TMPDIR 回退、永不返回 "/"
- 总计 19 个测试文件，全部通过

### 影响

- **用户**：升级到 1.0.0-rc.4 + 清 OpenCode cache 后，OpenCode log 中应不再出现 `failed to load plugin`，`pm-workflow plugin loaded` 日志正常出现
- **OpenCode 内对话式入口**：AI 真正能识别 skill 并调用 `pmw agents theme apply` 等命令（之前那次能用是因为我们手动复制了 skill md 文件）
- **dispatch / Gate / Auto-continue / 主题 badge**：在 OpenCode 内**真正生效**

## 1.0.0-rc.3

### 新增：Skill auto-install

修复 1.0.0-rc.2 的设计漏洞——主题 skill 文件存在于 npm 包里，但没有任何机制告诉 OpenCode 加载，导致用户在 OpenCode 内对话式触发主题时 AI 完全不知道有 skill 可用。

- **`src/server/skill-installer.ts`**：插件首次激活时一次性把包内 `skills/<id>/SKILL.md` 同步到 OpenCode 标准目录 `~/.config/opencode/skills/<id>.md`（XDG_CONFIG_HOME 优先）
- **幂等设计**：内容相同跳过；目标不存在则复制；**目标已存在但内容不同时不覆盖**（保护用户本地改过的版本）
- **失败不阻断**：所有 IO 错误转换为 finding，通过 plugin log 上报，不影响插件加载流程
- **公开 API**：导出 `resolveOpenCodeSkillsDir` / `resolvePackageSkillsDir` / `syncPackagedSkillsToOpenCode` 与 `SkillSyncFinding` / `SkillSyncOutcome` / `SkillSyncReport` 类型；API snapshot 129 → 132 个符号
- **测试**：`test/skill-installer.test.mjs` 7 个用例覆盖首次安装 / 内容相同跳过 / 用户改过保留 / 源不存在 / XDG 路径 / 包路径定位 / 忽略非 skill 子项

### 影响

- 用户**无需手动**把 skill 复制到 `~/.config/opencode/skills/`；首次启动 OpenCode 时插件自动完成
- 已经手动复制 skill 的老用户**不会被覆盖**；如想拿包内最新版本需手动删除目标文件后重启 OpenCode
- 用户的 skill 内容修改完全自由；plugin 不会污染

## 1.0.0-rc.2

### 新增：Agent 主题（agent-theme）—— 对话式 agent 皮肤配置

把 6 个固定语义 agent（commander / advisor / backendcoder / designer / fixer / advisor）包装成不同"皮肤"显示名（默认 / 三国 / 西游 / 漫威 / 现代职场）。语义 ID、dispatch 路由、history、permission 全部不变；只换 frontmatter `description` / `display_name` / `theme` 与 body 文案。

- **5 套内置主题**：`default` / `sanguo` / `xiyou` / `marvel` / `workplace`，每套包含 6 个固定 agent 完整皮肤
- **核心模块** `src/core/agent-theme.ts`：`applyAgentTheme` / `previewAgentTheme` / `renderAgentMdForTheme` / `resolveThemeTargetDir` / `listAgentThemes`；frontmatter 解析保留嵌套 `permission` / `permission.task` 块
- **preserveExisting 默认全保留** `model` / `mode` / `permission` / `fallback_models` / `temperature`，避免主题切换覆盖用户已配的模型与权限
- **CLI 三件套**：
  - `pmw agents theme list` 列出内置主题
  - `pmw agents theme preview <id>` 预览渲染（dry-run，不写盘）
  - `pmw agents theme apply <id> [--scope project|global] [--agents backendcoder,designer] [--no-preserve-model]` 真正落盘
- **scope 路由**：`global` → `~/.config/opencode/agents/`（XDG_CONFIG_HOME 优先）；`project` → `<projectDir>/.opencode/agents/`
- **`agent-registry` 扩展**：解析 frontmatter `display_name` / `theme` 字段，回填到 `ResolvedAgentDefinition`；OpenCode 自身忽略不识别的字段，无副作用
- **dispatch 输出渲染**：`resolved agent` 行附加 `theme=xxx display=xxx` badge，dispatch 与 doctor 都能看到当前主题
- **对话式入口**：`pm-workflow.agents.example.json` 模板 + `skills/agent-theme-config/SKILL.md`，AI 读取模板按用户主题选择 + scope 调用 `applyAgentTheme`
- **测试**：`test/agent-theme.test.mjs` 16 个用例，覆盖列表、渲染、apply（project / global）、preserveExisting、嵌套 permission 保留、dry-run、unknown theme、subset apply、registry 解析

### 设计原则（与"稳定任务域"治理一致）

- agent 文件名 = 语义 ID = 路由锚点，永不可改
- 主题永不影响 dispatch 路由 / history.jsonl / permission 规则 / retry/fallback 链路
- `preserveExisting` 默认全保留；用户必须明确把字段设为 false 才会清空对应字段
- 不引入运行时动态加载用户 JSON 主题（避免 prompt 注入与不一致）

### 修复

- **agent-registry.test.mjs 漏跑 + 断言过时**：该测试 0.2.0 后从未在 `npm test` 中运行；其内部 `'all'` → `'subagent'` 与 fallback description 短句对齐；现已加回 npm test 序列
- **scripts/test-coverage.mjs Node 22+ 输出前缀**：Node test reporter 从 `# ` 改为 `ℹ `，旧解析逻辑导致 6 个关键模块全部"未找到覆盖率数据"假失败；同时兼容两种前缀
- **test:coverage 接入 verify-release**：守门工具复活后并入发布前置检查
- **docs/workflow-flow.svg 残留"曹操"**：0.2.0 三国清理时漏掉的 SVG 文本节点，改为中性 `commander`
- **test/workflow-redesign.test.mjs 三国变量名**：`zhuge` / `lvbu` / `zhaoyun` / `chenlin` 改名为中性 `advisorPrompt` / `backendPrompt` / `reviewerPrompt` / `reviewerDocPrompt`
- **mode-aware-dispatch.test.mjs deepStrictEqual**：补上新字段 `displayName: undefined` / `theme: undefined`
- **公开 API 快照同步**：从 120 → 129 个符号，新增 9 个主题相关导出（`FIXED_AGENT_IDS` / `applyAgentTheme` / `getBuiltinTheme` / `getDefaultTheme` / `listAgentThemes` / `listBuiltinThemes` / `previewAgentTheme` / `renderAgentMdForTheme` / `resolveThemeTargetDir`）

### 影响的文档

- `README.md`、`docs/01-技术架构.md`、`docs/03-使用与运维手册.md`、`docs/04-待办与演进清单.md` 同步主题能力与边界
- `pm-workflow.agents.example.json`（新增）
- `skills/agent-theme-config/SKILL.md`（新增）

## 1.0.0-rc.1

### 文档：明确"OpenCode 内 / 外两种使用模式"边界

经过用户反馈，意识到 README / 主文档没有清晰说明 pm-workflow 与 OpenCode 的关系。本版本不引入新代码能力，只补足这个核心定位。

- **README 顶部新增"适用场景"段**：用对照表清晰区分两种模式：
  - **OpenCode 内（在线）**：dispatch / Auto-continue / ForegroundFallback / 量化分派 / 声明式路由 / Gate / Permission / 健康检查（**真实多 agent 分派必须在此**）
  - **OpenCode 外（离线 CLI）**：`pmw doctor / state / history / report / agents / docs check / models init / verify`（诊断、审计、配置类工具）
- 关键边界写明：pm-workflow 本身**不实现** LLM runtime / tool 协议 / 子进程编排，这些都来自 OpenCode；`pmw` CLI 提供的是"独立可用的诊断与审计工具子集"，不能脱离 OpenCode 完成 dispatch。
- `docs/02-业务功能与任务流转.md` §2 业务能力表开头加边界说明。
- `docs/03-使用与运维手册.md` FAQ 新增"我能不依赖 OpenCode 跑 pm-workflow 吗"。

### 设计回应（不做的事）

用户提出"是否能完全脱离 OpenCode 跑多 agent 分派"。经评估：

- 真正脱离 OpenCode 需重写 LLM 调用层 / tool 协议 / 子进程编排 / 会话管理 / 权限沙盒等，工作量约 6-12 个月，等于写迷你版 OpenCode。
- pm-workflow 的核心价值是"OpenCode 之上的 PM 编排"，离开 OpenCode 后 80% 能力消失。
- 真实使用场景里"装 Node 但不装 OpenCode 还要分派"几乎不存在；用户要么用完整 OpenCode，要么用 Claude Code/Cursor 等同类工具。

**决策**：保持现状（OpenCode 插件 + 独立 pmw CLI 共存）；通过文档明确边界，避免认知误差。0.8.0 起的 `pmw` CLI 已经满足"CI / 服务器 / 没装 OpenCode 的环境"独立诊断需求。

### 验证

- `npm run prepare-publish` 全绿（含 api-snapshot:check + docs:check）
- `npm test` 全套 16 个测试文件继续全绿
- `npm run test:e2e-headless` 3/3 通过
- `npm run test:coverage` 6 个关键模块继续 ≥ 85%

## 1.0.0-rc.0

### 1.0.0 路线第 3 步：真实环境端到端验收框架

**这是 1.0.0 release candidate**。代码层面没有新增能力；本版本目标是把"仅通过单元测试"的隐性风险降到 0，为 1.0.0 SemVer 承诺正式生效做最后的真实环境验证。

- **新增 `docs/sandbox/e2e-checklist.md`**：7 个真实 OpenCode 端到端验收场景，每个含执行步骤、期望输出、`实际` 字段（执行时填）：
  1. `pmw doctor` 在新项目跑通
  2. dispatch 真实执行（非 dry-run）
  3. ForegroundFallback 触发（mock 限流）
  4. Auto-continue 链路 + Guard 拒绝路径（含 4a/4b/4c 三个子场景）
  5. 声明式路由 routing.denied
  6. hot-reload activation: duplicate
  7. `pmw report` 生成 dashboard
- 该 checklist 不进入 5 篇主文档治理范围（`docs/sandbox/` 不被 `pmw docs check` 校验为额外主文档，因为 `listMarkdownDocs` 只扫顶层）。
- **新增 `scripts/e2e-headless.mjs` + `npm run test:e2e-headless`**：自动跑通其中 3 个场景（doctor / routing / report），覆盖代码层闭环：
  - 在 `mkdtemp` 隔离项目里写真实 history.jsonl 与 agent frontmatter
  - 调 `buildDoctorReport` / `resolveAgentTaskRouting` / `isSubagentAllowedByDeclarativeRouting` / `buildHistoryReportSummary` / `renderHistoryReportHtml` 真实公开 API
  - 校验关键指标计数（dispatch 2 / failures 1 / fallback 1 / auto-continue chain 1 step 1 / routing 拒绝 1）+ HTML 体积
- 场景 2 / 3 / 4 / 6 仍需用户在真实 OpenCode 工作区手动验证；checklist 提供执行步骤与期望输出。
- `.gitignore` 加入 `docs/sandbox/screenshots/`：截图默认不入库。

### 设计权衡

- **rc 版本不引入新代码能力**：完全聚焦于真实环境验证。任何 0.x → 1.0 的迁移压力都在 0.12.0 / 0.13.0 提前消化。
- **headless 子集 ≠ 替代真实 OpenCode**：dispatch 真实 spawn / hot-reload activation / 限流模拟 这三件事不能脱离 OpenCode 进程模拟，因此明确划出"必须人工验"的范围。
- **不引入 Playwright / 真实 e2e 框架**：headless 部分是直接调公开 API；不需要自动化浏览器；保持零依赖。

### 测试

- `npm run test:e2e-headless`：3 / 3 通过
- `npm test` 全套 16 个测试文件继续全绿
- `npm run test:coverage` 6 个关键模块继续 ≥ 85%
- `npm run prepare-publish` 全绿（含 api-snapshot:check + docs:check）

### 文档

- CHANGELOG 与 5 篇主文档底部 Change Log 同步
- `docs/03-使用与运维手册.md` 安装节增加 `npm run test:e2e-headless` 用法
- `docs/04-待办与演进清单.md` 状态摘要升 1.0.0-rc.0；1.0.0 发布前置条件清单更新

### 1.0.0 发布前置条件

升 1.0.0 之前必须**全部**满足：

- [ ] `docs/sandbox/e2e-checklist.md` 7 个场景的"实际"字段全部填写完毕
- [ ] `npm run test:e2e-headless` 全绿（已自动跑）
- [ ] `npm run test:coverage` 6 个关键模块 ≥ 85%（已自动跑）
- [ ] `npm run prepare-publish` 全绿（已自动跑）
- [ ] CHANGELOG `1.0.0` 段写明"语义版本承诺正式生效"
- [ ] 5 篇主文档底部 Change Log 同步
- [ ] `git tag v1.0.0` annotated tag
- [ ] `gh release create v1.0.0` GitHub Release

## 0.13.0

### 卫生与守门（1.0.0 路线第 2 步）

- **node_modules 历史 track 清理**：执行 `git rm -r --cached node_modules`，3703 个文件从 git track 移除（磁盘文件保留）。`.gitignore` 已声明 `node_modules/`，本次让它真正生效。从此 `git status` 不再被 npm install 污染；diff 干净。
- **测试覆盖率守门工具**：新增 `scripts/test-coverage.mjs`：
  - 用 Node 22 内置 `--experimental-test-coverage` 跑全套测试，零依赖。
  - 解析 `# file | line% | branch% | funcs% | uncovered` 表格，提取关键模块行覆盖率。
  - 守门阈值 **85%**，不达标 exit=1。
  - 关键模块清单（6 个，覆盖 0.4-0.10 引入的核心能力）：
    - `core/fallback-runtime`
    - `core/auto-continue`
    - `core/agent-routing`
    - `core/agent-library`
    - `core/report`
    - `core/agent-stats`
- **新增 npm 脚本** `npm run test:coverage`，可独立调用；不进入 `prepare-publish`（避免每次发布前都跑 5-10 秒覆盖率）。
- **`.gitignore` 加入 `.kilo/`**：本地 IDE 配置不再污染工作树。

### 当前覆盖率（0.13.0 基线）

| 模块 | 行覆盖率 | 阈值 |
| --- | --- | --- |
| `core/fallback-runtime` | 100.0% | 85% ✓ |
| `core/auto-continue` | 88.0% | 85% ✓ |
| `core/agent-routing` | 95.4% | 85% ✓ |
| `core/agent-library` | 91.3% | 85% ✓ |
| `core/report` | 98.3% | 85% ✓ |
| `core/agent-stats` | 100.0% | 85% ✓ |

**所有关键模块达标**，无需额外补测试。

### 设计权衡

- **不集成到 prepare-publish**：覆盖率跑一次约 5-10 秒，且数据稳定（除非新增模块）。让 `pmw verify` / `npm run prepare-publish` 仍快速通过；用户主动跑 `npm run test:coverage` 即可。
- **不强制全仓库阈值**：`all files` 当前约 74.6%，但其中 receipts.js / migration.js / safety.js 等模块多为运行时审计代码，单元测试很难直接覆盖，强 85% 反而引入垃圾测试。
- **不引入第三方覆盖率工具**：c8 / istanbul / nyc 都需要额外依赖；Node 22 内置足够用。

### 文档

- CHANGELOG 与 5 篇主文档底部 Change Log 同步。
- `docs/03-使用与运维手册.md` 安装节增加 `npm run test:coverage` 用法。
- `docs/04-待办与演进清单.md` 状态摘要升 0.13.0；已完成能力补本次两项。

## 0.12.0

### 新能力：公开 API 锁定 + 治理集成（1.0.0 路线第 1 步）

- **公开 API 快照工具**：新增 `scripts/api-snapshot.mjs`：
  - `check` 模式：把 `dist/index.js` 全部 named export（去掉 `__esModule` / `default`）与 `tools/api-snapshot.json` 对比；删除 / 改名 / 新增任一变更都 exit=1。
  - `update` 模式：用户确认变更后写回快照（含 schema_version / package_version / generated_at / 排序后的 public_symbols）。
  - 零额外依赖；纯本地操作；不解析类型签名（由 tsc 自然兜底）。
- 初始快照 `tools/api-snapshot.json` 入库，含 **120 个公开符号**。
- **prepare-publish 治理集成**：
  - `npm run prepare-publish` 现在等于 `typecheck && build && api-snapshot:check && docs:check`，发布前自动校验 API 与文档治理。
  - 新增 `npm run api-snapshot:check` / `api-snapshot:update` / `docs:check` 三个独立子脚本。
  - `pmw verify` 通过 prepare-publish 间接获得相同保护。
- **公开 API 文档** `docs/05-公开-API-参考.md`：
  - 把 120 个符号按 19 个职责分类列出（OpenCode 入口 / 配置 / 模型清单 / 状态机 / 项目目录与文档 / Dispatch 编排 / Gate / Retry-Fallback / ForegroundFallback / Auto-continue / 健康检查 / 声明式路由 / 量化分派 / 评估回执 / 历史审计 / Doctor / Report / Agent Library / OpenCode agent 配置生成）。
  - 写明 1.0.0 起的 SemVer 兼容承诺（minor 仅新增、major 走 deprecation 周期）。
  - `_*` 前缀符号（如 `_resetPluginActivationGuardForTesting`）和 `@beta` 不享受承诺。
- **docs-check 升级**：`MAIN_DOCS` 从 4 篇扩到 5 篇（含 `docs/05`），相关提示文案改为动态读取主文档数量。

### 设计权衡

- **不引入第三方 api-extractor**：自研 80 行 mjs 已能满足"符号级 SemVer 守护"需求；类型签名变化由 tsc 兜底。
- **快照仅记录符号名，不记录签名**：签名变化在 typescript build 阶段就会被拦截，重复维护意义不大。
- **快照差异 = 显式 update 二选一**：CI 永远不静默更新；变更必须由人确认，符合"少而稳"原则。

### 测试

- 新增 `test/api-snapshot.test.mjs`：7 组用例，覆盖 check 一致性 / 默认参数 / 未知 mode / 模拟删除符号 breaking / 模拟新增符号 / 快照结构合法性 / 快照不存在时报错。
- `npm test` 全套 16 个测试文件继续全绿。

### 修复

- README 当前发布版本字段从 `0.11.2` 对齐到 `0.11.4`（被 `pmw docs check` 第一次集成时发现）。

### 文档

- CHANGELOG 与 5 篇主文档底部 Change Log 同步。
- `docs/04-待办与演进清单.md` 标注 1.0.0 路线 §0.12 已落地。

## 0.11.4

### 优化：模型配置模板支持关键词数组与 provider 优先级

- `pm-workflow.models.example.json` 重写：
  - 每个 agent 的 `model` / `fallback_models` 字段同时支持 **完整模型 ID / 关键词字符串 / 关键词数组** 三种形式。
  - 关键词数组按出现顺序逐个尝试匹配，**第一个命中的关键词就停**，不再尝试后续。
  - 默认值替换为用户偏好示例：`commander/advisor` = `[claude-opus, gpt-5.5, gpt-5.4]`、`backendcoder` = `[gpt-5.4, gpt-5.3-codex]`、`designer` = `[gemini-3.1-, gemini-3-]` 等。
  - 新增 `_resolve_strategy` 段，定义 `match_order` / `provider_priority`（默认 `bestool-route-` > `bestool-` > `antigravity-manager/` > `antigravity/` > `opencode/` > `kr/` > `kg/` > `gh/` > `cx/`）/ `exclude_keywords_default`（`preview` / `deprecated` / `experimental`）。
  - `ai_apply_instructions` 扩到 12 条，明确多源 tiebreak、解析失败容忍场景（关键词当前 0 命中时保留模板原样，等接入新 provider 后再跑）、写入前必须用户确认等硬规则。
- `skills/agent-model-config/SKILL.md` 升级：
  - Hard rule 8-10 改为"读取模板 → 关键词解析 → 用户确认 → 合并配置"四步流程。
  - 新增 "Keyword resolution rules" 段：完整 ID 精确匹配 → 子串关键词匹配 → 多源 tiebreak → 关键词 0 命中容忍 → 用户确认表格的 5 步规范。
  - 明确"AI 永远不静默替换模型 ID"。
- `README.md` 与 `docs/03-使用与运维手册.md` 同步：模型配置 FAQ 增加关键词数组示例与 `_resolve_strategy` / `provider_priority` 说明。

### 已用真实清单验证

按本仓库当前 `~/.config/opencode/opencode.json`（43 个 provider 模型）跑模拟解析：

| Agent | 模板 | 解析结果 |
| --- | --- | --- |
| `commander` / `advisor` | `[claude-opus, gpt-5.5, gpt-5.4]` | `bestool-route-kr/kr/claude-opus-4.7` |
| `backendcoder` | `[gpt-5.4, gpt-5.3-codex]` | `bestool-route-cx/cx/gpt-5.4` |
| `designer` | `[gemini-3.1-, gemini-3-]` | `bestool-route-antigravity/antigravity/gemini-3.1-pro-high` |
| `fixer` | `[claude-sonnet, claude-haiku-4.5, gpt-5-mini]` | `bestool-route-kr/kr/claude-sonnet-4.6` |
| `advisor` | `[claude-haiku-4.5, gpt-5.4-mini, gpt-5-mini]` | `bestool-route-gh/gh/claude-haiku-4.5` |

`gpt-5.4-mini` 当前 0 命中，按设计保留在数组里，等接入新 provider 后下次解析自动生效。

### 测试

- `npm test` 全套 15 个测试文件继续全绿。
- `pmw docs check` 22/22 通过。

## 0.11.3

### 优化：模型配置模板补全 agent 角色画像

- `pm-workflow.models.example.json` 新增 `agent_profiles` 段，对 6 个内置 pm agent 分别给出：
  - `role`：角色一句话定位（含 mode 标识）
  - `description`：职责边界
  - `model_traits`：主模型应具备的能力标签（强推理 / 编码 / UI 直觉 / 检索 等）
  - `fallback_traits`：回退模型应保留的最低能力
  - `model_examples` / `fallback_examples`：可选模型示例（仅参考，仍以全局 OpenCode 清单为准）
  - `tips`：选模型的提示，例如"不要给 commander 选纯编码型模型"
- `agent_profiles` 是只读元数据，AI 校验时使用，**不**写入 `pm-workflow.config.json`。
- `ai_apply_instructions` 加强为 10 条规则，明确 AI 在 agent_models 缺失或模型不符 traits 时**给候选让用户确认、不静默替换**。
- 同步更新：
  - `skills/agent-model-config/SKILL.md`：新增 hard rule 9-10 与"Built-in pm agent profiles"说明表。
  - `README.md`：模板段引用 `agent_profiles` 角色说明。
  - `docs/03-使用与运维手册.md` "模型配置"FAQ：用 6 行表格描述每个 agent 的主模型 / 回退模型应具备的能力，替换原 JSON 示例。

### 测试

- `npm test` 全套 15 个测试文件继续全绿。
- `pmw docs check` 22/22 通过。

## 0.11.2

### 新能力：对话式模型配置模板

- 新增 `pm-workflow.models.example.json`：
  - 用户只需要填 `default_model`、`default_fallback_model`、`agent_models`、`agent_fallback_models`。
  - 模板内置 `ai_apply_instructions`，提示 AI 读取 OpenCode 全局 `provider.*.models` 清单、校验模型 ID，并合并到 pm-workflow 配置。
  - 支持 `write_target=global|project`，分别对应全局 `~/.config/opencode/pm-workflow.config.json` 与项目 `.pm-workflow/config.json`。
- 更新 `agent-model-config` Skill：
  - 增加“读取模型模板并配置 pm-workflow”的触发语义。
  - 明确模板字段到 `agents.definitions.*.model`、`fallback_models` 与 `fallback.chains` 的映射。
  - 将 CLI 定位为脚本化兜底，初次使用主路径改为“用户填模板，AI 读取并合并配置”。
- README、使用与运维手册、待办与演进清单同步更新到 0.11.2。

## 0.11.1

### 新能力：模型初始化 CLI

- 新增 `configureWorkflowAgentModels`：
  - 默认写入全局 `~/.config/opencode/pm-workflow.config.json`，也支持 `scope: "project"` 写当前项目配置。
  - 一次性给内置 6 个 pm agent 设置 `model`。
  - 可同步写入 `fallback_models` 与 `fallback.chains`，让 OpenCode agent fallback 定义和 pm-workflow ForegroundFallback 使用同一组备用模型。
  - 默认校验模型是否存在于 OpenCode 全局 `provider.*.models` 清单，支持 `provider/model-id` 与已带 `/` 的模型 key；需要时可显式跳过校验。
- `pmw` CLI 新增 `models init` 子命令：
  - `pmw models init --model <id> --fallback <id>`：初次使用时配置所有内置 agent。
  - `--scope project`：只写当前项目 `.pm-workflow/config.json`。
  - `--agent backendcoder,designer`：只配置指定 agent。
  - `--allow-unknown`：跳过 OpenCode 模型清单校验。
- 更新模型清单读取逻辑：当 provider model key 不含 `/` 时，同时接受官方 `provider/model-id` 写法；当 key 已含 `/` 时保持原样，避免重复拼接 provider。
- 新增 CLI 回归测试，覆盖成功写入全局配置与未知模型 blocker。
- README、使用与运维手册、待办与演进清单同步更新。

## 0.11.0

### 新能力：文档治理检查

- 新增 `src/core/docs-check.ts`：
  - `buildDocsCheckReport` — 只读检查 README 当前版本与 `package.json` 是否一致、docs 下是否仅保留 4 篇主文档、5 篇主文档是否都有 Change Log、CHANGELOG 是否包含当前版本节、是否残留旧文档目录或旧路径引用。
  - 输出结构化 `checks / warnings / blockers`，便于 CI 消费；存在 blocker 时 `ok=false`。
- `pmw` CLI 新增 `docs check` 子命令：
  - `pmw docs check` — 人类可读输出
  - `pmw docs check --json` — JSON 输出，存在 blocker 时退出码为 1
- 文档同步：
  - README 当前版本升到 0.11.0。
  - `docs/03-使用与运维手册.md` 增加 `pmw docs check` 用法与 CI 建议。
  - `docs/04-待办与演进清单.md` 标注文档治理检查已落地，并移除旧路径字面引用。

## 0.10.1

### 文档与 OpenCode 接入说明维护

- README 当前版本从旧的 `0.2.0` 对齐到 `0.10.1`，并修正"4 篇主文档"为 README + 4 篇主文档。
- README 与 `docs/03-使用与运维手册.md` 增加 OpenCode 官方 npm plugin 接入方式：在 `opencode.json` 中声明 `plugin: ["@walke/opencode-pm-workflow"]`；本地 server / TUI 子路径保留为调试方式。
- `docs/04-待办与演进清单.md` 补充下一步治理建议：OpenCode 接口回归清单、文档版本同步检查、`permission.task` 官方 glob / last-match-wins 兼容性评估、`pmw docs check` 只读命令候选。

## 0.10.0

### 新能力：跨项目共享 agent 库（长期路线 §7.3 落地）

- 新增 `src/core/agent-library.ts` 模块（240+ 行）：
  - `listAgentLibrary` — 列出项目级 + 全局级 agent，识别"项目覆盖全局"关系；同名时项目优先，不重复列。
  - `promoteProjectAgentToGlobal` — 把项目级 agent 复制到 `~/.config/opencode/agents/`；默认拒绝覆盖、不删原文件，需显式 `overwrite: true` 才覆盖。
  - `doctorAgentLibrary` — 检查所有 agent 的 frontmatter 完整性，返回 4 类 finding（缺 description / mode / model / primary 缺 permission.task），分级（warn / info）+ 聚合计数 + 明细。
- `pmw` CLI 新增 `agents` 子命令：
  - `pmw agents list [--json]` — 列 agent 库，标注 shadow 关系与 finding 数
  - `pmw agents promote <id> [--overwrite] [--json]` — 复制项目级 agent 到全局
  - `pmw agents doctor [--json]` — 跑完整性检查
  - 全部支持 `--cwd <path>` 指定项目目录；`XDG_CONFIG_HOME` 环境变量隔离全局目录（测试与多账户场景友好）

### 设计权衡

- **不引入网络 marketplace**：这是本地工具增强，不是中心化分发。
- **不实现 rename / delete**：删除是用户决定的事，工具只做安全的复制与诊断。
- **promote 不删除项目级原文件**：用户可保留 project-level 覆盖版本；让 shadow 关系成为有意识的设计选择。
- **findings 是建议而不是错误**：`doctor` 命令永远 exit=0，CI 用 `--json` 自行判断 severity 字段做门禁。

### 测试

- 新增 `test/agent-library.test.mjs`：13 组用例，覆盖
  - `listAgentLibrary`：项目级识别 / shadow 关系 / 同名不重复
  - `promoteProjectAgentToGlobal`：成功路径 / 项目级不存在 / 全局已有默认拒绝 / overwrite 强制
  - `doctorAgentLibrary`：聚合计数与明细
  - CLI 集成：`agents list` / `agents promote` / `agents promote` 缺参 / 未知子命令 / `agents doctor --json`
- `npm test` 全套 15 个测试绿。

### 修复

- 修复 0.9.0 引入的 CLI 文件结构 bug（`runVerify` 函数体被前次 edit 误删，导致 `node --check` 解析失败）；`scripts/cli/index.mjs` 现已通过 syntax 校验。

### 文档

- CHANGELOG 与 5 篇主文档底部 Change Log 同步。
- `docs/03-使用与运维手册.md` CLI 安装节增加 `pmw agents` 用法示例。
- `docs/04-待办与演进清单.md` §7.3 标注为已落地；五个长期路线方向至此全部交付（§7.1 / §7.2 / §7.3）。

## 0.9.0

### 新能力：可视化执行回执 dashboard（长期路线 §7.2 落地）

- 新增 `src/core/report.ts` 模块：
  - `buildHistoryReportSummary` — 从 history.jsonl 计算关键指标（dispatch 总数 / 失败数 / fallback 切换 / auto-continue 链与步与中止 / routing 拒绝）+ 按类型分组。
  - `renderHistoryReportHtml` — 生成单文件 HTML 报告。嵌入内联 CSS（深色主题）+ vanilla JS 筛选；不引外链字体、不引前端框架。
  - 内置 XSS 转义：事件 JSON 嵌入 script 标签中时 `<` 自动 → `\u003c`，恶意 HTML 不会被解释。
- `pmw` CLI 新增 `report` 子命令：
  - 默认输出到 `.pm-workflow/report.html`
  - `--out <path>` 自定义路径
  - `--json` 仅输出 summary 不写文件，便于 CI 消费
- 报告体积：~8 KB（空项目）/ 与事件数量线性相关。

### 设计权衡

- **不开本地 HTTP server / 不开端口 / 不实时刷新**：单文件静态 HTML 已够用，引入 server 增加运维面而无对应价值。
- **不上传任何数据**：所有计算在本地完成；浏览器打开报告也不发任何外部请求。
- **嵌入事件原文为 `<script>` 中常量**：与"上传到远端"严格区分；离线查看的最简形态。

### 测试

- 新增 `test/report.test.mjs`：6 组用例，覆盖空 history / 分类计数 / HTML 关键节点 / XSS 转义 / CLI 默认输出 / `--out` 自定义 / `--json` 不写文件。
- `npm test` 全套 14 个测试绿。

### 文档

- CHANGELOG 与 5 篇主文档底部 Change Log 同步。
- `docs/03-使用与运维手册.md` CLI 安装节增加 `pmw report` 用法示例。
- `docs/04-待办与演进清单.md` §7.2 标注为已落地。

## 0.8.0

### 新能力：pmw CLI 子命令（长期路线 §7.1 落地）

- 新增 `scripts/cli/index.mjs` 主入口与 5 个子命令：
  - `pmw doctor [--json]` — 输出当前项目 doctor 报告
  - `pmw dispatch dry-run [prompt...]` — dispatch 预演，不执行命令
  - `pmw state [--json]` — 输出 state.json 摘要
  - `pmw history [--limit N] [--type T] [--json]` — 查询 history.jsonl
  - `pmw verify` — 本地跑 typecheck + build + smoke + pack-dry-run
  - 全局支持 `--cwd <path>` / `--json` / `--help` / `--version`
- `package.json` 增加 `bin: { pmw: "./scripts/cli/index.mjs" }`：用户 `npm install -g @walke/opencode-pm-workflow` 后即可在任何项目直接 `pmw doctor`。
- CLI 完全复用 dist/ 中已经纯函数化的 `buildDoctorReport` / `buildDispatchCommand` / `buildExecutionPlan` / `buildStateSummary` / `queryHistory`；零额外依赖、零运行时改动。

### 设计权衡

- **同包内 bin 入口，不拆独立 npm 包**：子包发布维护成本高；`bin` 字段已能让用户直接通过 `pmw` 命令调用，无需额外 npm 包。
- **手写 argv 解析（约 30 行）**：不引入 `commander` / `yargs`；命令简单，自研更稳。
- **CLI 默认只读**：`doctor` / `state` / `history` / `dispatch dry-run` 全部不写文件、不开 spawn；只有 `verify` 调本包 `npm run verify-release` 是唯一例外（且写入边界由 npm script 控制）。
- **不接管 OpenCode 主循环**：CLI 仅做诊断与离线编排预演；运行时 dispatch 仍走插件路径。

### 测试

- 新增 `test/cli.test.mjs`：10 组 spawnSync 集成测试，覆盖 `--version` / `--help` / 无参等同 help / 未知命令 / 5 个子命令各自 happy path / `--json` 结构化输出 / `--limit` 截断。
- `npm test` 全套 13 个测试绿。

### 文档

- CHANGELOG 与 5 篇主文档底部 Change Log 同步。
- `docs/03-使用与运维手册.md` 第 3 节增加 CLI 命令表与典型用法。
- `docs/04-待办与演进清单.md` §7.1 标注为已完成，并把版本号升到 0.8.0。

## 0.7.0

### 新能力：permission.task 声明式路由

- 新增 `src/core/agent-routing.ts` 模块：
  - `parseFrontmatterTaskPermission`：自研轻量 frontmatter parser，仅解析 `permission.task` 两层 map 结构，**不引入 yaml 依赖**；解析失败的行直接跳过，markdown 编辑错误不会拖垮 dispatch。
  - `resolveAgentTaskRouting`：按"项目 `.opencode/agents/` → 全局 `~/.config/opencode/agents/`"顺序查找 primary agent 的 markdown，返回 `allowedSubagents / deniedSubagents / taskPermission` 三件套；找不到时 `source: "none"`，调用方自行回退。
  - `isSubagentAllowedByDeclarativeRouting`：三级优先级判定 — `deny` > `allow|ask` > fallback（默认 `true`，保持向后兼容）。
- 接入 `src/server/runtime.ts` 的 `buildAutoContinueDispatch`：
  - Auto-continue 选择 next agent 时，先调 `resolveAgentTaskRouting` + `isSubagentAllowedByDeclarativeRouting`；被 deny 时直接返回 `undefined` 让链路停在 `completed`。
  - 拒绝事件写 `routing.denied` 历史，便于排障。
  - primary 缺 frontmatter（`source: "none"`）时按 fallback 允许，旧项目零改动。

### 设计权衡

- **不删除 `dispatch_map`**：它仍是官方支持的"全局覆盖手段"。0.7.0 的目标是"让用户改 markdown 就能调路由"，而不是"让用户失去现有运行时配置入口"。
- **不引入 yaml 解析器**：完整 YAML 是不可控复杂度。`permission.task` 的两层结构只需要约 70 行自研 parser，更稳。
- **frontmatter 形式与 OpenCode 1.15.x 官方约定保持一致**：`permission.task[subagent]: allow|deny|ask`。

### 测试

- 新增 `test/permission-task-routing.test.mjs`：10 组用例，覆盖完整 frontmatter / 缺失 frontmatter / 仅 permission 无 task / 错值容错 / 引号 value / 项目级命中 / source=none / ask 等价 allow / deny 优先 / fallback 行为。
- `npm test` 全套 12 个测试绿。

### 文档

- CHANGELOG 与 4 篇主文档底部 Change Log 同步。
- `docs/01-技术架构.md` 新增 §14 节描述声明式路由分层。
- `docs/03-使用与运维手册.md` FAQ 增加 frontmatter 路由示例。

## 0.6.0

### 新能力：插件启动健康检查 + Hook 注册去重

- 新增 `src/server/hooks-health.ts` 模块：
  - `evaluatePluginHealth`：按可配置阈值（默认 `minAgents: 1`、`minTools: 5`、`minMcps: 0`）评估插件装配，返回结构化 findings（severity / category / expected / actual）。失败仅 `warn` 不阻断启动，符合"安全优先 + 不打扰用户"的设计原则。
  - `reportPluginHealth`：把 findings 写入 `ctx.client.app.log`，便于运维定位"为什么某个能力没生效"。
  - `guardPluginActivation`：进程内 plugin id 去重哨兵，防止 OpenCode hot-reload 场景下事件回调被重复注册导致 `syncState` / `writeReviewMarker` 被多次执行。
- `src/server/plugin.ts` 接入：
  - 装配前先调 `guardPluginActivation`；返回 `duplicate` 时跳过 hooks 注册与 health 写入，但仍提供完整的 tool / config 集合（无副作用）。
  - 装配完成后自动跑健康检查并通过 `app.log` 输出。
  - `PmWorkflowPlugin` options 新增可选 `health: Partial<PluginHealthThresholds>` 字段，便于上游覆盖默认阈值。

### 设计权衡

- **不拆分 hooks.ts**：`hooks.ts` 仅 131 行 4 个简单 hook，盲目拆 4 个文件会引入冗余间接层；保留单文件结构更易维护。借鉴 oh-my-opencode-slim 的"hook 工厂模式"主要价值在健康检查与去重——这两点用独立模块实现即可，不需要重构既有结构。
- **不向用户暴露 health 字段**：`PluginHealthThresholds` 是 plugin 装配级参数（通过 OpenCode plugin options 传入），不进入 `pm-workflow.config.json`；避免增加用户配置面，符合"少而稳"原则。

### 测试

- 新增 `test/hooks-health.test.mjs`：8 组用例，覆盖默认阈值通过、agents/tools/mcps 各类 finding、自定义阈值覆盖、`guardPluginActivation` 首次/重复/不同 id/reset 行为。
- `npm test` 全套 11 个测试绿。

### 文档

- CHANGELOG 与 4 篇主文档底部 Change Log 同步。

## 0.5.0

### 新能力：Auto-continue 真自动化（Gate 之上的自动续跑）

- 新增 `WorkflowConfig.auto_continue` 节：`enabled / max_steps / cooldown_ms / require_clean_tree / stop_on_feedback_signal`，全部默认保守值（`enabled=false`）。
- 新增 `permissions.allow_auto_continue` 总开关，默认 `false`。**双总开关同时打开**才允许进入续跑链路；与 Gate / Permission / Confirm 不互替。
- 新增 `WorkflowState.auto_continue`：`last_step_at / steps_used / aborted_reason`，作为冷却判定与终止原因审计来源。
- 新增 `src/core/auto-continue.ts` 模块：`evaluateAutoContinueGuard`（5 步分层校验）、`detectFeedbackStopSignal`（中英文用户停止词识别）、`markAutoContinueChainStart` / `recordAutoContinueStep` / `markAutoContinueAborted` 三件套生命周期事件。
- `executeAutoContinueChain` 全面重写：
  - 改为 async，使用 setTimeout-based 异步 sleep，不再阻塞 OpenCode 事件循环。
  - 链路启动前 + 每步前两次调用 `evaluateAutoContinueGuard`。
  - `maxAutoSteps` 默认值改为读取 `config.auto_continue.max_steps`，硬上限提到 5。
  - 步骤间真实冷却 sleep。
  - 反馈停止信号匹配后立即写 `auto_continue.aborted` 并退出。
  - `stopReason` 扩展 `guard-blocked` 与 `feedback-stop` 两个新值，并附 `lastBlockReasons` 帮助诊断。
- 与 oh-my-opencode-slim 的"无 Gate 自动续跑"严格区分：本能力**绝不绕过**已有 Gate；这是 pm-workflow 的核心安全承诺。

### 测试

- 新增 `test/auto-continue.test.mjs`：8 组用例，覆盖反馈停止词、双总开关默认拒绝、双开关打开后允许、`max_steps` 拦截、冷却期内被拒、冷却期外允许、状态机生命周期、`defaultWorkflowConfig` 默认值检查。
- 调整 `test/dispatch-quality-loop.test.mjs`：原 evaluator 测试改用隔离的 mkdtemp 项目并显式打开 `enabled=true / cooldown_ms=0`，反映新默认行为；同时把 `executeAutoContinueChain` 调用加 `await` + 注入 `sleep` 桩。
- 全套 10 个测试 (`npm test`) 全绿。

### 文档

- `pm-workflow.schema.json` 增加 `auto_continue` 与 `permissions.allow_auto_continue` 字段说明。
- `pm-workflow.config.example.json` 增加默认配置块。
- 4 篇主文档 + CHANGELOG 同步更新底部 Change Log。

## 0.4.0

### 新能力

- **ForegroundFallback 运行时模型降级**：新增 `WorkflowConfig.fallback.chains: Record<string, string[]>` 配置项。dispatch 子进程返回限流（429/rate-limit）、超时、上下文溢出、模型不可用四类错误时，自动按链路切换备用 model 重试，避免循环重试浪费 token。每次切换写入 `fallback.foreground_switch` 历史事件，便于审计。
- **量化分派指引（agent stats）**：handoff packet 新增可选 `agentStats` 字段。当任务存在多候选 agent 时，自动注入 1-3 张候选卡片（speed/cost/quality/delegateWhen/dontDelegateWhen/ruleOfThumb），帮助被 handoff 的 agent 准确判断"是否需要再委派"，降低二次分派率。单候选场景不注入，避免无意义 token 消耗。
- **新模块导出**：`shared.ts` / `dist/index.js` 新增 `AGENT_STATS_LIBRARY`、`pickAgentStats`、`buildForegroundFallbackPlan`、`detectFallbackTrigger`、`pickNextFallbackModel`、`resolveFallbackChain` 与对应类型 `AgentStatsCard`、`FallbackPlanRuntime`、`FallbackTriggerKind`、`FallbackTriggerSignal`。

### OpenCode 1.15.7 兼容

- 升级 `@opencode-ai/plugin` 依赖范围到 `^1.15.7`（之前 `^1.14.22`，跨 35+ 版本）。
- TUI 命令注册改为 **runtime 双路径适配**：优先 `api.keymap.registerLayer({ commands })`（1.15.x 推荐 / v2 唯一可用），自动回退 `api.command.register(...)`（1.14.x 路径）。同一份代码兼容三个版本周期。

### 测试

- 新增 `test/fallback-runtime.test.mjs`：覆盖四种触发器命中、链路解析、双索引合并去重、`pickNextFallbackModel` 边界（空链路 / 当前不在链 / 链路用尽）、`buildForegroundFallbackPlan` 集成场景。
- 新增 `test/agent-stats.test.mjs`：覆盖卡片完整性、单候选不注入、多候选 target 排首、最多 3 张卡片、target 与 fallback 重叠去重、handoff 端到端注入。
- `npm test` 脚本扩展到 9 个测试文件，全绿。

### 内部

- 新增 `src/core/fallback-runtime.ts` 与 `src/core/agent-stats.ts` 两个独立模块，遵循"Analyzer/Registry/Runtime 分层不被打破"的架构治理规则。
- `src/server/runtime.ts` 中 `executeDispatchCommand` 的返回类型由 `ReturnType<typeof spawnSync>` 收敛为显式 `DispatchExecutionResult`，`stdout/stderr` 类型 narrow 为 `string`，避免上层 `dispatch-tools.ts` 联合类型噪音。

### 文档

- 同步 `pm-workflow.schema.json`：新增 `fallback.chains` 字段说明。
- 同步 `pm-workflow.config.example.json`：增加 chains 示例（按 agent 配置降级路径）。

## 0.3.0

- **Breaking**: 完全移除旧 agent 名称兼容层。删除 `LEGACY_AGENT_MAP`、`CLI_COMPATIBLE_SUBAGENTS`、`normalizeAgentName`、`normalizeWorkflowAgentMode`、`normalizeWorkflowConfigModes` 等所有向后兼容代码。
- **Breaking**: `DispatchAgent` 类型仅保留新名称（`commander/advisor/backendcoder/designer/fixer/advisor`），不再包含旧名称。
- **Breaking**: `dispatch_map` / `fallback.agent_map` 的 key 从语义名称改为新 agent 名称。
- 清理 `prompts.ts`、`analyzer.ts`、`evaluator.ts`、`handoff.ts`、`plan.ts`、`dispatch-tools.ts` 中所有旧名称分支。
- 更新 `pm-workflow.schema.json`，移除旧名称 properties。
- 更新 `AGENTS.md` 移除兼容期说明。

## 0.2.2

- 更新 `commands/*.md`（4 条 lane 命令）的入口 agent 为新的主协调命名。
- 更新 `pm-workflow.config.example.json` 示例配置，全面使用新 agent 名称。
- 更新 `pm-workflow.schema.json` schema，补充新旧名称的 definitions properties。
- 更新 `AGENTS.md` 中主 agent 定位描述。

## 0.2.1

- 修复子 agent mode 定义：将 `backendcoder`/`designer`/`fixer`/`advisor` 的 mode 从 `"all"` 改为 `"subagent"`，语义更清晰，避免未来误用。

## 0.2.0

- **Agent 命名简化**：弃用旧 namespaced 角色名，统一为通用短名称（commander/advisor/backendcoder/designer/fixer/advisor）。
- **角色合并**：QA + Writer 合并为 `fixer`（审查与文档），前端双角色合并为 `designer`。
- **移除硬编码模型 ID**：所有内置 agent 定义不再携带具体模型 ID，改为从全局 OpenCode 配置读取。
- **向后兼容**：新增 `LEGACY_AGENT_MAP` 自动映射机制，旧名称自动转换为新名称，保留 2 个版本兼容期。
- `DispatchAgent` 类型扩展为新旧名称联合类型，确保旧配置仍可正常工作。
- 更新 analyzer 路由、prompts 分支、evaluator 判断、plan 默认值、dispatch-tools 格式化输出，全面适配新名称。
- 同步更新 AGENTS.md、README、全部 7 个测试文件。

## 0.1.18

- 文档收敛：将 30+ 篇分散文档（dev/runbooks/specs/superpowers）合并为 5 篇主文档（README + 01-技术架构 + 02-业务功能 + 03-使用运维 + 04-待办演进）。
- 所有 Mermaid 流程图统一并入主文档正文，不再散落维护。
- 新增 `AGENTS.md` 开发指南，固化"变更后必须同步现有文档、禁止新建文档"与"每次变更必须更新 CHANGELOG"规则。
- 每篇主文档底部增加 Change Log 表格，便于追踪文档版本与代码版本对应关系。
- 删除历史 spec/plan/migration/audit/draft 类文档 29 篇，仅保留当前 documentation consolidation 的 spec/plan 作为最小历史集合。

## 0.1.17

- 新增 `researcher` 一等语义角色，补齐默认类型、dispatch/fallback 映射、内置 agent 定义与专属执行 prompt。
- 为调研/资料搜索类请求增加 `researcher` 中等触发路由，避免“调研 + 后端关键词”场景被误分派到 `backend`，同时保持实现、文档与 QA 任务边界不被抢占。
- README 补充 `researcher` 角色职责说明，并新增 researcher routing implementation plan 文档以便后续追踪实现过程。

## 0.1.16

- 新增 Agent Definition Registry，按 `project/.opencode/agents` → `global ~/.config/opencode/agents` → legacy `agent` 目录 → 内部 fallback 的优先级解析 agent 定义。
- 将 auto-continue runtime dispatch 接入 registry，按外部 agent frontmatter 的 `model / mode / description` 生成实际 executable agent 与 invocation 语义。
- 为 dispatch 输出补充 `resolvedAgent` 诊断摘要，并新增 runtime/registry 级测试覆盖项目级优先、全局优先、字段级 fallback 与展示路径。

## 0.1.15

- 将 handoff packet 压缩为 `mission / context / scope / acceptance / artifacts / responseFormat` 结构，减少重复 prompt 与无关长文本注入。
- 更新 subagent handoff prompt 中文模板，并按 agent 职责裁剪上下文，统一回传 `summary / verification / risk` 结构化结果。
- 收紧 evaluator 对成功结果的判定：缺少结构化字段时不再直接视为完成，降低“有输出但不可评估”被误判成功的风险。

## 0.1.14

- 新增 `pm-quick`、`pm-medium`、`pm-full`、`pm-debug` 四条 Command Lane 入口，并将其注册到 TUI commands 与发布包 `commands/` 中。
- 引入 lane-aware orchestration：补充 `PmLaneContext`、`TopologySummary`、`TodoPolicySummary`，让调度摘要、toast 与 loop 输出携带更明确的策略信息。
- 修复 primary / subagent 调用语义：primary 继续走 `opencode run --agent`，subagent 改走 `opencode task`，避免专业 agent 被错误按 primary 路径调用并 fallback。
- 更新 README、runbook、架构/迁移文档与流程图，统一补充 0.1.14 的 command lane、mode-aware dispatch 与 topology summary 说明。

## 0.1.13

- 修复开发导向路由在 `collect-spec` / `create-dev-plan` gate 阶段过早切换到专业 agent 的问题，确保只有 `start-development` / `continue-development` 才根据 prompt 自动分派 backend/frontend/writer/QA。
- 新增 gate 路由回归测试，确保需求压缩和开发计划不会被 backend/plugin 关键词绕过。
- 补齐 README、配置示例与 schema，使发布包文档匹配当前 OpenCode 插件、agent、模型与 Skill 行为。

## 0.1.12

- 新增全局 OpenCode provider model inventory 读取能力，并按 `provider.*.models` 的 model key 校验 agent 模型。
- 为默认 workflow agents 配置开发导向模型：主协调、后端、前端、QA、文档分别使用对应模型。
- 新增 `agent-model-config` Skill，用于新项目自动识别 Claude/OpenCode 项目类型并配置 agents/models。
- 将 PM 默认调度改为开发阶段按任务内容分派专业 subagent，并在 prompt 中固化 Workflow/Todo 终结标准。

## 0.1.9

- 新增对 workflow agent `mode: "all"` 的配置支持，兼容可同时作为 primary 与 subagent 的 OpenCode agent 模式
- 对旧 subagent 配置增加 `subagent -> all` 归一化兼容，避免现有全局/项目配置继续把它们锁死为 subagent
- 修复当前 CLI `opencode run --agent ...` 直调链路下，上述 workflow agents 被错误识别为 subagent 并 fallback 到默认 `build` agent 的问题

## 0.1.8

- 自动生成的 fallback agents 默认带 `hidden: true`，减少 agent 切换列表噪音

## 0.1.7

- 将默认 agent 模式收紧为 `subagent`，并显式声明新的主协调 agent 为唯一 primary workflow agent
- 新增前端/UI subagent，默认 `hidden: true`
- QA、writer、frontend 默认都作为隐藏 subagent 注入，避免被 OpenCode 当成常用主 agent
- 配置 schema 与示例新增 `hidden` 和 `frontend` dispatch 支持

## 0.1.6

- 迁移并忽略旧项目配置中的 `pm`、`qa_engineer`、`writer` agent 定义，避免再次覆盖用户本地同名 subagent
- `buildOpenCodeAgentConfig` 防御性跳过 legacy semantic agent keys，只注入 namespaced workflow agents

## 0.1.5

- 新增全局配置文件支持：`~/.config/opencode/pm-workflow.config.json`
- 插件加载时会自动创建全局配置文件，并按“默认值 -> 全局配置 -> 插件 options -> 项目配置”的顺序合并
- 项目旧配置中的旧主协调命名会自动迁移到新的主协调命名

## 0.1.4

- 将默认主协调 agent 改为新的 namespaced 主协调命名，并收敛 primary coordinator 角色设定
- 更新默认 `agents.dispatch_map`、配置示例与 schema，使内部 `pm` 角色映射到新的主协调 agent

## 0.1.3

- 将默认 workflow agents 改为 namespaced 形式，避免覆盖用户已有的 `pm` / `qa_engineer` / `writer` agent
- 新增 `agents.dispatch_map`，内部调度仍可使用 `pm`、`qa_engineer`、`writer` 语义角色，并映射到实际 OpenCode agent 名称
- 修正配置 schema 与示例，支持自定义 namespaced agent 与 fallback model

## 0.1.2

- 移除运行时对 `~/.config/opencode/skills/pm-workflow/scripts` 的依赖，review gate、pre-commit check 与 feedback signal 检测改为包内实现
- 补齐 workflow agents 的模型与 fallback model 配置，并由 OpenCode config hook 注入 `pm`、`qa_engineer`、`writer` 等 agent
- 切换发布包名与文档引用到 `@walke/opencode-pm-workflow`
- 修复 OpenCode 新版 `tool.execute.before` hook 参数读取、TUI workspace 路径、跨平台构建与类型声明发布

## 0.1.1

- 补齐 `admin-tools` 与 `state-tools`，修复 `server/plugin.ts` 装配链中的缺失模块
- 暴露 `pm-get-execution-plan` 只读工具，并完善 `ExecutionPlan v2` 的动作分支预览
- 修正 `plugins/*` 兼容壳的导出契约，避免自动加载目录中的非标准 server 插件报错
- 清理 `pm-workflow` 的重复加载配置，恢复为通过 `plugins/*` 兼容壳自动接入
- 同步修复启动期可用性问题并通过当前插件契约测试与发布前校验

## 0.1.0

- 完成 `pm-workflow` 的 package-first 改造
- 将 `server`、`tui`、`shared` 运行逻辑迁入 `packages/opencode-pm-workflow/src/*`
- 将 `server` 拆分为 `plugin`、`runtime`、`hooks` 与 `tools/*` 模块
- 将 `tui` 拆分为 `plugin`、`toasts` 与 `commands` 模块
- 将 `shared` 收敛为纯 `re-export` 入口，核心逻辑下沉到 `core/*` 与 `orchestrator/*`
- 提供 `dist/*` 构建产物作为统一发布入口
- 保留 `plugins/*` 兼容壳，并转发到 `@walke/opencode-pm-workflow` 子路径入口
- 补齐 `typecheck`、`build`、`verify-release`、`check-auth`、`prepublishOnly` 等发布前检查链路
- 增加迁移总结、发布就绪报告、发布清单与发布说明草稿文档
- 同步契约测试到当前真实 package-first 结构，`npm test` 已达到 `13/13` 全绿
- 引入 `ExecutionPlan v2` 只读预览能力，并通过 `pm-get-execution-plan`、`pm-dry-run-dispatch`、`pm-dry-run-loop` 对外可见
