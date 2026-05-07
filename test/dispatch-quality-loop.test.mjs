import assert from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  analyzeDispatchTask,
  buildHandoffPacket,
  evaluateDispatchResult,
} from '../dist/index.js';
import { buildExecutablePrompt } from '../dist/orchestrator/prompts.js';
import { buildDispatchCommand } from '../dist/orchestrator/plan.js';
import {
  collectAutoContinueDispatches,
  executeAutoContinueChain,
  formatEvaluationLines,
  formatHandoffPacketLines,
  formatLaneDispatchLines,
  formatLoopDispatchLines,
  formatLoopEvaluationLines,
  formatNextDispatchHintLines,
  formatTaskAnalysisLines,
} from '../dist/server/tools/dispatch-tools.js';
import { buildAutoContinueDispatch } from '../dist/server/runtime.js';

async function withPlanReadyProject(run) {
  const projectDir = mkdtempSync(join(tmpdir(), 'pm-workflow-dispatch-'));
  const docsDir = join(projectDir, '.pm-workflow', 'docs');
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(join(docsDir, 'Product-Spec.md'), '# test\n', 'utf-8');
  writeFileSync(join(docsDir, 'DEV-PLAN.md'), '# test\n', 'utf-8');

  try {
    return await run(projectDir);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

async function testPublicLoopExports() {
  assert.strictEqual(typeof analyzeDispatchTask, 'function');
  assert.strictEqual(typeof buildHandoffPacket, 'function');
  assert.strictEqual(typeof evaluateDispatchResult, 'function');
  assert.strictEqual(typeof formatLaneDispatchLines, 'function');
}

async function testLaneDispatchFormatting() {
  const lines = await withPlanReadyProject(async (projectDir) => {
    const dispatch = buildDispatchCommand(
      projectDir,
      '请完善设置页 UI、交互细节和响应式布局',
      'medium',
    );
    return formatLaneDispatchLines(dispatch);
  });

  assert.ok(lines.some((line) => line.includes('lane: medium')));
  assert.ok(lines.some((line) => line.includes('risk=moderate')));
  assert.ok(lines.some((line) => line.includes('topology:')));
  assert.ok(lines.some((line) => line.includes('todo policy:')));
  assert.ok(lines.some((line) => line.includes('invocation: mode=subagent')));
}

async function testResolvedAgentFormattingOnAutoContinueDispatch() {
  const lines = await withPlanReadyProject(async (projectDir) => {
    const agentsDir = join(projectDir, '.opencode', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'qa_engineer.md'),
      ['---', 'description: QA agent', 'mode: subagent', 'model: test/qa-model', '---', '# qa'].join('\n'),
      'utf-8',
    );
    const dispatch = buildAutoContinueDispatch(projectDir, '请继续验证回归风险', {
      status: 'needs_verification',
      summary: '需要继续验证',
      matchedDeliverables: [],
      missingDeliverables: ['验证'],
      gaps: ['仍需继续处理'],
      recommendedNextAgent: 'qa_engineer',
      recommendedNextAction: 'continue-development',
      canAutoContinue: true,
      autoContinueSafe: true,
      nextAutoAction: 'continue-development',
    });
    assert.ok(dispatch, 'expected auto continue dispatch');
    return formatLaneDispatchLines(dispatch);
  });

  assert.ok(lines.some((line) => line.includes('resolved agent: source=project')));
}

async function testLoopDispatchFormatting() {
  const lines = await withPlanReadyProject(async (projectDir) => {
    const dispatch = buildDispatchCommand(
      projectDir,
      '请完善设置页 UI、交互细节和响应式布局',
      'medium',
    );
    return formatLoopDispatchLines(dispatch);
  });

  assert.ok(lines.some((line) => line.includes('lane: medium')));
  assert.ok(lines.some((line) => line.includes('topology:')));
  assert.ok(lines.some((line) => line.includes('todo policy:')));
  assert.ok(lines.some((line) => line.includes('invocation: mode=subagent')));
  assert.ok(lines.every((line) => line.startsWith('  ')));
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
  assert.strictEqual(orchestrationTask.recommendedAgent, 'pm');
  assert.strictEqual(orchestrationTask.needsDecomposition, true);
  assert.strictEqual(orchestrationTask.executionMode, 'advisor_then_dispatch');
  assert.ok(orchestrationTask.expectedNextAgents.includes('commander'));
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
  assert.ok(backendPacket.mission.includes('修复认证接口 401'));
  assert.ok(Array.isArray(backendPacket.context));
  assert.ok(Array.isArray(backendPacket.scope.do));
  assert.ok(Array.isArray(backendPacket.scope.dont));
  assert.ok(Array.isArray(backendPacket.acceptance));
  assert.ok(Array.isArray(backendPacket.artifacts));
  assert.deepStrictEqual(backendPacket.responseFormat, [
    'summary: 做了什么',
    'verification: 如何验证 / 未验证原因',
    'risk: 剩余风险或 blocked 原因',
  ]);
  assert.ok(backendPacket.acceptance.length <= 3);
  assert.ok(backendPacket.context.length <= 4);
  assert.ok(backendPacket.artifacts.length <= 6);
  assert.strictEqual(backendPacket.nextStepHint, 'backend');

  const structuredPrompt = buildExecutablePrompt(
    'backend',
    '修复认证接口 401 并确认不影响现有登录流程',
    backendPacket,
  );

  assert.ok(structuredPrompt.includes('【任务目标】'));
  assert.ok(structuredPrompt.includes('【关键背景】'));
  assert.ok(structuredPrompt.includes('【处理范围】'));
  assert.ok(structuredPrompt.includes('【相关对象】'));
  assert.ok(structuredPrompt.includes('【验收标准】'));
  assert.ok(structuredPrompt.includes('【回传格式】'));
  assert.ok(!structuredPrompt.includes('【输入材料】'));
  assert.ok(!structuredPrompt.includes('【完成定义】'));
}

async function testCompactHandoffCompression() {
  const prompt = [
    '请修复设置页保存失败问题，并补充 UI 验证说明。',
    '日志片段：Error: request timeout at settings-save.ts:42',
    '代码片段：const payload = buildSettingsPayload(formState)',
    '补充说明：不要扩展到其他页面，也不要做大规模重构。',
  ].join('\n');

  const packet = buildHandoffPacket({
    prompt,
    targetAgent: 'frontend',
    analysis: analyzeDispatchTask({
      prompt,
      stage: 'development',
      blockedReasons: [],
    }),
  });

  assert.ok(packet.mission.includes('设置页'));
  assert.ok(!packet.mission.includes('日志片段'));
  assert.ok(packet.context.length <= 4);
  assert.ok(packet.scope.do.length <= 3);
  assert.ok(packet.scope.dont.length <= 3);
  assert.ok(packet.acceptance.length <= 3);
  assert.ok(packet.artifacts.length <= 6);
  assert.ok(packet.artifacts.some((item) => item.includes('settings-save.ts')));
  assert.ok(packet.scope.dont.some((item) => item.includes('不要扩展到其他页面')));
}

async function testDispatchCommandIncludesHandoffPacket() {
  const dispatch = await withPlanReadyProject((projectDir) =>
    buildDispatchCommand(
      projectDir,
      '修复认证接口 401 并确认不影响现有登录流程',
    ),
  );

  assert.ok(dispatch.handoffPacket);
  assert.strictEqual(dispatch.recommendedAgent, 'backend');
  assert.ok(dispatch.executablePrompt.includes('【任务目标】'));
  assert.ok(dispatch.executablePrompt.includes('todo'));
  assert.ok(dispatch.executablePrompt.includes('Workflow 标准')); 

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
    analysisLines.some((line) => line.includes('pm 负责主协调')),
    'Analysis lines should explain that pm remains the primary coordinator',
  );
  assert.ok(
    handoffLines.some((line) =>
      line.includes(`target=${dispatch.handoffPacket.targetAgent}`),
    ),
  );
  assert.ok(handoffLines.some((line) => line.includes('handoff acceptance:')));
}

async function testAgentSpecificCompactContext() {
  const prompt = '把 onboarding 流程的前端实现、说明文档和拆解方案一起补齐';
  const analysis = analyzeDispatchTask({
    prompt,
    stage: 'plan_ready',
    blockedReasons: [],
  });

  const frontendPacket = buildHandoffPacket({ prompt, targetAgent: 'frontend', analysis });
  const qaPacket = buildHandoffPacket({ prompt, targetAgent: 'qa_engineer', analysis });
  const writerPacket = buildHandoffPacket({ prompt, targetAgent: 'writer', analysis });
  const commanderPacket = buildHandoffPacket({ prompt, targetAgent: 'commander', analysis });

  assert.ok(frontendPacket.scope.do.some((item) => item.includes('页面') || item.includes('组件') || item.includes('交互')));
  assert.ok(qaPacket.acceptance.some((item) => item.includes('验证') || item.includes('未覆盖')));
  assert.ok(writerPacket.artifacts.some((item) => item.includes('文档') || item.includes('章节')));
  assert.ok(commanderPacket.deliverables.some((item) => item.includes('任务拆解建议')));
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
    stdout: [
      'summary: 已修复 401，已更新认证逻辑。',
      'verification: 尚未执行验证命令。',
      'risk: 当前暂无新增阻塞，但仍缺少验证证据。',
    ].join('\n'),
    stderr: '',
  });
  assert.strictEqual(needsVerification.status, 'needs_verification');
  assert.strictEqual(needsVerification.recommendedNextAgent, 'qa_engineer');
  assert.strictEqual(needsVerification.canAutoContinue, true);
  assert.strictEqual(needsVerification.autoContinueSafe, true);
  assert.strictEqual(needsVerification.nextAutoAction, 'run-code-review');

  const done = evaluateDispatchResult({
    packet,
    exitCode: 0,
    stdout: [
      'summary: 已修复 401。',
      'verification: 已执行 npm run build 与 node test/workflow-redesign.test.mjs，验证通过。',
      'risk: 暂无新增阻塞风险。',
    ].join('\n'),
    stderr: '',
  });
  assert.strictEqual(done.status, 'done');

  const naturalLanguageOnly = evaluateDispatchResult({
    packet,
    exitCode: 0,
    stdout: '已经完成修复，看起来没有问题。',
    stderr: '',
  });
  assert.notStrictEqual(naturalLanguageOnly.status, 'done');

  const structuredDone = evaluateDispatchResult({
    packet,
    exitCode: 0,
    stdout: [
      'summary: 已修复 401 并更新认证逻辑。',
      'verification: 已执行 npm run build 与 node test/workflow-redesign.test.mjs，结果通过。',
      'risk: 暂无新增阻塞风险。',
    ].join('\n'),
    stderr: '',
  });
  assert.strictEqual(structuredDone.status, 'done');

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
    stdout: [
      'summary: 已完成任务拆解。',
      'verification: 已检查任务依赖与分派顺序。',
      'risk: 仍需 PM 做最终决策。',
    ].join('\n'),
    stderr: '',
  });
  assert.strictEqual(commanderResult.status, 'partial');
  assert.strictEqual(commanderResult.recommendedNextAgent, 'pm');
  assert.strictEqual(commanderResult.recommendedNextAction, 'continue-development');
  assert.strictEqual(commanderResult.canAutoContinue, true);
  assert.strictEqual(commanderResult.autoContinueSafe, true);
  assert.strictEqual(commanderResult.nextAutoAction, 'continue-development');
  assert.notStrictEqual(commanderResult.status, 'done');

  const partial = evaluateDispatchResult({
    packet,
    exitCode: 2,
    stdout: '',
    stderr: 'command failed',
  });
  assert.strictEqual(partial.status, 'partial');
  assert.ok(partial.gaps.includes('命令返回非 0 exitCode'));
  assert.strictEqual(partial.canAutoContinue, false);
  assert.strictEqual(partial.autoContinueSafe, false);
  assert.strictEqual(partial.nextAutoAction, undefined);

  const blockedPacket = buildHandoffPacket({
    prompt: '等待产品确认后再继续开发',
    targetAgent: 'pm',
    analysis: analyzeDispatchTask({
      prompt: '等待产品确认后再继续开发',
      stage: 'development',
      blockedReasons: ['等待产品确认'],
    }),
  });
  const blockedResult = evaluateDispatchResult({
    packet: blockedPacket,
    exitCode: 0,
    stdout: '当前被阻塞：等待产品确认后再继续',
    stderr: '',
  });
  assert.strictEqual(blockedResult.status, 'partial');
  assert.strictEqual(blockedResult.recommendedNextAction, 'blocked');
  assert.strictEqual(blockedResult.canAutoContinue, false);
  assert.strictEqual(blockedResult.autoContinueSafe, false);
  assert.strictEqual(blockedResult.nextAutoAction, undefined);

  const evaluationLines = formatEvaluationLines(needsVerification);
  assert.ok(
    evaluationLines.some((line) => line.includes('evaluation status: needs_verification')),
  );
  assert.ok(
    evaluationLines.some((line) => line.includes('recommended next agent: qa_engineer')),
  );
  assert.ok(
    evaluationLines.some((line) => line.includes('auto continue: yes')),
  );
  assert.ok(
    evaluationLines.some((line) => line.includes('auto continue safe: yes')),
  );
  assert.ok(
    evaluationLines.some((line) => line.includes('next auto action: run-code-review')),
  );

  const nextHintLines = formatNextDispatchHintLines(needsVerification);
  assert.ok(
    nextHintLines.some((line) => line.includes('next dispatch hint: qa_engineer/run-code-review')),
  );

  const commanderHintLines = formatNextDispatchHintLines(commanderResult);
  assert.ok(
    commanderHintLines.some((line) => line.includes('next dispatch hint: pm/continue-development')),
  );

  const orchestrationAnalysisLines = formatTaskAnalysisLines(
    analyzeDispatchTask({
      prompt: '把 onboarding 流程的前端实现、说明文档和拆解方案一起补齐',
      stage: 'plan_ready',
      blockedReasons: [],
    }),
  );
  assert.ok(
    orchestrationAnalysisLines.some((line) => line.includes('commander 作为顾问支持')),
    'Orchestration analysis should describe commander as advisor-only support',
  );

  const loopEvaluationLines = formatLoopEvaluationLines(needsVerification);
  assert.ok(
    loopEvaluationLines.some((line) => line.includes('evaluation status: needs_verification')),
  );
  assert.ok(
    loopEvaluationLines.some((line) => line.includes('next dispatch hint: qa_engineer/run-code-review')),
  );
  assert.ok(
    loopEvaluationLines.some((line) => line.includes('auto continue: yes')),
  );
  assert.ok(
    loopEvaluationLines.some((line) => line.includes('auto continue safe: yes')),
  );
  assert.ok(
    loopEvaluationLines.some((line) => line.includes('next auto action: run-code-review')),
  );

  const blockedEvaluationLines = formatEvaluationLines(blockedResult);
  assert.ok(
    blockedEvaluationLines.some((line) => line.includes('auto continue: no')),
  );
  assert.ok(
    blockedEvaluationLines.some((line) => line.includes('auto continue safe: no')),
  );
  assert.ok(
    blockedEvaluationLines.some((line) => line.includes('next auto action: none')),
  );

  const projectDir = process.cwd();
  const qaAutoContinueDispatch = buildAutoContinueDispatch(
    projectDir,
    '修复认证接口 401 并确认不影响现有登录流程',
    needsVerification,
  );
  assert.ok(qaAutoContinueDispatch, 'Needs verification should build one safe auto-continue dispatch');
  assert.strictEqual(qaAutoContinueDispatch?.recommendedAgent, 'qa_engineer');
  assert.strictEqual(qaAutoContinueDispatch?.recommendedAction, 'run-code-review');
  assert.strictEqual(qaAutoContinueDispatch?.handoffPacket?.targetAgent, 'qa_engineer');

  const pmAutoContinueDispatch = buildAutoContinueDispatch(
    projectDir,
    '拆解 onboarding 流程并给出后续分派建议',
    commanderResult,
  );
  assert.ok(pmAutoContinueDispatch, 'Commander advice should auto-continue back to pm');
  assert.strictEqual(pmAutoContinueDispatch?.recommendedAgent, 'pm');
  assert.strictEqual(pmAutoContinueDispatch?.recommendedAction, 'continue-development');
  assert.strictEqual(pmAutoContinueDispatch?.handoffPacket?.targetAgent, 'pm');

  const blockedAutoContinueDispatch = buildAutoContinueDispatch(
    projectDir,
    '等待产品确认后再继续开发',
    blockedResult,
  );
  assert.strictEqual(blockedAutoContinueDispatch, undefined);

  const doneAutoContinueDispatch = buildAutoContinueDispatch(
    projectDir,
    '修复认证接口 401 并确认不影响现有登录流程',
    done,
  );
  assert.strictEqual(doneAutoContinueDispatch, undefined);

  const autoContinueChain = collectAutoContinueDispatches({
    projectPath: projectDir,
    prompt: '修复认证接口 401 并确认不影响现有登录流程',
    firstEvaluation: needsVerification,
    subsequentEvaluations: [done],
    maxAutoSteps: 2,
  });
  assert.strictEqual(autoContinueChain.length, 1);
  assert.strictEqual(autoContinueChain[0]?.recommendedAgent, 'qa_engineer');
  assert.strictEqual(autoContinueChain[0]?.recommendedAction, 'run-code-review');

  const blockedChain = collectAutoContinueDispatches({
    projectPath: projectDir,
    prompt: '等待产品确认后再继续开发',
    firstEvaluation: blockedResult,
    subsequentEvaluations: [done],
    maxAutoSteps: 2,
  });
  assert.strictEqual(blockedChain.length, 0);

  const cappedChain = collectAutoContinueDispatches({
    projectPath: projectDir,
    prompt: '拆解 onboarding 流程并给出后续分派建议',
    firstEvaluation: commanderResult,
    subsequentEvaluations: [commanderResult, done],
    maxAutoSteps: 1,
  });
  assert.strictEqual(cappedChain.length, 1);
  assert.strictEqual(cappedChain[0]?.recommendedAgent, 'pm');

  const executed = [];
  const executedChain = executeAutoContinueChain({
    projectPath: projectDir,
    prompt: '修复认证接口 401 并确认不影响现有登录流程',
    firstEvaluation: needsVerification,
    maxAutoSteps: 2,
    canExecute: () => ({ allowed: true, reasons: [] }),
    runDispatch: (dispatch) => {
      executed.push(`${dispatch.recommendedAgent}/${dispatch.recommendedAction}`);
      return {
        dispatch,
        result: { status: 0, stdout: '验证通过', stderr: '' },
        evaluation: done,
      };
    },
  });
  assert.strictEqual(executedChain.executions.length, 1);
  assert.deepStrictEqual(executed, ['qa_engineer/run-code-review']);
  assert.strictEqual(executedChain.stopReason, 'completed');

  const blockedExecutionChain = executeAutoContinueChain({
    projectPath: projectDir,
    prompt: '修复认证接口 401 并确认不影响现有登录流程',
    firstEvaluation: needsVerification,
    maxAutoSteps: 2,
    canExecute: () => ({ allowed: false, reasons: ['gate blocked'] }),
    runDispatch: () => {
      throw new Error('should not execute when gate is blocked');
    },
  });
  assert.strictEqual(blockedExecutionChain.executions.length, 0);
  assert.strictEqual(blockedExecutionChain.stopReason, 'gate-blocked');
}

async function runTests() {
  try {
    await testPublicLoopExports();
    await testLaneDispatchFormatting();
    await testResolvedAgentFormattingOnAutoContinueDispatch();
    await testLoopDispatchFormatting();
    await testAnalyzerRouting();
    await testHandoffPacket();
    await testCompactHandoffCompression();
    await testDispatchCommandIncludesHandoffPacket();
    await testAgentSpecificCompactContext();
    await testEvaluator();
    console.log('dispatch quality loop public exports ready');
  } catch (error) {
    console.error('dispatch quality loop test failed:', error);
    process.exit(1);
  }
}

runTests();
