import type {
  DispatchAgent,
  HandoffPacket,
  TaskAnalysis,
} from "../core/types.js";
import { pickAgentStats } from "../core/agent-stats.js";

export interface BuildHandoffPacketInput {
  prompt: string;
  analysis: TaskAnalysis;
  targetAgent?: DispatchAgent;
}

function uniqueNonEmpty(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function limitItems(items: string[], limit: number): string[] {
  return uniqueNonEmpty(items).slice(0, limit);
}

function compactMission(prompt: string): string {
  const firstLine =
    prompt
      .split(/\n+/)
      .map((line) => line.trim())
      .find((line) => line && !line.includes("日志片段")) ??
    "请完成当前分派任务";
  return firstLine;
}

function extractArtifactHints(prompt: string): string[] {
  const matches = prompt.match(/[\w./-]+\.(ts|tsx|js|jsx|md|json)/g) || [];
  const fileHints = limitItems(matches.map((item) => `相关文件：${item}`), 6);

  if (fileHints.length > 0) {
    return fileHints;
  }

  return limitItems([`相关任务：${compactMission(prompt)}`], 6);
}

function buildBasePacket(
  input: BuildHandoffPacketInput,
  targetAgent: DispatchAgent,
): HandoffPacket {
  const mission = compactMission(input.prompt);
  const context = limitItems(
    [...input.analysis.rationale, "根据当前任务分析生成结构化压缩交接包。"],
    4,
  );

  return {
    mission,
    context,
    taskType: `${input.analysis.domain}:${input.analysis.complexity}`,
    targetAgent,
    scope: {
      do: limitItems(["只处理当前任务直接相关内容"], 3),
      dont: limitItems(
        [
          "不要擅自扩大范围",
          "不要做大规模无关重构",
          "不要在需求层停留过久",
          "不要扩展到其他页面",
        ],
        3,
      ),
    },
    artifacts: extractArtifactHints(input.prompt),
    constraints: limitItems(["遵循现有项目结构"], 3),
    acceptance: limitItems(
      [
        "输出结果与任务目标直接对应",
        "输出必须可验证",
        "明确说明完成项与未完成项",
      ],
      3,
    ),
    deliverables: ["执行结果摘要", "todo 完成/blocked 状态"],
    responseFormat: [
      "summary: 做了什么",
      "verification: 如何验证 / 未验证原因",
      "risk: 剩余风险或 blocked 原因",
    ],
    nextStepHint: input.analysis.expectedNextAgents[0],
  };
}

function applyAgentSpecificContext(packet: HandoffPacket): HandoffPacket {
  switch (packet.targetAgent) {
    case "pm_frontend":
      packet.scope.do = limitItems(
        [...packet.scope.do, "只处理相关页面、组件与交互边界"],
        3,
      );
      packet.acceptance = limitItems(
        [...packet.acceptance, "说明 UI/交互影响范围"],
        3,
      );
      packet.deliverables = ["页面或组件修改摘要", "交互说明", "验收方式"];
      packet.scope.dont = limitItems(
        ["不要扩展到其他页面", "不要擅自扩大范围", "不要做大规模无关重构"],
        3,
      );
      break;
    case "pm_reviewer":
      packet.scope.do = limitItems(
        [...packet.scope.do, "聚焦验证范围、未覆盖项与回归风险"],
        3,
      );
      packet.acceptance = limitItems(
        [...packet.acceptance, "明确列出验证范围与未覆盖项"],
        3,
      );
      packet.deliverables = ["测试结论", "风险列表", "是否通过建议"];
      break;
    case "pm_advisor":
      packet.scope.do = limitItems(
        [...packet.scope.do, "只做任务拆解、角色顺序与风险排序建议"],
        3,
      );
      packet.scope.dont = limitItems(
        [...packet.scope.dont, "不要直接取代 PM 做最终决策"],
        3,
      );
      packet.deliverables = ["任务拆解建议", "推荐角色顺序", "风险排序"];
      packet.constraints = limitItems(
        [...packet.constraints, "只提供任务拆解、角色顺序与风险排序建议"],
        3,
      );
      break;
    case "pm_backend":
      packet.acceptance = limitItems(
        [...packet.acceptance, "说明接口或逻辑影响范围"],
        3,
      );
      packet.deliverables = ["代码修改摘要", "验证命令", "风险说明"];
      break;
  }

  return packet;
}

function validatePacket(packet: HandoffPacket): void {
  if (!packet.mission || !packet.context.length || !packet.acceptance.length || packet.responseFormat.length !== 3) {
    throw new Error("handoff packet missing required compact fields");
  }
}

export function buildHandoffPacket(
  input: BuildHandoffPacketInput,
): HandoffPacket {
  const targetAgent = input.targetAgent ?? input.analysis.recommendedAgent;
  const packet = applyAgentSpecificContext(buildBasePacket(input, targetAgent));

  if (input.analysis.risks.length > 0) {
    packet.constraints.push(...input.analysis.risks);
    packet.constraints = limitItems(packet.constraints, 3);
  }

  // 量化分派指引：仅在多候选场景注入，避免单候选时浪费 token。
  const stats = pickAgentStats({
    targetAgent,
    fallbackAgents: input.analysis.fallbackAgents,
  });
  if (stats) {
    packet.agentStats = stats;
  }

  validatePacket(packet);

  return packet;
}
