export const AGENT_STATS_LIBRARY = Object.freeze({
    pm_lead: {
        agent: "pm_lead",
        role: "主协调官",
        speed: "1x（基准）",
        cost: "1x（基准）",
        quality: "决策与编排质量基准",
        delegateWhen: [
            "需要跨角色串联的复合任务",
            "需求模糊、需要先压缩再分派",
            "已有阻塞，需要重新规划路径",
        ],
        dontDelegateWhen: [
            "任务边界清晰、可直接落到单一专业角色",
            "纯执行类、无需再做规划判断",
        ],
        ruleOfThumb: "需要拍板和编排时找它，纯执行交给专业 agent",
    },
    pm_advisor: {
        agent: "pm_advisor",
        role: "拆解顾问",
        speed: "1.5x faster（仅做拆解，不做执行）",
        cost: "0.6x（仅推理，不动文件）",
        quality: "拆解与风险识别质量高于纯 PM",
        delegateWhen: [
            "需要先把模糊任务拆成清晰步骤",
            "对推进顺序、风险排序拿不准",
        ],
        dontDelegateWhen: [
            "任务已经被拆得很清楚",
            "需要的是真正动手而不是拆解",
        ],
        ruleOfThumb: "卡在'怎么拆'时找它，已经在'怎么做'就别再拆",
    },
    pm_backend: {
        agent: "pm_backend",
        role: "后端执行",
        speed: "1x",
        cost: "1x",
        quality: "API/数据库/服务逻辑/性能 高于通用 agent",
        delegateWhen: [
            "需要写或改 API、服务、数据库、鉴权",
            "性能调优、数据流梳理、后端架构落地",
        ],
        dontDelegateWhen: [
            "任务核心是 UI/交互/前端组件",
            "任务核心是写文档或测试",
        ],
        ruleOfThumb: "动接口/数据/服务找它，UI/前端别派给它",
    },
    pm_frontend: {
        agent: "pm_frontend",
        role: "前端执行",
        speed: "1x",
        cost: "1x",
        quality: "UI/UX/组件/响应式/可访问性 高于通用 agent",
        delegateWhen: [
            "需要落地页面、组件、交互、动效",
            "需要响应式布局、安全区、可访问性",
        ],
        dontDelegateWhen: [
            "任务核心是接口或服务层",
            "任务核心是发布/打包/CI",
        ],
        ruleOfThumb: "改页面/组件/交互找它，后端/打包别派给它",
    },
    pm_reviewer: {
        agent: "pm_reviewer",
        role: "审查与文档",
        speed: "1.2x faster（聚焦验证与文档）",
        cost: "0.8x",
        quality: "测试/回归/审查/发布说明 质量稳定",
        delegateWhen: [
            "需要验证已有改动、补回归用例",
            "需要整理变更摘要、发布说明、用户文档",
        ],
        dontDelegateWhen: [
            "任务核心是新功能实现",
            "任务核心是技术评审或方案选型",
        ],
        ruleOfThumb: "验证或文档化已有改动找它，新建实现别派给它",
    },
    pm_researcher: {
        agent: "pm_researcher",
        role: "资料调研",
        speed: "2x faster（不动文件，仅检索整理）",
        cost: "0.5x（仅 LLM + 检索）",
        quality: "外部资料、官方方案对比、事实核查 质量高",
        delegateWhen: [
            "需要先确认官方文档/最新规范",
            "需要在多种方案间做事实层面的比较",
        ],
        dontDelegateWhen: [
            "任务核心是直接动代码",
            "已经有充足上下文，不需要再调研",
        ],
        ruleOfThumb: "需要查/对比官方资料找它，纯实现别派给它",
    },
});
/**
 * 选取 handoff 量化指引。
 *
 * 规则：
 * - target agent 总是放第一张卡片（让被 handoff 的 agent 立刻看到"我自己的边界"）。
 * - fallback agents 取前 2 个加进来，凑成最多 3 张卡片。
 * - 单候选场景（fallbackAgents 为空）返回 undefined，避免无意义 token 注入。
 */
export function pickAgentStats(input) {
    if (input.fallbackAgents.length === 0) {
        return undefined;
    }
    const seen = new Set();
    const cards = [];
    const tryPush = (agent) => {
        if (seen.has(agent))
            return;
        const card = AGENT_STATS_LIBRARY[agent];
        if (!card)
            return;
        seen.add(agent);
        cards.push(card);
    };
    tryPush(input.targetAgent);
    for (const candidate of input.fallbackAgents) {
        if (cards.length >= 3)
            break;
        tryPush(candidate);
    }
    // 仅当至少有 2 张卡片（target + 1 备选）时才有对比意义。
    if (cards.length < 2) {
        return undefined;
    }
    return cards;
}
