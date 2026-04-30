import { tool } from "@opencode-ai/plugin";
import {
  evaluateDispatchResult,
  type EvaluationResult,
  type HandoffPacket,
  type TaskAnalysis,
  buildConfirmGate,
  buildFallbackCommand,
  buildDispatchCommand,
  buildExecutionPlan,
  buildExecutionGate,
  buildFallbackPlan,
  buildPermissionGate,
  buildRetryPlan,
  buildStateSummary,
  recordExecutionReceipt,
  recordFallbackExecution,
  setLastAgent,
} from "../../shared.js";
import { executeDispatchCommand } from "../runtime.js";

export function formatTaskAnalysisLines(analysis?: TaskAnalysis): string[] {
  if (!analysis) {
    return ["- task analysis: unavailable"];
  }

  return [
    `- task analysis: domain=${analysis.domain} complexity=${analysis.complexity} mode=${analysis.executionMode}`,
    `- task analysis agent: recommended=${analysis.recommendedAgent} fallback=${analysis.fallbackAgents.join(",") || "none"}`,
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

export function formatHandoffPacketLines(packet?: HandoffPacket): string[] {
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

export function formatEvaluationLines(evaluation?: EvaluationResult): string[] {
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
  ];
}

export function formatNextDispatchHintLines(
  evaluation?: EvaluationResult,
): string[] {
  if (!evaluation?.recommendedNextAgent || !evaluation.recommendedNextAction) {
    return ["- next dispatch hint: none"];
  }

  return [
    `- next dispatch hint: ${evaluation.recommendedNextAgent}/${evaluation.recommendedNextAction}`,
  ];
}

export function formatLoopEvaluationLines(
  evaluation?: EvaluationResult,
): string[] {
  return [
    ...formatEvaluationLines(evaluation).map((line) => `  ${line.slice(2)}`),
    ...formatNextDispatchHintLines(evaluation).map(
      (line) => `  ${line.slice(2)}`,
    ),
  ];
}

export function createDispatchTools() {
  return {
    "pm-run-dispatch": tool({
      description:
        "基于 pm-workflow 当前 state/gates 生成一条可直接执行的调度命令，并更新 last_agent。",
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
      description:
        "模拟一次 pm-workflow dispatch 执行，检查 permission/gate/retry/fallback，但不执行命令。",
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
        const gate = buildExecutionGate(
          projectPath,
          dispatch.recommendedAction,
        );
        const retry = buildRetryPlan(projectPath, dispatch.recommendedAction);
        const fallback = buildFallbackPlan(
          projectPath,
          dispatch.recommendedAction,
          dispatch.executableAgent,
        );

        return [
          "pm-workflow dry-run dispatch",
          `- execution plan summary: mode=${executionPlan.mode} steps=${executionPlan.steps.length} primary=${executionPlan.primaryAction}`,
          ...executionPlan.steps.map(
            (step, index) =>
              `  step ${index + 1}: ${step.id} | ${step.mode} | ${step.agent ?? "local"} | ${step.action}`,
          ),
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
      description:
        "基于 pm-workflow 当前 state/gates 直接执行推荐命令，并返回执行结果。",
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
        const gate = buildExecutionGate(
          projectPath,
          dispatch.recommendedAction,
        );

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

        const result = executeDispatchCommand(
          projectPath,
          dispatch,
          args.prompt || "继续当前阶段的推荐动作",
        );
        const evaluation = dispatch.handoffPacket
          ? evaluateDispatchResult({
              packet: dispatch.handoffPacket,
              exitCode: result.status ?? -1,
              stdout: result.stdout || "",
              stderr: result.stderr || "",
            })
          : undefined;
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
          ...formatTaskAnalysisLines(dispatch.analysis),
          ...formatHandoffPacketLines(dispatch.handoffPacket),
          ...formatEvaluationLines(evaluation),
          ...formatNextDispatchHintLines(evaluation),
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
      description:
        "模拟 pm-workflow 自动循环编排，逐步检查 permission/gate/dispatch，但不执行命令。",
      args: {
        steps: tool.schema.string().describe("最大模拟步数，建议 1-5，例如 3"),
        prompt: tool.schema
          .string()
          .optional()
          .describe("可选，dry-run prompt"),
      },
      async execute(args, context) {
        const projectPath = context.worktree || context.directory;
        const maxSteps = Math.max(
          1,
          Math.min(5, Number.parseInt(args.steps, 10) || 1),
        );
        const outputs: string[] = [
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
          const gate = buildExecutionGate(
            projectPath,
            dispatch.recommendedAction,
          );
          const retry = buildRetryPlan(projectPath, dispatch.recommendedAction);
          const fallback = buildFallbackPlan(
            projectPath,
            dispatch.recommendedAction,
            dispatch.executableAgent,
          );

          outputs.push(
            `- Step ${index + 1}: ${dispatch.recommendedAgent}/${dispatch.executableAgent} -> ${dispatch.recommendedAction}`,
          );
          outputs.push(...formatLoopEvaluationLines());
          outputs.push(
            `  execution plan summary: mode=${executionPlan.mode} steps=${executionPlan.steps.length} primary=${executionPlan.primaryAction}`,
          );
          outputs.push(
            ...executionPlan.steps.map(
              (step, stepIndex) =>
                `    step ${stepIndex + 1}: ${step.id} | ${step.mode} | ${step.agent ?? "local"} | ${step.action}`,
            ),
          );
          outputs.push("  execution plan:");
          outputs.push("  ```json");
          outputs.push(JSON.stringify(executionPlan, null, 2));
          outputs.push("  ```");
          outputs.push(
            `  permission: ${permission.allowed ? "allowed" : "blocked"}`,
          );
          if (permission.reasons.length) {
            outputs.push(
              `  permission reasons: ${permission.reasons.join("；")}`,
            );
          }
          outputs.push(`  gate: ${gate.allowed ? "allowed" : "blocked"}`);
          if (gate.reasons.length) {
            outputs.push(`  gate reasons: ${gate.reasons.join("；")}`);
          }
          outputs.push(
            `  retry: ${retry.retryable ? "retryable" : "not-retryable"} ${retry.attempts}/${retry.maxAttempts}`,
          );
          outputs.push(
            `  fallback: ${fallback.allowed && fallback.toAgent ? `${fallback.fromAgent}->${fallback.toAgent}` : "not-available"}`,
          );

          if (!permission.allowed || !gate.allowed) break;
        }

        return outputs.join("\n");
      },
    }),
    "pm-run-loop": tool({
      description:
        "按 pm-workflow 当前 state/gates 进行受控自动循环编排，最多执行指定步数。",
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
        const maxSteps = Math.max(
          1,
          Math.min(5, Number.parseInt(args.steps, 10) || 1),
        );
        const outputs: string[] = [
          "pm-workflow 自动循环编排结果",
          `- 最大步数: ${maxSteps}`,
        ];

        for (let index = 0; index < maxSteps; index += 1) {
          const dispatch = buildDispatchCommand(projectPath, args.prompt);
          const gate = buildExecutionGate(
            projectPath,
            dispatch.recommendedAction,
          );

          outputs.push(
            `- Step ${index + 1}: ${dispatch.recommendedAgent} / ${dispatch.recommendedAction}`,
          );

          if (!gate.allowed) {
            outputs.push(`  gate blocked: ${gate.reasons.join("；")}`);
            break;
          }

          const result = executeDispatchCommand(
            projectPath,
            dispatch,
            args.prompt,
          );
          const evaluation = dispatch.handoffPacket
            ? evaluateDispatchResult({
                packet: dispatch.handoffPacket,
                exitCode: result.status ?? -1,
                stdout: result.stdout || "",
                stderr: result.stderr || "",
              })
            : undefined;
          outputs.push(`  exitCode: ${result.status ?? -1}`);
          outputs.push(...formatLoopEvaluationLines(evaluation));

          if ((result.status ?? -1) !== 0) {
            const retry = buildRetryPlan(
              projectPath,
              dispatch.recommendedAction,
            );
            if (retry.allowed) {
              outputs.push(
                `  retry: ${retry.attempts + 1}/${retry.maxAttempts}`,
              );
              const retryResult = executeDispatchCommand(
                projectPath,
                dispatch,
                args.prompt,
              );
              const retryEvaluation = dispatch.handoffPacket
                ? evaluateDispatchResult({
                    packet: dispatch.handoffPacket,
                    exitCode: retryResult.status ?? -1,
                    stdout: retryResult.stdout || "",
                    stderr: retryResult.stderr || "",
                  })
                : undefined;
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
              outputs.push(
                `  retryStderr: ${(retryResult.stderr || "").trim() || "(empty)"}`,
              );
              const fallback = buildFallbackPlan(
                projectPath,
                dispatch.recommendedAction,
                dispatch.executableAgent,
              );
              if (fallback.allowed && fallback.toAgent) {
                outputs.push(
                  `  fallback: ${fallback.fromAgent} -> ${fallback.toAgent}`,
                );
                const fallbackDispatch = buildFallbackCommand(
                  projectPath,
                  dispatch,
                  fallback.toAgent,
                  args.prompt,
                );
                const fallbackResult = executeDispatchCommand(
                  projectPath,
                  fallbackDispatch,
                  args.prompt,
                );
                const fallbackEvaluation = fallbackDispatch.handoffPacket
                  ? evaluateDispatchResult({
                      packet: fallbackDispatch.handoffPacket,
                      exitCode: fallbackResult.status ?? -1,
                      stdout: fallbackResult.stdout || "",
                      stderr: fallbackResult.stderr || "",
                    })
                  : undefined;
                recordFallbackExecution(projectPath, {
                  action: dispatch.recommendedAction,
                  fromAgent: fallback.fromAgent,
                  toAgent: fallback.toAgent,
                  exitCode: fallbackResult.status ?? -1,
                  stdout: fallbackResult.stdout || "",
                  stderr: fallbackResult.stderr || "",
                });
                outputs.push(
                  `  fallbackExitCode: ${fallbackResult.status ?? -1}`,
                );
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
            const fallback = buildFallbackPlan(
              projectPath,
              dispatch.recommendedAction,
              dispatch.executableAgent,
            );
            if (fallback.allowed && fallback.toAgent) {
              outputs.push(
                `  fallback: ${fallback.fromAgent} -> ${fallback.toAgent}`,
              );
              const fallbackDispatch = buildFallbackCommand(
                projectPath,
                dispatch,
                fallback.toAgent,
                args.prompt,
              );
              const fallbackResult = executeDispatchCommand(
                projectPath,
                fallbackDispatch,
                args.prompt,
              );
              const fallbackEvaluation = fallbackDispatch.handoffPacket
                ? evaluateDispatchResult({
                    packet: fallbackDispatch.handoffPacket,
                    exitCode: fallbackResult.status ?? -1,
                    stdout: fallbackResult.stdout || "",
                    stderr: fallbackResult.stderr || "",
                  })
                : undefined;
              recordFallbackExecution(projectPath, {
                action: dispatch.recommendedAction,
                fromAgent: fallback.fromAgent,
                toAgent: fallback.toAgent,
                exitCode: fallbackResult.status ?? -1,
                stdout: fallbackResult.stdout || "",
                stderr: fallbackResult.stderr || "",
              });
              outputs.push(
                `  fallbackExitCode: ${fallbackResult.status ?? -1}`,
              );
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
            outputs.push(
              `  stderr: ${(result.stderr || "").trim() || "(empty)"}`,
            );
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
