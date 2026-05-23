#!/usr/bin/env bash
# pm-workflow 综合健康检查
#
# 一行输出当前所有关键状态：环境、CLI、plugin cache、skills、agents、log 错误。
# 任何 pm-workflow 问题诊断的第一步都跑这个脚本。
#
# 用法：bash check.sh
#
# 退出码：
#   0 - 全部 OK 或仅有非阻塞 warning
#   1 - 检测到至少一个阻塞性问题（CLI 缺失 / plugin abort / agent md 缺字段等）

set -uo pipefail

# 颜色（仅 TTY 输出时启用）
if [ -t 1 ]; then
  C_OK="\033[32m"
  C_WARN="\033[33m"
  C_ERR="\033[31m"
  C_DIM="\033[2m"
  C_END="\033[0m"
else
  C_OK="" C_WARN="" C_ERR="" C_DIM="" C_END=""
fi

OK="${C_OK}✓${C_END}"
WARN="${C_WARN}⚠${C_END}"
ERR="${C_ERR}✗${C_END}"

# 计数
BLOCKERS=0
WARNINGS=0

heading() {
  echo ""
  echo "—— $1 ——"
}

ok() { echo "  $OK $1"; }
warn() { echo "  $WARN $1"; WARNINGS=$((WARNINGS+1)); }
blocker() { echo "  $ERR $1"; BLOCKERS=$((BLOCKERS+1)); }
info() { echo "  ${C_DIM}$1${C_END}"; }

echo "════════════════════════════════════════════"
echo " pm-workflow 健康检查"
echo " 时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════"

# -----------------------------------------------------------------------------
heading "环境"
# -----------------------------------------------------------------------------

NODE_VERSION=$(node --version 2>/dev/null || echo "")
if [ -z "$NODE_VERSION" ]; then
  blocker "Node 未安装（pm-workflow 需要 Node ≥ 20）"
else
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    ok "Node $NODE_VERSION"
  else
    warn "Node $NODE_VERSION（建议 ≥ 20）"
  fi
fi

NPM_VERSION=$(npm --version 2>/dev/null || echo "")
if [ -z "$NPM_VERSION" ]; then
  blocker "npm 未安装"
else
  ok "npm $NPM_VERSION"
fi

# -----------------------------------------------------------------------------
heading "pmw CLI"
# -----------------------------------------------------------------------------

PMW_PATH=$(which pmw 2>/dev/null || echo "")
PMW_VERSION=""
if [ -z "$PMW_PATH" ]; then
  blocker "pmw 未安装到全局（运行 npm install -g @walke/opencode-pm-workflow@rc）"
else
  PMW_VERSION=$(pmw --version 2>/dev/null || echo "unknown")
  ok "pmw 路径: $PMW_PATH"
  info "pmw 版本: $PMW_VERSION"
fi

# 查 npm registry rc tag
REGISTRY_RC=$(curl -fsSL --max-time 5 https://registry.npmjs.org/@walke/opencode-pm-workflow 2>/dev/null \
  | python3 -c 'import sys,json
try: print(json.load(sys.stdin)["dist-tags"]["rc"])
except: print("")' 2>/dev/null || echo "")
if [ -z "$REGISTRY_RC" ]; then
  warn "无法查询 npm registry（网络问题或离线环境）"
else
  info "npm registry rc tag: $REGISTRY_RC"
  if [ -n "$PMW_VERSION" ] && [ "$PMW_VERSION" != "$REGISTRY_RC" ]; then
    warn "CLI 版本 ($PMW_VERSION) 落后于 npm rc tag ($REGISTRY_RC)，建议升级"
  fi
fi

# -----------------------------------------------------------------------------
heading "OpenCode plugin cache"
# -----------------------------------------------------------------------------

PLUGIN_PKG=~/.cache/opencode/packages/@walke/opencode-pm-workflow@rc/node_modules/@walke/opencode-pm-workflow/package.json
if [ -f "$PLUGIN_PKG" ]; then
  CACHED_VERSION=$(python3 -c "import json;print(json.load(open('$PLUGIN_PKG'))['version'])" 2>/dev/null || echo "unknown")
  info "cache 路径: $PLUGIN_PKG"
  ok "cache 版本: $CACHED_VERSION"
  if [ -n "$PMW_VERSION" ] && [ "$PMW_VERSION" != "$CACHED_VERSION" ]; then
    warn "CLI 版本 ($PMW_VERSION) ≠ cache 版本 ($CACHED_VERSION)（清 cache 并重启 OpenCode 让其同步）"
  fi
else
  warn "plugin cache 不存在（OpenCode 可能未启动，或 Bun install 失败）"
  info "cache 期望路径: $PLUGIN_PKG"
fi

# -----------------------------------------------------------------------------
heading "OpenCode skills 目录结构"
# -----------------------------------------------------------------------------

SKILLS_DIR=~/.config/opencode/skills
if [ ! -d "$SKILLS_DIR" ]; then
  warn "$SKILLS_DIR 不存在（OpenCode 启动后会自动创建）"
else
  # 检查 pm-workflow 的 3 个 skill
  for skill in pm-workflow-config agent-theme-config agent-model-config; do
    if [ -f "$SKILLS_DIR/$skill/SKILL.md" ]; then
      ok "$skill/SKILL.md（子目录结构正确）"
    elif [ -f "$SKILLS_DIR/$skill.md" ]; then
      blocker "$skill.md 是扁平结构（rc.3-rc.6 错误产物，OpenCode 不识别）。升级到 rc.7+ 并清旧文件"
    else
      warn "缺少 $skill/SKILL.md（升级 + 重启 OpenCode 让 plugin auto-install 写入）"
    fi
  done

  # 警告任何扁平 .md（rc.3-rc.6 残留）
  FLAT_MD_COUNT=$(ls -1 "$SKILLS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$FLAT_MD_COUNT" != "0" ]; then
    blocker "$SKILLS_DIR/ 含 $FLAT_MD_COUNT 个扁平 .md 文件（应该是子目录结构）"
    info "扁平文件: $(ls "$SKILLS_DIR"/*.md 2>/dev/null | tr '\n' ' ')"
  fi
fi

# -----------------------------------------------------------------------------
heading "agent md 完整性"
# -----------------------------------------------------------------------------

AGENTS_DIR=~/.config/opencode/agents
if [ ! -d "$AGENTS_DIR" ]; then
  warn "$AGENTS_DIR 不存在（首次安装可跑 pmw agents theme apply default --scope global 创建）"
else
  for agent in commander advisor backendcoder designer fixer writer; do
    f="$AGENTS_DIR/$agent.md"
    if [ ! -f "$f" ]; then
      warn "$agent.md 不存在"
      continue
    fi
    has_desc=$(grep -c "^description:" "$f")
    has_mode=$(grep -c "^mode:" "$f")
    has_temp=$(grep -c "^temperature:" "$f")
    has_tools=$(grep -c "^tools:" "$f")
    has_perm=$(grep -c "^permission:" "$f")
    body_lines=$(wc -l < "$f" | tr -d ' ')

    issues=()
    [ "$has_desc" = "0" ] && issues+=("缺 description")
    [ "$has_mode" = "0" ] && issues+=("缺 mode")
    [ "$has_temp" = "0" ] && issues+=("缺 temperature")
    [ "$has_tools" = "0" ] && issues+=("缺 tools")
    [ "$has_perm" = "0" ] && issues+=("缺 permission")
    [ "$body_lines" -lt 30 ] && issues+=("body 过短 ($body_lines 行)")

    if [ "${#issues[@]}" = "0" ]; then
      mode_value=$(grep "^mode:" "$f" | head -1 | awk '{print $2}')
      ok "$agent.md（mode=$mode_value, $body_lines 行）"
    else
      blocker "$agent.md 不完整: $(IFS=', '; echo "${issues[*]}")（重新 apply 主题修复）"
    fi
  done

  # commander 必须 primary，其他必须 subagent
  COMMANDER_MODE=$(grep "^mode:" "$AGENTS_DIR/commander.md" 2>/dev/null | awk '{print $2}')
  if [ -n "$COMMANDER_MODE" ] && [ "$COMMANDER_MODE" != "primary" ]; then
    blocker "commander.md mode 应为 primary，实际是 $COMMANDER_MODE"
  fi
  for agent in advisor backendcoder designer fixer writer; do
    am=$(grep "^mode:" "$AGENTS_DIR/$agent.md" 2>/dev/null | awk '{print $2}')
    if [ -n "$am" ] && [ "$am" != "subagent" ]; then
      blocker "$agent.md mode 应为 subagent，实际是 $am（OpenCode UI 切换列表会显示太多）"
    fi
  done
fi

# -----------------------------------------------------------------------------
heading "pm-workflow 全局配置"
# -----------------------------------------------------------------------------

CONFIG_FILE=~/.config/opencode/pm-workflow.config.json
if [ -f "$CONFIG_FILE" ]; then
  CONFIG_SIZE=$(stat -f '%z' "$CONFIG_FILE" 2>/dev/null || stat -c '%s' "$CONFIG_FILE" 2>/dev/null || echo "?")
  ok "$CONFIG_FILE ($CONFIG_SIZE B)"
else
  warn "$CONFIG_FILE 不存在 (OpenCode 启动后 plugin 会自动创建)"
fi

# -----------------------------------------------------------------------------
heading "OpenCode log 中的 pm-workflow 错误"
# -----------------------------------------------------------------------------

LOG_DIR=~/.local/share/opencode/log
if [ ! -d "$LOG_DIR" ]; then
  warn "$LOG_DIR 不存在（OpenCode 没启动过）"
else
  LATEST_LOG=$(ls -t "$LOG_DIR"/*.log 2>/dev/null | head -1)
  if [ -z "$LATEST_LOG" ]; then
    warn "log 目录里没有 .log 文件"
  else
    info "最新 log: $LATEST_LOG"
    # grep -c 没匹配时返回 0 行（输出 "0"）但退出码 1。我们用 || true 吃掉退出码。
    # 然后用 tr 去除空白，避免 "0\n" 被当成多行。
    PM_ERRORS=$(grep -cE "pm-workflow.*failed|mkdir.*pm-workflow|@walke.*ERROR" "$LATEST_LOG" 2>/dev/null || true)
    PM_ERRORS=$(echo "$PM_ERRORS" | tr -d '[:space:]')
    [ -z "$PM_ERRORS" ] && PM_ERRORS=0

    TOTAL_ERRORS=$(grep -c "^ERROR" "$LATEST_LOG" 2>/dev/null || true)
    TOTAL_ERRORS=$(echo "$TOTAL_ERRORS" | tr -d '[:space:]')
    [ -z "$TOTAL_ERRORS" ] && TOTAL_ERRORS=0
    info "log 总 ERROR 数: $TOTAL_ERRORS"
    if [ "$PM_ERRORS" = "0" ]; then
      ok "pm-workflow 相关错误数: 0（plugin 加载干净）"
    else
      blocker "pm-workflow 相关错误数: $PM_ERRORS"
      info "运行以下命令查看详情:"
      info "  grep -E 'pm-workflow|mkdir.*pm-workflow|@walke.*ERROR' '$LATEST_LOG' | head -10"
    fi
  fi
fi

# -----------------------------------------------------------------------------
heading "opencode.json 中的 plugin 配置"
# -----------------------------------------------------------------------------

OPENCODE_JSON=~/.config/opencode/opencode.json
if [ ! -f "$OPENCODE_JSON" ]; then
  warn "$OPENCODE_JSON 不存在（OpenCode 没初始化过配置）"
else
  if grep -q "@walke/opencode-pm-workflow" "$OPENCODE_JSON"; then
    PLUGIN_LINE=$(grep "@walke/opencode-pm-workflow" "$OPENCODE_JSON" | head -1 | tr -d ' ",')
    ok "opencode.json 含 plugin: $PLUGIN_LINE"
  else
    warn "opencode.json 没有 @walke/opencode-pm-workflow plugin 行（启动 OpenCode 不会加载 pm-workflow）"
  fi
fi

# -----------------------------------------------------------------------------
heading "OpenCode 进程状态"
# -----------------------------------------------------------------------------

OPENCODE_PROCS=$(ps aux | grep -iE "OpenCode\.app/Contents" | grep -v grep | wc -l | tr -d ' ')
if [ "$OPENCODE_PROCS" = "0" ]; then
  info "OpenCode 进程: 0（OpenCode 未运行）"
else
  info "OpenCode 进程: $OPENCODE_PROCS"
fi

# -----------------------------------------------------------------------------
echo ""
echo "════════════════════════════════════════════"
if [ "$BLOCKERS" = "0" ] && [ "$WARNINGS" = "0" ]; then
  echo " ${C_OK}全部 OK${C_END}"
elif [ "$BLOCKERS" = "0" ]; then
  echo " ${C_WARN}$WARNINGS 个 warning（无阻塞）${C_END}"
else
  echo " ${C_ERR}$BLOCKERS 个阻塞${C_END} + ${C_WARN}$WARNINGS 个 warning${C_END}"
  echo ""
  echo " 建议运行升级脚本修复："
  echo "   bash \${CLAUDE_SKILL_DIR}/scripts/upgrade.sh"
fi
echo "════════════════════════════════════════════"

# 退出码
[ "$BLOCKERS" = "0" ] && exit 0 || exit 1
