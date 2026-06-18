#!/usr/bin/env bash
# pm-workflow 互动式升级脚本
#
# 完整升级流程：
#   1. 按 opencode.json plugin 引用检查当前版本（CLI / plugin cache）vs npm 目标 tag
#   2. 询问用户确认（除非 --yes）
#   3. 强制 quit OpenCode（pkill）
#   4. 清 plugin cache
#   5. 升级全局 CLI（npm install -g）
#   6. 清旧扁平 skill md（rc.3-rc.6 残留）
#   7. 提示用户双击启动 OpenCode
#   8. 跑 check.sh 验证
#
# 用法：
#   bash upgrade.sh           # 互动式（每步问用户）
#   bash upgrade.sh --yes     # 全自动（适合 AI 跑）
#
# 退出码：0 全部成功；1 失败或用户取消

set -uo pipefail

# 颜色
if [ -t 1 ]; then
  C_OK="\033[32m"; C_WARN="\033[33m"; C_ERR="\033[31m"
  C_BLUE="\033[34m"; C_DIM="\033[2m"; C_END="\033[0m"
else
  C_OK="" C_WARN="" C_ERR="" C_BLUE="" C_DIM="" C_END=""
fi

AUTO_YES=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=true ;;
    *) echo "未知参数: $arg"; exit 1 ;;
  esac
done

confirm() {
  local prompt="$1"
  if [ "$AUTO_YES" = "true" ]; then
    echo "$prompt [自动 yes]"
    return 0
  fi
  read -p "$prompt [y/N] " -n 1 -r
  echo ""
  [[ $REPLY =~ ^[Yy]$ ]]
}

step() {
  echo ""
  echo -e "${C_BLUE}━━━ $1 ━━━${C_END}"
}

ok()    { echo -e "  ${C_OK}✓${C_END} $1"; }
warn()  { echo -e "  ${C_WARN}⚠${C_END} $1"; }
err()   { echo -e "  ${C_ERR}✗${C_END} $1"; }
info()  { echo -e "  ${C_DIM}$1${C_END}"; }

PACKAGE_NAME="@walke/opencode-pm-workflow"
OPENCODE_CONFIG_FILE="${OPENCODE_CONFIG_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode.json}"
OPENCODE_CACHE_ROOT="${OPENCODE_CACHE_ROOT:-$HOME/.cache/opencode}"
OPENCODE_LEGACY_CACHE_BASE="${OPENCODE_CACHE_BASE:-$OPENCODE_CACHE_ROOT/packages}"

read_plugin_ref() {
  python3 - "$PACKAGE_NAME" "$OPENCODE_CONFIG_FILE" "$PWD" <<'PY' 2>/dev/null || true
import json
import os
import sys

package, global_path, cwd = sys.argv[1], sys.argv[2], sys.argv[3]

def load_path(path):
    try:
        with open(os.path.expanduser(path), "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return None

def refs_from(data):
    if not isinstance(data, dict):
        return []
    plugins = data.get("plugin", [])
    if isinstance(plugins, str):
        plugins = [plugins]
    return [
        item for item in plugins
        if isinstance(item, str) and (item == package or item.startswith(package + "@"))
    ]

paths = [global_path]
env_path = os.environ.get("OPENCODE_CONFIG")
if env_path:
    paths.append(env_path)

dirs = []
current = os.path.abspath(cwd)
while True:
    dirs.append(current)
    parent = os.path.dirname(current)
    if parent == current:
        break
    current = parent
for directory in reversed(dirs):
    paths.append(os.path.join(directory, "opencode.json"))
    paths.append(os.path.join(directory, ".opencode", "opencode.json"))

found = []
for path in paths:
    found.extend(refs_from(load_path(path)))

content = os.environ.get("OPENCODE_CONFIG_CONTENT")
if content:
    try:
        found.extend(refs_from(json.loads(content)))
    except Exception:
        pass

if found:
    print(found[-1])
PY
}

resolve_plugin_target() {
  local ref="$1"
  local spec="latest"
  if [ -n "$ref" ]; then
    local rest="${ref#"$PACKAGE_NAME"}"
    if [ "$rest" != "$ref" ] && [ -n "$rest" ]; then
      spec="${rest#@}"
    fi
  fi
  [ -z "$spec" ] && spec="latest"
  echo "$spec"
}

resolve_registry_version() {
  local spec="$1"
  if echo "$spec" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-.+][0-9A-Za-z.-]+)?$'; then
    echo "$spec"
    return 0
  fi

  local registry_json
  registry_json="$(curl -fsSL --max-time 10 "https://registry.npmjs.org/$PACKAGE_NAME" 2>/dev/null || true)"
  printf '%s' "$registry_json" | python3 -c '
import json
import sys

tag = sys.argv[1]
try:
    data = json.load(sys.stdin)
    print(data.get("dist-tags", {}).get(tag, ""))
except Exception:
    print("")
' "$spec" 2>/dev/null || true
}

echo "════════════════════════════════════════════"
echo " pm-workflow 升级流程"
echo " 时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo " 模式: $([ "$AUTO_YES" = "true" ] && echo "全自动 (--yes)" || echo "互动式")"
echo "════════════════════════════════════════════"

# -----------------------------------------------------------------------------
step "Step 1/8: 检查当前版本"
# -----------------------------------------------------------------------------

PMW_VERSION=$(pmw --version 2>/dev/null || echo "未装")
info "当前 pmw CLI: $PMW_VERSION"

PLUGIN_REF="$(read_plugin_ref)"
TARGET_SPEC="$(resolve_plugin_target "$PLUGIN_REF")"
TARGET_VERSION="$(resolve_registry_version "$TARGET_SPEC")"
TARGET_DESC="npm $TARGET_SPEC tag"
if echo "$TARGET_SPEC" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-.+][0-9A-Za-z.-]+)?$'; then
  TARGET_DESC="指定版本"
fi
PLUGIN_PKG_NEW="$OPENCODE_CACHE_ROOT/node_modules/$PACKAGE_NAME/package.json"
PLUGIN_PKG_LEGACY="$OPENCODE_LEGACY_CACHE_BASE/$PACKAGE_NAME@$TARGET_SPEC/node_modules/$PACKAGE_NAME/package.json"
PLUGIN_PKG="$PLUGIN_PKG_NEW"
CACHE_DIR_NEW="$OPENCODE_CACHE_ROOT/node_modules/$PACKAGE_NAME"
CACHE_DIR_LEGACY="$OPENCODE_LEGACY_CACHE_BASE/$PACKAGE_NAME@$TARGET_SPEC"
PLUGIN_CACHE_LAYOUT="node_modules"
if [ ! -f "$PLUGIN_PKG" ] && [ -f "$PLUGIN_PKG_LEGACY" ]; then
  PLUGIN_PKG="$PLUGIN_PKG_LEGACY"
  PLUGIN_CACHE_LAYOUT="packages"
fi
LEGACY_CACHE_COUNT=0
LEGACY_EXTRA_COUNT=0
if [ -d "$OPENCODE_LEGACY_CACHE_BASE/@walke" ]; then
  LEGACY_CACHE_COUNT=$(find "$OPENCODE_LEGACY_CACHE_BASE/@walke" -maxdepth 1 -type d -name 'opencode-pm-workflow@*' 2>/dev/null | wc -l | tr -d ' ')
  LEGACY_EXTRA_COUNT=$(find "$OPENCODE_LEGACY_CACHE_BASE/@walke" -maxdepth 1 -type d -name 'opencode-pm-workflow@*' ! -path "$CACHE_DIR_LEGACY" 2>/dev/null | wc -l | tr -d ' ')
fi
if [ "$PLUGIN_CACHE_LAYOUT" = "node_modules" ]; then
  LEGACY_EXTRA_COUNT="$LEGACY_CACHE_COUNT"
fi

if [ -n "$PLUGIN_REF" ]; then
  info "OpenCode plugin 配置: $PLUGIN_REF"
else
  info "OpenCode plugin 配置: 未找到 $PACKAGE_NAME，默认使用 $PACKAGE_NAME@latest"
fi
info "升级目标: $PACKAGE_NAME@$TARGET_SPEC"

if [ -f "$PLUGIN_PKG" ]; then
  CACHED_VERSION=$(python3 -c "import json;print(json.load(open('$PLUGIN_PKG'))['version'])" 2>/dev/null || echo "unknown")
  info "OpenCode plugin cache: $CACHED_VERSION"
  info "OpenCode plugin cache 布局: $PLUGIN_CACHE_LAYOUT"
else
  CACHED_VERSION="不存在"
  info "OpenCode plugin cache: 不存在（OpenCode 未启动过）"
fi
if [ "$LEGACY_CACHE_COUNT" != "0" ]; then
  info "OpenCode legacy packages cache 残留: $LEGACY_CACHE_COUNT"
fi

if [ -z "$TARGET_VERSION" ]; then
  err "解析 $TARGET_DESC 目标版本失败（网络问题、离线或 tag 不存在）"
  echo ""
  echo "请检查网络连接后重试。"
  exit 1
fi

info "$TARGET_DESC 目标版本: $TARGET_VERSION"

if [ "$PMW_VERSION" = "$TARGET_VERSION" ] && { [ "$CACHED_VERSION" = "$TARGET_VERSION" ] || [ "$CACHED_VERSION" = "不存在" ]; } && [ "$LEGACY_EXTRA_COUNT" = "0" ]; then
  VERSION_STATUS="CLI=${TARGET_VERSION}; plugin cache=${CACHED_VERSION}"
  ok "已是目标版本（${VERSION_STATUS}），无需升级"
  exit 0
fi

echo ""
if confirm "升级到 $TARGET_VERSION？这会 quit OpenCode + 清 cache + 升 CLI"; then
  :
else
  warn "用户取消升级"
  exit 1
fi

# -----------------------------------------------------------------------------
step "Step 2/8: Quit OpenCode"
# -----------------------------------------------------------------------------

OPENCODE_PROCS=$(ps aux | grep -iE "OpenCode\.app/Contents" | grep -v grep | wc -l | tr -d ' ')
if [ "$OPENCODE_PROCS" = "0" ]; then
  ok "OpenCode 未运行（跳过 quit）"
else
  info "检测到 $OPENCODE_PROCS 个 OpenCode 进程"
  if confirm "强制 quit OpenCode？（会丢失当前会话状态）"; then
    pkill -9 -f "OpenCode Helper" 2>/dev/null || true
    pkill -9 -f "OpenCode.app" 2>/dev/null || true
    sleep 3
    REMAINING=$(ps aux | grep -iE "OpenCode\.app/Contents" | grep -v grep | wc -l | tr -d ' ')
    if [ "$REMAINING" = "0" ]; then
      ok "OpenCode 已 quit"
    else
      err "仍有 $REMAINING 个进程，请用户手动 quit OpenCode (⌘+Q)"
      echo ""
      echo "等待用户操作后重新跑此脚本。"
      exit 1
    fi
  else
    warn "用户拒绝 quit。请手动 quit 后重新跑此脚本。"
    exit 1
  fi
fi

# -----------------------------------------------------------------------------
step "Step 3/8: 清 OpenCode plugin cache"
# -----------------------------------------------------------------------------

REMOVED_CACHE=0
if [ -d "$CACHE_DIR_NEW" ]; then
  info "清理: $CACHE_DIR_NEW"
  rm -rf "$CACHE_DIR_NEW"
  REMOVED_CACHE=$((REMOVED_CACHE+1))
fi
if [ -d "$OPENCODE_LEGACY_CACHE_BASE/@walke" ]; then
  while IFS= read -r cache_dir; do
    [ -z "$cache_dir" ] && continue
    info "清理 legacy cache: $cache_dir"
    rm -rf "$cache_dir"
    REMOVED_CACHE=$((REMOVED_CACHE+1))
  done < <(find "$OPENCODE_LEGACY_CACHE_BASE/@walke" -maxdepth 1 -type d -name 'opencode-pm-workflow@*' 2>/dev/null)
fi
if [ "$REMOVED_CACHE" = "0" ]; then
  ok "plugin cache 不存在（无需清）"
else
  ok "plugin cache 已清（$REMOVED_CACHE 个目录）"
fi

# -----------------------------------------------------------------------------
step "Step 4/8: 升级全局 pmw CLI"
# -----------------------------------------------------------------------------

info "运行: npm install -g $PACKAGE_NAME@$TARGET_SPEC"
if npm install -g "$PACKAGE_NAME@$TARGET_SPEC" 2>&1 | tail -5; then
  NEW_VERSION=$(pmw --version 2>/dev/null || echo "未装")
  if [ "$NEW_VERSION" = "$TARGET_VERSION" ]; then
    ok "pmw CLI 升级成功: $NEW_VERSION"
  else
    err "pmw CLI 升级后版本仍是 $NEW_VERSION（期望 $TARGET_VERSION）"
    exit 1
  fi
else
  err "npm install -g 失败（看上方错误）"
  exit 1
fi

# -----------------------------------------------------------------------------
step "Step 5/8: 清旧扁平 skill md（rc.3-rc.6 残留）"
# -----------------------------------------------------------------------------

SKILLS_DIR=~/.config/opencode/skills
FLAT_SKILL_MD=()
if [ -d "$SKILLS_DIR" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] && FLAT_SKILL_MD+=("$f")
  done < <(ls -1 "$SKILLS_DIR"/*.md 2>/dev/null)
fi

if [ "${#FLAT_SKILL_MD[@]}" = "0" ]; then
  ok "无扁平 skill md 残留"
else
  info "检测到 ${#FLAT_SKILL_MD[@]} 个扁平 skill md（rc.3-rc.6 错误产物）："
  for f in "${FLAT_SKILL_MD[@]}"; do
    info "  - $f"
  done
  if confirm "清理这些扁平 .md 文件？（rc.7+ 用子目录结构，旧文件无用）"; then
    for f in "${FLAT_SKILL_MD[@]}"; do
      rm -fv "$f"
    done
    ok "扁平 skill md 已清"
  else
    warn "保留扁平 .md（OpenCode 不识别它们，但不影响新结构）"
  fi
fi

# -----------------------------------------------------------------------------
step "Step 6/8: 提示用户启动 OpenCode"
# -----------------------------------------------------------------------------

echo ""
echo "  请双击启动 OpenCode（Spotlight ⌘+空格 → 输入 OpenCode → 回车）"
echo "  GUI 应用 shell 触不到，必须用户操作。"
echo ""

if [ "$AUTO_YES" = "true" ]; then
  info "[自动模式] 跳过等待，直接进入 Step 7"
else
  read -p "  启动后回车继续..." -r
fi

# -----------------------------------------------------------------------------
step "Step 7/8: 等 OpenCode 完成 Bun install"
# -----------------------------------------------------------------------------

info "等待 OpenCode 拉新版到 cache（最长 30 秒）..."
for i in $(seq 1 30); do
  CURRENT_PLUGIN_PKG="$PLUGIN_PKG_NEW"
  if [ ! -f "$CURRENT_PLUGIN_PKG" ] && [ -f "$PLUGIN_PKG_LEGACY" ]; then
    CURRENT_PLUGIN_PKG="$PLUGIN_PKG_LEGACY"
  fi
  if [ -f "$CURRENT_PLUGIN_PKG" ]; then
    NEW_CACHED=$(python3 -c "import json;print(json.load(open('$CURRENT_PLUGIN_PKG'))['version'])" 2>/dev/null || echo "")
    if [ "$NEW_CACHED" = "$TARGET_VERSION" ]; then
      ok "plugin cache 已更新到 $NEW_CACHED"
      break
    fi
  fi
  echo -n "."
  sleep 1
done
echo ""

if [ ! -f "$PLUGIN_PKG_NEW" ] && [ ! -f "$PLUGIN_PKG_LEGACY" ]; then
  warn "30 秒内未检测到 plugin cache。可能 OpenCode 尚未完成 Bun install"
  info "稍后再跑 check.sh 验证"
fi

# -----------------------------------------------------------------------------
step "Step 8/8: 跑 check.sh 验证"
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/check.sh" ]; then
  bash "$SCRIPT_DIR/check.sh"
  CHECK_EXIT=$?
else
  warn "check.sh 不在同目录（$SCRIPT_DIR）"
  CHECK_EXIT=0
fi

# -----------------------------------------------------------------------------
echo ""
echo "════════════════════════════════════════════"
if [ "$CHECK_EXIT" = "0" ]; then
  echo -e " ${C_OK}升级完成 → $TARGET_VERSION${C_END}"
  echo ""
  echo " 后续可选:"
  echo "   - 重新 apply 主题（让 agent md 升级到最新规范）:"
  echo "       pmw agents theme apply default --scope global"
  echo "   - 配置子代理模型（可调 agent-model-config skill）"
  echo "   - 在 OpenCode 内开新对话验证: \"切三国主题\""
  exit 0
else
  echo -e " ${C_ERR}升级完成但有问题，看上方 check.sh 报告${C_END}"
  exit 1
fi
