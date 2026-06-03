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
npm install -g @walke/opencode-pm-workflow@latest
which pmw   # 应输出 /opt/homebrew/bin/pmw 或类似路径
pmw --version
```

### 验证

```bash
pmw --version
# 应输出当前 npm latest 版本
```

---

## T2: plugin 加载 mkdir 失败

### 症状

OpenCode log（`~/.local/share/opencode/log/*.log`）出现：

```
ERROR service=plugin path=@walke/opencode-pm-workflow
      error=ENOENT: no such file or directory, mkdir '/.pm-workflow'
      failed to load plugin
```

注意是 **根目录** `/.pm-workflow` 而不是 `~/.pm-workflow`。

### 根因

旧版缓存包（典型是 0.3.1 或 rc.4 之前版本）的 `getProjectDir()` 兜底逻辑不够强：

- OpenCode server 在 system service 模式下 `process.cwd()` 是 `/`
- 旧版 `ctx.worktree || ctx.directory || process.cwd()` 得到 `/`
- 后续 `mkdir(join('/', '.pm-workflow'))` ENOENT
- 整个 plugin 加载 abort

### 修复

先用新版 CLI 备份旧/坏缓存：

```bash
pmw repair opencode-cache
```

如果需要先看会动哪些目录：

```bash
pmw repair opencode-cache --dry-run --json
```

然后**完全 quit + 重启 OpenCode**，让 OpenCode 用 Bun 重新拉新版到 cache。若 `pmw` 还是旧版或找不到，先：

```bash
npm install -g @walke/opencode-pm-workflow@latest
pmw --version
```

### 验证

启动后查 log：

```bash
LATEST=$(ls -t ~/.local/share/opencode/log/*.log | head -1)
grep "mkdir '/.pm-workflow'" "$LATEST"
# 应无输出
```

同时确认缓存版本：

```bash
pmw repair opencode-cache --dry-run --json
# staleCount 应为 0
```

---
