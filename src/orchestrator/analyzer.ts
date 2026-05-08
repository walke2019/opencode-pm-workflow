import type {
  DispatchAgent,
  DispatchExecutionMode,
  TaskAnalysis,
  TaskComplexity,
  TaskDomain,
  WorkflowStage,
} from "../core/types.js";

export interface AnalyzeDispatchTaskInput {
  prompt: string;
  stage: WorkflowStage;
  blockedReasons?: string[];
  preferredAgent?: DispatchAgent | null;
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function inferDomain(
  prompt: string,
  preferredAgent?: DispatchAgent | null,
): TaskDomain {
  if (preferredAgent === "backend") return "backend";
  if (preferredAgent === "frontend") return "frontend";
  if (preferredAgent === "writer") return "writer";
  if (preferredAgent === "qa_engineer") return "qa_engineer";
  if (preferredAgent === "researcher") return "researcher";
  if (preferredAgent === "commander") return "orchestration";
  // pm 是主协调默认值，不应阻止后续基于任务内容分派给专业 subagent。

  const normalized = prompt.toLowerCase();
  const researcherMatched =
    normalized.includes("调研") ||
    normalized.includes("搜索") ||
    normalized.includes("查资料") ||
    normalized.includes("查文档") ||
    normalized.includes("官方文档") ||
    normalized.includes("官方推荐") ||
    normalized.includes("对比方案") ||
    normalized.includes("对比一下") ||
    normalized.includes("搜集资料") ||
    normalized.includes("收集资料") ||
    normalized.includes("业内怎么做") ||
    normalized.includes("有哪些方案") ||
    ((normalized.includes("查一下") || normalized.includes("看看")) &&
      (normalized.includes("方案") ||
        normalized.includes("文档") ||
        normalized.includes("资料") ||
        normalized.includes("官方") ||
        normalized.includes("实现路线") ||
        normalized.includes("埋点")));
  const orchestrationMatched =
    (normalized.includes("前端") &&
      (normalized.includes("文档") ||
        normalized.includes("说明") ||
        normalized.includes("readme"))) ||
    normalized.includes("拆解方案") ||
    normalized.includes("一起补齐") ||
    normalized.includes("一并补齐") ||
    (normalized.includes("实现") &&
      (normalized.includes("文档") || normalized.includes("方案")) &&
      !researcherMatched);
  const backendMatched =
    normalized.includes("api") ||
    normalized.includes("backend") ||
    normalized.includes("数据库") ||
    normalized.includes("服务") ||
    normalized.includes("接口") ||
    normalized.includes("认证") ||
    normalized.includes("鉴权") ||
    normalized.includes("中间件") ||
    normalized.includes("401") ||
    normalized.includes("登录") ||
    normalized.includes("plugin") ||
    normalized.includes("插件") ||
    normalized.includes("opencode") ||
    normalized.includes("workflow") ||
    normalized.includes("工具") ||
    normalized.includes("tool");
  const frontendMatched =
    normalized.includes("ui") ||
    normalized.includes("前端") ||
    normalized.includes("页面") ||
    normalized.includes("组件");
  const writerMatched =
    normalized.includes("整理成文档") ||
    normalized.includes("整理为文档") ||
    normalized.includes("编写文档") ||
    normalized.includes("更新 readme") ||
    normalized.includes("更新readme") ||
    normalized.includes("release") ||
    normalized.includes("说明") ||
    normalized.includes("readme");
  const qaMatched =
    normalized.includes("测试") ||
    normalized.includes("review") ||
    normalized.includes("验证");

  if (orchestrationMatched) {
    return "orchestration";
  }

  if (researcherMatched) {
    return "researcher";
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

function inferComplexity(prompt: string): TaskComplexity {
  const normalized = prompt.toLowerCase();
  if (
    normalized.includes("并且") ||
    normalized.includes("同时") ||
    normalized.includes("以及") ||
    normalized.includes("一起") ||
    normalized.includes("拆解方案")
  ) {
    return "composite";
  }
  if (
    hasAnyKeyword(normalized, [
      "验证",
      "不影响",
      "回归",
      "联调",
      "补齐",
      "完善",
    ])
  ) {
    return "multi_step";
  }
  if (normalized.length > 80) {
    return "multi_step";
  }
  return "simple";
}

function mapDomainToAgent(domain: TaskDomain): DispatchAgent {
  switch (domain) {
    case "backend":
      return "backend";
    case "frontend":
      return "frontend";
    case "writer":
      return "writer";
    case "qa_engineer":
      return "qa_engineer";
    case "researcher":
      return "researcher";
    case "pm":
      return "pm";
    case "orchestration":
    default:
      return "pm";
  }
}

function inferExecutionMode(
  domain: TaskDomain,
  complexity: TaskComplexity,
  stage: WorkflowStage,
): DispatchExecutionMode {
  if (complexity === "composite") {
    return "advisor_then_dispatch";
  }
  if (domain === "researcher") {
    return "serial_handoff";
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

function inferRecommendedAgent(
  domain: TaskDomain,
  complexity: TaskComplexity,
  preferredAgent?: DispatchAgent | null,
): DispatchAgent {
  if (preferredAgent && preferredAgent !== "pm") {
    return preferredAgent;
  }
  return mapDomainToAgent(domain);
}

function inferExpectedNextAgents(
  domain: TaskDomain,
  recommendedAgent: DispatchAgent,
  complexity: TaskComplexity,
): DispatchAgent[] {
  if (recommendedAgent === "commander") {
    return ["pm", "frontend", "writer"];
  }
  if (domain === "researcher") {
    return ["researcher"];
  }
  if (domain === "backend" && complexity !== "simple") {
    return ["backend", "qa_engineer"];
  }
  if (recommendedAgent === "pm") {
    return complexity === "simple"
      ? ["commander"]
      : ["commander", "qa_engineer"];
  }
  return [recommendedAgent];
}

export function analyzeDispatchTask(
  input: AnalyzeDispatchTaskInput,
): TaskAnalysis {
  const domain = inferDomain(input.prompt, input.preferredAgent ?? null);
  const complexity = inferComplexity(input.prompt);
  const recommendedAgent = inferRecommendedAgent(
    domain,
    complexity,
    input.preferredAgent ?? null,
  );
  const executionMode = inferExecutionMode(domain, complexity, input.stage);
  const blockedReasons = input.blockedReasons ?? [];
  const expectedNextAgents = inferExpectedNextAgents(
    domain,
    recommendedAgent,
    complexity,
  );

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
    suggestedStepCount:
      complexity === "simple" ? 1 : complexity === "multi_step" ? 3 : 4,
    specialistCount: new Set(
      expectedNextAgents.filter((agent) => agent !== "pm"),
    ).size,
  };
}
