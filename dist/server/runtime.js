import { spawnSync } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { REVIEW_MARKER_FILENAME, buildDispatchPlan, buildStateSummary, recordDispatchExecution, setLastAgent, } from "../shared.js";
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
export function executeDispatchCommand(projectPath, dispatch, prompt) {
    setLastAgent(projectPath, dispatch.recommendedAgent);
    const result = spawnSync("opencode", dispatch.commandArgs, {
        cwd: projectPath,
        shell: false,
        encoding: "utf-8",
    });
    recordDispatchExecution(projectPath, {
        agent: dispatch.recommendedAgent,
        action: dispatch.recommendedAction,
        exitCode: result.status ?? -1,
        prompt,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
    });
    return result;
}
export function getConfigDir() {
    if (process.platform === "win32") {
        return join(process.env.APPDATA || "", "opencode");
    }
    return join(process.env.HOME || "", ".config", "opencode");
}
export function getProjectDir(ctx) {
    return ctx.worktree || ctx.directory || process.cwd();
}
export function getSkillDir() {
    return join(getConfigDir(), "skills", "pm-workflow");
}
export function getScriptPath(scriptName) {
    return join(getSkillDir(), "scripts", scriptName);
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
export function runPythonScript(scriptName, args = [], stdinText) {
    const scriptPath = getScriptPath(scriptName);
    if (!existsSync(scriptPath)) {
        return {
            ok: false,
            code: 1,
            stdout: "",
            stderr: `script not found: ${scriptPath}`,
        };
    }
    const commandCandidates = process.platform === "win32"
        ? [
            ["py", ["-3", scriptPath, ...args]],
            ["python", [scriptPath, ...args]],
            ["python3", [scriptPath, ...args]],
        ]
        : [
            ["python3", [scriptPath, ...args]],
            ["python", [scriptPath, ...args]],
        ];
    for (const [command, commandArgs] of commandCandidates) {
        const result = spawnSync(command, commandArgs, {
            input: stdinText,
            encoding: "utf-8",
            timeout: 120000,
        });
        if (!result.error) {
            return {
                ok: result.status === 0,
                code: result.status ?? 1,
                stdout: result.stdout || "",
                stderr: result.stderr || "",
            };
        }
    }
    return {
        ok: false,
        code: 1,
        stdout: "",
        stderr: "python runtime not available",
    };
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
    if (!existsSync(markerPath)) {
        return {
            state: "clean",
            message: "当前没有待 review 的代码变更。",
            markerPath,
        };
    }
    const state = runPythonScript("stop_gate.py", [projectDir]);
    if (state.ok) {
        return {
            state: "clean",
            message: "review gate 已通过，或标记已清理。",
            markerPath,
        };
    }
    const stdout = state.stdout.trim();
    return {
        state: "needs_review",
        message: stdout || "代码已修改但尚未完成 code review。",
        markerPath,
    };
}
export function buildFeedbackSignalSummary(message) {
    const result = runPythonScript("detect_feedback_signal.py", [], JSON.stringify({ prompt: message }));
    if (!result.stdout.trim()) {
        return {
            detected: false,
            message: "未检测到明显的用户修正或反馈信号。",
            detail: "",
        };
    }
    return {
        detected: true,
        message: "检测到用户修正或反馈信号。",
        detail: result.stdout.trim(),
    };
}
