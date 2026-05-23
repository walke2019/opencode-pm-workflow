#!/usr/bin/env bash
# pm-workflow 重置 agent md 到当前主题最新版
#
# 用途：
#   - 升级 plugin 后让 agent md 跟上新规范（如 rc.7 → rc.8 加 temperature/tools/permission）
#   - 修复用户手改坏了的 agent md
#   - 检测当前主题，重新 apply 写新版本
#
# 流程：
#   1. 检测当前 6 个 agent 的 theme 字段（如果存在）
#   2. 备份 ~/.config/opencode/agents/ 到 .backup-<timestamp>/
#   3. 删除旧 agent md
#   4. pmw agents theme apply <检测到的主题> --scope global
#   5. 验证新 agent md 完整性
#
# 用法：
#   bash reset-agents.sh             # 互动（备份 + 询问主题 + apply）
#   bash reset-agents.sh --yes       # 全自动（用检测到的主题，无询问）
#   bash reset-agents.sh --theme sanguo --yes  # 指定主题
#
# 退出码：0 成功；1 失败或取消

set -uo pipefail

if [ -t 1 ]; then
  C_OK="\033[32m"; C_WARN="\033[33m"; C_ERR="\033[31m"
  C_BLUE="\033[34m"; C_DIM="\033[2m"; C_END="\033[0m"
else
  C_OK="" C_WARN="" C_ERR="" C_BLUE="" C_DIM="" C_END=""
fi

AUTO_YES=false
FORCE_THEME=""
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=true ;;
    --theme) shift; FORCE_THEME="$1" ;;
    --theme=*) FORCE_THEME="${arg#*=}" ;;
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

echo "════════════════════════════════════════════"
echo " pm-workflow 重置 agent md"
echo " 时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════"

AGENTS_DIR=~/.config/opencode/agents

# -----------------------------------------------------------------------------
step "Step 1/5: 检查 pmw CLI"
# -----------------------------------------------------------------------------

if ! command -v pmw &> /dev/null; then
  err "pmw 未装到全局。先跑 upgrade.sh"
  exit 1
fi
PMW_VERSION=$(pmw --version 2>/dev/null || echo "")
ok "pmw CLI 版本: $PMW_VERSION"

# -----------------------------------------------------------------------------
step "Step 2/5: 检测当前主题"
# -----------------------------------------------------------------------------

DETECTED_THEME=""
if [ -d "$AGENTS_DIR" ]; then
  # 从 6 个 agent 里找一个有 theme 字段的
  for agent in commander advisor backendcoder designer fixer writer; do
    f="$AGENTS_DIR/$agent.md"
    if [ -f "$f" ]; then
      t=$(grep "^theme:" "$f" 2>/dev/null | head -1 | awk '{print $2}')
      if [ -n "$t" ]; then
        DETECTED_THEME="$t"
        info "从 $agent.md 检测到主题: $t"
        break
      fi
    fi
  done
fi

if [ -n "$FORCE_THEME" ]; then
  THEME="$FORCE_THEME"
  info "用 --theme 参数指定的主题: $THEME"
elif [ -n "$DETECTED_THEME" ]; then
  THEME="$DETECTED_THEME"
  ok "将沿用现有主题: $THEME"
else
  THEME="default"
  info "未检测到主题（agent md 不存在或没 theme 字段），用默认主题: default"
fi

# -----------------------------------------------------------------------------
step "Step 3/5: 备份现有 agent md"
# -----------------------------------------------------------------------------

if [ ! -d "$AGENTS_DIR" ] || [ -z "$(ls "$AGENTS_DIR" 2>/dev/null)" ]; then
  ok "$AGENTS_DIR 不存在或为空（无需备份）"
else
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  BACKUP=~/.config/opencode/.backup-agents-$TIMESTAMP
  info "备份目录: $BACKUP"
  cp -r "$AGENTS_DIR" "$BACKUP"
  ok "已备份 $(ls "$AGENTS_DIR" | wc -l | tr -d ' ') 个文件到 $BACKUP"
fi

# -----------------------------------------------------------------------------
step "Step 4/5: 重新 apply 主题"
# -----------------------------------------------------------------------------

# 验证主题名合法
case "$THEME" in
  default|sanguo|xiyou|marvel|workplace) ;;
  *)
    err "未知主题: $THEME（合法: default / sanguo / xiyou / marvel / workplace）"
    exit 1
    ;;
esac

if confirm "执行 pmw agents theme apply $THEME --scope global？"; then
  info "运行: pmw agents theme apply $THEME --scope global"
  echo ""
  if pmw agents theme apply "$THEME" --scope global; then
    ok "主题 apply 成功"
  else
    err "主题 apply 失败"
    exit 1
  fi
else
  warn "用户取消"
  exit 1
fi

# -----------------------------------------------------------------------------
step "Step 5/5: 验证新 agent md"
# -----------------------------------------------------------------------------

ALL_OK=true
for agent in commander advisor backendcoder designer fixer writer; do
  f="$AGENTS_DIR/$agent.md"
  if [ ! -f "$f" ]; then
    err "$agent.md 不存在（apply 失败）"
    ALL_OK=false
    continue
  fi

  has_desc=$(grep -c "^description:" "$f")
  has_mode=$(grep -c "^mode:" "$f")
  has_temp=$(grep -c "^temperature:" "$f")
  has_tools=$(grep -c "^tools:" "$f")
  has_perm=$(grep -c "^permission:" "$f")

  if [ "$has_desc" = "1" ] && [ "$has_mode" = "1" ] && [ "$has_temp" = "1" ] && [ "$has_tools" = "1" ] && [ "$has_perm" = "1" ]; then
    mode_value=$(grep "^mode:" "$f" | head -1 | awk '{print $2}')
    body_lines=$(wc -l < "$f" | tr -d ' ')
    ok "$agent.md（mode=$mode_value, $body_lines 行，全部字段就位）"
  else
    err "$agent.md 字段不全: desc=$has_desc mode=$has_mode temp=$has_temp tools=$has_tools perm=$has_perm"
    ALL_OK=false
  fi
done

# 检查 mode 约束
COMMANDER_MODE=$(grep "^mode:" "$AGENTS_DIR/commander.md" 2>/dev/null | awk '{print $2}')
if [ "$COMMANDER_MODE" != "primary" ]; then
  err "commander.md mode 应为 primary，实际是 $COMMANDER_MODE"
  ALL_OK=false
fi

# -----------------------------------------------------------------------------
echo ""
echo "════════════════════════════════════════════"
if [ "$ALL_OK" = "true" ]; then
  echo -e " ${C_OK}重置完成（主题: $THEME）${C_END}"
  echo ""
  echo " 后续："
  echo "   - 完全 quit + 重启 OpenCode 让新 agent md 生效"
  echo "   - 在 OpenCode 内按 Tab 键，应只看到 commander 一个 primary"
  echo "   - 如对主题不满意，跑：pmw agents theme apply <其他主题> --scope global"
  exit 0
else
  echo -e " ${C_ERR}重置后部分 agent md 不完整，看上方报告${C_END}"
  echo ""
  echo " 备份在: $BACKUP（如需恢复）"
  exit 1
fi
