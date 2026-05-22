/**
 * Auto-continue 受控编排（0.5.0 起）。
 *
 * 设计目标：
 * - 在 Gate / Permission / Confirm 全部前置约束之上，提供"低风险条件下自动推进下一步"的能力。
 * - 与 oh-my-opencode-slim 的"无 Gate 自动续跑"严格区分：本模块 **绝不绕过**任何安全门。
 * - 节省 token：通过冷却时间 + 步数上限 + 反馈停止信号，避免空循环或被推翻又自动重做。
 *
 * 不做的事情：
 * - 不主动跑命令；命令仍由 dispatch-tools 触发。
 * - 不替代现有的 buildExecutionGate / buildPermissionGate；只在它们之上叠加额外约束。
 * - 不持有任何 LLM 状态；所有判断基于本地 state.json + history.jsonl。
 */
import { execSync } from "child_process";
import { appendHistory } from "./history.js";
import {
  defaultAutoContinueState,
  readState,
  writeState,
} from "./state.js";
import type { DispatchAction, WorkflowConfig, WorkflowState } from "./types.js";

/**
 * Auto-continue 安全门评估结果。
 *
 * 每个字段说明哪条额外约束导致 `allowed=false`，便于上层把原因合并进
 * dispatch tool 的回执，让用户立刻看到"为什么没自动续跑"。
 */
export type AutoContinueGuardDecision = {
  allowed: boolean;
  reasons: string[];
  /**
   * 距离允许下一次自动续跑还差多少毫秒。仅在被冷却阻断时设置。
   * dispatch tool 可以据此决定 sleep 时长或直接放弃。
   */
  cooldownRemainingMs?: number;
};

export type AutoContinueGuardInput = {
  projectDir: string;
  config: WorkflowConfig;
  /** 当前已经在本次链路里成功执行过几步（不含原始 dispatch 步） */
  stepsAlreadyDone: number;
  /** 当前 dispatch action，仅用于日志归因 */
  action?: DispatchAction;
  /** 注入时间源便于测试，默认 Date.now() */
  now?: () => number;
};

const FEEDBACK_STOP_PATTERNS: ReadonlyArray<RegExp> = [
  /停下/,
  /停止/,
  /不要再/,
  /别再/,
  /先暂停/,
  /\bstop\b/i,
  /\bcancel\b/i,
  /\babort\b/i,
];

/**
 * 检查最近一次 dispatch 输出是否携带"用户型停止信号"。
 *
 * 用于在长链路中允许用户通过自然语言反馈即时打断自动续跑：
 * 当被 dispatch 的 specialist agent 把"用户说停下"原文输出回来时，本检查命中即停止链路。
 */
export function detectFeedbackStopSignal(text: string | undefined | null) {
  if (!text) return undefined;
  for (const pattern of FEEDBACK_STOP_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        matched: match[0],
        source: text.slice(0, 300),
      };
    }
  }
  return undefined;
}

function readGitWorkingTreeStatus(projectDir: string) {
  try {
    const out = execSync("git status --porcelain=1 --untracked-files=no", {
      cwd: projectDir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return { ok: true, dirty: out.length > 0, raw: out } as const;
  } catch {
    // 不在 git 项目内时不阻断；require_clean_tree 会兜底成"无法确认"
    return { ok: false, dirty: false, raw: "" } as const;
  }
}

/**
 * 在 dispatch 真正发起之前对自动续跑做最终安全校验。
 *
 * 检查顺序（先轻后重，便于早返回）：
 * 1. `auto_continue.enabled` 总开关
 * 2. `permissions.allow_auto_continue` 总开关
 * 3. `auto_continue.max_steps` 步数上限
 * 4. `auto_continue.cooldown_ms` 冷却
 * 5. `auto_continue.require_clean_tree` 工作树干净
 *
 * 任一失败就 `allowed=false` 并附原因；不做硬性 throw，让上层决定是否记录到回执。
 */
export function evaluateAutoContinueGuard(
  input: AutoContinueGuardInput,
): AutoContinueGuardDecision {
  const reasons: string[] = [];
  const ac = input.config.auto_continue;
  const permission = input.config.permissions;
  const now = (input.now || (() => Date.now()))();

  if (!ac.enabled) {
    reasons.push("auto_continue.enabled=false");
  }

  if (!permission.allow_auto_continue) {
    reasons.push("permissions.allow_auto_continue=false");
  }

  if (input.stepsAlreadyDone >= ac.max_steps) {
    reasons.push(
      `auto_continue.max_steps reached (${input.stepsAlreadyDone}/${ac.max_steps})`,
    );
  }

  let cooldownRemainingMs: number | undefined;
  if (reasons.length === 0 && ac.cooldown_ms > 0) {
    const state = readState(input.projectDir);
    const lastAt = state.auto_continue?.last_step_at
      ? Date.parse(state.auto_continue.last_step_at)
      : Number.NaN;
    if (!Number.isNaN(lastAt)) {
      const diff = now - lastAt;
      if (diff < ac.cooldown_ms) {
        cooldownRemainingMs = ac.cooldown_ms - diff;
        reasons.push(
          `auto_continue.cooldown_ms=${ac.cooldown_ms} not elapsed (剩余 ${cooldownRemainingMs}ms)`,
        );
      }
    }
  }

  if (reasons.length === 0 && ac.require_clean_tree) {
    const tree = readGitWorkingTreeStatus(input.projectDir);
    if (!tree.ok) {
      reasons.push("auto_continue.require_clean_tree=true 但无法读取 git 状态");
    } else if (tree.dirty) {
      reasons.push("auto_continue.require_clean_tree=true 但工作树有未提交改动");
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    cooldownRemainingMs,
  };
}

/**
 * 标记自动续跑链路启动，重置 `steps_used` / `aborted_reason`，并写 history。
 * 由 dispatch tool 在原始 dispatch 完成、准备进入续跑前调用。
 */
export function markAutoContinueChainStart(
  projectDir: string,
  context: { initialAction?: DispatchAction },
) {
  const previous = readState(projectDir);
  const next: WorkflowState = {
    ...previous,
    auto_continue: {
      ...defaultAutoContinueState(),
      last_step_at: previous.auto_continue?.last_step_at ?? null,
    },
  };
  writeState(projectDir, next);
  appendHistory(projectDir, {
    type: "auto_continue.chain_start",
    initial_action: context.initialAction,
  });
  return next.auto_continue;
}

/**
 * 记录一次成功的自动续跑步骤；写 `auto_continue.step` 历史，更新 state。
 */
export function recordAutoContinueStep(
  projectDir: string,
  context: {
    stepIndex: number;
    action?: DispatchAction;
    agent?: string;
    exitCode: number;
  },
) {
  const previous = readState(projectDir);
  const stepsUsed = (previous.auto_continue?.steps_used ?? 0) + 1;
  const nowIso = new Date().toISOString();
  const next: WorkflowState = {
    ...previous,
    auto_continue: {
      last_step_at: nowIso,
      steps_used: stepsUsed,
      aborted_reason: null,
    },
    timestamps: {
      ...previous.timestamps,
      updated_at: nowIso,
    },
  };
  writeState(projectDir, next);
  appendHistory(projectDir, {
    type: "auto_continue.step",
    step_index: context.stepIndex,
    action: context.action,
    agent: context.agent,
    exit_code: context.exitCode,
  });
  return next.auto_continue;
}

/**
 * 标记自动续跑链路终止；可被 Gate 阻断、用户停止信号、max_steps 用尽等场景调用。
 */
export function markAutoContinueAborted(
  projectDir: string,
  reason: string,
  extra?: Record<string, unknown>,
) {
  const previous = readState(projectDir);
  const next: WorkflowState = {
    ...previous,
    auto_continue: {
      ...(previous.auto_continue ?? defaultAutoContinueState()),
      aborted_reason: reason,
    },
  };
  writeState(projectDir, next);
  appendHistory(projectDir, {
    type: "auto_continue.aborted",
    reason,
    ...(extra || {}),
  });
}
