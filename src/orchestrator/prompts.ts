import type {
  AgentInvocationMode,
  DispatchAgent,
  DispatchInvocationSemantics,
  HandoffPacket,
} from "../core/types.js";
import { escapePrompt } from "../core/recovery.js";

const DEFAULT_DISPATCH_AGENT_MAP: Partial<Record<DispatchAgent, string>> = {
  plan: "pm_advisor",
  build: "pm_backend",
  pm: "pm_lead",
  qa_engineer: "pm_reviewer",
  writer: "pm_reviewer",
  frontend: "pm_frontend",
  commander: "pm_advisor",
  backend: "pm_backend",
  researcher: "pm_researcher",
};

export function getExecutableAgent(
  agent: DispatchAgent,
  dispatchMap: Partial<
    Record<DispatchAgent, string>
  > = DEFAULT_DISPATCH_AGENT_MAP,
) {
  return dispatchMap[agent] || DEFAULT_DISPATCH_AGENT_MAP[agent] || agent;
}

export function resolveAgentInvocationSemantics(
  _agentName: string,
  mode: AgentInvocationMode,
): DispatchInvocationSemantics {
  if (mode === "subagent") {
    return {
      mode,
      supportsDirectRun: false,
      requiresTaskPermission: true,
    };
  }

  return {
    mode,
    supportsDirectRun: true,
    requiresTaskPermission: false,
  };
}

function renderListSection(title: string, items: string[]) {
  if (items.length === 0) {
    return "";
  }

  const content = items
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  return `${title}\n${content}`;
}

function renderScopeSection(scope: HandoffPacket["scope"]) {
  const lines: string[] = [];

  if (scope.do.length > 0) {
    lines.push(`应做：${scope.do.join("；")}`);
  }

  if (scope.dont.length > 0) {
    lines.push(`不做：${scope.dont.join("；")}`);
  }

  return lines.length > 0 ? `【处理范围】\n${lines.join("\n")}` : "";
}

export function renderAgentHandoffPrompt(
  agent:
    | DispatchAgent
    | "pm_advisor"
    | "pm_lead"
    | "pm_backend"
    | "pm_frontend"
    | "pm_reviewer"
    | "pm_researcher",
  packet: HandoffPacket,
) {
  const sections = [
    `【任务目标】\n${packet.mission}`,
    renderListSection("【关键背景】", packet.context),
    `【任务类型】\n${packet.taskType}`,
    renderScopeSection(packet.scope),
    renderListSection("【相关对象】", packet.artifacts),
    renderListSection("【约束条件】", packet.constraints),
    renderListSection("【验收标准】", packet.acceptance),
    renderListSection("【交付物】", packet.deliverables),
    renderListSection("【回传格式】", packet.responseFormat),
  ].filter(Boolean);

  if (packet.nextStepHint) {
    sections.push(`【下一步建议】\n1. 优先同步给 ${packet.nextStepHint}`);
  }

  sections.push(`【执行角色】\n当前执行 agent: ${agent}`);

  return sections.join("\n\n");
}

export function buildExecutablePrompt(
  agent:
    | DispatchAgent
    | "pm_advisor"
    | "pm_lead"
    | "pm_backend"
    | "pm_frontend"
    | "pm_reviewer"
    | "pm_researcher",
  prompt: string,
  packet?: HandoffPacket,
) {
  let roleContext = "";
  let roleTitle = "";

  switch (agent) {
    case "pm_advisor":
    case "plan":
    case "build":
      roleTitle = "【拆解顾问】";
      roleContext =
        "你是 pm-workflow 的拆解顾问。擅长将复杂任务拆解为清晰的推进步骤，识别风险并提供顾问式支持。先澄清疑虑，再划定边界，最后给出合适的分派建议与推进顺序。";
      break;
    case "pm_lead":
    case "pm":
      roleTitle = "【主协调官】";
      roleContext =
        "你是 pm-workflow 的主协调官。负责快速压缩需求，确定目标、边界、todo、验收标准与分派路径；随后直接推进开发、测试、发布摘要。你表达直接、务实、清晰，重视结果与验证。";
      break;
    case "pm_backend":
    case "backend":
      roleTitle = "【后端执行】";
      roleContext =
        "你是 pm-workflow 的后端 agent。专注于 API、数据库、服务逻辑与性能优化。追求代码质量与架构清晰。";
      break;
    case "pm_frontend":
    case "frontend":
      roleTitle = "【前端执行】";
      roleContext =
        "你是 pm-workflow 的前端 agent。负责前端实现、UI/UX、组件拆分、响应式布局、可访问性和视觉一致性。";
      break;
    case "pm_reviewer":
    case "qa_engineer":
    case "writer":
      roleTitle = "【审查与文档】";
      roleContext =
        "你是 pm-workflow 的 reviewer agent。优先检查 bug、回归风险、安全问题和缺失测试；同时负责整理发布说明、变更摘要与用户可读文档。";
      break;
    case "pm_researcher":
    case "researcher":
      roleTitle = "【资料调研官】";
      roleContext =
        "你是 pm-workflow 的 researcher agent。负责资料检索、官方方案调研、事实核查、备选路径比较与参考依据整理。不直接承担实现工作。";
      break;
    default:
      roleTitle = "【专业执行官】";
      roleContext = `你现在是一名专业的执行官，负责高效完成以下 pm-workflow 任务。`;
  }

  const taskBody = packet
    ? renderAgentHandoffPrompt(agent, packet)
    : `【核心任务】\n${prompt}`;

  const executionRequirements =
    agent === "pm_researcher" || agent === "researcher"
      ? [
          "1. 优先查找官方文档、权威资料或一手来源；结论需尽量附参考依据。",
          "2. 先收集资料、再比对方案与风险，不默认进入开发实现、测试验证或发布摘要。",
          "3. 如信息不足，明确列出缺口、假设与建议的下一步搜索/验证方向。",
          "4. Todo 终结标准：每个 todo 必须完成，或标注 blocked 并说明原因。",
          "5. 过程务必清晰，结果务必可验证；输出应便于后续 agent 接手执行。",
        ].join("\n")
      : [
          "1. 严格遵循 OpenCode 插件/扩展规范、项目既有代码规范与技术栈。",
          "2. 不在需求层停留过久；先压缩需求，再进入开发实现、测试验证和发布摘要。",
          "3. Workflow 标准：需求压缩 → 开发实现 → 测试验证 → 发布摘要。",
          "4. Todo 终结标准：每个 todo 必须完成，或标注 blocked 并说明原因。",
          "5. 过程务必清晰，结果务必可验证；涉及代码时给出验证命令。",
        ].join("\n");

  return `
${roleTitle}
${roleContext}

${taskBody}

【执行要求】
${executionRequirements}
`.trim();
}

export function buildDispatchCommandStrings(
  sessionID: string | null | undefined,
  executableAgent: ReturnType<typeof getExecutableAgent>,
  executablePrompt: string,
  invocation?: DispatchInvocationSemantics,
) {
  if (invocation && !invocation.supportsDirectRun) {
    const commandArgs = sessionID
      ? [
          "task",
          "--session",
          sessionID,
          "--agent",
          executableAgent,
          executablePrompt,
        ]
      : ["task", "--agent", executableAgent, executablePrompt];

    const command = sessionID
      ? `opencode task --session ${sessionID} --agent ${executableAgent} \"${escapePrompt(executablePrompt)}\"`
      : `opencode task --agent ${executableAgent} \"${escapePrompt(executablePrompt)}\"`;

    return {
      command,
      commandArgs,
    };
  }

  const command = sessionID
    ? `opencode run --session ${sessionID} --agent ${executableAgent} "${escapePrompt(executablePrompt)}"`
    : `opencode run --agent ${executableAgent} "${escapePrompt(executablePrompt)}"`;

  const commandArgs = sessionID
    ? [
        "run",
        "--session",
        sessionID,
        "--agent",
        executableAgent,
        executablePrompt,
      ]
    : ["run", "--agent", executableAgent, executablePrompt];

  return {
    command,
    commandArgs,
  };
}
