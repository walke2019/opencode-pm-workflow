import { appendHistory, queryHistory, readHistory } from "./history.js";
import type {
  DispatchAction,
  ExecutionReceipt,
  WorkflowStage,
} from "./types.js";

function nowIso() {
  return new Date().toISOString();
}

function createExecutionId() {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function recordExecutionReceipt(
  projectDir: string,
  input: {
    action: DispatchAction;
    executableAgent: string;
    prompt: string;
    commandArgs: string[];
    exitCode: number;
    retryUsed: boolean;
    fallbackUsed: boolean;
    stageBefore: WorkflowStage;
    stageAfter: WorkflowStage;
  },
) {
  const receipt: ExecutionReceipt = {
    at: nowIso(),
    type: "execution.receipt",
    execution_id: createExecutionId(),
    action: input.action,
    executable_agent: input.executableAgent,
    prompt_summary: input.prompt.slice(0, 200),
    command_args: input.commandArgs,
    exitCode: input.exitCode,
    retry_used: input.retryUsed,
    fallback_used: input.fallbackUsed,
    stage_before: input.stageBefore,
    stage_after: input.stageAfter,
  };

  appendHistory(projectDir, receipt);
  return receipt;
}

export function getExecutionReceipts(
  projectDir: string,
  options: {
    limit?: number;
    action?: string;
    agent?: string;
    success?: "true" | "false";
  } = {},
) {
  const limit = options.limit || 10;
  return queryHistory(projectDir, {
    type: "execution.receipt",
    limit,
  }).filter((event) => {
    const receipt = event as ExecutionReceipt;
    if (options.action && receipt.action !== options.action) return false;
    if (options.agent && receipt.executable_agent !== options.agent)
      return false;
    if (options.success === "true" && receipt.exitCode !== 0) return false;
    if (options.success === "false" && receipt.exitCode === 0) return false;
    return true;
  }) as ExecutionReceipt[];
}

export function getLastExecutionReceipt(projectDir: string) {
  const receipts = getExecutionReceipts(projectDir, { limit: 1 });
  return receipts[0] || null;
}

export function getExecutionReceiptById(
  projectDir: string,
  executionId: string,
) {
  return (readHistory(projectDir).find(
    (event) =>
      event.type === "execution.receipt" && event.execution_id === executionId,
  ) || null) as ExecutionReceipt | null;
}

export function buildExecutionSummary(projectDir: string, limit = 10) {
  const receipts = getExecutionReceipts(projectDir, { limit });
  const successCount = receipts.filter(
    (receipt) => receipt.exitCode === 0,
  ).length;
  const failureCount = receipts.length - successCount;
  const last = receipts[0] || null;

  return {
    total: receipts.length,
    successCount,
    failureCount,
    successRate: receipts.length
      ? Number((successCount / receipts.length).toFixed(2))
      : 0,
    lastAction: last?.action || null,
    lastAgent: last?.executable_agent || null,
    lastExitCode: typeof last?.exitCode === "number" ? last.exitCode : null,
  };
}
