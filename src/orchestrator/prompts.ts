import type { DispatchAgent } from "../core/types.js";
import { escapePrompt } from "../core/recovery.js";

export function getExecutableAgent(agent: DispatchAgent) {
  if (agent === "build") return "build" as const;
  return "plan" as const;
}

export function buildExecutablePrompt(agent: DispatchAgent, prompt: string) {
  if (agent === "pm") {
    return `以产品经理视角处理以下 pm-workflow 任务；如需要，可在当前会话中委派给 pm subagent：${prompt}`;
  }

  if (agent === "qa_engineer") {
    return `以 QA/code-review 视角处理以下 pm-workflow 任务；如需要，可在当前会话中委派给 qa_engineer subagent：${prompt}`;
  }

  if (agent === "writer") {
    return `以文档写作者视角处理以下 pm-workflow 任务；如需要，可在当前会话中委派给 writer subagent：${prompt}`;
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
