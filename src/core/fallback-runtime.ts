/**
 * ForegroundFallback：运行时模型降级。
 *
 * 设计目标：
 * - 当 dispatch 子进程返回限流 / 超时 / 上下文溢出等可降级错误时，
 *   按 `WorkflowConfig.fallback.chains` 配置的链路切换到下一备选模型，
 *   避免在同一模型上做无效重试，直接节省 token 与等待时间。
 * - 不取代 OpenCode 自身的 provider fallback；只在外层 dispatch 层做"看得见的降级"，
 *   产出审计可见的回执，便于排障。
 *
 * 不做的事情：
 * - 不主动切换 agent 角色（角色切换走 fallback.agent_map）。
 * - 不在执行成功时做任何调整。
 * - 不引入额外网络请求；仅基于子进程 exit code / stdout / stderr 做判定。
 */
import type { DispatchAgent, WorkflowConfig } from "./types.js";

export type FallbackTriggerKind =
  | "rate_limit"
  | "timeout"
  | "context_overflow"
  | "model_unavailable";

export interface FallbackTriggerSignal {
  kind: FallbackTriggerKind;
  matchedPattern: string;
  source: "stdout" | "stderr" | "exit_code";
}

const RATE_LIMIT_PATTERNS: ReadonlyArray<RegExp> = [
  /\b429\b/,
  /rate[\s_-]?limit/i,
  /too\s+many\s+requests/i,
  /quota.*exceeded/i,
  /usage[\s_-]?limit/i,
];

const TIMEOUT_PATTERNS: ReadonlyArray<RegExp> = [
  /\btimed?\s*out\b/i,
  /\b504\b/,
  /gateway\s+timeout/i,
  /request\s+timeout/i,
  /etimedout/i,
];

const CONTEXT_OVERFLOW_PATTERNS: ReadonlyArray<RegExp> = [
  /context\s+(length|window)\s+exceeded/i,
  /maximum\s+context/i,
  /token\s+limit/i,
  /input\s+is\s+too\s+long/i,
];

const MODEL_UNAVAILABLE_PATTERNS: ReadonlyArray<RegExp> = [
  /\b503\b/,
  /service\s+unavailable/i,
  /model.*(?:not\s+found|unavailable|deprecated)/i,
  /no\s+such\s+model/i,
];

const PATTERN_GROUPS: ReadonlyArray<{
  kind: FallbackTriggerKind;
  patterns: ReadonlyArray<RegExp>;
}> = [
  { kind: "rate_limit", patterns: RATE_LIMIT_PATTERNS },
  { kind: "timeout", patterns: TIMEOUT_PATTERNS },
  { kind: "context_overflow", patterns: CONTEXT_OVERFLOW_PATTERNS },
  { kind: "model_unavailable", patterns: MODEL_UNAVAILABLE_PATTERNS },
];

/**
 * 判断子进程结果是否触发了"前台模型降级"。
 *
 * 仅在 exit code 非 0 的失败场景下检查，避免误判。
 * 命中任意一类模式即视为可降级；返回的 signal 会写入 receipt，便于事后审计。
 */
export function detectFallbackTrigger(input: {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}): FallbackTriggerSignal | undefined {
  if (input.exitCode === 0) {
    return undefined;
  }

  const sources: Array<{ source: "stdout" | "stderr"; text: string }> = [];
  if (input.stderr) sources.push({ source: "stderr", text: input.stderr });
  if (input.stdout) sources.push({ source: "stdout", text: input.stdout });

  for (const { source, text } of sources) {
    for (const group of PATTERN_GROUPS) {
      for (const pattern of group.patterns) {
        const match = text.match(pattern);
        if (match) {
          return {
            kind: group.kind,
            matchedPattern: match[0],
            source,
          };
        }
      }
    }
  }

  return undefined;
}

/**
 * 解析 fallback chain：按 semantic agent 名称、然后按当前 model id 查找。
 *
 * 设计要点：
 * - 多源合并去重，按"先按 agent 配置、再按 model 配置"的顺序拼接。
 * - **保留** currentModel 的位置（如果它出现在链路里），便于 pickNextFallbackModel
 *   按位置往后走；这样可以避免当 currentModel 已在链路尾时被错误地"折回"链路开头。
 * - 仅当 currentModel 既不出现在 byAgent、也不出现在 byModel 链路时，
 *   才认为它是"链路外"模型，pickNextFallbackModel 会从头开始。
 */
export function resolveFallbackChain(input: {
  config: WorkflowConfig;
  semanticAgent: DispatchAgent;
  currentModel?: string;
}): string[] {
  const chains = input.config.fallback.chains || {};
  const candidates: string[][] = [];

  const byAgent = chains[input.semanticAgent];
  if (Array.isArray(byAgent) && byAgent.length > 0) {
    candidates.push(byAgent);
  }

  if (input.currentModel) {
    const byModel = chains[input.currentModel];
    if (Array.isArray(byModel) && byModel.length > 0) {
      candidates.push(byModel);
    }
  }

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const list of candidates) {
    for (const model of list) {
      if (typeof model !== "string" || !model.trim()) continue;
      if (seen.has(model)) continue;
      seen.add(model);
      merged.push(model);
    }
  }
  return merged;
}

/**
 * 计算"下一个可用备选模型"。
 *
 * - 当前 model 不在链路里时，返回链路第一个。
 * - 当前 model 在链路里时，返回它后面的下一个；用尽则返回 undefined。
 */
export function pickNextFallbackModel(input: {
  chain: string[];
  currentModel?: string;
}): string | undefined {
  if (input.chain.length === 0) return undefined;

  if (!input.currentModel) {
    return input.chain[0];
  }

  const index = input.chain.indexOf(input.currentModel);
  if (index === -1) {
    return input.chain[0];
  }

  return input.chain[index + 1];
}

export interface FallbackPlanRuntime {
  triggered: boolean;
  signal?: FallbackTriggerSignal;
  /** 整个降级链路（不含 currentModel） */
  chain: string[];
  /** 立即可切到的下一个 model；undefined = 链路用尽 */
  nextModel?: string;
  /** 给回执 / 日志使用的人类可读原因 */
  reason: string;
}

/**
 * 一次性决定"是否需要触发前台降级 + 切到哪个 model"。
 *
 * dispatch 层只需要看 `triggered === true && nextModel` 就可以决定是否重试，
 * 看 `triggered === true && nextModel === undefined` 就知道链路已耗尽，停止重试。
 */
export function buildForegroundFallbackPlan(input: {
  config: WorkflowConfig;
  semanticAgent: DispatchAgent;
  currentModel?: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
}): FallbackPlanRuntime {
  const signal = detectFallbackTrigger({
    exitCode: input.exitCode,
    stdout: input.stdout,
    stderr: input.stderr,
  });

  if (!signal) {
    return {
      triggered: false,
      chain: [],
      reason: "no_fallback_trigger_detected",
    };
  }

  const chain = resolveFallbackChain({
    config: input.config,
    semanticAgent: input.semanticAgent,
    currentModel: input.currentModel,
  });

  const nextModel = pickNextFallbackModel({
    chain,
    currentModel: input.currentModel,
  });

  return {
    triggered: true,
    signal,
    chain,
    nextModel,
    reason: nextModel
      ? `${signal.kind} from ${signal.source}; switching to ${nextModel}`
      : `${signal.kind} from ${signal.source}; chain exhausted`,
  };
}
