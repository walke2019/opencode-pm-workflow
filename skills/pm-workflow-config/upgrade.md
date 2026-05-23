# pm-workflow 升级流程

本文件是 [SKILL.md](SKILL.md) 的支持文件，详细介绍升级到最新版的完整步骤。AI 在用户说"升级到最新版"时按需引用。

**最快路径**：直接跑互动升级脚本，它会按下面的步骤逐步执行并输出日志：

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/upgrade.sh
```

如果脚本不可用，按下面的手动步骤跑。

---

## 升级前必查

```bash
# 1. 当前 CLI 版本
pmw --version

# 2. npm registry 上 rc tag 最新版本
curl -fsSL https://registry.npmjs.org/@walke/opencode-pm-workflow | python3 -c 'import sys,json;print(json.load(sys.stdin)["dist-tags"]["rc"])'

# 3. 当前 OpenCode plugin cache 版本
cat ~/.cache/opencode/packages/@walke/opencode-pm-workflow@rc/node_modules/@walke/opencode-pm-workflow/package.json | python3 -c 'import sys,json;print(json.load(sys.stdin)["version"])'
```

**判断**：

- 如果 CLI 版本 < npm rc tag → 需要升级 CLI
- 如果 cache 版本 < npm rc tag → 需要清 cache 让 OpenCode 重新拉
- 如果 CLI 版本 ≠ cache 版本 → 必须保持一致（清 cache + 重启 OpenCode）

---

## 完整升级步骤

### Step 1：完全 quit OpenCode

GUI 应用必须由用户操作，shell 触不到。**用户必须**：

- 桌面端：菜单 OpenCode → Quit OpenCode（或 `⌘+Q`）。点关闭窗口的 X 不够，进程还在后台。
- TUI：退出会话。

或 AI 可以用 pkill 强制结束（**会丢失当前会话**）：

```bash
pkill -9 -f "OpenCode Helper" && pkill -9 -f "OpenCode.app" && sleep 3
ps aux | grep -iE "OpenCode\.app/Contents" | grep -v grep | wc -l
# 应输出 0
```

### Step 2：清 OpenCode plugin cache

```bash
rm -rf ~/.cache/opencode/packages/@walke/opencode-pm-workflow@rc
ls ~/.cache/opencode/packages/@walke/ 2>/dev/null
# 应空
```

下次 OpenCode 启动时 Bun 会自动拉最新版。

### Step 3：升级全局 pmw CLI

```bash
npm install -g @walke/opencode-pm-workflow@rc
pmw --version
# 应等于 npm rc tag 最新版
```

### Step 4：（可选但建议）清旧 skill md

rc.3-rc.6 时期 skill auto-install 写过扁平 `*.md`（OpenCode 不识别）。rc.7+ 改为子目录结构。如果你之前升过这些版本，可能有残留。

```bash
# 看是否有扁平 md（rc.3-rc.6 残留）
ls ~/.config/opencode/skills/*.md 2>/dev/null

# 如果有，清掉
rm -fv ~/.config/opencode/skills/*.md
```

### Step 5：用户双击启动 OpenCode

shell 启动 GUI 受 macOS 安全限制，必须用户操作：

- Spotlight `⌘+空格` → 输入 OpenCode → 回车
- 或从 Launchpad 找图标双击

### Step 6：等 OpenCode 完成 Bun install + plugin 激活

启动后等约 8-10 秒，让：

- Bun 拉新版 plugin 到 `~/.cache/opencode/packages/`
- plugin 首次激活
- skill auto-install 把包内 skill 同步到 `~/.config/opencode/skills/<id>/`（rc.9+ 含 supporting files + scripts/）

### Step 7：验证

```bash
${CLAUDE_SKILL_DIR}/scripts/check.sh
```

应该看到：

- ✓ CLI 与 plugin 版本一致（最新 rc）
- ✓ skills 目录都是子目录结构
- ✓ agent md 含完整字段
- ✓ pm-workflow log 错误数 = 0

---

## 升级后的可选步骤

### 如果 agent md 是旧版（缺 temperature/tools/permission）

升级到 rc.8+ 后，建议重新 apply 主题让 agent md 升级到完整规范：

```bash
# 看当前主题
grep "^theme:" ~/.config/opencode/agents/commander.md
# 例如：theme: default

# 重新 apply（备份 + 写新版）
${CLAUDE_SKILL_DIR}/scripts/reset-agents.sh
```

或让用户选其他主题（调 `agent-theme-config` skill）。

### 如果 model 配置丢了

rc.8 起主题不写 model 字段，model 由 `~/.config/opencode/opencode.json` 单独配置（调 `agent-model-config` skill）。如果用户从 rc.7 之前升上来，原来在 agent md 里的 model 配置不会被自动迁移到 `opencode.json`。

让用户调 `agent-model-config` skill 重新配置。

---

## 版本兼容矩阵

| 从版本 | 升到 rc.X | 必做的额外步骤 |
|---|---|---|
| 0.x.x | 1.0.0-rc.9 | 全部清 + 重新 apply 主题（agent ID 全部改了：pm_lead → commander 等） |
| 1.0.0-rc.0 ~ rc.5 | 1.0.0-rc.9 | 清 plugin cache + 升 CLI + 重新 apply 主题（agent ID 在 rc.6 改） |
| 1.0.0-rc.6 | 1.0.0-rc.9 | 清 plugin cache + 清扁平 skill md（rc.7 改子目录） + 重新 apply 主题（rc.8 加字段） |
| 1.0.0-rc.7 | 1.0.0-rc.9 | 清 plugin cache + 重新 apply 主题（rc.8 加字段） |
| 1.0.0-rc.8 | 1.0.0-rc.9 | 清 plugin cache + 重启 OpenCode（rc.9 加 pm-workflow-config skill 与 supporting files） |

---

## 跨大版本升级注意事项（0.x → 1.0.0+）

如果用户从 0.x 升上来，**强烈建议先备份**：

```bash
BACKUP=~/.config/opencode/.backup-pre-1.0
mkdir -p "$BACKUP"
cp -r ~/.config/opencode/agents "$BACKUP/agents" 2>/dev/null
cp ~/.config/opencode/pm-workflow.config.json "$BACKUP/pm-workflow.config.json" 2>/dev/null
cp -r ~/.config/opencode/skills "$BACKUP/skills" 2>/dev/null
echo "备份至: $BACKUP"
```

然后清掉旧 ID（rc.6 起改名）：

```bash
rm -fv ~/.config/opencode/agents/pm_*.md
rm -fv ~/.config/opencode/agents/{pm_lead,pm_advisor,pm_backend,pm_frontend,pm_reviewer,pm_researcher}.md
```

升级后 plugin 会用新 ID 重建。

---

## 验证升级成功

跑 `check.sh` 看到全部 ✓ 后，建议在 OpenCode 内做最终验证：

1. **UI 切换列表**（按 Tab 键）：只显示 commander
2. **@ 自动补全**（输入 `@`）：看到 commander + 5 个子代理 + OpenCode 内置（build/plan/general/explore/scout）
3. **新对话试 skill**：说"帮我装 pm-workflow"，AI 应该自动加载 `pm-workflow-config` skill
4. **新对话试主题**：说"切三国主题"，AI 应该调 `agent-theme-config` skill

如果以上 4 项都通过，升级完成。

---

## 关联资源

- [SKILL.md](SKILL.md)：主入口
- [troubleshooting.md](troubleshooting.md)：升级中遇到错误时的诊断
- [scripts/upgrade.sh](scripts/upgrade.sh)：互动式自动升级脚本
- [scripts/check.sh](scripts/check.sh)：升级前后健康检查
