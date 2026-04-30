import assert from 'node:assert';
import {
  analyzeDispatchTask,
  buildHandoffPacket,
  evaluateDispatchResult,
} from '../dist/index.js';
import { buildExecutablePrompt } from '../dist/orchestrator/prompts.js';
import { buildDispatchCommand } from '../dist/orchestrator/plan.js';
import {
  formatEvaluationLines,
  formatHandoffPacketLines,
  formatLoopEvaluationLines,
  formatNextDispatchHintLines,
  formatTaskAnalysisLines,
} from '../dist/server/tools/dispatch-tools.js';

async function testPublicLoopExports() {
  assert.strictEqual(typeof analyzeDispatchTask, 'function');
  assert.strictEqual(typeof buildHandoffPacket, 'function');
  assert.strictEqual(typeof evaluateDispatchResult, 'function');
}

async function testAnalyzerRouting() {
  const writerTask = analyzeDispatchTask({
    prompt: '帮我补 README 的安装说明',
    stage: 'development',
    blockedReasons: [],
  });
  assert.strictEqual(writerTask.domain, 'writer');
  assert.strictEqual(writerTask.recommendedAgent, 'writer');
  assert.strictEqual(writerTask.executionMode, 'single_agent');

  const backendTask = analyzeDispatchTask({
    prompt: '修复认证接口 401 并验证不影响现有登录流程',
    stage: 'development',
    blockedReasons: [],
  });
  assert.strictEqual(backendTask.domain, 'backend');
  assert.ok(backendTask.expectedNextAgents.includes('qa_engineer'));

  const orchestrationTask = analyzeDispatchTask({
    prompt: '把 onboarding 流程的前端实现、说明文档和拆解方案一起补齐',
    stage: 'plan_ready',
    blockedReasons: [],
  });
  assert.strictEqual(orchestrationTask.recommendedAgent, 'commander');
  assert.strictEqual(orchestrationTask.needsDecomposition, true);
  assert.strictEqual(orchestrationTask.executionMode, 'advisor_then_dispatch');
}

async function testHandoffPacket() {
  const analysis = analyzeDispatchTask({
    prompt: '修复认证接口 401 并确认不影响现有登录流程',
    stage: 'development',
    blockedReasons: [],
  });

  const backendPacket = buildHandoffPacket({
    prompt: '修复认证接口 401 并确认不影响现有登录流程',
    targetAgent: 'backend',
    analysis,
  });

  assert.strictEqual(backendPacket.targetAgent, 'backend');
  assert.ok(backendPacket.acceptanceCriteria.length > 0);
  assert.ok(backendPacket.returnFormat.some((item) => item.includes('验证')));
  assert.strictEqual(backendPacket.nextStepHint, 'backend');

  const structuredPrompt = buildExecutablePrompt(
    'backend',
    '修复认证接口 401 并确认不影响现有登录流程',
    backendPacket,
  );

  assert.ok(structuredPrompt.includes('【任务目标】'));
  assert.ok(structuredPrompt.includes('【任务背景】'));
  assert.ok(structuredPrompt.includes('【验收标准】'));
  assert.ok(structuredPrompt.includes('【回传格式】'));
}

async function testDispatchCommandIncludesHandoffPacket() {
  const projectDir = process.cwd();
  const dispatch = buildDispatchCommand(
    projectDir,
    '修复认证接口 401 并确认不影响现有登录流程',
  );

  assert.ok(dispatch.handoffPacket);
  assert.ok(dispatch.executablePrompt.includes('【任务目标】'));

  const analysisLines = formatTaskAnalysisLines(dispatch.analysis);
  const handoffLines = formatHandoffPacketLines(dispatch.handoffPacket);

  assert.ok(
    analysisLines.some((line) =>
      line.includes(`domain=${dispatch.analysis.domain}`),
    ),
  );
  assert.ok(
    analysisLines.some((line) =>
      line.includes(`recommended=${dispatch.analysis.recommendedAgent}`),
    ),
  );
  assert.ok(
    handoffLines.some((line) =>
      line.includes(`target=${dispatch.handoffPacket.targetAgent}`),
    ),
  );
  assert.ok(handoffLines.some((line) => line.includes('handoff acceptance:')));
}

async function testEvaluator() {
  const analysis = analyzeDispatchTask({
    prompt: '修复认证接口 401 并确认不影响现有登录流程',
    stage: 'development',
    blockedReasons: [],
  });
  const packet = buildHandoffPacket({
    prompt: '修复认证接口 401 并确认不影响现有登录流程',
    targetAgent: 'backend',
    analysis,
  });

  const needsVerification = evaluateDispatchResult({
    packet,
    exitCode: 0,
    stdout: '已修复 401，已更新认证逻辑，但尚未执行验证命令',
    stderr: '',
  });
  assert.strictEqual(needsVerification.status, 'needs_verification');
  assert.strictEqual(needsVerification.recommendedNextAgent, 'qa_engineer');

  const done = evaluateDispatchResult({
    packet,
    exitCode: 0,
    stdout:
      '已修复 401，并执行 npm run build 与 node test/workflow-redesign.test.mjs 验证通过',
    stderr: '',
  });
  assert.strictEqual(done.status, 'done');

  const commanderPacket = buildHandoffPacket({
    prompt: '拆解 onboarding 流程并给出后续分派建议',
    targetAgent: 'commander',
    analysis: analyzeDispatchTask({
      prompt: '拆解 onboarding 流程并给出后续分派建议',
      stage: 'plan_ready',
      blockedReasons: [],
    }),
  });
  const commanderResult = evaluateDispatchResult({
    packet: commanderPacket,
    exitCode: 0,
    stdout: '已完成任务拆解，建议下一步由 PM 决定派发顺序',
    stderr: '',
  });
  assert.strictEqual(commanderResult.status, 'partial');
  assert.strictEqual(commanderResult.recommendedNextAgent, 'pm');
  assert.strictEqual(commanderResult.recommendedNextAction, 'continue-development');
  assert.notStrictEqual(commanderResult.status, 'done');

  const partial = evaluateDispatchResult({
    packet,
    exitCode: 2,
    stdout: '',
    stderr: 'command failed',
  });
  assert.strictEqual(partial.status, 'partial');
  assert.ok(partial.gaps.includes('命令返回非 0 exitCode'));

  const evaluationLines = formatEvaluationLines(needsVerification);
  assert.ok(
    evaluationLines.some((line) => line.includes('evaluation status: needs_verification')),
  );
  assert.ok(
    evaluationLines.some((line) => line.includes('recommended next agent: qa_engineer')),
  );

  const nextHintLines = formatNextDispatchHintLines(needsVerification);
  assert.ok(
    nextHintLines.some((line) => line.includes('next dispatch hint: qa_engineer/run-code-review')),
  );

  const commanderHintLines = formatNextDispatchHintLines(commanderResult);
  assert.ok(
    commanderHintLines.some((line) => line.includes('next dispatch hint: pm/continue-development')),
  );

  const loopEvaluationLines = formatLoopEvaluationLines(needsVerification);
  assert.ok(
    loopEvaluationLines.some((line) => line.includes('evaluation status: needs_verification')),
  );
  assert.ok(
    loopEvaluationLines.some((line) => line.includes('next dispatch hint: qa_engineer/run-code-review')),
  );
}

async function runTests() {
  try {
    await testPublicLoopExports();
    await testAnalyzerRouting();
    await testHandoffPacket();
    await testDispatchCommandIncludesHandoffPacket();
    await testEvaluator();
    console.log('dispatch quality loop public exports ready');
  } catch (error) {
    console.error('dispatch quality loop test failed:', error);
    process.exit(1);
  }
}

runTests();
