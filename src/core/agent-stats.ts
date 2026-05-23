/**
 * Agent 量化分派指引数据。
 *
 * 这是一份**精简的、面向 handoff 多候选场景**的量化能力卡片，灵感取自
 * oh-my-opencode-slim 的 orchestrator AGENT_DESCRIPTIONS（其使用类似
 * "2x faster, 1/2 cost" 的相对量化方式提升 LLM 分派准确率）。
 *
 * 我们的卡片以 `commander` 主协调为基准（相对 1x），其他 agent 用相对值描述
 * 速度/成本/质量；并补充 delegate-when / don't-delegate-when 边界，
 * 让被 handoff 的 agent 能精准决定"是否需要再委派"。
 *
 * 这些卡片只在 handoff packet 存在多候选 agent 时被注入到 prompt，
 * 避免在单候选场景浪费 token。
 */
import type { AgentStatsCard, DispatchAgent } from "./types.js";

export const AGENT_STATS_LIBRARY: Readonly<
  Record<DispatchAgent, AgentStatsCard>
> = Object.freeze({
  commander: {
    agent: "commander",
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
  advisor: {
    agent: "advisor",
    role: "调研拆解顾问",
    speed: "1.5x faster（仅做调研与拆解，不动文件）",
    cost: "0.6x（推理 + 检索为主）",
    quality: "资料调研、方案对比、任务拆解、风险识别 质量稳定",
    delegateWhen: [
      "需要先把模糊任务拆成清晰步骤",
      "需要先确认官方文档/最新规范",
      "需要在多种方案间做事实层面的比较",
      "对推进顺序、风险排序拿不准",
    ],
    dontDelegateWhen: [
      "任务核心是直接动代码",
      "任务已经被拆得很清楚 + 上下文充足",
    ],
    ruleOfThumb: "卡在'调研 / 拆解 / 风险评估'时找它，纯实现别派给它",
  },
  backendcoder: {
    agent: "backendcoder",
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
  designer: {
    agent: "designer",
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
  fixer: {
    agent: "fixer",
    role: "测试与发布",
    speed: "1.2x faster（专注验证与交付）",
    cost: "0.8x",
    quality: "测试/回归/修复/打包/部署 质量稳定",
    delegateWhen: [
      "需要验证已有改动、补回归用例、跑 type check",
      "需要修 bug、做联调、补缺失测试",
      "需要打包、发版本、跑 CI/CD",
    ],
    dontDelegateWhen: [
      "任务核心是新功能实现",
      "任务核心是技术评审或方案选型",
      "任务核心是写文档或发布说明文案",
    ],
    ruleOfThumb: "验证 / 修复 / 发布找它，写新功能或写文档别派给它",
  },
  writer: {
    agent: "writer",
    role: "文档撰写",
    speed: "1.5x faster（聚焦文字创作）",
    cost: "0.6x",
    quality: "README / API 文档 / 发布说明 / ADR 文笔稳定",
    delegateWhen: [
      "需要写 README / API 文档 / 注释",
      "需要整理变更摘要、发布说明、用户文档",
      "需要把决策结果写成 ADR / runbook",
    ],
    dontDelegateWhen: [
      "任务核心是改代码",
      "任务核心是跑测试或跑命令",
    ],
    ruleOfThumb: "写文档找它，跑命令或改代码别派给它",
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
export function pickAgentStats(input: {
  targetAgent: DispatchAgent;
  fallbackAgents: ReadonlyArray<DispatchAgent>;
}): AgentStatsCard[] | undefined {
  if (input.fallbackAgents.length === 0) {
    return undefined;
  }

  const seen = new Set<DispatchAgent>();
  const cards: AgentStatsCard[] = [];

  const tryPush = (agent: DispatchAgent) => {
    if (seen.has(agent)) return;
    const card = AGENT_STATS_LIBRARY[agent];
    if (!card) return;
    seen.add(agent);
    cards.push(card);
  };

  tryPush(input.targetAgent);
  for (const candidate of input.fallbackAgents) {
    if (cards.length >= 3) break;
    tryPush(candidate);
  }

  // 仅当至少有 2 张卡片（target + 1 备选）时才有对比意义。
  if (cards.length < 2) {
    return undefined;
  }
  return cards;
}
