import type {
  DispatchAgent,
  HandoffPacket,
  TaskAnalysis,
} from "../core/types.js";

export interface BuildHandoffPacketInput {
  prompt: string;
  analysis: TaskAnalysis;
  targetAgent?: DispatchAgent;
}

function buildBasePacket(
  input: BuildHandoffPacketInput,
  targetAgent: DispatchAgent,
): HandoffPacket {
  return {
    goal: input.prompt,
    why:
      input.analysis.rationale.join("；") ||
      "根据当前任务分析生成结构化交接包。",
    taskType: `${input.analysis.domain}:${input.analysis.complexity}`,
    targetAgent,
    scope: ["只处理当前任务直接相关内容"],
    inputs: [input.prompt],
    constraints: ["遵循现有项目结构", "不要擅自扩大范围"],
    acceptanceCriteria: ["输出结果与任务目标直接对应", "输出必须可验证"],
    deliverables: ["执行结果摘要"],
    doneDefinition: ["明确说明完成项、未完成项与验证情况"],
    returnFormat: [
      "summary: 做了什么",
      "verification: 如何验证",
      "risk: 剩余风险",
    ],
    nextStepHint: input.analysis.expectedNextAgents[0],
  };
}

function validatePacket(packet: HandoffPacket): void {
  if (
    !packet.goal ||
    !packet.inputs.length ||
    !packet.acceptanceCriteria.length
  ) {
    throw new Error("handoff packet missing required fields");
  }
}

export function buildHandoffPacket(
  input: BuildHandoffPacketInput,
): HandoffPacket {
  const targetAgent = input.targetAgent ?? input.analysis.recommendedAgent;
  const packet = buildBasePacket(input, targetAgent);

  if (input.analysis.risks.length > 0) {
    packet.constraints.push(...input.analysis.risks);
  }

  if (targetAgent === "backend") {
    packet.deliverables = ["代码修改摘要", "验证命令", "风险说明"];
    packet.acceptanceCriteria.push("说明接口或逻辑影响范围");
    packet.returnFormat.push("verification: 提供测试、构建或回归检查命令");
  }

  if (targetAgent === "frontend") {
    packet.deliverables = ["页面或组件修改摘要", "交互说明", "验收方式"];
    packet.acceptanceCriteria.push("说明 UI/交互影响范围");
  }

  if (targetAgent === "writer") {
    packet.deliverables = ["文档变更摘要", "目标读者说明", "章节清单"];
    packet.acceptanceCriteria.push("文档结构清晰且与代码行为一致");
  }

  if (targetAgent === "qa_engineer") {
    packet.deliverables = ["测试结论", "风险列表", "是否通过建议"];
    packet.acceptanceCriteria.push("明确列出验证范围与未覆盖项");
    packet.returnFormat.push("verification: 列出执行过的检查项");
  }

  if (targetAgent === "commander") {
    packet.deliverables = ["任务拆解建议", "推荐角色顺序", "风险排序"];
    packet.constraints.push("只提供建议，不直接取代 PM 做最终决策");
  }

  validatePacket(packet);

  return packet;
}
