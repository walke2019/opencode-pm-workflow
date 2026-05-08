import type {
  AgentInvocationMode,
  DispatchAgent,
  DispatchInvocationSemantics,
  HandoffPacket,
} from "../core/types.js";
import { escapePrompt } from "../core/recovery.js";

const DEFAULT_DISPATCH_AGENT_MAP: Partial<Record<DispatchAgent, string>> = {
  plan: "commander",
  build: "commander",
  pm: "pm",
  qa_engineer: "qa_engineer",
  writer: "writer",
  frontend: "frontend",
  commander: "commander",
  backend: "backend",
  researcher: "researcher",
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
  agent: DispatchAgent,
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
  agent: DispatchAgent,
  prompt: string,
  packet?: HandoffPacket,
) {
  let roleContext = "";
  let roleTitle = "";

  switch (agent) {
    case "commander":
    case "plan":
    case "build":
      roleTitle = "【拆解顾问·诸葛亮】";
      roleContext =
        "你现在是神机妙算的诸葛亮。请发挥你在任务拆解、风险识别与顾问式支持方面的专长，为 PM 提供清晰的分派建议与推进顺序。";
      break;
    case "pm":
      roleTitle = "【主协调·曹操】";
      roleContext =
        "你现在是雄才大略的曹操。请以敏锐的洞察力辨明形势，快速压缩需求，确定目标、边界、todo、验收标准与专业 subagent 分派路径。";
      break;
    case "backend":
      roleTitle = "【后端战将·吕布】";
      roleContext =
        "你现在是战力惊人的吕布。请发挥你攻坚克难的本领，拿下所有 API 与逻辑难点，确保架构稳如泰山。";
      break;
    case "frontend":
      roleTitle = "【前端视觉官·貂蝉】";
      roleContext =
        "你现在是审美卓越的貂蝉。请用你细腻的心思雕琢界面，实现极致的交互体验与美学平衡。";
      break;
    case "qa_engineer":
      roleTitle = "【常胜校验官·赵云】";
      roleContext =
        "你现在是赵云（Zhao Yun），一位稳健、可靠、纪律严明的校验官。请细致审查各项变更，优先识别 bug、回归风险、安全隐患与遗漏测试，确保交付像子龙出阵一样干净利落、可进可退。";
      break;
    case "writer":
      roleTitle = "【檄文执笔官·陈琳】";
      roleContext =
        "你现在是陈琳（Chen Lin），一位文辞敏捷、条理分明的执笔官。请负责整理发布说明、变更摘要、交付文档与对外说明，确保文字准确、结构清楚、重点鲜明。";
      break;
    case "researcher":
      roleTitle = "【资料调研官】";
      roleContext =
        "你现在是一名资料调研官。请围绕问题快速收集资料、调研官方方案、比对可选路径，并在必要时继续搜索权威来源，输出可验证的结论与参考依据。你不直接承担实现工作，也不替代开发、修复或交付执行；除非任务明确要求你亲自实现，否则应以调研结论、风险提示和建议路径支持后续执行。";
      break;
    default:
      roleTitle = "【专业执行官】";
      roleContext = `你现在是一名专业的执行官，负责高效完成以下 pm-workflow 任务。`;
  }

  const taskBody = packet
    ? renderAgentHandoffPrompt(agent, packet)
    : `【核心任务】\n${prompt}`;

  const executionRequirements =
    agent === "researcher"
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
