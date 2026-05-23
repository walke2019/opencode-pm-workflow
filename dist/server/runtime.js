import { spawnSync } from "child_process";
import { homedir, tmpdir } from "node:os";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, } from "fs";
import { join } from "path";
import { REVIEW_MARKER_FILENAME, buildExecutablePrompt, buildDispatchPlan, buildStateSummary, recordDispatchExecution, resolveWorkflowAgentDefinition, resolveAgentInvocationSemantics, setLastAgent, } from "../shared.js";
import { buildDispatchCommandStrings } from "../orchestrator/prompts.js";
import { analyzeDispatchTask } from "../orchestrator/analyzer.js";
import { buildHandoffPacket } from "../orchestrator/handoff.js";
import { readWorkflowConfig } from "../core/config.js";
import { buildForegroundFallbackPlan, } from "../core/fallback-runtime.js";
import { appendHistory } from "../core/history.js";
import { isSubagentAllowedByDeclarativeRouting, resolveAgentTaskRouting, } from "../core/agent-routing.js";
const NON_CODE_EXTENSIONS = new Set([
    ".md",
    ".txt",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".lock",
    ".log",
    ".env",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".mp4",
    ".mp3",
    ".wav",
    ".pdf",
    ".zip",
]);
const IGNORED_TSCONFIG_DIRS = new Set([
    "node_modules",
    ".next",
    "dist",
    "build",
    ".venv",
    "__pycache__",
]);
const FEEDBACK_SIGNAL_PATTERNS = [
    /不是这样/,
    /别这样做/,
    /你搞错/,
    /搞错了/,
    /你错了/,
    /不对/,
    /不应该/,
    /你漏了/,
    /你忘了/,
    /改一下/,
    /不合理/,
    /你理解错/,
    /我说的不是/,
    /你确定/,
    /到底在/,
    /为什么没/,
    /没有执行/,
    /没有生效/,
    /你又忘/,
    /强调了/,
    /说过了/,
    /提醒过/,
    /怎么还/,
    /一直在/,
    /每次都/,
    /我不是让你/,
    /你先.*看/,
    /再说一遍/,
    /你到底/,
    /什么意思/,
    /能不能/,
    /不要再/,
    /别再/,
    /停下/,
    /不用管/,
    /先不要/,
];
function toUtf8(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value;
    return value.toString("utf-8");
}
/**
 * 在 commandArgs 中替换 model 参数。
 *
 * OpenCode 的 `run` / `task` 子命令支持 `--model <id>`；
 * 旧的 commandArgs 可能没有携带该参数，因此既支持替换也支持追加。
 */
function replaceModelInCommandArgs(commandArgs, nextModel) {
    const next = [...commandArgs];
    const flagIndex = next.indexOf("--model");
    if (flagIndex !== -1 && flagIndex + 1 < next.length) {
        next[flagIndex + 1] = nextModel;
        return next;
    }
    // 把 --model 插入到第一个非选项参数前（即 prompt 字符串前），
    // 这样不会影响 prompt 自身。
    const insertAt = (() => {
        for (let i = 1; i < next.length; i += 1) {
            if (!next[i - 1].startsWith("-") && !next[i].startsWith("-")) {
                return i;
            }
        }
        return next.length;
    })();
    next.splice(insertAt, 0, "--model", nextModel);
    return next;
}
/**
 * 提取当前 commandArgs 中显式指定的 model id。未指定则返回 resolvedAgent.model。
 */
function detectCurrentModel(commandArgs, resolvedModel) {
    const flagIndex = commandArgs.indexOf("--model");
    if (flagIndex !== -1 && flagIndex + 1 < commandArgs.length) {
        return commandArgs[flagIndex + 1];
    }
    return resolvedModel;
}
export function executeDispatchCommand(projectPath, dispatch, prompt) {
    setLastAgent(projectPath, dispatch.recommendedAgent);
    const config = readWorkflowConfig(projectPath);
    let currentArgs = dispatch.commandArgs;
    let currentModel = detectCurrentModel(currentArgs, dispatch.resolvedAgent?.model);
    const attempts = [];
    // 单次原始执行 + 至多 N 次降级重试。N 由 fallback.max_attempts 限制（≥1）。
    const maxFallbackAttempts = Math.max(1, config.fallback.max_attempts || 1);
    let finalResult = spawnSync("opencode", currentArgs, {
        cwd: projectPath,
        shell: false,
        encoding: "utf-8",
    });
    let finalStdout = toUtf8(finalResult.stdout);
    let finalStderr = toUtf8(finalResult.stderr);
    let usedFallback = false;
    let fallbackAttemptsUsed = 0;
    while (fallbackAttemptsUsed < maxFallbackAttempts) {
        const plan = buildForegroundFallbackPlan({
            config,
            semanticAgent: dispatch.recommendedAgent,
            currentModel,
            exitCode: finalResult.status ?? -1,
            stdout: finalStdout,
            stderr: finalStderr,
        });
        attempts.push({
            model: currentModel,
            exitCode: finalResult.status ?? -1,
            plan,
        });
        if (!plan.triggered || !plan.nextModel) {
            // 未触发降级，或链路耗尽：保留 finalResult，跳出循环。
            break;
        }
        const fromModel = currentModel;
        currentArgs = replaceModelInCommandArgs(currentArgs, plan.nextModel);
        currentModel = plan.nextModel;
        fallbackAttemptsUsed += 1;
        usedFallback = true;
        appendHistory(projectPath, {
            type: "fallback.foreground_switch",
            action: dispatch.recommendedAction,
            agent: dispatch.recommendedAgent,
            from_model: fromModel,
            to_model: plan.nextModel,
            trigger_kind: plan.signal?.kind,
            trigger_pattern: plan.signal?.matchedPattern,
            trigger_source: plan.signal?.source,
        });
        finalResult = spawnSync("opencode", currentArgs, {
            cwd: projectPath,
            shell: false,
            encoding: "utf-8",
        });
        finalStdout = toUtf8(finalResult.stdout);
        finalStderr = toUtf8(finalResult.stderr);
    }
    recordDispatchExecution(projectPath, {
        agent: dispatch.recommendedAgent,
        action: dispatch.recommendedAction,
        exitCode: finalResult.status ?? -1,
        prompt,
        stdout: finalStdout,
        stderr: finalStderr,
    });
    return {
        status: finalResult.status,
        stdout: finalStdout,
        stderr: finalStderr,
        fallback: {
            usedFallback,
            finalModel: usedFallback ? currentModel : undefined,
            attempts,
        },
    };
}
export function buildAutoContinueDispatch(projectDir, prompt, evaluation) {
    if (!evaluation.canAutoContinue ||
        !evaluation.autoContinueSafe ||
        !evaluation.recommendedNextAgent ||
        !evaluation.nextAutoAction) {
        return undefined;
    }
    // 0.7.0：声明式路由门禁。
    // 如果当前 evaluation.recommendedNextAgent 是某个 primary（pm_lead / pm_advisor）
    // 推荐分派出去的 subagent，且该 primary 的 frontmatter 明确写了 `permission.task[next]=deny`，
    // 则 buildAutoContinueDispatch 直接返回 undefined，让 chain 落到 `completed` 状态。
    // primary 自身缺失 frontmatter（source=none）时按 fallbackAllow=true，保持向后兼容。
    const lastAgentCandidate = evaluation.lastAgent ||
        "pm_lead";
    const routing = resolveAgentTaskRouting({
        projectDir,
        primaryAgent: lastAgentCandidate,
    });
    const decision = isSubagentAllowedByDeclarativeRouting({
        routing,
        candidate: evaluation.recommendedNextAgent,
    });
    if (!decision.allowed) {
        appendHistory(projectDir, {
            type: "routing.denied",
            primary_agent: lastAgentCandidate,
            candidate_agent: evaluation.recommendedNextAgent,
            reason: decision.reason,
        });
        return undefined;
    }
    const plan = buildDispatchPlan(projectDir);
    const sessionID = plan.preferredSession;
    const analysis = analyzeDispatchTask({
        prompt,
        stage: plan.stage,
        blockedReasons: plan.blockedReasons,
        preferredAgent: evaluation.recommendedNextAgent,
    });
    const handoffPacket = buildHandoffPacket({
        prompt,
        analysis,
        targetAgent: evaluation.recommendedNextAgent,
    });
    const resolvedAgent = resolveWorkflowAgentDefinition({
        projectDir,
        semanticAgent: evaluation.recommendedNextAgent,
    });
    const executableAgent = resolvedAgent.id;
    const invocationMode = resolvedAgent.mode === "primary" ? "primary" : "subagent";
    const invocation = resolveAgentInvocationSemantics(executableAgent, invocationMode);
    const executablePrompt = buildExecutablePrompt(evaluation.recommendedNextAgent, prompt, handoffPacket);
    const { command, commandArgs } = buildDispatchCommandStrings(sessionID, executableAgent, executablePrompt, invocation);
    return {
        ...plan,
        recommendedAgent: evaluation.recommendedNextAgent,
        recommendedAction: evaluation.nextAutoAction,
        reason: `自动续跑下一步：${evaluation.recommendedNextAgent}/${evaluation.nextAutoAction}`,
        analysis,
        handoffPacket,
        invocation,
        resolvedAgent,
        executableAgent,
        executablePrompt,
        command,
        commandArgs,
    };
}
/**
 * OpenCode 全局配置目录。
 *
 * 跨平台统一规则（与 OpenCode 官方文档对齐）：
 * - macOS/Linux: `~/.config/opencode/`
 * - Windows:    `%USERPROFILE%\.config\opencode\`
 *
 * 注意：OpenCode 在 Windows 上**不用** `%APPDATA%`，而是统一用 `%USERPROFILE%\.config\`，
 * 跟 Linux 风格一致。这与传统 Windows 应用习惯不同。
 *
 * 实现策略：用 Node `os.homedir()` 跨平台拿 home 目录（macOS = "/Users/...", Linux =
 * "/home/...", Windows = "C:\Users\..."），再 join `.config/opencode`，无需平台分支。
 */
export function getConfigDir() {
    return join(homedir(), ".config", "opencode");
}
/**
 * 推断 plugin 工作的"项目目录"。
 *
 * OpenCode 的 PluginInput 在以下场景里会传入空字符串或根目录：
 * - 用户在非 git 目录启动 OpenCode（worktree 解析失败）
 * - `ctx.project.id === "global"`（OpenCode 文档明说会发生）
 * - OpenCode server 在系统服务模式下 cwd === "/"
 *
 * 简单 `ctx.worktree || ctx.directory || process.cwd()` 在以上场景里会得到 `/`，
 * 然后 `join("/", ".pm-workflow")` = `/.pm-workflow`，mkdir 立刻 ENOENT，整个插件
 * 装配 abort（参见 OpenCode log 中的 "mkdir '/.pm-workflow' failed to load plugin"）。
 *
 * 正确的兜底：
 * 1. ctx.worktree（非空且非 "/"）
 * 2. ctx.directory（非空且非 "/"）
 * 3. process.cwd()（非 "/"）
 * 4. fallback 到 ~/.cache/pm-workflow/global —— 这是个普通用户可写的目录，永不抛错
 */
export function getProjectDir(ctx) {
    return resolveSafeProjectDir(ctx.worktree, ctx.directory, process.cwd());
}
/**
 * 通用安全 projectDir 解析。给 tool 入口（context.worktree / context.directory）
 * 与其他需要 projectDir 兜底的地方使用。
 *
 * 跨平台兼容：
 * - 跳过空字符串 / 纯空白 / "/"（POSIX 根） / "\"（Windows 根的早期形式） / 单字符
 * - 正常路径直接返回
 * - 都不可用时回退到 `<home>/.cache/pm-workflow/global`（Node `os.homedir()` 跨平台）
 * - 极端无 home 时用 `os.tmpdir()`（macOS = `/var/folders/...`, Linux = `/tmp`,
 *   Windows = `C:\Users\<user>\AppData\Local\Temp` 等系统标准临时目录）
 *
 * **永不返回 `/` 或 `\`**。
 */
export function resolveSafeProjectDir(...candidates) {
    for (const candidate of candidates) {
        if (typeof candidate !== "string")
            continue;
        const trimmed = candidate.trim();
        if (!trimmed)
            continue;
        // 拒绝 POSIX / Windows 早期根目录形式（"/" 或单一 "\"）
        if (trimmed === "/" || trimmed === "\\")
            continue;
        return trimmed;
    }
    // 兜底 1：用户 home 下的 cache 目录。Node `os.homedir()` 跨平台：
    //   macOS:   /Users/<user>
    //   Linux:   /home/<user>
    //   Windows: C:\Users\<user>
    const home = homedir();
    if (home && home !== "/" && home !== "\\") {
        return join(home, ".cache", "pm-workflow", "global");
    }
    // 兜底 2：极端 sandbox 环境（home 也异常时），用 Node 系统标准临时目录。
    //   macOS:   /var/folders/.../T/
    //   Linux:   /tmp
    //   Windows: C:\Users\<user>\AppData\Local\Temp
    return join(tmpdir(), "pm-workflow-global");
}
export async function log(client, level, message, extra) {
    await client?.app?.log?.({
        body: {
            service: "pm-workflow-plugin",
            level,
            message,
            extra,
        },
    });
}
export function isCodePath(filePath) {
    const lower = filePath.toLowerCase();
    const lastDot = lower.lastIndexOf(".");
    if (lastDot === -1)
        return true;
    const extension = lower.slice(lastDot);
    return !NON_CODE_EXTENSIONS.has(extension);
}
export function writeReviewMarker(projectDir) {
    const markerPath = join(projectDir, REVIEW_MARKER_FILENAME);
    writeFileSync(markerPath, "needs_review", "utf-8");
}
export function checkReviewGate(projectDir) {
    const markerPath = join(projectDir, REVIEW_MARKER_FILENAME);
    if (!existsSync(markerPath)) {
        return { ok: true, message: "", markerPath };
    }
    const state = readFileSync(markerPath, "utf-8").trim();
    if (state === "clean") {
        rmSync(markerPath, { force: true });
        return { ok: true, message: "", markerPath };
    }
    if (state === "needs_review") {
        return {
            ok: false,
            message: JSON.stringify({
                decision: "block",
                reason: "代码已修改但未进行 code review。请先完成两阶段审查，再继续提交或结束流程。",
            }),
            markerPath,
        };
    }
    return { ok: true, message: "", markerPath };
}
function findTsconfig(projectDir) {
    const queue = [
        { dir: projectDir, depth: 0 },
    ];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || current.depth > 3)
            continue;
        const tsconfig = join(current.dir, "tsconfig.json");
        if (existsSync(tsconfig))
            return current.dir;
        if (current.depth === 3)
            continue;
        let children = [];
        try {
            children = readdirSync(current.dir).sort();
        }
        catch {
            continue;
        }
        for (const child of children) {
            if (IGNORED_TSCONFIG_DIRS.has(child))
                continue;
            const childPath = join(current.dir, child);
            try {
                if (statSync(childPath).isDirectory()) {
                    queue.push({ dir: childPath, depth: current.depth + 1 });
                }
            }
            catch {
                continue;
            }
        }
    }
    return null;
}
export function runPreCommitCheck(projectDir) {
    const codeDir = findTsconfig(projectDir);
    if (!codeDir) {
        return { ok: true, stdout: "", stderr: "" };
    }
    const result = spawnSync("npx", ["tsc", "--noEmit"], {
        cwd: codeDir,
        encoding: "utf-8",
        timeout: 120000,
    });
    if ((result.status ?? 0) === 0) {
        return {
            ok: true,
            stdout: result.stdout || "",
            stderr: result.stderr || "",
        };
    }
    return {
        ok: false,
        stdout: result.stdout || "",
        stderr: [
            "编译检查未通过，commit 被阻止。请修复以下错误：",
            result.stdout || "",
            result.stderr || "",
        ]
            .filter(Boolean)
            .join("\n"),
    };
}
export function extractChangedPathsFromPatch(patchText) {
    const matches = patchText.matchAll(/\*\*\* (?:Add|Update) File: (.+)$/gm);
    return Array.from(matches, (match) => match[1].trim());
}
export function buildStagePrompt(projectDir) {
    const status = buildStateSummary(projectDir);
    const dispatch = buildDispatchPlan(projectDir);
    return [
        "## pm-workflow 项目状态",
        `- Product Spec: ${status.documents.product_spec ? "已完成" : "未完成"}`,
        `- Design Brief: ${status.documents.design_brief ? "已生成" : "未生成"}`,
        `- DEV-PLAN: ${status.documents.dev_plan ? "已生成" : "未生成"}`,
        `- 当前阶段: ${status.stageLabel}`,
        `- 当前 Phase: ${status.phase.current || "未设置"}`,
        `- Review 状态: ${status.review.status}`,
        `- 建议 Agent: ${dispatch.recommendedAgent}`,
        `- 建议动作: ${dispatch.recommendedAction}`,
        `- 下一步: ${status.nextStep}`,
    ].join("\n");
}
export function buildStageSummary(projectDir) {
    const status = buildStateSummary(projectDir);
    return {
        productSpec: status.documents.product_spec ? "已完成" : "未完成",
        designBrief: status.documents.design_brief ? "已生成" : "未生成",
        devPlan: status.documents.dev_plan ? "已生成" : "未生成",
        stage: status.stageLabel,
        phase: status.phase.current || "未设置",
        reviewStatus: status.review.status,
        nextStep: status.nextStep,
    };
}
export function buildReviewGateSummary(projectDir) {
    const markerPath = join(projectDir, REVIEW_MARKER_FILENAME);
    const gate = checkReviewGate(projectDir);
    if (gate.ok) {
        return {
            state: "clean",
            message: "review gate 已通过，或当前没有待 review 的代码变更。",
            markerPath,
        };
    }
    return {
        state: "needs_review",
        message: gate.message || "代码已修改但尚未完成 code review。",
        markerPath,
    };
}
export function buildFeedbackSignalSummary(message) {
    if (!FEEDBACK_SIGNAL_PATTERNS.some((pattern) => pattern.test(message))) {
        return {
            detected: false,
            message: "未检测到明显的用户修正或反馈信号。",
            detail: "",
        };
    }
    return {
        detected: true,
        message: "检测到用户修正或反馈信号。",
        detail: JSON.stringify({
            additionalContext: "检测到用户修正信号。请在处理完用户请求后，将这条反馈记录到项目 .pm-workflow/feedback/ 目录。",
        }),
    };
}
