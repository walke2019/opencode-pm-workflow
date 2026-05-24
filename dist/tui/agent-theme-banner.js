import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
/**
 * 解析极简 frontmatter：识别顶层 `key: value` 行，仅取我们需要的几个字段。
 * 不引 yaml 包；与 agent-registry / agent-library 解析口径一致（轻量）。
 */
function parseAgentFrontmatter(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!match)
        return {};
    const fmText = match[1];
    const result = {};
    for (const line of fmText.split("\n")) {
        const sep = line.indexOf(":");
        if (sep === -1)
            continue;
        const key = line.slice(0, sep).trim();
        if (key !== "display_name" && key !== "theme" && key !== "description")
            continue;
        const val = line.slice(sep + 1).trim().replace(/^["']|["']$/g, "");
        if (key === "display_name")
            result.display_name = val;
        else if (key === "theme")
            result.theme = val;
        else if (key === "description")
            result.description = val;
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
function readGlobalAgentsDisplayInfo() {
    const FIXED_IDS = ["commander", "advisor", "backendcoder", "designer", "fixer", "writer"];
    const homeFromEnv = process.env.HOME || process.env.USERPROFILE;
    if (!homeFromEnv)
        return [];
    const xdgHome = process.env.XDG_CONFIG_HOME || join(homeFromEnv, ".config");
    const agentsDir = join(xdgHome, "opencode", "agents");
    if (!existsSync(agentsDir))
        return [];
    const result = [];
    for (const id of FIXED_IDS) {
        const filePath = join(agentsDir, `${id}.md`);
        if (!existsSync(filePath))
            continue;
        let raw = "";
        try {
            raw = readFileSync(filePath, "utf-8");
        }
        catch {
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
function detectCurrentTheme(infos) {
    for (const info of infos) {
        if (info.theme && info.theme !== "")
            return info.theme;
    }
    return "";
}
/**
 * 主题中文 label 表（来自 agent-theme-data.ts，但不依赖 import 避免 TUI bundle 膨胀）
 */
const THEME_LABELS = {
    default: "默认（中性）",
    sanguo: "三国",
    xiyou: "西游",
    marvel: "漫威",
    workplace: "现代职场",
};
/**
 * 创建 agent 主题名 banner / toast 工具集。
 * 由 src/tui/plugin.ts 在 plugin 装配阶段调用，注入到 commands 里供用户触发。
 */
export function createAgentThemeBanner(api) {
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
            message: roleLine.length > 0
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
    const showSingleAgentToast = (agentId, duration = 6000) => {
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
            message: target.description.length > 0
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
