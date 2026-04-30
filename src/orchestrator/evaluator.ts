import type {
  DispatchAction,
  DispatchAgent,
  EvaluationResult,
  HandoffPacket,
} from "../core/types.js";

export interface EvaluateDispatchResultInput {
  packet: HandoffPacket;
  exitCode: number;
  stdout: string;
  stderr: string;
}

const VERIFICATION_KEYWORDS = ["验证", "test", "build", "review", "通过"];
const NEGATED_VERIFICATION_PHRASES = [
  "尚未验证",
  "未验证",
  "尚未执行验证",
  "未执行验证",
  "尚未执行验证命令",
  "未执行验证命令",
  "未跑测试",
  "没有验证",
  "缺少验证",
  "not verified",
  "no verification",
  "without verification",
  "not tested",
];

function normalizeText(input: EvaluateDispatchResultInput): string {
  return `${input.stdout}\n${input.stderr}`.toLowerCase();
}

function mentionsVerification(text: string): boolean {
  if (NEGATED_VERIFICATION_PHRASES.some((phrase) => text.includes(phrase))) {
    return false;
  }

  return VERIFICATION_KEYWORDS.some((keyword) => text.includes(keyword));
}

function isBlockedText(text: string): boolean {
  return (
    text.includes("阻塞") ||
    text.includes("blocked") ||
    text.includes("等待确认")
  );
}

function inferNextAgent(
  packet: HandoffPacket,
  exitCode: number,
  text: string,
): DispatchAgent | undefined {
  if (exitCode !== 0) {
    return "pm";
  }

  if (packet.targetAgent === "backend" && !mentionsVerification(text)) {
    return "qa_engineer";
  }

  if (packet.targetAgent === "commander") {
    return "pm";
  }

  return undefined;
}

function inferNextAction(
  packet: HandoffPacket,
  exitCode: number,
  text: string,
): DispatchAction | undefined {
  if (isBlockedText(text)) {
    return "blocked";
  }

  if (exitCode !== 0) {
    return "continue-development";
  }

  if (packet.targetAgent === "backend" && !mentionsVerification(text)) {
    return "run-code-review";
  }

  if (packet.targetAgent === "commander") {
    return "continue-development";
  }

  return undefined;
}

function canAutoContinue(
  packet: HandoffPacket,
  exitCode: number,
  text: string,
): boolean {
  if (exitCode !== 0 || isBlockedText(text)) {
    return false;
  }

  if (packet.targetAgent === "commander") {
    return true;
  }

  if (packet.targetAgent === "backend" && !mentionsVerification(text)) {
    return true;
  }

  return false;
}

export function evaluateDispatchResult(
  input: EvaluateDispatchResultInput,
): EvaluationResult {
  const text = normalizeText(input);
  const hasResponse = text.trim().length > 0;

  if (input.exitCode !== 0) {
    return {
      status: "partial",
      summary: "执行未成功完成，需要继续处理失败项。",
      matchedDeliverables: [],
      missingDeliverables: input.packet.deliverables,
      gaps: ["命令返回非 0 exitCode"],
      recommendedNextAgent: inferNextAgent(input.packet, input.exitCode, text),
      recommendedNextAction: inferNextAction(
        input.packet,
        input.exitCode,
        text,
      ),
      canAutoContinue: false,
      autoContinueSafe: false,
    };
  }

  if (!hasResponse) {
    return {
      status: "partial",
      summary: "执行成功但未收到可评估的结果内容。",
      matchedDeliverables: [],
      missingDeliverables: input.packet.deliverables,
      gaps: ["缺少可评估的执行结果内容"],
      recommendedNextAgent: input.packet.targetAgent,
      recommendedNextAction: "blocked",
      canAutoContinue: false,
      autoContinueSafe: false,
    };
  }

  if (isBlockedText(text)) {
    return {
      status: "partial",
      summary: "执行结果显示当前流程被阻塞，需等待外部条件满足。",
      matchedDeliverables: [],
      missingDeliverables: input.packet.deliverables,
      gaps: ["存在明确阻塞信号"],
      recommendedNextAgent: input.packet.targetAgent,
      recommendedNextAction: "blocked",
      canAutoContinue: false,
      autoContinueSafe: false,
    };
  }

  if (input.packet.targetAgent === "backend" && !mentionsVerification(text)) {
    return {
      status: "needs_verification",
      summary: "后端工作已完成，但缺少可验证证据。",
      matchedDeliverables: ["代码修改摘要"],
      missingDeliverables: ["验证命令", "测试结论"],
      gaps: ["尚未提供验证命令或验证结果"],
      recommendedNextAgent: inferNextAgent(input.packet, input.exitCode, text),
      recommendedNextAction: inferNextAction(
        input.packet,
        input.exitCode,
        text,
      ),
      canAutoContinue: canAutoContinue(input.packet, input.exitCode, text),
      autoContinueSafe: canAutoContinue(input.packet, input.exitCode, text),
      nextAutoAction: inferNextAction(input.packet, input.exitCode, text),
    };
  }

  if (input.packet.targetAgent === "commander") {
    return {
      status: "partial",
      summary: "commander 已提供建议，仍需 PM 二次分派。",
      matchedDeliverables: ["任务拆解建议"],
      missingDeliverables: [],
      gaps: ["建议不能直接视为最终完成"],
      recommendedNextAgent: inferNextAgent(input.packet, input.exitCode, text),
      recommendedNextAction: inferNextAction(
        input.packet,
        input.exitCode,
        text,
      ),
      canAutoContinue: canAutoContinue(input.packet, input.exitCode, text),
      autoContinueSafe: canAutoContinue(input.packet, input.exitCode, text),
      nextAutoAction: inferNextAction(input.packet, input.exitCode, text),
    };
  }

  return {
    status: "done",
    summary: "输出与交接包基本一致，可视为当前环节完成。",
    matchedDeliverables: input.packet.deliverables,
    missingDeliverables: [],
    gaps: [],
    recommendedNextAgent: inferNextAgent(input.packet, input.exitCode, text),
    recommendedNextAction: inferNextAction(input.packet, input.exitCode, text),
    canAutoContinue: false,
    autoContinueSafe: false,
  };
}
