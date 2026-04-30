function hasAnyKeyword(text, keywords) {
    return keywords.some((keyword) => text.includes(keyword));
}
function inferDomain(prompt, preferredAgent) {
    if (preferredAgent === "backend")
        return "backend";
    if (preferredAgent === "frontend")
        return "frontend";
    if (preferredAgent === "writer")
        return "writer";
    if (preferredAgent === "qa_engineer")
        return "qa_engineer";
    if (preferredAgent === "pm" || preferredAgent === "commander")
        return "orchestration";
    const normalized = prompt.toLowerCase();
    const orchestrationMatched = (normalized.includes("前端") &&
        (normalized.includes("文档") ||
            normalized.includes("说明") ||
            normalized.includes("readme"))) ||
        normalized.includes("拆解方案") ||
        normalized.includes("一起补齐") ||
        normalized.includes("一并补齐") ||
        (normalized.includes("实现") &&
            (normalized.includes("文档") || normalized.includes("方案")));
    const backendMatched = normalized.includes("api") ||
        normalized.includes("backend") ||
        normalized.includes("数据库") ||
        normalized.includes("服务") ||
        normalized.includes("接口") ||
        normalized.includes("认证") ||
        normalized.includes("401") ||
        normalized.includes("登录");
    const frontendMatched = normalized.includes("ui") ||
        normalized.includes("前端") ||
        normalized.includes("页面") ||
        normalized.includes("组件");
    const writerMatched = normalized.includes("文档") ||
        normalized.includes("release") ||
        normalized.includes("说明") ||
        normalized.includes("readme");
    const qaMatched = normalized.includes("测试") ||
        normalized.includes("review") ||
        normalized.includes("验证");
    if (orchestrationMatched) {
        return "orchestration";
    }
    if (backendMatched) {
        return "backend";
    }
    if (frontendMatched) {
        return "frontend";
    }
    if (writerMatched) {
        return "writer";
    }
    if (qaMatched) {
        return "qa_engineer";
    }
    return "orchestration";
}
function inferComplexity(prompt) {
    const normalized = prompt.toLowerCase();
    if (normalized.includes("并且") ||
        normalized.includes("同时") ||
        normalized.includes("以及") ||
        normalized.includes("一起") ||
        normalized.includes("拆解方案")) {
        return "composite";
    }
    if (hasAnyKeyword(normalized, [
        "验证",
        "不影响",
        "回归",
        "联调",
        "补齐",
        "完善",
    ])) {
        return "multi_step";
    }
    if (normalized.length > 80) {
        return "multi_step";
    }
    return "simple";
}
function mapDomainToAgent(domain) {
    switch (domain) {
        case "backend":
            return "backend";
        case "frontend":
            return "frontend";
        case "writer":
            return "writer";
        case "qa_engineer":
            return "qa_engineer";
        case "pm":
            return "pm";
        case "orchestration":
        default:
            return "pm";
    }
}
function inferExecutionMode(domain, complexity, stage) {
    if (complexity === "composite") {
        return "advisor_then_dispatch";
    }
    if (complexity === "simple") {
        return domain === "orchestration" ? "pm_direct" : "single_agent";
    }
    if (complexity === "multi_step") {
        return "serial_handoff";
    }
    if (stage === "development" && domain !== "writer") {
        return "serial_handoff";
    }
    return domain === "orchestration" ? "pm_direct" : "single_agent";
}
function inferRecommendedAgent(domain, complexity, preferredAgent) {
    if (preferredAgent) {
        return preferredAgent;
    }
    return mapDomainToAgent(domain);
}
function inferExpectedNextAgents(domain, recommendedAgent, complexity) {
    if (recommendedAgent === "commander") {
        return ["pm", "frontend", "writer"];
    }
    if (domain === "backend" && complexity !== "simple") {
        return ["backend", "qa_engineer"];
    }
    if (recommendedAgent === "pm") {
        return ["commander"];
    }
    return [recommendedAgent];
}
export function analyzeDispatchTask(input) {
    const domain = inferDomain(input.prompt, input.preferredAgent ?? null);
    const complexity = inferComplexity(input.prompt);
    const recommendedAgent = inferRecommendedAgent(domain, complexity, input.preferredAgent ?? null);
    const executionMode = inferExecutionMode(domain, complexity, input.stage);
    const blockedReasons = input.blockedReasons ?? [];
    const expectedNextAgents = inferExpectedNextAgents(domain, recommendedAgent, complexity);
    return {
        domain,
        complexity,
        recommendedAgent,
        fallbackAgents: recommendedAgent === "pm" ? ["commander"] : ["pm"],
        executionMode,
        needsDecomposition: complexity !== "simple",
        rationale: [
            `当前任务被识别为 ${domain} 域`,
            `当前复杂度判断为 ${complexity}`,
            `当前执行方式建议为 ${executionMode}`,
        ],
        risks: [
            ...(complexity === "simple"
                ? []
                : ["任务包含多步或跨角色协作，需要中间结果回收"]),
            ...blockedReasons.map((reason) => `当前存在阻塞：${reason}`),
        ],
        expectedNextAgents,
    };
}
