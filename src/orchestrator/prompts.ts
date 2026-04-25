import type { DispatchAgent } from "../core/types.js";
import { escapePrompt } from "../core/recovery.js";

const DEFAULT_DISPATCH_AGENT_MAP: Partial<Record<DispatchAgent, string>> = {
  plan: "plan",
  build: "build",
  pm: "pm_workflow_caocao",
  qa_engineer: "pm_workflow_qa",
  writer: "pm_workflow_writer",
};

export function getExecutableAgent(
  agent: DispatchAgent,
  dispatchMap: Partial<Record<DispatchAgent, string>> = DEFAULT_DISPATCH_AGENT_MAP,
) {
  return dispatchMap[agent] || DEFAULT_DISPATCH_AGENT_MAP[agent] || agent;
}

export function buildExecutablePrompt(agent: DispatchAgent, prompt: string) {
  if (agent === "pm") {
    return `以产品经理视角处理以下 pm-workflow 任务：${prompt}`;
  }

  if (agent === "qa_engineer") {
    return `以 QA/code-review 视角处理以下 pm-workflow 任务：${prompt}`;
  }

  if (agent === "writer") {
    return `以文档写作者视角处理以下 pm-workflow 任务：${prompt}`;
  }

  return prompt;
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
