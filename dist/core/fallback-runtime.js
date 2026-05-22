const RATE_LIMIT_PATTERNS = [
    /\b429\b/,
    /rate[\s_-]?limit/i,
    /too\s+many\s+requests/i,
    /quota.*exceeded/i,
    /usage[\s_-]?limit/i,
];
const TIMEOUT_PATTERNS = [
    /\btimed?\s*out\b/i,
    /\b504\b/,
    /gateway\s+timeout/i,
    /request\s+timeout/i,
    /etimedout/i,
];
const CONTEXT_OVERFLOW_PATTERNS = [
    /context\s+(length|window)\s+exceeded/i,
    /maximum\s+context/i,
    /token\s+limit/i,
    /input\s+is\s+too\s+long/i,
];
const MODEL_UNAVAILABLE_PATTERNS = [
    /\b503\b/,
    /service\s+unavailable/i,
    /model.*(?:not\s+found|unavailable|deprecated)/i,
    /no\s+such\s+model/i,
];
const PATTERN_GROUPS = [
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
export function detectFallbackTrigger(input) {
    if (input.exitCode === 0) {
        return undefined;
    }
    const sources = [];
    if (input.stderr)
        sources.push({ source: "stderr", text: input.stderr });
    if (input.stdout)
        sources.push({ source: "stdout", text: input.stdout });
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
export function resolveFallbackChain(input) {
    const chains = input.config.fallback.chains || {};
    const candidates = [];
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
    const merged = [];
    const seen = new Set();
    for (const list of candidates) {
        for (const model of list) {
            if (typeof model !== "string" || !model.trim())
                continue;
            if (seen.has(model))
                continue;
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
export function pickNextFallbackModel(input) {
    if (input.chain.length === 0)
        return undefined;
    if (!input.currentModel) {
        return input.chain[0];
    }
    const index = input.chain.indexOf(input.currentModel);
    if (index === -1) {
        return input.chain[0];
    }
    return input.chain[index + 1];
}
/**
 * 一次性决定"是否需要触发前台降级 + 切到哪个 model"。
 *
 * dispatch 层只需要看 `triggered === true && nextModel` 就可以决定是否重试，
 * 看 `triggered === true && nextModel === undefined` 就知道链路已耗尽，停止重试。
 */
export function buildForegroundFallbackPlan(input) {
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
