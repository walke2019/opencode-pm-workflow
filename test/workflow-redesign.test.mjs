import assert from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultWorkflowConfig } from '../dist/core/config.js';
import { buildDispatchPlan } from '../dist/orchestrator/plan.js';
import { buildDispatchCommand } from '../dist/orchestrator/plan.js';
import { buildExecutablePrompt } from '../dist/orchestrator/prompts.js';

async function withTempProject(setup, run) {
  const projectDir = mkdtempSync(join(tmpdir(), 'pm-workflow-routing-'));

  try {
    await setup(projectDir);
    return await run(projectDir);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

function createDoc(projectDir, name, content = '# test\n') {
  const docsDir = join(projectDir, '.pm-workflow', 'docs');
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(join(docsDir, name), content, 'utf-8');
}

async function testDefaults() {
  console.log('Testing default config values...');
  const config = defaultWorkflowConfig();
  assert.strictEqual(config.permissions.allow_execute_tools, true, 'Should allow tool execution by default');
  assert.strictEqual(config.confirm.require_confirm_for_execute, false, 'Should not require confirmation by default');
  assert.strictEqual(config.agents.definitions.pm_workflow_caocao.model, 'cx/gpt-5.5');
  assert.strictEqual(config.agents.definitions.pm_workflow_lvbu.model, 'cx/gpt-5.3-codex');
  assert.strictEqual(config.agents.definitions.pm_workflow_frontend.model, 'antigravity/gemini-3-flash-preview');
  assert.ok(
    config.agents.definitions.pm_workflow_qa.description.includes('赵云'),
    'QA definition should include Zhao Yun',
  );
  assert.ok(
    config.agents.definitions.pm_workflow_writer.description.includes('陈琳'),
    'Writer definition should include Chen Lin',
  );
  assert.ok(
    config.agents.definitions.pm_workflow_zhuge.description.includes('顾问'),
    'Zhuge definition should describe advisor role',
  );
  assert.ok(
    !config.agents.definitions.pm_workflow_zhuge.description.includes('总指挥'),
    'Zhuge definition should no longer describe commander as the primary coordinator',
  );
  assert.ok(
    config.agents.definitions.pm_workflow_zhuge.prompt.includes('顾问'),
    'Zhuge prompt should describe advisor role',
  );
  assert.ok(
    !config.agents.definitions.pm_workflow_zhuge.prompt.includes('总指挥'),
    'Zhuge prompt should no longer describe commander as the primary coordinator',
  );
  console.log('✓ role-specific model defaults are configured');
  console.log('✓ allow_execute_tools is true');
  console.log('✓ require_confirm_for_execute is false');
  console.log('✓ QA definition correctly mapped to Zhao Yun');
  console.log('✓ Writer definition correctly mapped to Chen Lin');
  console.log('✓ Zhuge definition correctly mapped to advisor-only role');
}

async function testPrompts() {
  console.log('\nTesting prompts and character mapping...');
  const zhuge = buildExecutablePrompt('commander', '测试任务');
  assert.ok(zhuge.includes('诸葛亮'), 'Commander prompt should include Zhuge Liang');
  assert.ok(zhuge.includes('【核心任务】'), 'Prompt should be structured');
  assert.ok(zhuge.includes('顾问'), 'Commander prompt should describe advisor role');
  assert.ok(
    !zhuge.includes('总指挥'),
    'Commander prompt should no longer describe commander as the primary coordinator',
  );
  console.log('✓ Commander prompt correctly mapped to Zhuge Liang');

  const lvbu = buildExecutablePrompt('backend', '修复 Bug');
  assert.ok(lvbu.includes('吕布'), 'Backend prompt should include Lv Bu');
  console.log('✓ Backend prompt correctly mapped to Lv Bu');

  const zhaoyun = buildExecutablePrompt('qa_engineer', '执行代码审查');
  assert.ok(zhaoyun.includes('赵云'), 'QA prompt should include Zhao Yun');
  console.log('✓ QA prompt correctly mapped to Zhao Yun');

  const chenlin = buildExecutablePrompt('writer', '整理发布说明');
  assert.ok(chenlin.includes('陈琳'), 'Writer prompt should include Chen Lin');
  console.log('✓ Writer prompt correctly mapped to Chen Lin');
}

async function testDispatchRouting() {
  console.log('\nTesting dispatch routing regressions...');
  const simpleWriterDispatch = buildDispatchCommand(
    process.cwd(),
    '帮我补 README 的安装说明',
  );
  assert.notStrictEqual(
    simpleWriterDispatch.recommendedAgent,
    'commander',
    'Simple writer task should not default to commander',
  );
  assert.ok(simpleWriterDispatch.analysis, 'Dispatch should include task analysis');
  assert.ok(simpleWriterDispatch.handoffPacket, 'Dispatch should include handoff packet');
  assert.strictEqual(simpleWriterDispatch.recommendedAgent, 'writer');
  assert.ok(
    !simpleWriterDispatch.executablePrompt.includes('commander 作为主 agent'),
    'Executable prompt should not describe commander as the primary agent',
  );
  console.log('✓ Simple writer task does not default to commander');
  console.log('✓ Dispatch includes analysis and handoff packet');

  const backendDispatch = buildDispatchCommand(
    process.cwd(),
    '实现 OpenCode plugin 工具调用和 workflow 路由，并补齐测试',
  );
  assert.strictEqual(backendDispatch.recommendedAgent, 'backend');
  assert.ok(backendDispatch.analysis.expectedNextAgents.includes('qa_engineer'));
  assert.ok(backendDispatch.executablePrompt.includes('Workflow 标准'));
  assert.ok(backendDispatch.executablePrompt.includes('todo'));
  console.log('✓ PM default dispatch routes implementation work to backend with QA follow-up');
}

async function testStageDefaultRouting() {
  console.log('\nTesting stage default routing...');

  const planReadyDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
  }, (projectDir) => buildDispatchPlan(projectDir));
  assert.strictEqual(planReadyDispatch.stage, 'plan_ready', 'Fixture should resolve to plan_ready');
  assert.strictEqual(
    planReadyDispatch.recommendedAgent,
    'pm',
    'plan_ready should default to pm instead of commander',
  );

  const developmentDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
    mkdirSync(join(projectDir, 'src'), { recursive: true });
  }, (projectDir) => buildDispatchPlan(projectDir));
  assert.strictEqual(
    developmentDispatch.stage,
    'development',
    'Fixture should resolve to development',
  );
  assert.strictEqual(
    developmentDispatch.recommendedAgent,
    'pm',
    'development should default to pm instead of commander',
  );

  console.log('✓ plan_ready defaults to pm');
  console.log('✓ development defaults to pm');
}

async function runTests() {
  try {
    await testDefaults();
    await testPrompts();
    await testDispatchRouting();
    await testStageDefaultRouting();
    console.log('\nAll verification tests passed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runTests();
