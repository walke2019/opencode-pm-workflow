# 安装与加载类问题（T1-T2）

## T1: pmw 命令找不到

### 症状

```bash
$ pmw --version
zsh: command not found: pmw
```

### 根因

OpenCode 装 plugin 不会暴露 bin 到全局 PATH（设计安全性，避免污染）。需要单独 `npm install -g`。

### 修复

```bash
npm install -g @walke/opencode-pm-workflow@rc
which pmw   # 应输出 /opt/homebrew/bin/pmw 或类似路径
pmw --version
```

### 验证

```bash
pmw --version
# 应输出 1.0.0-rc.X
```

---

## T2: plugin 加载 mkdir 失败

### 症状

OpenCode log（`~/.local/share/opencode/log/*.log`）出现：

```
ERROR service=plugin path=@walke/opencode-pm-workflow@rc
      error=ENOENT: no such file or directory, mkdir '/.pm-workflow'
      failed to load plugin
```

注意是 **根目录** `/.pm-workflow` 而不是 `~/.pm-workflow`。

### 根因

rc.4 之前 `getProjectDir()` 兜底逻辑不够强：

- OpenCode server 在 system service 模式下 `process.cwd()` 是 `/`
- 旧版 `ctx.worktree || ctx.directory || process.cwd()` 得到 `/`
- 后续 `mkdir(join('/', '.pm-workflow'))` ENOENT
- 整个 plugin 加载 abort

### 修复

升级到 rc.4+：

```bash
${CLAUDE_SKILL_DIR}/scripts/upgrade.sh
```

升级后必须**完全 quit + 重启 OpenCode**，让 OpenCode 用 Bun 重新拉新版到 cache。

### 验证

启动后查 log：

```bash
LATEST=$(ls -t ~/.local/share/opencode/log/*.log | head -1)
grep "mkdir '/.pm-workflow'" "$LATEST"
# 应无输出
```

---

