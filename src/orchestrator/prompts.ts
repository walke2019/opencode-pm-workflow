import type { DispatchAgent } from "../core/types.js";
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
};

export function getExecutableAgent(
  agent: DispatchAgent,
  dispatchMap: Partial<
    Record<DispatchAgent, string>
  > = DEFAULT_DISPATCH_AGENT_MAP,
) {
  return dispatchMap[agent] || DEFAULT_DISPATCH_AGENT_MAP[agent] || agent;
}

export function buildExecutablePrompt(agent: DispatchAgent, prompt: string) {
  let roleContext = "";
  let roleTitle = "";

  switch (agent) {
    case "commander":
    case "plan":
    case "build":
      roleTitle = "【总指挥·诸葛亮】";
      roleContext =
        "你现在是神机妙算的诸葛亮。请发挥你任务拆解与全局调度的专长，指派最合适的将领执行以下军令。";
      break;
    case "pm":
      roleTitle = "【主协调·曹操】";
      roleContext =
        "你现在是雄才大略的曹操。请以敏锐的洞察力辨明形势，确定目标与边界，下达清晰的决策指令。";
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
    default:
      roleTitle = "【专业执行官】";
      roleContext = `你现在是一名专业的执行官，负责高效完成以下 pm-workflow 任务。`;
  }

  return `
${roleTitle}
${roleContext}

【核心任务】
${prompt}

【执行要求】
1. 严格遵循项目既有的代码规范与技术栈。
2. 优先执行，如有重大疑虑再行请示。
3. 过程务必清晰，结果务必可验证。
`.trim();
}

export function buildDispatchCommandStrings(
  sessionID: string | null | undefined,
  executableAgent: ReturnType<typeof getExecutableAgent>,
  executablePrompt: string,
) {
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
