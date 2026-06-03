#!/usr/bin/env bash
# pm-workflow 完全清理脚本（卸载流程的核心动作）
#
# **风险等级：高**——会清掉用户的 agent md / pm-workflow 配置 / 项目状态。
# 必须 --confirm 才会真的删，否则只 dry-run（显示将做什么）。
#
# 流程：
#   0. quit OpenCode
#   1. 备份所有用户数据到 .backup-uninstall-<timestamp>/
#   2. 移除 opencode.json 中的 plugin 行
#   3. 卸载全局 pmw CLI（npm uninstall -g）
#   4. 清 OpenCode plugin cache
#   5. （询问）清 agent md
#   6. （询问）清 pm-workflow 相关 skill 子目录
#   7. （询问）清 pm-workflow 全局配置
#   8. （询问）清 ~/.cache/pm-workflow（rc.4+ fallback）
#
# 用法：
#   bash full-clean.sh                # dry-run 模式
#   bash full-clean.sh --confirm      # 真的执行（每步还是问用户）
#   bash full-clean.sh --confirm --yes  # 全自动（适合 AI 跑）
#
# 退出码：0 成功；1 失败或取消

set -uo pipefail

if [ -t 1 ]; then
  C_OK="\033[32m"; C_WARN="\033[33m"; C_ERR="\033[31m"
  C_BLUE="\033[34m"; C_DIM="\033[2m"; C_END="\033[0m"
else
  C_OK="" C_WARN="" C_ERR="" C_BLUE="" C_DIM="" C_END=""
fi

CONFIRM=false
AUTO_YES=false
for arg in "$@"; do
  case "$arg" in
    --confirm) CONFIRM=true ;;
    --yes|-y) AUTO_YES=true ;;
    *) ;;
  esac
done

confirm() {
  if [ "$AUTO_YES" = "true" ]; then
    echo "$1 [自动 yes]"
    return 0
  fi
  read -p "$1 [y/N] " -n 1 -r
  echo ""
  [[ $REPLY =~ ^[Yy]$ ]]
}

step() { echo ""; echo -e "${C_BLUE}━━━ $1 ━━━${C_END}"; }
ok()   { echo -e "  ${C_OK}✓${C_END} $1"; }
warn() { echo -e "  ${C_WARN}⚠${C_END} $1"; }
err()  { echo -e "  ${C_ERR}✗${C_END} $1"; }
info() { echo -e "  ${C_DIM}$1${C_END}"; }

run_or_dry() {
  if [ "$CONFIRM" = "true" ]; then
    eval "$1"
  else
    info "[dry-run] $1"
  fi
}

echo "════════════════════════════════════════════"
echo " pm-workflow 完全清理"
echo " 时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo " 模式: $([ "$CONFIRM" = "true" ] && echo "${C_ERR}真实执行 (--confirm)${C_END}" || echo "${C_WARN}DRY-RUN（加 --confirm 真的执行）${C_END}")"
echo "════════════════════════════════════════════"

if [ "$CONFIRM" = "false" ]; then
  echo ""
  echo "  ${C_WARN}注意：${C_END}当前是 dry-run 模式，下面所有操作都不会真的执行。"
  echo "  确认无误后再加 --confirm 重新跑。"
  echo ""
fi

# -----------------------------------------------------------------------------
step "Step 0: Quit OpenCode"
# -----------------------------------------------------------------------------

OPENCODE_PROCS=$(ps aux | grep -iE "OpenCode\.app/Contents" | grep -v grep | wc -l | tr -d ' ')
if [ "$OPENCODE_PROCS" = "0" ]; then
  ok "OpenCode 未运行"
else
  info "检测到 $OPENCODE_PROCS 个 OpenCode 进程"
  if confirm "强制 quit OpenCode？"; then
    if [ "$CONFIRM" = "true" ]; then
      pkill -9 -f "OpenCode Helper" 2>/dev/null || true
      pkill -9 -f "OpenCode.app" 2>/dev/null || true
      sleep 3
      ok "OpenCode 已 quit"
    else
      info "[dry-run] 将运行 pkill -9 -f OpenCode"
    fi
  else
    err "用户拒绝 quit。卸载需要 OpenCode 完全 quit。退出。"
    exit 1
  fi
fi

# -----------------------------------------------------------------------------
step "Step 1: 备份所有用户数据"
# -----------------------------------------------------------------------------

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP=~/.config/opencode/.backup-uninstall-$TIMESTAMP
info "备份目录: $BACKUP"

run_or_dry "mkdir -p '$BACKUP'"

# 备份 agents/
if [ -d ~/.config/opencode/agents ]; then
  info "备份 ~/.config/opencode/agents/ → $BACKUP/agents/"
  run_or_dry "cp -r ~/.config/opencode/agents '$BACKUP/agents'"
fi

# 备份 pm-workflow 相关 skills
for skill in pm-workflow-config agent-theme-config agent-model-config; do
  if [ -d ~/.config/opencode/skills/$skill ]; then
    info "备份 skills/$skill → $BACKUP/skills-$skill/"
    run_or_dry "cp -r ~/.config/opencode/skills/$skill '$BACKUP/skills-$skill'"
  fi
done

# 备份 pm-workflow.config.json
if [ -f ~/.config/opencode/pm-workflow.config.json ]; then
  info "备份 pm-workflow.config.json"
  run_or_dry "cp ~/.config/opencode/pm-workflow.config.json '$BACKUP/pm-workflow.config.json'"
fi

ok "备份完成（$BACKUP）"

# -----------------------------------------------------------------------------
step "Step 2: 移除 opencode.json 中的 plugin 行"
# -----------------------------------------------------------------------------

OPENCODE_JSON=~/.config/opencode/opencode.json
if [ ! -f "$OPENCODE_JSON" ]; then
  ok "opencode.json 不存在（无需修改）"
elif ! grep -q "@walke/opencode-pm-workflow" "$OPENCODE_JSON"; then
  ok "opencode.json 没有 pm-workflow plugin 行"
else
  info "当前 plugin 行："
  grep "@walke/opencode-pm-workflow" "$OPENCODE_JSON" | head -3
  echo ""
  if confirm "移除这些行？"; then
    if command -v jq &> /dev/null; then
      info "用 jq 移除（保持 JSON 格式）"
      run_or_dry "jq 'del(.plugin[] | select(. | startswith(\"@walke/opencode-pm-workflow\")))' '$OPENCODE_JSON' > /tmp/opencode.json.tmp && mv /tmp/opencode.json.tmp '$OPENCODE_JSON'"
    else
      warn "jq 未装，请手动编辑 $OPENCODE_JSON 移除 plugin 行"
    fi
    ok "opencode.json plugin 行已移除"
  else
    warn "保留 plugin 行（OpenCode 启动时会尝试加载但找不到 plugin，会报 error）"
  fi
fi

# -----------------------------------------------------------------------------
step "Step 3: 卸载全局 pmw CLI"
# -----------------------------------------------------------------------------

if ! command -v pmw &> /dev/null; then
  ok "pmw 未装到全局（跳过）"
else
  info "当前 pmw: $(which pmw)（$(pmw --version)）"
  if confirm "卸载全局 pmw CLI？"; then
    run_or_dry "npm uninstall -g @walke/opencode-pm-workflow"
    ok "pmw CLI 已卸载"
  else
    warn "保留 pmw CLI"
  fi
fi

# -----------------------------------------------------------------------------
step "Step 4: 清 OpenCode plugin cache"
# -----------------------------------------------------------------------------

NODE_CACHE_DIR=~/.cache/opencode/node_modules/@walke/opencode-pm-workflow
LEGACY_CACHE_DIR=~/.cache/opencode/packages/@walke
if [ ! -d "$NODE_CACHE_DIR" ] && [ ! -d "$LEGACY_CACHE_DIR" ]; then
  ok "plugin cache 不存在（跳过）"
else
  [ -d "$NODE_CACHE_DIR" ] && info "清理: $NODE_CACHE_DIR"
  [ -d "$LEGACY_CACHE_DIR" ] && info "清理 legacy cache: $LEGACY_CACHE_DIR"
  run_or_dry "rm -rf '$NODE_CACHE_DIR' '$LEGACY_CACHE_DIR'"
  ok "plugin cache 已清"
fi

# -----------------------------------------------------------------------------
step "Step 5: 清 agent md（询问）"
# -----------------------------------------------------------------------------

AGENTS_DIR=~/.config/opencode/agents
if [ ! -d "$AGENTS_DIR" ]; then
  ok "agents/ 不存在（跳过）"
else
  PM_AGENTS=()
  for agent in commander advisor backendcoder designer fixer writer; do
    [ -f "$AGENTS_DIR/$agent.md" ] && PM_AGENTS+=("$agent.md")
  done

  if [ "${#PM_AGENTS[@]}" = "0" ]; then
    ok "agents/ 里没有 pm-workflow 6 个 agent md"
  else
    info "将清的文件（${#PM_AGENTS[@]} 个）："
    for f in "${PM_AGENTS[@]}"; do info "  - $AGENTS_DIR/$f"; done

    OTHER_AGENTS=$(ls "$AGENTS_DIR" 2>/dev/null | grep -vE "^(commander|advisor|backendcoder|designer|fixer|writer)\.md$" | wc -l | tr -d ' ')
    if [ "$OTHER_AGENTS" != "0" ]; then
      info "（保留其他 $OTHER_AGENTS 个非 pm-workflow agent md）"
    fi

    if confirm "清这 ${#PM_AGENTS[@]} 个 pm-workflow agent md？"; then
      for f in "${PM_AGENTS[@]}"; do
        run_or_dry "rm -fv '$AGENTS_DIR/$f'"
      done
      ok "pm-workflow agent md 已清"
    else
      warn "保留 agent md"
    fi
  fi
fi

# -----------------------------------------------------------------------------
step "Step 6: 清 pm-workflow 相关 skill 子目录（询问）"
# -----------------------------------------------------------------------------

PM_SKILLS=(pm-workflow-config agent-theme-config agent-model-config)
EXISTING_SKILLS=()
for skill in "${PM_SKILLS[@]}"; do
  [ -d ~/.config/opencode/skills/$skill ] && EXISTING_SKILLS+=("$skill")
done

if [ "${#EXISTING_SKILLS[@]}" = "0" ]; then
  ok "pm-workflow 相关 skill 子目录都不存在"
else
  info "将清的 skill 子目录（${#EXISTING_SKILLS[@]} 个）："
  for s in "${EXISTING_SKILLS[@]}"; do info "  - ~/.config/opencode/skills/$s/"; done

  if confirm "清这些 skill 目录？（其他 skill 如 cloudflare-* 不影响）"; then
    for s in "${EXISTING_SKILLS[@]}"; do
      run_or_dry "rm -rfv ~/.config/opencode/skills/$s"
    done
    ok "pm-workflow skill 目录已清"
  else
    warn "保留 skill 目录"
  fi
fi

# -----------------------------------------------------------------------------
step "Step 7: 清 pm-workflow 全局配置（询问）"
# -----------------------------------------------------------------------------

CONFIG_FILE=~/.config/opencode/pm-workflow.config.json
if [ ! -f "$CONFIG_FILE" ]; then
  ok "$CONFIG_FILE 不存在（跳过）"
else
  CONFIG_SIZE=$(stat -f '%z' "$CONFIG_FILE" 2>/dev/null || stat -c '%s' "$CONFIG_FILE" 2>/dev/null)
  info "配置文件: $CONFIG_FILE（${CONFIG_SIZE}B）"
  if confirm "清 pm-workflow.config.json？"; then
    run_or_dry "rm -fv '$CONFIG_FILE'"
    ok "pm-workflow.config.json 已清"
  else
    warn "保留 config.json"
  fi
fi

# -----------------------------------------------------------------------------
step "Step 8: 清 fallback projectDir（询问）"
# -----------------------------------------------------------------------------

FALLBACK_DIR=~/.cache/pm-workflow
if [ ! -d "$FALLBACK_DIR" ]; then
  ok "$FALLBACK_DIR 不存在（跳过）"
else
  info "fallback 目录（rc.4+ 兜底用）: $FALLBACK_DIR"
  if confirm "清 ~/.cache/pm-workflow？"; then
    run_or_dry "rm -rf '$FALLBACK_DIR'"
    ok "~/.cache/pm-workflow 已清"
  else
    warn "保留 fallback 目录"
  fi
fi

# -----------------------------------------------------------------------------
echo ""
echo "════════════════════════════════════════════"
if [ "$CONFIRM" = "true" ]; then
  echo -e " ${C_OK}清理完成${C_END}"
  echo ""
  echo " 备份在: $BACKUP"
  echo ""
  echo " 如需恢复："
  echo "   cp -r '$BACKUP/agents' ~/.config/opencode/agents"
  echo "   cp -r '$BACKUP/skills-pm-workflow-config' ~/.config/opencode/skills/pm-workflow-config"
  echo "   cp '$BACKUP/pm-workflow.config.json' ~/.config/opencode/"
  echo "   npm install -g @walke/opencode-pm-workflow@latest"
  echo ""
  echo " 项目级 .pm-workflow/ 状态目录未清（在每个项目里手动清）："
  echo "   find ~ -name '.pm-workflow' -type d 2>/dev/null"
else
  echo -e " ${C_WARN}DRY-RUN 完成（什么都没改）${C_END}"
  echo ""
  echo " 确认无误后再跑："
  echo "   bash full-clean.sh --confirm"
fi
echo "════════════════════════════════════════════"
exit 0
