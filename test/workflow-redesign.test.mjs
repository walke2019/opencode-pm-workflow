import assert from 'node:assert';
import { defaultWorkflowConfig } from '../dist/core/config.js';
import { buildExecutablePrompt } from '../dist/orchestrator/prompts.js';

async function testDefaults() {
  console.log('Testing default config values...');
  const config = defaultWorkflowConfig();
  assert.strictEqual(config.permissions.allow_execute_tools, true, 'Should allow tool execution by default');
  assert.strictEqual(config.confirm.require_confirm_for_execute, false, 'Should not require confirmation by default');
  assert.ok(
    config.agents.definitions.pm_workflow_qa.description.includes('赵云'),
    'QA definition should include Zhao Yun',
  );
  assert.ok(
    config.agents.definitions.pm_workflow_writer.description.includes('陈琳'),
    'Writer definition should include Chen Lin',
  );
  console.log('✓ allow_execute_tools is true');
  console.log('✓ require_confirm_for_execute is false');
  console.log('✓ QA definition correctly mapped to Zhao Yun');
  console.log('✓ Writer definition correctly mapped to Chen Lin');
}

async function testPrompts() {
  console.log('\nTesting prompts and character mapping...');
  const zhuge = buildExecutablePrompt('commander', '测试任务');
  assert.ok(zhuge.includes('诸葛亮'), 'Commander prompt should include Zhuge Liang');
  assert.ok(zhuge.includes('【核心任务】'), 'Prompt should be structured');
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
  // 注意：这个测试依赖于 state.js 的实现，可能需要 mock
  console.log('\nNote: Skipping complex dispatch routing test as it requires mock state.');
}

async function runTests() {
  try {
    await testDefaults();
    await testPrompts();
    await testDispatchRouting();
    console.log('\nAll verification tests passed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runTests();
