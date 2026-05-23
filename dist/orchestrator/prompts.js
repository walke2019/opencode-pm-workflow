import { escapePrompt } from "../core/recovery.js";
const DEFAULT_DISPATCH_AGENT_MAP = {
    commander: "commander",
    advisor: "advisor",
    backendcoder: "backendcoder",
    designer: "designer",
    fixer: "fixer",
    writer: "writer",
};
export function getExecutableAgent(agent, dispatchMap = DEFAULT_DISPATCH_AGENT_MAP) {
    return dispatchMap[agent] || DEFAULT_DISPATCH_AGENT_MAP[agent] || agent;
}
export function resolveAgentInvocationSemantics(_agentName, mode) {
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
function renderListSection(title, items) {
    if (items.length === 0) {
        return "";
    }
    const content = items
        .map((item, index) => `${index + 1}. ${item}`)
        .join("\n");
    return `${title}\n${content}`;
}
function renderScopeSection(scope) {
    const lines = [];
    if (scope.do.length > 0) {
        lines.push(`应做：${scope.do.join("；")}`);
    }
    if (scope.dont.length > 0) {
        lines.push(`不做：${scope.dont.join("；")}`);
    }
    return lines.length > 0 ? `【处理范围】\n${lines.join("\n")}` : "";
}
/**
 * 渲染量化分派指引（仅多候选场景）。
 *
 * 输出紧凑的卡片格式，让被 handoff 的 agent 一眼看出：
 * - 自己（target）的角色定位、能力强项、不该做的事
 * - 候选备选 agent 的速度/成本/质量对比
 * 从而能更准确决定"是否需要再委派给别的 agent"，降低二次分派率。
 */
function renderAgentStatsSection(stats) {
    if (!stats || stats.length === 0)
        return "";
    const cards = stats.map((card, index) => {
        const lines = [
            `${index + 1}. ${card.agent} · ${card.role}`,
            `   - 速度：${card.speed}；成本：${card.cost}；质量：${card.quality}`,
        ];
        if (card.delegateWhen.length > 0) {
            lines.push(`   - 适合：${card.delegateWhen.join("；")}`);
        }
        if (card.dontDelegateWhen.length > 0) {
            lines.push(`   - 不适合：${card.dontDelegateWhen.join("；")}`);
        }
        if (card.ruleOfThumb) {
            lines.push(`   - 经验法则：${card.ruleOfThumb}`);
        }
        return lines.join("\n");
    });
    return `【角色对比（用于判断是否需要再委派）】\n${cards.join("\n")}`;
}
export function renderAgentHandoffPrompt(agent, packet) {
    const sections = [
        `【任务目标】\n${packet.mission}`,
        renderListSection("【关键背景】", packet.context),
        `【任务类型】\n${packet.taskType}`,
        renderScopeSection(packet.scope),
        renderListSection("【相关对象】", packet.artifacts),
        renderListSection("【约束条件】", packet.constraints),
        renderListSection("【验收标准】", packet.acceptance),
        renderListSection("【交付物】", packet.deliverables),
        renderAgentStatsSection(packet.agentStats),
        renderListSection("【回传格式】", packet.responseFormat),
    ].filter(Boolean);
    if (packet.nextStepHint) {
        sections.push(`【下一步建议】\n1. 优先同步给 ${packet.nextStepHint}`);
    }
    sections.push(`【执行角色】\n当前执行 agent: ${agent}`);
    return sections.join("\n\n");
}
export function buildExecutablePrompt(agent, prompt, packet) {
    let roleContext = "";
    let roleTitle = "";
    switch (agent) {
        case "advisor":
            roleTitle = "【调研拆解顾问】";
            roleContext =
                "你是 pm-workflow 的调研拆解顾问。负责调研资料、对比方案、识别风险、把复杂任务拆成清晰的推进步骤，并给出可被 commander 直接拿来分派的拆解结果与决策建议。先澄清疑虑，再划定边界，最后输出调研 + 拆解 + 风险 + 建议四段。不直接承担实现工作。";
            break;
        case "commander":
            roleTitle = "【主协调官】";
            roleContext =
                "你是 pm-workflow 的主协调官。负责快速压缩需求，确定目标、边界、todo、验收标准与分派路径；随后直接推进开发、测试、发布摘要。你表达直接、务实、清晰，重视结果与验证。";
            break;
        case "backendcoder":
            roleTitle = "【后端工程师】";
            roleContext =
                "你是 pm-workflow 的后端工程师。专注于 API、数据库、服务逻辑与性能优化。追求代码质量与架构清晰。";
            break;
        case "designer":
            roleTitle = "【设计师】";
            roleContext =
                "你是 pm-workflow 的设计师。负责 UI 草图、原型、高保真页面、前端代码、交互、图像生成；保证响应式、可访问性与视觉一致性。";
            break;
        case "fixer":
            roleTitle = "【测试与发布】";
            roleContext =
                "你是 pm-workflow 的 fixer agent。优先跑测试、type check、回归验证；遇到失败要定位并修复 bug；同时负责打包、版本号、构建产物、CI/CD 与发布前验收。";
            break;
        case "writer":
            roleTitle = "【文档撰稿人】";
            roleContext =
                "你是 pm-workflow 的 writer agent。负责文档撰写、README、API 文档、代码注释、发布说明、ADR、用户可读说明。表达清晰、结构稳定、术语一致；只动文档与注释，不动业务代码。";
            break;
        default:
            roleTitle = "【专业执行官】";
            roleContext = `你现在是一名专业的执行官，负责高效完成以下 pm-workflow 任务。`;
    }
    const taskBody = packet
        ? renderAgentHandoffPrompt(agent, packet)
        : `【核心任务】\n${prompt}`;
    const executionRequirements = agent === "advisor"
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
export function buildDispatchCommandStrings(sessionID, executableAgent, executablePrompt, invocation) {
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
