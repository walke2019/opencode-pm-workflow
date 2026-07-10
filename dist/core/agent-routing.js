/**
 * 0.7.0：声明式路由（permission.task）。
 *
 * 设计目标：
 * - 把 `commander → specialist` 路由的真相从代码（`config.agents.dispatch_map`）迁到
 *   agent frontmatter，让用户改一份 markdown 就能定制路由，而不需要改代码。
 * - 完整向后兼容：有 frontmatter `permission.task` 时优先使用；没有则回退到
 *   现有 `dispatch_map`；都没有时回退到默认（self-route）。
 *
 * frontmatter 形式（与 OpenCode 1.17.x 官方约定保持一致）：
 *
 *   ---
 *   description: PM 主协调官
 *   mode: primary
 *   permission:
 *     task:
 *       "*": deny
 *       backend*: allow
 *       designer: allow
 *   ---
 *
 * 其中 value 为 `allow` / `deny` / `ask`：
 * - `allow`：该 primary 可以分派到这个 subagent；
 * - `deny`  / 缺省 false：禁止；
 * - `ask`：需要人工确认（pm-workflow 当前等价于 `allow`，由 OpenCode 自身确认面板拦截）。
 *
 * 规则语义与 OpenCode 保持一致：
 * - pattern 支持 `*` / `?` glob；
 * - 按声明顺序求值，最后一个匹配规则生效。
 *
 * 不做的事情：
 * - 不解析任意复杂 YAML；只支持 `permission.task` 这一项简单 map。
 * - 不删除 `dispatch_map`；它仍是官方支持的运行时覆盖手段。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
function getAgentSearchDirs(projectDir) {
    const globalBase = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode");
    return [
        {
            source: "project",
            dir: join(projectDir, ".opencode", "agents"),
        },
        {
            source: "global",
            dir: join(globalBase, "agents"),
        },
    ];
}
function findAgentMarkdown(projectDir, agentId) {
    for (const search of getAgentSearchDirs(projectDir)) {
        if (!existsSync(search.dir))
            continue;
        const files = readdirSync(search.dir);
        const match = files.find((f) => basename(f, ".md") === agentId);
        if (!match)
            continue;
        const filePath = join(search.dir, match);
        return {
            source: search.source,
            filePath,
            raw: readFileSync(filePath, "utf-8"),
        };
    }
    return undefined;
}
/**
 * 抽取 frontmatter 块（`---` 包裹的部分）。
 *
 * 不依赖完整 YAML parser；仅识别 `key: value` 与 `key:` 子缩进的两层结构。
 * 这是因为 pm-workflow 仅需要解析 `permission.task` 这一项 map，且约定 frontmatter
 * 结构稳定（OpenCode 官方文档示例都是两层缩进）。复杂 YAML 不在本模块职责内。
 */
function extractFrontmatterBlock(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    return match ? match[1] : undefined;
}
/**
 * 把 frontmatter 解析为 `{ permission: { task: {...} } }`-like 对象。
 *
 * 算法：
 * - 一行 `key: value` → 顶层 `key` = value
 * - 一行 `key:` 后接缩进行 `  childKey: childValue` → `key` = { childKey: childValue }
 * - 进一步缩进的孙节点同理（仅支持到第三层）
 *
 * 容错：解析失败的行直接跳过，不抛异常；保证 markdown 编辑错误不会拖垮整个 dispatch。
 */
export function parseFrontmatterTaskPermission(raw) {
    const block = extractFrontmatterBlock(raw);
    if (!block)
        return { taskPermission: {} };
    const lines = block.split(/\n/);
    const taskPermission = {};
    let inPermission = false;
    let inTask = false;
    let permissionIndent = -1;
    let taskIndent = -1;
    const lineIndent = (line) => line.match(/^(\s*)/)?.[1].length || 0;
    for (const rawLine of lines) {
        if (rawLine.trim() === "")
            continue;
        const indent = lineIndent(rawLine);
        const trimmed = rawLine.trim();
        if (indent === 0) {
            inPermission = trimmed === "permission:";
            inTask = false;
            permissionIndent = inPermission ? 0 : -1;
            continue;
        }
        if (inPermission && indent > permissionIndent) {
            if (trimmed === "task:") {
                inTask = true;
                taskIndent = indent;
                continue;
            }
            if (inTask) {
                if (indent <= taskIndent) {
                    // 跳出 task 子块
                    inTask = false;
                    taskIndent = -1;
                }
                else {
                    const sep = trimmed.indexOf(":");
                    if (sep === -1)
                        continue;
                    const subagent = trimmed
                        .slice(0, sep)
                        .trim()
                        .replace(/^(?:"([^"]*)"|'([^']*)')$/, "$1$2");
                    const value = trimmed
                        .slice(sep + 1)
                        .trim()
                        .replace(/^["']|["']$/g, "");
                    if (subagent && (value === "allow" || value === "deny" || value === "ask")) {
                        taskPermission[subagent] = value;
                    }
                }
            }
        }
        else {
            // 缩进回到 0 之外的层级，重置上下文
            inPermission = trimmed === "permission:";
            inTask = false;
            permissionIndent = inPermission ? indent : -1;
        }
    }
    return { taskPermission };
}
/**
 * 匹配 OpenCode permission 使用的 glob 语义。
 *
 * 与 OpenCode `Wildcard.match` 保持一致：统一路径分隔符，支持 `*` / `?`，
 * Windows 下忽略大小写，并兼容 `git *` 同时匹配 `git` 的命令规则。
 */
function matchesOpenCodeWildcard(input, pattern) {
    const normalized = input.replaceAll("\\", "/");
    let escaped = pattern
        .replaceAll("\\", "/")
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
    if (escaped.endsWith(" .*")) {
        escaped = `${escaped.slice(0, -3)}( .*)?`;
    }
    return new RegExp(`^${escaped}$`, process.platform === "win32" ? "si" : "s").test(normalized);
}
/**
 * 解析某个 primary agent（如 `commander`）的声明式路由。
 *
 * 优先 project agents，再 global；都没有时返回 `source: "none"`，调用方应回退到
 * `dispatch_map` 或默认 self-route。
 */
export function resolveAgentTaskRouting(input) {
    const found = findAgentMarkdown(input.projectDir, input.primaryAgent);
    if (!found) {
        return {
            primaryAgent: input.primaryAgent,
            allowedSubagents: [],
            deniedSubagents: [],
            taskPermission: {},
            source: "none",
        };
    }
    const { taskPermission } = parseFrontmatterTaskPermission(found.raw);
    const allowedSubagents = [];
    const deniedSubagents = [];
    for (const [subagent, value] of Object.entries(taskPermission)) {
        if (value === "allow" || value === "ask") {
            allowedSubagents.push(subagent);
        }
        else if (value === "deny") {
            deniedSubagents.push(subagent);
        }
    }
    return {
        primaryAgent: input.primaryAgent,
        allowedSubagents,
        deniedSubagents,
        taskPermission,
        source: found.source,
        filePath: found.filePath,
    };
}
/**
 * 综合判断 primary 是否被允许把任务委派给 candidate。
 *
 * 按 frontmatter 声明顺序匹配 glob，最后一个匹配规则生效；没有规则命中时由
 * fallbackAllow 决定（默认 true，保持向后兼容）。
 *
 * 这样新增 frontmatter 是"显式规则"，旧项目无 frontmatter 时一切照旧。
 */
export function isSubagentAllowedByDeclarativeRouting(input) {
    const fallbackAllow = input.fallbackAllow ?? true;
    let matchedPattern;
    let value;
    for (const [pattern, action] of Object.entries(input.routing.taskPermission)) {
        if (!action || !matchesOpenCodeWildcard(input.candidate, pattern)) {
            continue;
        }
        matchedPattern = pattern;
        value = action;
    }
    if (value === "deny") {
        return {
            allowed: false,
            reason: `permission.task[${matchedPattern}]=deny matched ${input.candidate} in ${input.routing.filePath ?? "frontmatter"}`,
        };
    }
    if (value === "allow" || value === "ask") {
        return {
            allowed: true,
            reason: `permission.task[${matchedPattern}]=${value} matched ${input.candidate}`,
        };
    }
    if (input.routing.source === "none") {
        return {
            allowed: fallbackAllow,
            reason: "no frontmatter routing; using legacy dispatch_map fallback",
        };
    }
    return {
        allowed: fallbackAllow,
        reason: `permission.task did not declare ${input.candidate}; using fallback`,
    };
}
