import { spawnSync } from "child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import {
  REVIEW_MARKER_FILENAME,
  buildDispatchCommand,
  buildExecutablePrompt,
  buildDispatchPlan,
  buildStateSummary,
  getExecutableAgent,
  recordDispatchExecution,
  readWorkflowConfig,
  setLastAgent,
} from "../shared.js";
import type { DispatchCommand, EvaluationResult } from "../core/types.js";
import { buildDispatchCommandStrings } from "../orchestrator/prompts.js";
import { analyzeDispatchTask } from "../orchestrator/analyzer.js";
import { buildHandoffPacket } from "../orchestrator/handoff.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type OpenCodeClient = {
  app?: {
    log?: (payload: {
      body: {
        service: string;
        level: LogLevel;
        message: string;
        extra?: Record<string, unknown>;
      };
    }) => Promise<void> | void;
  };
};

export type PluginContext = {
  project?: { name?: string };
  client?: OpenCodeClient;
  directory?: string;
  worktree?: string;
};

export type EventPayload = {
  event?: {
    type?: string;
    properties?: Record<string, unknown>;
  };
};

export type ToolInput = {
  tool?: string;
  args?: Record<string, unknown>;
};

export type ToolOutput = {
  args?: Record<string, unknown>;
  result?: unknown;
};

export type TuiPromptOutput = {
  prompt?: string;
};

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

export function executeDispatchCommand(
  projectPath: string,
  dispatch: ReturnType<typeof buildDispatchCommand>,
  prompt: string,
) {
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

export function buildAutoContinueDispatch(
  projectDir: string,
  prompt: string,
  evaluation: EvaluationResult,
): DispatchCommand | undefined {
  if (
    !evaluation.canAutoContinue ||
    !evaluation.autoContinueSafe ||
    !evaluation.recommendedNextAgent ||
    !evaluation.nextAutoAction
  ) {
    return undefined;
  }

  const plan = buildDispatchPlan(projectDir);
  const config = readWorkflowConfig(projectDir);
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
  const executableAgent = getExecutableAgent(
    evaluation.recommendedNextAgent,
    config.agents.dispatch_map,
  );
  const executablePrompt = buildExecutablePrompt(
    evaluation.recommendedNextAgent,
    prompt,
    handoffPacket,
  );
  const { command, commandArgs } = buildDispatchCommandStrings(
    sessionID,
    executableAgent,
    executablePrompt,
  );

  return {
    ...plan,
    recommendedAgent: evaluation.recommendedNextAgent,
    recommendedAction: evaluation.nextAutoAction,
    reason: `自动续跑下一步：${evaluation.recommendedNextAgent}/${evaluation.nextAutoAction}`,
    analysis,
    handoffPacket,
    executableAgent,
    executablePrompt,
    command,
    commandArgs,
  };
}

export function getConfigDir() {
  if (process.platform === "win32") {
    return join(process.env.APPDATA || "", "opencode");
  }
  return join(process.env.HOME || "", ".config", "opencode");
}

export function getProjectDir(ctx: PluginContext) {
  return ctx.worktree || ctx.directory || process.cwd();
}

export async function log(
  client: OpenCodeClient | undefined,
  level: LogLevel,
  message: string,
  extra?: Record<string, unknown>,
) {
  await client?.app?.log?.({
    body: {
      service: "pm-workflow-plugin",
      level,
      message,
      extra,
    },
  });
}

export function isCodePath(filePath: string) {
  const lower = filePath.toLowerCase();
  const lastDot = lower.lastIndexOf(".");
  if (lastDot === -1) return true;
  const extension = lower.slice(lastDot);
  return !NON_CODE_EXTENSIONS.has(extension);
}

export function writeReviewMarker(projectDir: string) {
  const markerPath = join(projectDir, REVIEW_MARKER_FILENAME);
  writeFileSync(markerPath, "needs_review", "utf-8");
}

export function checkReviewGate(projectDir: string) {
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
        reason:
          "代码已修改但未进行 code review。请先完成两阶段审查，再继续提交或结束流程。",
      }),
      markerPath,
    };
  }

  return { ok: true, message: "", markerPath };
}

function findTsconfig(projectDir: string) {
  const queue: Array<{ dir: string; depth: number }> = [
    { dir: projectDir, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > 3) continue;

    const tsconfig = join(current.dir, "tsconfig.json");
    if (existsSync(tsconfig)) return current.dir;
    if (current.depth === 3) continue;

    let children: string[] = [];
    try {
      children = readdirSync(current.dir).sort();
    } catch {
      continue;
    }

    for (const child of children) {
      if (IGNORED_TSCONFIG_DIRS.has(child)) continue;
      const childPath = join(current.dir, child);
      try {
        if (statSync(childPath).isDirectory()) {
          queue.push({ dir: childPath, depth: current.depth + 1 });
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

export function runPreCommitCheck(projectDir: string) {
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

export function extractChangedPathsFromPatch(patchText: string) {
  const matches = patchText.matchAll(/\*\*\* (?:Add|Update) File: (.+)$/gm);
  return Array.from(matches, (match) => match[1].trim());
}

export function buildStagePrompt(projectDir: string) {
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

export function buildStageSummary(projectDir: string) {
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

export function buildReviewGateSummary(projectDir: string) {
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

export function buildFeedbackSignalSummary(message: string) {
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
      additionalContext:
        "检测到用户修正信号。请在处理完用户请求后，将这条反馈记录到项目 .pm-workflow/feedback/ 目录。",
    }),
  };
}
