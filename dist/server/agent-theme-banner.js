/**
 * Server-side agent 主题 banner（1.0.0-rc.16 起）
 *
 * rc.14 在 src/tui/agent-theme-banner.ts 实现 toast banner，但需要
 * OpenCode TUI plugin 注册——经 rc.15 实测，OpenCode 1.15 当前**不支持**
 * 外部 npm plugin 注册 TUI hook（所有 service=tui.plugin 都是 internal:*）。
 *
 * rc.16 改用 server plugin 的 SDK 调用：`client.tui.showToast({...})`
 * 直接从 server 侧 push toast 到 OpenCode TUI。这条路径已在 OpenCode 1.15
 * 验证可用（v1 SDK 的 client.tui.showToast 是公开 API）。
 *
 * 设计原则：
 * - 只读：从 ~/.config/opencode/agents/<id>.md 读 frontmatter，不修改
 * - 容错：agent md 不存在 / 字段缺失时优雅降级（不弹 banner）
 * - 不阻塞：toast 调用失败也不影响 plugin 加载
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const FIXED_AGENT_IDS = [
    "commander",
    "advisor",
    "backendcoder",
    "designer",
    "fixer",
    "writer",
];
const THEME_LABELS = {
    default: "默认（中性）",
    sanguo: "三国",
    xiyou: "西游",
    marvel: "漫威",
    workplace: "现代职场",
};
/**
 * 极简 frontmatter 解析：识别顶层 `key: value` 行，仅取 display_name + theme。
 * 不引 yaml 包；与 agent-registry / agent-theme 解析口径一致。
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
        if (key !== "display_name" && key !== "theme")
            continue;
        const val = line
            .slice(sep + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
        if (key === "display_name")
            result.display_name = val;
        else if (key === "theme")
            result.theme = val;
    }
    return result;
}
/** 解析 OpenCode 全局 agents 目录路径（XDG_CONFIG_HOME 优先）。 */
function resolveGlobalAgentsDir() {
    const xdgHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(xdgHome, "opencode", "agents");
}
/**
 * 读取 6 个固定 agent 的 display_name + theme。
 * 缺失文件 / 缺字段时优雅降级（不抛错）。
 */
export function readGlobalAgentsDisplayInfo() {
    const agentsDir = resolveGlobalAgentsDir();
    if (!existsSync(agentsDir))
        return [];
    const result = [];
    for (const id of FIXED_AGENT_IDS) {
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
        });
    }
    return result;
}
/** 从 6 个 agent 中检出当前主题（任一非空即可，6 个一致）。 */
function detectCurrentTheme(infos) {
    for (const info of infos) {
        if (info.theme && info.theme !== "")
            return info.theme;
    }
    return "";
}
/**
 * 构造 banner toast 内容。
 *
 * 行为：
 * - 6 个 agent 全部存在 + 全有 display_name → 显示 "主题：X" + 6 个角色名映射
 * - 任意一个 display_name 与 id 相同（说明该 agent 没主题化）→ 仍显示，但只列出有主题的部分
 * - infos 为空（agents 目录不存在 / 6 个 md 都没装）→ 返回 null（不弹 banner）
 */
export function buildAgentThemeBannerContent(infos) {
    if (infos.length === 0)
        return null;
    const theme = detectCurrentTheme(infos);
    const themeLabel = theme ? (THEME_LABELS[theme] || theme) : "未配置主题";
    // 优先显示有主题化的 agent（display_name !== id），避免 toast 太长
    const themedRoles = infos.filter((info) => info.displayName !== info.id);
    const message = themedRoles.length > 0
        ? themedRoles.map((info) => `${info.displayName}(${info.id})`).join(" / ")
        : `6 个固定 agent: ${infos.map((i) => i.id).join(" / ")}`;
    return {
        title: `pm-workflow 主题：${themeLabel}`,
        message,
    };
}
/**
 * Server-side banner 调用入口：在 plugin first activation 后调一次。
 *
 * 接受任意带 `tui.showToast` 方法的 client（OpenCode SDK v1 client 类型，
 * 我们不强类型化避免 plugin 包体绑定 SDK 版本）。
 *
 * 行为：
 * - 读 agent md → 构造内容 → 调 showToast
 * - 任何一步失败都静默吞掉（不阻塞 plugin 加载）
 * - 6 个 agent md 不存在时直接返回，不弹 banner（避免新装用户被空 banner 打扰）
 */
export async function showAgentThemeBanner(input) {
    let infos = [];
    try {
        infos = readGlobalAgentsDisplayInfo();
    }
    catch (err) {
        return {
            shown: false,
            reason: `read-agents-failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
    const content = buildAgentThemeBannerContent(infos);
    if (!content) {
        return { shown: false, reason: "no-agents-installed" };
    }
    try {
        await input.client.tui.showToast({
            title: content.title,
            message: content.message,
            variant: "info",
            duration: input.duration ?? 6500,
        });
        return { shown: true };
    }
    catch (err) {
        return {
            shown: false,
            reason: `toast-failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
