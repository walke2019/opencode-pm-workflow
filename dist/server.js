import { existsSync, writeFileSync } from "fs";
import { join, relative } from "path";
import { spawnSync } from "child_process";
import { tool } from "@opencode-ai/plugin";
import { REVIEW_MARKER_FILENAME, buildFallbackCommand, buildFallbackPlan, buildDispatchCommand, buildDispatchPlan, buildDoctorReport, buildExecutionSummary, buildConfirmGate, buildExecutionGate, getMigrationReport, getAutomationMode, isAutomationCapabilityEnabled, migrateLegacyProjectArtifacts, buildPermissionGate, buildRetryPlan, buildSafetyReport, buildStateSummary, buildGateSummary, buildRecoverySummary, getExecutionReceipts, getExecutionReceiptById, getLastExecutionReceipt, getLastFailure, queryHistory, recordExecutionReceipt, recordDispatchExecution, recordFallbackExecution, repairDoctorState, readWorkflowConfig, setAutomationMode, setLastAgent, setPermission, setPreferredSession, syncState, } from "./shared.js";
function executeDispatchCommand(projectPath, dispatch, prompt) {
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
function getConfigDir() {
    if (process.platform === "win32") {
        return join(process.env.APPDATA || "", "opencode");
    }
    return join(process.env.HOME || "", ".config", "opencode");
}
function getProjectDir(ctx) {
    return ctx.worktree || ctx.directory || process.cwd();
}
function getSkillDir() {
    return join(getConfigDir(), "skills", "pm-workflow");
}
function getScriptPath(scriptName) {
    return join(getSkillDir(), "scripts", scriptName);
}
async function log(client, level, message, extra) {
    await client?.app?.log?.({
        body: {
            service: "pm-workflow-plugin",
            level,
            message,
            extra,
        },
    });
}
function runPythonScript(scriptName, args = [], stdinText) {
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
function isCodePath(filePath) {
    const lower = filePath.toLowerCase();
    const lastDot = lower.lastIndexOf(".");
    if (lastDot === -1)
        return true;
    const extension = lower.slice(lastDot);
    return !NON_CODE_EXTENSIONS.has(extension);
}
function writeReviewMarker(projectDir) {
    const markerPath = join(projectDir, REVIEW_MARKER_FILENAME);
    writeFileSync(markerPath, "needs_review", "utf-8");
}
function extractChangedPathsFromPatch(patchText) {
    const matches = patchText.matchAll(/\*\*\* (?:Add|Update) File: (.+)$/gm);
    return Array.from(matches, (match) => match[1].trim());
}
function buildStagePrompt(projectDir) {
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
function buildStageSummary(projectDir) {
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
function buildReviewGateSummary(projectDir) {
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
function buildFeedbackSignalSummary(message) {
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
export const PmWorkflowPlugin = async (ctx) => {
    const projectDir = getProjectDir(ctx);
    const migration = migrateLegacyProjectArtifacts(projectDir);
    const initialState = syncState(projectDir);
    const automationMode = getAutomationMode(projectDir);
    await log(ctx.client, "info", "pm-workflow plugin loaded", {
        projectDir,
        skillDir: getSkillDir(),
        stage: initialState.stage,
        automationMode,
        migration,
    });
    return {
        tool: {
            "pm-get-state": tool({
                description: "返回 pm-workflow 当前状态文件中的核心状态快照。",
                args: {},
                async execute(_args, context) {
                    const summary = buildStateSummary(context.worktree || context.directory);
                    return JSON.stringify({
                        stage: summary.stage,
                        stageLabel: summary.stageLabel,
                        phase: summary.phase,
                        review: summary.review,
                        release: summary.release,
                        documents: summary.documents,
                        preferredSession: summary.session.preferred_session_id,
                        nextStep: summary.nextStep,
                    }, null, 2);
                },
            }),
            "pm-check-project-state": tool({
                description: "检查当前项目所处的 pm-workflow 阶段，并返回下一步建议。",
                args: {},
                async execute(_args, context) {
                    const summary = buildStageSummary(context.worktree || context.directory);
                    return [
                        "pm-workflow 项目状态",
                        `- Product Spec: ${summary.productSpec}`,
                        `- Design Brief: ${summary.designBrief}`,
                        `- DEV-PLAN: ${summary.devPlan}`,
                        `- 当前阶段: ${summary.stage}`,
                        `- 当前 Phase: ${summary.phase}`,
                        `- Review 状态: ${summary.reviewStatus}`,
                        `- 下一步: ${summary.nextStep}`,
                    ].join("\n");
                },
            }),
            "pm-check-gates": tool({
                description: "检查 pm-workflow 的 spec/plan/review/release gate 状态。",
                args: {},
                async execute(_args, context) {
                    const projectPath = context.worktree || context.directory;
                    const gates = buildGateSummary(projectPath);
                    return [
                        "pm-workflow gates 状态",
                        `- Spec Gate: ${gates.specGate ? "pass" : "blocked"}`,
                        `- Plan Gate: ${gates.planGate ? "pass" : "blocked"}`,
                        `- Review Gate: ${gates.reviewGate ? "pass" : "blocked"}`,
                        `- Release Gate: ${gates.releaseGate ? "pass" : "blocked"}`,
                        gates.blockedReasons.length
                            ? `- 阻塞原因: ${gates.blockedReasons.join("；")}`
                            : "- 阻塞原因: 无",
                    ].join("\n");
                },
            }),
            "pm-check-review-gate": tool({
                description: "检查当前项目是否仍有待 review 的代码变更。",
                args: {},
                async execute(_args, context) {
                    const summary = buildReviewGateSummary(context.worktree || context.directory);
                    return [
                        "pm-workflow review gate 状态",
                        `- 状态: ${summary.state}`,
                        `- 标记文件: ${summary.markerPath}`,
                        `- 说明: ${summary.message}`,
                    ].join("\n");
                },
            }),
            "pm-set-preferred-session": tool({
                description: "设置 pm-workflow 当前项目优先复用的 session_id。",
                args: {
                    sessionID: tool.schema.string().describe("要写入的 session_id"),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const state = setPreferredSession(projectPath, args.sessionID);
                    return [
                        "pm-workflow preferred session 已更新",
                        `- session_id: ${state.session.preferred_session_id}`,
                        `- stage: ${state.stage}`,
                    ].join("\n");
                },
            }),
            "pm-get-next-step": tool({
                description: "根据当前 pm-workflow 阶段返回下一步最合理的动作建议。",
                args: {},
                async execute(_args, context) {
                    const summary = buildStageSummary(context.worktree || context.directory);
                    return [
                        "pm-workflow 下一步建议",
                        `- 当前阶段: ${summary.stage}`,
                        `- 建议动作: ${summary.nextStep}`,
                    ].join("\n");
                },
            }),
            "pm-get-dispatch-plan": tool({
                description: "基于 pm-workflow 当前 state/gates 返回推荐 agent、动作和阻塞原因。",
                args: {},
                async execute(_args, context) {
                    const projectPath = context.worktree || context.directory;
                    const plan = buildDispatchPlan(projectPath);
                    return [
                        "pm-workflow 调度建议",
                        `- 当前阶段: ${plan.stageLabel}`,
                        `- 推荐 Agent: ${plan.recommendedAgent}`,
                        `- 推荐动作: ${plan.recommendedAction}`,
                        `- preferred session: ${plan.preferredSession || "未设置"}`,
                        `- 说明: ${plan.reason}`,
                        plan.blockedReasons.length
                            ? `- 阻塞原因: ${plan.blockedReasons.join("；")}`
                            : "- 阻塞原因: 无",
                    ].join("\n");
                },
            }),
            "pm-run-dispatch": tool({
                description: "基于 pm-workflow 当前 state/gates 生成一条可直接执行的调度命令，并更新 last_agent。",
                args: {
                    prompt: tool.schema
                        .string()
                        .optional()
                        .describe("可选，自定义要交给推荐 agent 的任务描述"),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const dispatch = buildDispatchCommand(projectPath, args.prompt);
                    setLastAgent(projectPath, dispatch.recommendedAgent);
                    return [
                        "pm-workflow 调度执行建议",
                        `- 当前阶段: ${dispatch.stageLabel}`,
                        `- 推荐 Agent: ${dispatch.recommendedAgent}`,
                        `- 可执行 Agent: ${dispatch.executableAgent}`,
                        `- 推荐动作: ${dispatch.recommendedAction}`,
                        `- 说明: ${dispatch.reason}`,
                        dispatch.blockedReasons.length
                            ? `- 阻塞原因: ${dispatch.blockedReasons.join("；")}`
                            : "- 阻塞原因: 无",
                        `- 推荐命令: ${dispatch.command}`,
                    ].join("\n");
                },
            }),
            "pm-execute-dispatch": tool({
                description: "基于 pm-workflow 当前 state/gates 直接执行推荐命令，并返回执行结果。",
                args: {
                    prompt: tool.schema
                        .string()
                        .describe("要交给推荐 agent 的任务描述；如留空则使用默认提示"),
                    confirm: tool.schema
                        .string()
                        .optional()
                        .describe('执行确认；只有传入 "YES" 才会真正执行'),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const dispatch = buildDispatchCommand(projectPath, args.prompt);
                    const beforeState = buildStateSummary(projectPath);
                    const confirm = buildConfirmGate(projectPath, args.confirm);
                    if (!confirm.allowed) {
                        return [
                            "pm-workflow 调度执行已被确认门阻止",
                            `- 推荐动作: ${dispatch.recommendedAction}`,
                            `- 原因: ${confirm.reasons.join("；")}`,
                        ].join("\n");
                    }
                    const permission = buildPermissionGate(projectPath, {
                        kind: "execute",
                        action: dispatch.recommendedAction,
                    });
                    if (!permission.allowed) {
                        return [
                            "pm-workflow 调度执行已被权限策略阻止",
                            `- 推荐动作: ${dispatch.recommendedAction}`,
                            `- 原因: ${permission.reasons.join("；")}`,
                        ].join("\n");
                    }
                    const gate = buildExecutionGate(projectPath, dispatch.recommendedAction);
                    if (!gate.allowed) {
                        return [
                            "pm-workflow 调度执行已阻止",
                            `- 当前阶段: ${dispatch.stageLabel}`,
                            `- 推荐 Agent: ${dispatch.recommendedAgent}`,
                            `- 可执行 Agent: ${dispatch.executableAgent}`,
                            `- 推荐动作: ${dispatch.recommendedAction}`,
                            `- 拦截原因: ${gate.reasons.join("；")}`,
                            `- 推荐命令（未执行）: ${dispatch.command}`,
                        ].join("\n");
                    }
                    const result = executeDispatchCommand(projectPath, dispatch, args.prompt || "继续当前阶段的推荐动作");
                    const afterState = buildStateSummary(projectPath);
                    const receipt = recordExecutionReceipt(projectPath, {
                        action: dispatch.recommendedAction,
                        executableAgent: dispatch.executableAgent,
                        prompt: args.prompt || "继续当前阶段的推荐动作",
                        commandArgs: dispatch.commandArgs,
                        exitCode: result.status ?? -1,
                        retryUsed: false,
                        fallbackUsed: false,
                        stageBefore: beforeState.stage,
                        stageAfter: afterState.stage,
                    });
                    return [
                        "pm-workflow 调度执行结果",
                        `- 当前阶段: ${dispatch.stageLabel}`,
                        `- 推荐 Agent: ${dispatch.recommendedAgent}`,
                        `- 可执行 Agent: ${dispatch.executableAgent}`,
                        `- 推荐动作: ${dispatch.recommendedAction}`,
                        `- 执行命令: ${dispatch.command}`,
                        `- exitCode: ${result.status ?? -1}`,
                        result.stdout?.trim()
                            ? `- stdout:\n${result.stdout.trim()}`
                            : "- stdout: (empty)",
                        result.stderr?.trim()
                            ? `- stderr:\n${result.stderr.trim()}`
                            : "- stderr: (empty)",
                        `- execution_id: ${receipt.execution_id}`,
                    ].join("\n");
                },
            }),
            "pm-dry-run-dispatch": tool({
                description: "模拟一次 pm-workflow dispatch 执行，检查 permission/gate/retry/fallback，但不执行命令。",
                args: {
                    prompt: tool.schema
                        .string()
                        .optional()
                        .describe("可选，自定义 dry-run prompt"),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const dispatch = buildDispatchCommand(projectPath, args.prompt);
                    const permission = buildPermissionGate(projectPath, {
                        kind: "execute",
                        action: dispatch.recommendedAction,
                    });
                    const gate = buildExecutionGate(projectPath, dispatch.recommendedAction);
                    const retry = buildRetryPlan(projectPath, dispatch.recommendedAction);
                    const fallback = buildFallbackPlan(projectPath, dispatch.recommendedAction, dispatch.executableAgent);
                    return [
                        "pm-workflow dry-run dispatch",
                        `- 当前阶段: ${dispatch.stageLabel}`,
                        `- 推荐 Agent: ${dispatch.recommendedAgent}`,
                        `- 可执行 Agent: ${dispatch.executableAgent}`,
                        `- 推荐动作: ${dispatch.recommendedAction}`,
                        `- permission: ${permission.allowed ? "allowed" : "blocked"}`,
                        permission.reasons.length
                            ? `- permission reasons: ${permission.reasons.join("；")}`
                            : "- permission reasons: 无",
                        `- gate: ${gate.allowed ? "allowed" : "blocked"}`,
                        gate.reasons.length
                            ? `- gate reasons: ${gate.reasons.join("；")}`
                            : "- gate reasons: 无",
                        `- retry: ${retry.retryable ? "retryable" : "not-retryable"} ${retry.attempts}/${retry.maxAttempts}`,
                        `- fallback: ${fallback.allowed && fallback.toAgent ? `${fallback.fromAgent}->${fallback.toAgent}` : "not-available"}`,
                        `- command（不会执行）: ${dispatch.command}`,
                    ].join("\n");
                },
            }),
            "pm-run-loop": tool({
                description: "按 pm-workflow 当前 state/gates 进行受控自动循环编排，最多执行指定步数。",
                args: {
                    steps: tool.schema
                        .string()
                        .describe("最大执行步数，建议 1-5，例如 3"),
                    prompt: tool.schema
                        .string()
                        .describe("交给自动循环编排的基础任务描述"),
                    confirm: tool.schema
                        .string()
                        .optional()
                        .describe('执行确认；只有传入 "YES" 才会真正执行'),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const confirm = buildConfirmGate(projectPath, args.confirm);
                    if (!confirm.allowed) {
                        return [
                            "pm-workflow 自动循环编排已被确认门阻止",
                            `- 原因: ${confirm.reasons.join("；")}`,
                        ].join("\n");
                    }
                    const permission = buildPermissionGate(projectPath, {
                        kind: "execute",
                    });
                    if (!permission.allowed) {
                        return [
                            "pm-workflow 自动循环编排已被权限策略阻止",
                            `- 原因: ${permission.reasons.join("；")}`,
                        ].join("\n");
                    }
                    const maxSteps = Math.max(1, Math.min(5, Number.parseInt(args.steps, 10) || 1));
                    const outputs = [
                        "pm-workflow 自动循环编排结果",
                        `- 最大步数: ${maxSteps}`,
                    ];
                    for (let index = 0; index < maxSteps; index += 1) {
                        const dispatch = buildDispatchCommand(projectPath, args.prompt);
                        const gate = buildExecutionGate(projectPath, dispatch.recommendedAction);
                        outputs.push(`- Step ${index + 1}: ${dispatch.recommendedAgent} / ${dispatch.recommendedAction}`);
                        if (!gate.allowed) {
                            outputs.push(`  gate blocked: ${gate.reasons.join("；")}`);
                            break;
                        }
                        const result = executeDispatchCommand(projectPath, dispatch, args.prompt);
                        outputs.push(`  exitCode: ${result.status ?? -1}`);
                        if ((result.status ?? -1) !== 0) {
                            const retry = buildRetryPlan(projectPath, dispatch.recommendedAction);
                            if (retry.allowed) {
                                outputs.push(`  retry: ${retry.attempts + 1}/${retry.maxAttempts}`);
                                const retryResult = executeDispatchCommand(projectPath, dispatch, args.prompt);
                                outputs.push(`  retryExitCode: ${retryResult.status ?? -1}`);
                                if ((retryResult.status ?? -1) === 0) {
                                    const state = buildStateSummary(projectPath);
                                    const receipt = recordExecutionReceipt(projectPath, {
                                        action: dispatch.recommendedAction,
                                        executableAgent: dispatch.executableAgent,
                                        prompt: args.prompt,
                                        commandArgs: dispatch.commandArgs,
                                        exitCode: retryResult.status ?? -1,
                                        retryUsed: true,
                                        fallbackUsed: false,
                                        stageBefore: dispatch.stage,
                                        stageAfter: state.stage,
                                    });
                                    outputs.push(`  next stage: ${state.stageLabel}`);
                                    outputs.push(`  execution_id: ${receipt.execution_id}`);
                                    continue;
                                }
                                outputs.push(`  retryStderr: ${(retryResult.stderr || "").trim() || "(empty)"}`);
                                const fallback = buildFallbackPlan(projectPath, dispatch.recommendedAction, dispatch.executableAgent);
                                if (fallback.allowed && fallback.toAgent) {
                                    outputs.push(`  fallback: ${fallback.fromAgent} -> ${fallback.toAgent}`);
                                    const fallbackDispatch = buildFallbackCommand(projectPath, dispatch, fallback.toAgent, args.prompt);
                                    const fallbackResult = executeDispatchCommand(projectPath, fallbackDispatch, args.prompt);
                                    recordFallbackExecution(projectPath, {
                                        action: dispatch.recommendedAction,
                                        fromAgent: fallback.fromAgent,
                                        toAgent: fallback.toAgent,
                                        exitCode: fallbackResult.status ?? -1,
                                        stdout: fallbackResult.stdout || "",
                                        stderr: fallbackResult.stderr || "",
                                    });
                                    outputs.push(`  fallbackExitCode: ${fallbackResult.status ?? -1}`);
                                    if ((fallbackResult.status ?? -1) === 0) {
                                        const state = buildStateSummary(projectPath);
                                        const receipt = recordExecutionReceipt(projectPath, {
                                            action: dispatch.recommendedAction,
                                            executableAgent: fallback.toAgent,
                                            prompt: args.prompt,
                                            commandArgs: fallbackDispatch.commandArgs,
                                            exitCode: fallbackResult.status ?? -1,
                                            retryUsed: true,
                                            fallbackUsed: true,
                                            stageBefore: dispatch.stage,
                                            stageAfter: state.stage,
                                        });
                                        outputs.push(`  next stage: ${state.stageLabel}`);
                                        outputs.push(`  execution_id: ${receipt.execution_id}`);
                                        continue;
                                    }
                                }
                                break;
                            }
                            const fallback = buildFallbackPlan(projectPath, dispatch.recommendedAction, dispatch.executableAgent);
                            if (fallback.allowed && fallback.toAgent) {
                                outputs.push(`  fallback: ${fallback.fromAgent} -> ${fallback.toAgent}`);
                                const fallbackDispatch = buildFallbackCommand(projectPath, dispatch, fallback.toAgent, args.prompt);
                                const fallbackResult = executeDispatchCommand(projectPath, fallbackDispatch, args.prompt);
                                recordFallbackExecution(projectPath, {
                                    action: dispatch.recommendedAction,
                                    fromAgent: fallback.fromAgent,
                                    toAgent: fallback.toAgent,
                                    exitCode: fallbackResult.status ?? -1,
                                    stdout: fallbackResult.stdout || "",
                                    stderr: fallbackResult.stderr || "",
                                });
                                outputs.push(`  fallbackExitCode: ${fallbackResult.status ?? -1}`);
                                if ((fallbackResult.status ?? -1) === 0) {
                                    const state = buildStateSummary(projectPath);
                                    const receipt = recordExecutionReceipt(projectPath, {
                                        action: dispatch.recommendedAction,
                                        executableAgent: fallback.toAgent,
                                        prompt: args.prompt,
                                        commandArgs: fallbackDispatch.commandArgs,
                                        exitCode: fallbackResult.status ?? -1,
                                        retryUsed: false,
                                        fallbackUsed: true,
                                        stageBefore: dispatch.stage,
                                        stageAfter: state.stage,
                                    });
                                    outputs.push(`  next stage: ${state.stageLabel}`);
                                    outputs.push(`  execution_id: ${receipt.execution_id}`);
                                    continue;
                                }
                            }
                            outputs.push(`  stderr: ${(result.stderr || "").trim() || "(empty)"}`);
                            break;
                        }
                        const state = buildStateSummary(projectPath);
                        outputs.push(`  next stage: ${state.stageLabel}`);
                    }
                    return outputs.join("\n");
                },
            }),
            "pm-get-last-execution": tool({
                description: "查询最近一次 execution receipt。",
                args: {},
                async execute(_args, context) {
                    const projectPath = context.worktree || context.directory;
                    const receipt = getLastExecutionReceipt(projectPath);
                    if (!receipt) {
                        return "pm-workflow 最近执行回执\n- 无 execution receipt";
                    }
                    return [
                        "pm-workflow 最近执行回执",
                        "```json",
                        JSON.stringify(receipt, null, 2),
                        "```",
                    ].join("\n");
                },
            }),
            "pm-get-execution-receipt": tool({
                description: "查询 execution receipts 列表。",
                args: {
                    limit: tool.schema
                        .string()
                        .optional()
                        .describe("可选，返回条数，默认 10，最大 100"),
                    action: tool.schema
                        .string()
                        .optional()
                        .describe("可选，按 action 过滤"),
                    agent: tool.schema
                        .string()
                        .optional()
                        .describe("可选，按 executable_agent 过滤"),
                    success: tool.schema
                        .string()
                        .optional()
                        .describe('可选，传 "true" 或 "false" 按成功/失败过滤'),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const receipts = getExecutionReceipts(projectPath, {
                        limit: Number.parseInt(args.limit || "10", 10) || 10,
                        action: args.action || undefined,
                        agent: args.agent || undefined,
                        success: args.success === "true" || args.success === "false"
                            ? args.success
                            : undefined,
                    });
                    return [
                        "pm-workflow execution receipts",
                        `- 数量: ${receipts.length}`,
                        "```json",
                        JSON.stringify(receipts, null, 2),
                        "```",
                    ].join("\n");
                },
            }),
            "pm-get-execution-by-id": tool({
                description: "按 execution_id 精确查询 execution receipt。",
                args: {
                    execution_id: tool.schema
                        .string()
                        .describe("execution.receipt 的 execution_id"),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const receipt = getExecutionReceiptById(projectPath, args.execution_id);
                    if (!receipt) {
                        return [
                            "pm-workflow execution receipt by id",
                            `- execution_id: ${args.execution_id}`,
                            "- 结果: 未找到",
                        ].join("\n");
                    }
                    return [
                        "pm-workflow execution receipt by id",
                        "```json",
                        JSON.stringify(receipt, null, 2),
                        "```",
                    ].join("\n");
                },
            }),
            "pm-get-execution-summary": tool({
                description: "汇总 execution receipts 的成功率、最近 action 和最近 agent。",
                args: {
                    limit: tool.schema
                        .string()
                        .optional()
                        .describe("可选，统计最近 N 条 receipt，默认 10，最大 100"),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const summary = buildExecutionSummary(projectPath, Number.parseInt(args.limit || "10", 10) || 10);
                    return [
                        "pm-workflow execution summary",
                        "```json",
                        JSON.stringify(summary, null, 2),
                        "```",
                    ].join("\n");
                },
            }),
            "pm-dry-run-loop": tool({
                description: "模拟 pm-workflow 自动循环编排，逐步检查 permission/gate/dispatch，但不执行命令。",
                args: {
                    steps: tool.schema
                        .string()
                        .describe("最大模拟步数，建议 1-5，例如 3"),
                    prompt: tool.schema
                        .string()
                        .optional()
                        .describe("可选，dry-run prompt"),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const maxSteps = Math.max(1, Math.min(5, Number.parseInt(args.steps, 10) || 1));
                    const outputs = [
                        "pm-workflow dry-run loop",
                        `- 最大模拟步数: ${maxSteps}`,
                    ];
                    for (let index = 0; index < maxSteps; index += 1) {
                        const dispatch = buildDispatchCommand(projectPath, args.prompt);
                        const permission = buildPermissionGate(projectPath, {
                            kind: "execute",
                            action: dispatch.recommendedAction,
                        });
                        const gate = buildExecutionGate(projectPath, dispatch.recommendedAction);
                        const retry = buildRetryPlan(projectPath, dispatch.recommendedAction);
                        const fallback = buildFallbackPlan(projectPath, dispatch.recommendedAction, dispatch.executableAgent);
                        outputs.push(`- Step ${index + 1}: ${dispatch.recommendedAgent}/${dispatch.executableAgent} -> ${dispatch.recommendedAction}`);
                        outputs.push(`  permission: ${permission.allowed ? "allowed" : "blocked"}`);
                        if (permission.reasons.length) {
                            outputs.push(`  permission reasons: ${permission.reasons.join("；")}`);
                        }
                        outputs.push(`  gate: ${gate.allowed ? "allowed" : "blocked"}`);
                        if (gate.reasons.length) {
                            outputs.push(`  gate reasons: ${gate.reasons.join("；")}`);
                        }
                        outputs.push(`  retry: ${retry.retryable ? "retryable" : "not-retryable"} ${retry.attempts}/${retry.maxAttempts}`);
                        outputs.push(`  fallback: ${fallback.allowed && fallback.toAgent ? `${fallback.fromAgent}->${fallback.toAgent}` : "not-available"}`);
                        if (!permission.allowed || !gate.allowed)
                            break;
                    }
                    return outputs.join("\n");
                },
            }),
            "pm-safety-report": tool({
                description: "只读汇总 pm-workflow 权限、doctor、最近 history 和 dry-run dispatch 安全状态。",
                args: {
                    prompt: tool.schema
                        .string()
                        .optional()
                        .describe("可选，用于 dry-run dispatch 的 prompt"),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const report = buildSafetyReport(projectPath, args.prompt);
                    return [
                        "pm-workflow safety report",
                        `- ok: ${report.ok ? "yes" : "no"}`,
                        `- safe_to_enable_execute: ${report.safeToEnableExecute ? "yes" : "no"}`,
                        `- execute permission: ${report.permissions.allow_execute_tools}`,
                        `- repair permission: ${report.permissions.allow_repair_tools}`,
                        `- release permission: ${report.permissions.allow_release_actions}`,
                        `- doctor ok: ${report.doctor.ok}`,
                        `- recommended: ${report.dispatch.recommendedAgent}/${report.dispatch.executableAgent} -> ${report.dispatch.recommendedAction}`,
                        `- permission allowed: ${report.dispatch.permissionAllowed}`,
                        report.dispatch.permissionReasons.length
                            ? `- permission reasons: ${report.dispatch.permissionReasons.join("；")}`
                            : "- permission reasons: none",
                        `- gate allowed: ${report.dispatch.gateAllowed}`,
                        report.dispatch.gateReasons.length
                            ? `- gate reasons: ${report.dispatch.gateReasons.join("；")}`
                            : "- gate reasons: none",
                        `- retry allowed: ${report.dispatch.retryAllowed}`,
                        `- fallback allowed: ${report.dispatch.fallbackAllowed}`,
                        `- recent history events: ${report.recentHistory.length}`,
                    ].join("\n");
                },
            }),
            "pm-check-feedback-signal": tool({
                description: "检测一段用户消息是否包含明显的修正或反馈信号。",
                args: {
                    message: tool.schema.string().describe("要检测的用户消息内容"),
                },
                async execute(args) {
                    const summary = buildFeedbackSignalSummary(args.message);
                    return [
                        "pm-workflow feedback signal 检测",
                        `- detected: ${summary.detected ? "yes" : "no"}`,
                        `- 说明: ${summary.message}`,
                        summary.detail ? `- 细节: ${summary.detail}` : "",
                    ]
                        .filter(Boolean)
                        .join("\n");
                },
            }),
            "pm-get-history": tool({
                description: "查询 pm-workflow history.jsonl 事件，可按 type/action/agent 过滤。",
                args: {
                    type: tool.schema.string().optional().describe("可选，事件类型"),
                    action: tool.schema.string().optional().describe("可选，动作名称"),
                    agent: tool.schema.string().optional().describe("可选，agent 名称"),
                    limit: tool.schema
                        .string()
                        .optional()
                        .describe("可选，返回条数，默认 20，最大 100"),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const events = queryHistory(projectPath, {
                        type: args.type || undefined,
                        action: args.action || undefined,
                        agent: args.agent || undefined,
                        limit: Number.parseInt(args.limit || "20", 10) || 20,
                    });
                    return [
                        "pm-workflow history 查询结果",
                        `- 数量: ${events.length}`,
                        "```json",
                        JSON.stringify(events, null, 2),
                        "```",
                    ].join("\n");
                },
            }),
            "pm-get-last-failure": tool({
                description: "查询 pm-workflow 最近一次失败事件。",
                args: {},
                async execute(_args, context) {
                    const projectPath = context.worktree || context.directory;
                    const failure = getLastFailure(projectPath);
                    if (!failure) {
                        return "pm-workflow 最近失败事件\n- 无失败事件";
                    }
                    return [
                        "pm-workflow 最近失败事件",
                        "```json",
                        JSON.stringify(failure, null, 2),
                        "```",
                    ].join("\n");
                },
            }),
            "pm-get-recovery-summary": tool({
                description: "汇总 pm-workflow dispatch/retry/fallback/recovery 历史状态。",
                args: {},
                async execute(_args, context) {
                    const projectPath = context.worktree || context.directory;
                    const summary = buildRecoverySummary(projectPath);
                    return [
                        "pm-workflow 恢复历史摘要",
                        "```json",
                        JSON.stringify(summary, null, 2),
                        "```",
                    ].join("\n");
                },
            }),
            "pm-doctor": tool({
                description: "检查 pm-workflow runtime 状态、配置、历史、gate 和 recovery 健康度。",
                args: {},
                async execute(_args, context) {
                    const projectPath = context.worktree || context.directory;
                    const report = buildDoctorReport(projectPath);
                    return [
                        "pm-workflow doctor",
                        `- ok: ${report.ok ? "yes" : "no"}`,
                        `- stage: ${report.stage}`,
                        "",
                        "checks:",
                        ...report.checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`),
                        report.warnings.length ? "" : "",
                        report.warnings.length ? "warnings:" : "",
                        ...report.warnings.map((warning) => `- ${warning}`),
                        report.blockers.length ? "" : "",
                        report.blockers.length ? "blockers:" : "",
                        ...report.blockers.map((blocker) => `- ${blocker}`),
                    ]
                        .filter((line) => line !== "")
                        .join("\n");
                },
            }),
            "pm-doctor-repair": tool({
                description: "安全修复 pm-workflow 自身运行状态文件：state/config/history 与字段迁移。",
                args: {},
                async execute(_args, context) {
                    const projectPath = context.worktree || context.directory;
                    const permission = buildPermissionGate(projectPath, {
                        kind: "repair",
                    });
                    if (!permission.allowed) {
                        return [
                            "pm-workflow doctor repair 已被权限策略阻止",
                            `- 原因: ${permission.reasons.join("；")}`,
                        ].join("\n");
                    }
                    const result = repairDoctorState(projectPath);
                    return [
                        "pm-workflow doctor repair",
                        result.repaired.length
                            ? `- repaired: ${result.repaired.join("；")}`
                            : "- repaired: none",
                        `- before ok: ${result.before.ok ? "yes" : "no"}`,
                        `- after ok: ${result.after.ok ? "yes" : "no"}`,
                        result.after.warnings.length
                            ? `- warnings: ${result.after.warnings.join("；")}`
                            : "- warnings: none",
                        result.after.blockers.length
                            ? `- blockers: ${result.after.blockers.join("；")}`
                            : "- blockers: none",
                    ].join("\n");
                },
            }),
            "pm-get-config": tool({
                description: "读取当前 .pm-workflow/config.json 配置。",
                args: {},
                async execute(_args, context) {
                    const projectPath = context.worktree || context.directory;
                    const config = readWorkflowConfig(projectPath);
                    return [
                        "pm-workflow config",
                        "```json",
                        JSON.stringify(config, null, 2),
                        "```",
                    ].join("\n");
                },
            }),
            "pm-check-permissions": tool({
                description: "查看 pm-workflow permissions 策略当前状态。",
                args: {},
                async execute(_args, context) {
                    const projectPath = context.worktree || context.directory;
                    const config = readWorkflowConfig(projectPath);
                    return [
                        "pm-workflow permissions",
                        `- allow_execute_tools: ${config.permissions.allow_execute_tools}`,
                        `- allow_repair_tools: ${config.permissions.allow_repair_tools}`,
                        `- allow_release_actions: ${config.permissions.allow_release_actions}`,
                    ].join("\n");
                },
            }),
            "pm-set-permission": tool({
                description: "安全修改 pm-workflow permissions 中的单个布尔开关，并写入 history。",
                args: {
                    key: tool.schema
                        .string()
                        .describe("权限键：allow_execute_tools / allow_repair_tools / allow_release_actions"),
                    value: tool.schema.string().describe("布尔值：true 或 false"),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const allowedKeys = [
                        "allow_execute_tools",
                        "allow_repair_tools",
                        "allow_release_actions",
                    ];
                    if (!allowedKeys.includes(args.key)) {
                        return `pm-workflow permission 更新失败\n- 不支持的 key: ${args.key}`;
                    }
                    if (!["true", "false"].includes(args.value)) {
                        return `pm-workflow permission 更新失败\n- value 必须是 true 或 false`;
                    }
                    const next = setPermission(projectPath, args.key, args.value === "true");
                    return [
                        "pm-workflow permission 已更新",
                        `- ${args.key}: ${next.permissions[args.key]}`,
                    ].join("\n");
                },
            }),
            "pm-set-mode": tool({
                description: "设置 pm-workflow 自动介入模式（off/observe/assist/strict）。",
                args: {
                    mode: tool.schema
                        .string()
                        .describe("模式：off / observe / assist / strict"),
                },
                async execute(args, context) {
                    const projectPath = context.worktree || context.directory;
                    const allowedModes = ["off", "observe", "assist", "strict"];
                    const mode = String(args.mode || "")
                        .trim()
                        .toLowerCase();
                    if (!allowedModes.includes(mode)) {
                        return [
                            "pm-workflow mode 更新失败",
                            `- 不支持的 mode: ${args.mode}`,
                            "- 可选值: off / observe / assist / strict",
                        ].join("\n");
                    }
                    const next = setAutomationMode(projectPath, mode);
                    return [
                        "pm-workflow mode 已更新",
                        `- mode: ${next.automation.mode}`,
                        `- docs.storage_mode: ${next.docs.storage_mode}`,
                    ].join("\n");
                },
            }),
            "pm-get-migration-report": tool({
                description: "查看 pm-workflow 归档迁移报告（copied/conflicts）。",
                args: {},
                async execute(_args, context) {
                    const projectPath = context.worktree || context.directory;
                    const report = getMigrationReport(projectPath);
                    return [
                        "pm-workflow migration report",
                        `- last_run_at: ${report.last_run_at}`,
                        `- docs: copied=${report.docs.copied_count} conflicts=${report.docs.conflicts_count}`,
                        `- feedback: copied=${report.feedback.copied_count} conflicts=${report.feedback.conflicts_count}`,
                        "```json",
                        JSON.stringify(report, null, 2),
                        "```",
                    ].join("\n");
                },
            }),
        },
        event: async ({ event }) => {
            const mode = getAutomationMode(projectDir);
            const canSync = isAutomationCapabilityEnabled(mode, "event_sync");
            if (!canSync)
                return;
            if (event?.type === "session.created") {
                const status = syncState(projectDir);
                await log(ctx.client, "info", "pm-workflow stage detected", {
                    stage: status.stage,
                    review: status.review.status,
                });
            }
            if (event?.type === "session.idle") {
                syncState(projectDir);
                if (mode === "strict") {
                    const stopGate = runPythonScript("stop_gate.py", [projectDir]);
                    if (!stopGate.ok) {
                        await log(ctx.client, "warn", "review gate still pending", {
                            projectDir,
                            stdout: stopGate.stdout.trim(),
                            stderr: stopGate.stderr.trim(),
                        });
                    }
                }
            }
        },
        "tui.prompt.append": async (_input, output) => {
            const mode = getAutomationMode(projectDir);
            if (!isAutomationCapabilityEnabled(mode, "prompt_inject"))
                return;
            const stagePrompt = buildStagePrompt(projectDir);
            output.prompt = output.prompt
                ? `${output.prompt}\n\n${stagePrompt}`
                : stagePrompt;
        },
        "tool.execute.before": async (input, _output) => {
            const mode = getAutomationMode(projectDir);
            if (!isAutomationCapabilityEnabled(mode, "commit_gate"))
                return;
            if (input.tool !== "bash")
                return;
            const command = String(input.args?.command || "");
            if (!/\bgit\s+commit\b/.test(command))
                return;
            const preCheck = runPythonScript("pre_commit_check.py", [projectDir]);
            if (!preCheck.ok) {
                throw new Error([
                    "pm-workflow pre-commit gate blocked the commit.",
                    preCheck.stdout.trim(),
                    preCheck.stderr.trim(),
                ]
                    .filter(Boolean)
                    .join("\n"));
            }
        },
        "tool.execute.after": async (input, _output) => {
            const mode = getAutomationMode(projectDir);
            const allowReviewMarker = isAutomationCapabilityEnabled(mode, "review_marker");
            const allowEventSync = isAutomationCapabilityEnabled(mode, "event_sync");
            if (input.tool === "edit" || input.tool === "write") {
                const filePath = String(input.args?.filePath || "");
                if (filePath && isCodePath(filePath)) {
                    if (allowReviewMarker) {
                        const markerResult = runPythonScript("mark_review_needed.py", [
                            filePath,
                            projectDir,
                        ]);
                        if (!markerResult.ok) {
                            writeReviewMarker(projectDir);
                        }
                    }
                    if (allowEventSync) {
                        syncState(projectDir);
                    }
                    await log(ctx.client, "info", "review marker updated", {
                        filePath,
                        relativePath: relative(projectDir, filePath),
                        mode,
                        reviewMarkerUpdated: allowReviewMarker,
                    });
                }
                return;
            }
            if (input.tool === "apply_patch") {
                const patchText = String(input.args?.patchText || "");
                const changedPaths = extractChangedPathsFromPatch(patchText);
                if (allowReviewMarker &&
                    changedPaths.some((filePath) => isCodePath(filePath))) {
                    writeReviewMarker(projectDir);
                    if (allowEventSync) {
                        syncState(projectDir);
                    }
                    await log(ctx.client, "info", "review marker updated from patch", {
                        changedPaths,
                        mode,
                    });
                }
            }
        },
    };
};
export default {
    id: "local.pm-workflow-plugin",
    server: PmWorkflowPlugin,
};
