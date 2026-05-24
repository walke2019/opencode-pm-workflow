import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type TuiApi = Parameters<NonNullable<TuiPluginModule["tui"]>>[0];

/**
 * Agent 主题名渲染 — 1.0.0-rc.14 实验
 *
 * OpenCode UI 切换器只渲染 agent 文件名（如 designer），不识别 frontmatter
 * 自定义字段（如 display_name）。所以原生 UI 上看不到"貂蝉"等主题角色名。
 *
 * 本模块的策略（rc.14 阶段 B 实验）：
 *
 * 1. **Toast banner** — 启动后 / 切换主代理时 / 用户主动查询时弹 toast，
 *    渲染当前 active agent 的 display_name + theme（来自 frontmatter）。
 *    这是最可靠的扩展点：toast 是 OpenCode 官方 plugin API，跨 UI 形态可用。
 *
 * 2. **Slot 探针**（暂未启用） — 后续 rc.15 评估
 *    api.slots.register() 在 sidebar / app / home_logo 等位置注入自定义渲染。
 *    需要 Solid JSX 编译链路，先验证 toast 方案够不够再决定是否引入。
 *
 * 3. **Command 主题查询** — 用户按快捷键能弹"当前所有 6 个 agent 的主题角色名"
 *    汇总，便于 UI 上随时查看。
 *
 * 设计约束：
 * - 只读：不修改 OpenCode 原生 UI，不替换 agent 文件名
 * - 容错：agent md 不存在 / 没 display_name / 没 theme 字段时优雅降级
 * - 跨主题：default 主题下 display_name 也存在（"主协调官"等），不会空显示
 */

interface AgentDisplayInfo {
  /** agent ID，例如 commander / designer */
  id: string;
  /** frontmatter display_name，例如 "诸葛亮" / "主协调官"；缺则等于 id */
  displayName: string;
  /** frontmatter theme，例如 "sanguo" / "default"；缺则空字符串 */
  theme: string;
  /** frontmatter description 一句话简介；缺则空字符串 */
  description: string;
}

/**
 * 解析极简 frontmatter：识别顶层 `key: value` 行，仅取我们需要的几个字段。
 * 不引 yaml 包；与 agent-registry / agent-library 解析口径一致（轻量）。
 */
function parseAgentFrontmatter(raw: string): {
  display_name?: string;
  theme?: string;
  description?: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fmText = match[1];
  const result: { display_name?: string; theme?: string; description?: string } = {};
  for (const line of fmText.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    if (key !== "display_name" && key !== "theme" && key !== "description") continue;
    const val = line.slice(sep + 1).trim().replace(/^["']|["']$/g, "");
    if (key === "display_name") result.display_name = val;
    else if (key === "theme") result.theme = val;
    else if (key === "description") result.description = val;
  }
  return result;
}

/**
 * 读取 OpenCode 全局 agents 目录里 6 个 pm-workflow 固定 agent 的 display_name。
 *
 * 路径：
 * - 全局：`$XDG_CONFIG_HOME/opencode/agents/<id>.md`（默认 ~/.config/opencode/agents/）
 *
 * 项目级 agent 目录暂不读，避免主题名字在 home / 项目间频繁切换让用户困惑。
 */
function readGlobalAgentsDisplayInfo(): AgentDisplayInfo[] {
  const FIXED_IDS = ["commander", "advisor", "backendcoder", "designer", "fixer", "writer"] as const;
  const homeFromEnv = process.env.HOME || process.env.USERPROFILE;
  if (!homeFromEnv) return [];
  const xdgHome = process.env.XDG_CONFIG_HOME || join(homeFromEnv, ".config");
  const agentsDir = join(xdgHome, "opencode", "agents");
  if (!existsSync(agentsDir)) return [];

  const result: AgentDisplayInfo[] = [];
  for (const id of FIXED_IDS) {
    const filePath = join(agentsDir, `${id}.md`);
    if (!existsSync(filePath)) continue;
    let raw = "";
    try {
      raw = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const fm = parseAgentFrontmatter(raw);
    result.push({
      id,
      displayName: fm.display_name && fm.display_name.length > 0 ? fm.display_name : id,
      theme: fm.theme || "",
      description: fm.description || "",
    });
  }
  return result;
}

/**
 * 当前主题名（从任一 agent md 的 theme 字段读，6 个一致）。
 * 没装主题时返回空字符串。
 */
function detectCurrentTheme(infos: AgentDisplayInfo[]): string {
  for (const info of infos) {
    if (info.theme && info.theme !== "") return info.theme;
  }
  return "";
}

/**
 * 主题中文 label 表（来自 agent-theme-data.ts，但不依赖 import 避免 TUI bundle 膨胀）
 */
const THEME_LABELS: Record<string, string> = {
  default: "默认（中性）",
  sanguo: "三国",
  xiyou: "西游",
  marvel: "漫威",
  workplace: "现代职场",
};

export interface AgentThemeBannerHelpers {
  /**
   * 启动 toast — 显示当前主题与 6 个 agent 的角色名映射。
   * 5 秒展示。
   */
  showStartupBanner: (duration?: number) => void;
  /**
   * 用户主动查询 toast — 列出全部 6 个 agent 的 display_name。
   * 8 秒展示，便于阅读。
   */
  showAgentRosterToast: (duration?: number) => void;
  /**
   * 单个 agent 信息 toast — 用户 hover / 关注某个 agent 时调用。
   */
  showSingleAgentToast: (agentId: string, duration?: number) => void;
}

/**
 * 创建 agent 主题名 banner / toast 工具集。
 * 由 src/tui/plugin.ts 在 plugin 装配阶段调用，注入到 commands 里供用户触发。
 */
export function createAgentThemeBanner(api: TuiApi): AgentThemeBannerHelpers {
  const showStartupBanner = (duration = 5000) => {
    const infos = readGlobalAgentsDisplayInfo();
    if (infos.length === 0) {
      // 没装 6 个 agent md，不打扰用户
      return;
    }
    const theme = detectCurrentTheme(infos);
    const themeLabel = theme ? (THEME_LABELS[theme] || theme) : "未配置主题";

    // 构造一行 6 个角色名（display_name 与 id 不同的才显示，避免冗余）
    const roleLine = infos
      .filter((info) => info.displayName !== info.id)
      .map((info) => `${info.displayName}(${info.id})`)
      .join(" / ");

    api.ui.toast({
      variant: "info",
      title: `pm-workflow 主题：${themeLabel}`,
      message:
        roleLine.length > 0
          ? roleLine
          : `6 个固定 agent: ${infos.map((i) => i.id).join(" / ")}（建议跑 pmw agents theme apply 应用主题）`,
      duration,
    });
  };

  const showAgentRosterToast = (duration = 8000) => {
    const infos = readGlobalAgentsDisplayInfo();
    if (infos.length === 0) {
      api.ui.toast({
        variant: "warning",
        title: "pm-workflow agents",
        message: "未在 ~/.config/opencode/agents/ 找到 6 个固定 agent；建议运行 pmw agents theme apply",
        duration,
      });
      return;
    }
    const theme = detectCurrentTheme(infos);
    const themeLabel = theme ? (THEME_LABELS[theme] || theme) : "未配置";

    const roster = infos
      .map((info) => `${info.id}=${info.displayName}`)
      .join(" | ");

    api.ui.toast({
      variant: "info",
      title: `pm-workflow agents（主题：${themeLabel}）`,
      message: roster,
      duration,
    });
  };

  const showSingleAgentToast = (agentId: string, duration = 6000) => {
    const infos = readGlobalAgentsDisplayInfo();
    const target = infos.find((info) => info.id === agentId);
    if (!target) {
      api.ui.toast({
        variant: "warning",
        title: `pm-workflow agent: ${agentId}`,
        message: `未找到 ~/.config/opencode/agents/${agentId}.md`,
        duration,
      });
      return;
    }
    const themeLabel = target.theme ? (THEME_LABELS[target.theme] || target.theme) : "未配置";

    api.ui.toast({
      variant: "info",
      title: `${target.displayName}（${target.id}）`,
      message:
        target.description.length > 0
          ? `${target.description} | 主题: ${themeLabel}`
          : `主题: ${themeLabel}`,
      duration,
    });
  };

  return {
    showStartupBanner,
    showAgentRosterToast,
    showSingleAgentToast,
  };
}
