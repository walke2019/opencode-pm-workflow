import { tool } from "@opencode-ai/plugin";
import { evaluateDispatchResult, buildConfirmGate, buildFallbackCommand, buildDispatchCommand, buildExecutionPlan, buildExecutionGate, buildFallbackPlan, buildPermissionGate, buildRetryPlan, buildStateSummary, recordExecutionReceipt, recordFallbackExecution, setLastAgent, } from "../../shared.js";
import { buildAutoContinueDispatch, executeDispatchCommand, } from "../runtime.js";
export function collectAutoContinueDispatches({ projectPath, prompt, firstEvaluation, subsequentEvaluations = [], maxAutoSteps = 2, }) {
    const collected = [];
    let currentEvaluation = firstEvaluation;
    const safeMaxSteps = Math.max(0, Math.min(3, maxAutoSteps));
    for (let index = 0; index < safeMaxSteps; index += 1) {
        const nextDispatch = currentEvaluation
            ? buildAutoContinueDispatch(projectPath, prompt, currentEvaluation)
            : undefined;
        if (!nextDispatch) {
            break;
        }
        collected.push(nextDispatch);
        currentEvaluation = subsequentEvaluations[index];
    }
    return collected;
}
export function executeAutoContinueChain({ projectPath, prompt, firstEvaluation, maxAutoSteps = 2, canExecute, runDispatch, }) {
    const executions = [];
    const safeMaxSteps = Math.max(0, Math.min(3, maxAutoSteps));
    let currentEvaluation = firstEvaluation;
    let stopReason = "no-auto-continue";
    for (let index = 0; index < safeMaxSteps; index += 1) {
        const dispatch = currentEvaluation
            ? buildAutoContinueDispatch(projectPath, prompt, currentEvaluation)
            : undefined;
        if (!dispatch) {
            stopReason = executions.length > 0 ? "completed" : "no-auto-continue";
            break;
        }
        const gate = canExecute(dispatch);
        if (!gate.allowed) {
            stopReason = "gate-blocked";
            break;
        }
        const execution = runDispatch(dispatch);
        executions.push(execution);
        const exitCode = execution.result.status ?? -1;
        if (exitCode !== 0) {
            stopReason = "execution-failed";
            break;
        }
        currentEvaluation = execution.evaluation;
        if (!currentEvaluation?.canAutoContinue ||
            !currentEvaluation?.autoContinueSafe) {
            stopReason = "completed";
            break;
        }
        stopReason = index === safeMaxSteps - 1 ? "max-steps-reached" : stopReason;
    }
    return {
        executions,
        stopReason,
    };
}
function buildAutoContinueGate(projectPath, dispatch) {
    const permission = buildPermissionGate(projectPath, {
        kind: "execute",
        action: dispatch.recommendedAction,
    });
    if (!permission.allowed) {
        return {
            allowed: false,
            reasons: permission.reasons,
        };
    }
    const gate = buildExecutionGate(projectPath, dispatch.recommendedAction);
    return {
        allowed: gate.allowed,
        reasons: gate.reasons,
    };
}
function formatAutoContinueExecutionLines(autoContinue) {
    const lines = [
        `- auto-continue executed steps: ${autoContinue.executions.length}`,
        `- auto-continue stop reason: ${autoContinue.stopReason}`,
    ];
    autoContinue.executions.forEach((execution, index) => {
        lines.push(`- auto-continue executed step ${index + 1}: ${execution.dispatch.recommendedAgent}/${execution.dispatch.recommendedAction}`);
        lines.push(`  auto-continue exitCode: ${execution.result.status ?? -1}`);
        lines.push(...formatLoopEvaluationLines(execution.evaluation));
    });
    return lines;
}
export function formatTaskAnalysisLines(analysis) {
    if (!analysis) {
        return ["- task analysis: unavailable"];
    }
    const coordinationLine = analysis.recommendedAgent === "pm"
        ? analysis.expectedNextAgents.includes("commander")
            ? "- task analysis coordination: pm 负责主协调，commander 作为顾问支持"
            : "- task analysis coordination: pm 负责主协调"
        : analysis.recommendedAgent === "commander"
            ? "- task analysis coordination: commander 负责顾问式拆解支持"
            : undefined;
    return [
        `- task analysis: domain=${analysis.domain} complexity=${analysis.complexity} mode=${analysis.executionMode}`,
        `- task analysis agent: recommended=${analysis.recommendedAgent} fallback=${analysis.fallbackAgents.join(",") || "none"}`,
        ...(coordinationLine ? [coordinationLine] : []),
        `- task analysis decomposition: ${analysis.needsDecomposition ? "yes" : "no"}`,
        analysis.rationale.length
            ? `- task analysis rationale: ${analysis.rationale.join("；")}`
            : "- task analysis rationale: 无",
        analysis.risks.length
            ? `- task analysis risks: ${analysis.risks.join("；")}`
            : "- task analysis risks: 无",
        analysis.expectedNextAgents.length
            ? `- task analysis next agents: ${analysis.expectedNextAgents.join(" -> ")}`
            : "- task analysis next agents: 无",
    ];
}
export function formatHandoffPacketLines(packet) {
    if (!packet) {
        return ["- handoff packet: unavailable"];
    }
    return [
        `- handoff packet: target=${packet.targetAgent} type=${packet.taskType}`,
        `- handoff goal: ${packet.goal}`,
        `- handoff scope: ${packet.scope.join("；") || "无"}`,
        `- handoff acceptance: ${packet.acceptanceCriteria.join("；") || "无"}`,
        `- handoff deliverables: ${packet.deliverables.join("；") || "无"}`,
        `- handoff next step: ${packet.nextStepHint || "无"}`,
    ];
}
export function formatEvaluationLines(evaluation) {
    if (!evaluation) {
        return ["- evaluation status: unavailable"];
    }
    return [
        `- evaluation status: ${evaluation.status}`,
        `- evaluation summary: ${evaluation.summary}`,
        evaluation.gaps.length
            ? `- evaluation gaps: ${evaluation.gaps.join("；")}`
            : "- evaluation gaps: 无",
        evaluation.recommendedNextAgent
            ? `- recommended next agent: ${evaluation.recommendedNextAgent}`
            : "- recommended next agent: none",
        evaluation.recommendedNextAction
            ? `- recommended next action: ${evaluation.recommendedNextAction}`
            : "- recommended next action: none",
        `- auto continue: ${evaluation.canAutoContinue ? "yes" : "no"}`,
        `- auto continue safe: ${evaluation.autoContinueSafe ? "yes" : "no"}`,
        evaluation.nextAutoAction
            ? `- next auto action: ${evaluation.nextAutoAction}`
            : "- next auto action: none",
    ];
}
export function formatNextDispatchHintLines(evaluation) {
    if (!evaluation?.recommendedNextAgent || !evaluation.recommendedNextAction) {
        return ["- next dispatch hint: none"];
    }
    return [
        `- next dispatch hint: ${evaluation.recommendedNextAgent}/${evaluation.recommendedNextAction}`,
    ];
}
export function formatLoopEvaluationLines(evaluation) {
    return [
        ...formatEvaluationLines(evaluation).map((line) => `  ${line.slice(2)}`),
        ...formatNextDispatchHintLines(evaluation).map((line) => `  ${line.slice(2)}`),
    ];
}
function executeSingleDispatch(projectPath, dispatch, prompt) {
    const result = executeDispatchCommand(projectPath, dispatch, prompt);
    const evaluation = dispatch.handoffPacket
        ? evaluateDispatchResult({
            packet: dispatch.handoffPacket,
            exitCode: result.status ?? -1,
            stdout: result.stdout || "",
            stderr: result.stderr || "",
        })
        : undefined;
    return { result, evaluation };
}
function appendAutoContinueSummary(outputs, projectPath, prompt, evaluation, maxAutoSteps = 2) {
    const nextDispatches = collectAutoContinueDispatches({
        projectPath,
        prompt,
        firstEvaluation: evaluation,
        maxAutoSteps,
    });
    outputs.push(`- auto-continue planned steps: ${nextDispatches.length}/${Math.max(0, Math.min(3, maxAutoSteps))}`);
    for (const [index, dispatch] of nextDispatches.entries()) {
        outputs.push(`- auto-continue step ${index + 1}: ${dispatch.recommendedAgent}/${dispatch.recommendedAction}`);
    }
}
export function createDispatchTools() {
    return {
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
                    ...formatTaskAnalysisLines(dispatch.analysis),
                    ...formatHandoffPacketLines(dispatch.handoffPacket),
                    `- 推荐命令: ${dispatch.command}`,
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
                const executionPlan = buildExecutionPlan(projectPath, args.prompt);
                const permission = buildPermissionGate(projectPath, {
                    kind: "execute",
                    action: dispatch.recommendedAction,
                });
                const gate = buildExecutionGate(projectPath, dispatch.recommendedAction);
                const retry = buildRetryPlan(projectPath, dispatch.recommendedAction);
                const fallback = buildFallbackPlan(projectPath, dispatch.recommendedAction, dispatch.executableAgent);
                return [
                    "pm-workflow dry-run dispatch",
                    `- execution plan summary: mode=${executionPlan.mode} steps=${executionPlan.steps.length} primary=${executionPlan.primaryAction}`,
                    ...executionPlan.steps.map((step, index) => `  step ${index + 1}: ${step.id} | ${step.mode} | ${step.agent ?? "local"} | ${step.action}`),
                    ...executionPlan.steps.flatMap((step, index) => [
                        `    step ${index + 1} permission: ${permission.allowed ? "allowed" : "blocked"}`,
                        `    step ${index + 1} gate: ${gate.allowed ? "allowed" : "blocked"}`,
                        `    step ${index + 1} retry: ${retry.retryable ? "retryable" : "not-retryable"} ${retry.attempts}/${retry.maxAttempts}`,
                        `    step ${index + 1} fallback: ${fallback.allowed && fallback.toAgent ? `${fallback.fromAgent}->${fallback.toAgent}` : "not-available"}`,
                    ]),
                    "- execution plan:",
                    "```json",
                    JSON.stringify(executionPlan, null, 2),
                    "```",
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
                    ...formatTaskAnalysisLines(dispatch.analysis),
                    ...formatHandoffPacketLines(dispatch.handoffPacket),
                    `- command（不会执行）: ${dispatch.command}`,
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
                const executionPrompt = args.prompt || "继续当前阶段的推荐动作";
                const { result, evaluation } = executeSingleDispatch(projectPath, dispatch, executionPrompt);
                const afterState = buildStateSummary(projectPath);
                const receipt = recordExecutionReceipt(projectPath, {
                    action: dispatch.recommendedAction,
                    executableAgent: dispatch.executableAgent,
                    prompt: executionPrompt,
                    commandArgs: dispatch.commandArgs,
                    exitCode: result.status ?? -1,
                    retryUsed: false,
                    fallbackUsed: false,
                    stageBefore: beforeState.stage,
                    stageAfter: afterState.stage,
                });
                const autoContinue = executeAutoContinueChain({
                    projectPath,
                    prompt: executionPrompt,
                    firstEvaluation: evaluation,
                    maxAutoSteps: 2,
                    canExecute: (nextDispatch) => buildAutoContinueGate(projectPath, nextDispatch),
                    runDispatch: (nextDispatch) => {
                        const { result: nextResult, evaluation: nextEvaluation } = executeSingleDispatch(projectPath, nextDispatch, executionPrompt);
                        return {
                            dispatch: nextDispatch,
                            result: {
                                status: nextResult.status ?? -1,
                                stdout: nextResult.stdout || "",
                                stderr: nextResult.stderr || "",
                            },
                            evaluation: nextEvaluation,
                        };
                    },
                });
                return [
                    "pm-workflow 调度执行结果",
                    `- 当前阶段: ${dispatch.stageLabel}`,
                    `- 推荐 Agent: ${dispatch.recommendedAgent}`,
                    `- 可执行 Agent: ${dispatch.executableAgent}`,
                    `- 推荐动作: ${dispatch.recommendedAction}`,
                    `- 执行命令: ${dispatch.command}`,
                    `- exitCode: ${result.status ?? -1}`,
                    ...formatTaskAnalysisLines(dispatch.analysis),
                    ...formatHandoffPacketLines(dispatch.handoffPacket),
                    ...formatEvaluationLines(evaluation),
                    ...formatNextDispatchHintLines(evaluation),
                    ...(() => {
                        const lines = [];
                        appendAutoContinueSummary(lines, projectPath, executionPrompt, evaluation, 2);
                        return lines;
                    })(),
                    ...formatAutoContinueExecutionLines(autoContinue),
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
        "pm-dry-run-loop": tool({
            description: "模拟 pm-workflow 自动循环编排，逐步检查 permission/gate/dispatch，但不执行命令。",
            args: {
                steps: tool.schema.string().describe("最大模拟步数，建议 1-5，例如 3"),
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
                    const executionPlan = buildExecutionPlan(projectPath, args.prompt);
                    const permission = buildPermissionGate(projectPath, {
                        kind: "execute",
                        action: dispatch.recommendedAction,
                    });
                    const gate = buildExecutionGate(projectPath, dispatch.recommendedAction);
                    const retry = buildRetryPlan(projectPath, dispatch.recommendedAction);
                    const fallback = buildFallbackPlan(projectPath, dispatch.recommendedAction, dispatch.executableAgent);
                    outputs.push(`- Step ${index + 1}: ${dispatch.recommendedAgent}/${dispatch.executableAgent} -> ${dispatch.recommendedAction}`);
                    outputs.push(...formatLoopEvaluationLines());
                    outputs.push(`  execution plan summary: mode=${executionPlan.mode} steps=${executionPlan.steps.length} primary=${executionPlan.primaryAction}`);
                    outputs.push(...executionPlan.steps.map((step, stepIndex) => `    step ${stepIndex + 1}: ${step.id} | ${step.mode} | ${step.agent ?? "local"} | ${step.action}`));
                    outputs.push("  execution plan:");
                    outputs.push("  ```json");
                    outputs.push(JSON.stringify(executionPlan, null, 2));
                    outputs.push("  ```");
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
        "pm-run-loop": tool({
            description: "按 pm-workflow 当前 state/gates 进行受控自动循环编排，最多执行指定步数。",
            args: {
                steps: tool.schema.string().describe("最大执行步数，建议 1-5，例如 3"),
                prompt: tool.schema.string().describe("交给自动循环编排的基础任务描述"),
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
                    const { result, evaluation } = executeSingleDispatch(projectPath, dispatch, args.prompt);
                    outputs.push(`  exitCode: ${result.status ?? -1}`);
                    outputs.push(...formatLoopEvaluationLines(evaluation));
                    appendAutoContinueSummary(outputs, projectPath, args.prompt, evaluation, 2);
                    if ((result.status ?? -1) === 0) {
                        const autoContinue = executeAutoContinueChain({
                            projectPath,
                            prompt: args.prompt,
                            firstEvaluation: evaluation,
                            maxAutoSteps: 2,
                            canExecute: (nextDispatch) => buildAutoContinueGate(projectPath, nextDispatch),
                            runDispatch: (nextDispatch) => {
                                const { result: nextResult, evaluation: nextEvaluation } = executeSingleDispatch(projectPath, nextDispatch, args.prompt);
                                return {
                                    dispatch: nextDispatch,
                                    result: {
                                        status: nextResult.status ?? -1,
                                        stdout: nextResult.stdout || "",
                                        stderr: nextResult.stderr || "",
                                    },
                                    evaluation: nextEvaluation,
                                };
                            },
                        });
                        outputs.push(...formatAutoContinueExecutionLines(autoContinue));
                    }
                    if ((result.status ?? -1) !== 0) {
                        const retry = buildRetryPlan(projectPath, dispatch.recommendedAction);
                        if (retry.allowed) {
                            outputs.push(`  retry: ${retry.attempts + 1}/${retry.maxAttempts}`);
                            const { result: retryResult, evaluation: retryEvaluation } = executeSingleDispatch(projectPath, dispatch, args.prompt);
                            outputs.push(`  retryExitCode: ${retryResult.status ?? -1}`);
                            outputs.push(...formatLoopEvaluationLines(retryEvaluation));
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
                                const { result: fallbackResult, evaluation: fallbackEvaluation, } = executeSingleDispatch(projectPath, fallbackDispatch, args.prompt);
                                recordFallbackExecution(projectPath, {
                                    action: dispatch.recommendedAction,
                                    fromAgent: fallback.fromAgent,
                                    toAgent: fallback.toAgent,
                                    exitCode: fallbackResult.status ?? -1,
                                    stdout: fallbackResult.stdout || "",
                                    stderr: fallbackResult.stderr || "",
                                });
                                outputs.push(`  fallbackExitCode: ${fallbackResult.status ?? -1}`);
                                outputs.push(...formatLoopEvaluationLines(fallbackEvaluation));
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
                            const { result: fallbackResult, evaluation: fallbackEvaluation } = executeSingleDispatch(projectPath, fallbackDispatch, args.prompt);
                            recordFallbackExecution(projectPath, {
                                action: dispatch.recommendedAction,
                                fromAgent: fallback.fromAgent,
                                toAgent: fallback.toAgent,
                                exitCode: fallbackResult.status ?? -1,
                                stdout: fallbackResult.stdout || "",
                                stderr: fallbackResult.stderr || "",
                            });
                            outputs.push(`  fallbackExitCode: ${fallbackResult.status ?? -1}`);
                            outputs.push(...formatLoopEvaluationLines(fallbackEvaluation));
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
    };
}
