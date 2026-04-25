import { escapePrompt } from "../core/recovery.js";
const DEFAULT_DISPATCH_AGENT_MAP = {
    plan: "plan",
    build: "build",
    pm: "pm_workflow_pm",
    qa_engineer: "pm_workflow_qa",
    writer: "pm_workflow_writer",
};
export function getExecutableAgent(agent, dispatchMap = DEFAULT_DISPATCH_AGENT_MAP) {
    return dispatchMap[agent] || DEFAULT_DISPATCH_AGENT_MAP[agent] || agent;
}
export function buildExecutablePrompt(agent, prompt) {
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
export function buildDispatchCommandStrings(sessionID, executableAgent, executablePrompt) {
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
