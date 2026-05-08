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
  assert.strictEqual(config.agents.definitions.pm_lead.model, undefined, 'Model should be read from global config');
  assert.strictEqual(config.agents.definitions.pm_backend.model, undefined, 'Model should be read from global config');
  assert.strictEqual(config.agents.definitions.pm_frontend.model, undefined, 'Model should be read from global config');
  assert.ok(
    config.agents.definitions.pm_reviewer.description.includes('审查'),
    'Reviewer definition should include 审查',
  );
  assert.ok(
    config.agents.definitions.pm_reviewer.description.includes('文档'),
    'Reviewer definition should include 文档',
  );
  assert.ok(
    config.agents.definitions.pm_advisor.description.includes('顾问'),
    'Advisor definition should describe advisor role',
  );
  assert.ok(
    !config.agents.definitions.pm_advisor.description.includes('总指挥'),
    'Advisor definition should no longer describe commander as the primary coordinator',
  );
  assert.ok(
    config.agents.definitions.pm_advisor.prompt.includes('顾问'),
    'Advisor prompt should describe advisor role',
  );
  assert.ok(
    !config.agents.definitions.pm_advisor.prompt.includes('总指挥'),
    'Advisor prompt should no longer describe commander as the primary coordinator',
  );
  console.log('✓ role-specific model defaults are configured');
  console.log('✓ allow_execute_tools is true');
  console.log('✓ require_confirm_for_execute is false');
  console.log('✓ Reviewer definition correctly mapped to reviewer role');
  console.log('✓ Reviewer definition correctly includes 文档 responsibilities');
  console.log('✓ Advisor definition correctly mapped to advisor-only role');

  assert.strictEqual(
    config.fallback.agent_map.pm_researcher,
    'pm_researcher',
    'Fallback agent map should support pm_researcher',
  );
  assert.strictEqual(
    config.agents.dispatch_map.pm_researcher,
    'pm_researcher',
    'Dispatch map should support pm_researcher',
  );
  assert.ok(
    config.agents.definitions.pm_researcher,
    'Built-in researcher definition should exist for executable researcher defaults',
  );
  assert.ok(
    config.agents.definitions.pm_researcher.description.includes('调研') ||
      config.agents.definitions.pm_researcher.description.includes('搜索') ||
      config.agents.definitions.pm_researcher.description.includes('资料'),
    'Researcher definition should describe research/search behavior',
  );
  assert.ok(
    config.agents.definitions.pm_researcher.prompt.includes('不直接承担实现工作') ||
      config.agents.definitions.pm_researcher.prompt.includes('不替代开发'),
    'Researcher definition prompt should state non-implementation by default',
  );
  const researcherPrompt = buildExecutablePrompt('pm_researcher', '帮我调研一下官方鉴权方案');
  assert.ok(researcherPrompt.includes('资料'), 'Researcher prompt should mention 资料');
  assert.ok(
    researcherPrompt.includes('调研') || researcherPrompt.includes('搜索'),
    'Researcher prompt should mention 调研 or 搜索',
  );
  assert.ok(
    researcherPrompt.includes('不直接承担实现工作') || researcherPrompt.includes('不替代开发'),
    'Researcher prompt should state it does not directly replace implementation work',
  );
  assert.ok(
    !researcherPrompt.includes('先压缩需求，再进入开发实现、测试验证和发布摘要'),
    'Researcher prompt should not include generic implementation-oriented execution requirements',
  );
  assert.ok(
    researcherPrompt.includes('先收集资料') ||
      researcherPrompt.includes('先调研') ||
      researcherPrompt.includes('输出可验证的结论'),
    'Researcher prompt should use role-appropriate research execution requirements',
  );
  console.log('✓ Researcher defaults and prompt are configured');
}

async function testPrompts() {
  console.log('\nTesting prompts and character mapping...');
  const zhuge = buildExecutablePrompt('pm_advisor', '测试任务');
  assert.ok(zhuge.includes('拆解顾问'), 'Advisor prompt should include 拆解顾问');
  assert.ok(zhuge.includes('【核心任务】'), 'Prompt should be structured');
  assert.ok(zhuge.includes('顾问'), 'Commander prompt should describe advisor role');
  assert.ok(
    !zhuge.includes('总指挥'),
    'Commander prompt should no longer describe commander as the primary coordinator',
  );
  console.log('✓ Advisor prompt correctly mapped to 拆解顾问');

  const lvbu = buildExecutablePrompt('pm_backend', '修复 Bug');
  assert.ok(lvbu.includes('后端'), 'Backend prompt should include 后端');
  console.log('✓ Backend prompt correctly mapped to 后端角色');

  const zhaoyun = buildExecutablePrompt('pm_reviewer', '执行代码审查');
  assert.ok(zhaoyun.includes('审查'), 'Reviewer prompt should include 审查');
  console.log('✓ Reviewer prompt correctly mapped to 审查职责');

  const chenlin = buildExecutablePrompt('pm_reviewer', '整理发布说明');
  assert.ok(chenlin.includes('文档'), 'Reviewer prompt should include 文档');
  console.log('✓ Reviewer prompt correctly mapped to 文档职责');
}

async function testDispatchRouting() {
  console.log('\nTesting dispatch routing regressions...');
  const simpleWriterDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
  }, (projectDir) =>
    buildDispatchCommand(
      projectDir,
      '帮我补 README 的安装说明',
    ),
  );
  assert.notStrictEqual(
    simpleWriterDispatch.recommendedAgent,
    'commander',
    'Simple writer task should not default to commander',
  );
  assert.ok(simpleWriterDispatch.analysis, 'Dispatch should include task analysis');
  assert.ok(simpleWriterDispatch.handoffPacket, 'Dispatch should include handoff packet');
  assert.strictEqual(simpleWriterDispatch.recommendedAgent, 'pm_reviewer');
  assert.ok(
    !simpleWriterDispatch.executablePrompt.includes('commander 作为主 agent'),
    'Executable prompt should not describe commander as the primary agent',
  );
  console.log('✓ Simple writer task does not default to commander');
  console.log('✓ Dispatch includes analysis and handoff packet');

  const backendDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
  }, (projectDir) =>
    buildDispatchCommand(
      projectDir,
      '实现 OpenCode plugin 工具调用和 workflow 路由，并补齐测试',
    ),
  );
  assert.strictEqual(backendDispatch.recommendedAgent, 'pm_backend');
  assert.ok(backendDispatch.analysis.expectedNextAgents.includes('pm_reviewer'));
  assert.ok(backendDispatch.executablePrompt.includes('Workflow 标准'));
  assert.ok(backendDispatch.executablePrompt.includes('todo'));
  console.log('✓ Backend dispatch routes implementation work to pm_backend with reviewer follow-up');

  const gatedDispatch = await withTempProject(() => {}, (projectDir) =>
    buildDispatchCommand(
      projectDir,
      '实现 OpenCode plugin 工具调用和 workflow 路由，并补齐测试',
    ),
  );
  assert.strictEqual(gatedDispatch.recommendedAction, 'collect-spec');
  assert.strictEqual(
    gatedDispatch.recommendedAgent,
    'pm_lead',
    'Spec gate should keep collect-spec on pm_lead instead of routing to backend',
  );
  console.log('✓ Spec gate keeps requirements compression on PM before development routing');

  const researcherDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
  }, (projectDir) =>
    buildDispatchCommand(
      projectDir,
      '帮我调研一下 React Native 埋点方案，并对比几种实现路线',
    ),
  );
  assert.strictEqual(researcherDispatch.recommendedAgent, 'pm_researcher');
  assert.strictEqual(researcherDispatch.analysis?.domain, 'researcher');
  assert.strictEqual(researcherDispatch.analysis?.executionMode, 'serial_handoff');

  const researcherBackendCollisionDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
  }, (projectDir) =>
    buildDispatchCommand(
      projectDir,
      '帮我调研一下官方鉴权方案，并对比几种中间件实现路线',
    ),
  );
  assert.strictEqual(researcherBackendCollisionDispatch.recommendedAgent, 'pm_researcher');
  assert.strictEqual(researcherBackendCollisionDispatch.analysis?.domain, 'researcher');

  const backendRoutingDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
  }, (projectDir) =>
    buildDispatchCommand(
      projectDir,
      '帮我实现一个鉴权中间件，并补测试',
    ),
  );
  assert.strictEqual(backendRoutingDispatch.recommendedAgent, 'pm_backend');

  const writerRoutingDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
  }, (projectDir) =>
    buildDispatchCommand(
      projectDir,
      '把这段说明整理成文档，并更新 README',
    ),
  );
  assert.strictEqual(writerRoutingDispatch.recommendedAgent, 'pm_reviewer');
  console.log('✓ Researcher medium-trigger routing prefers researcher over backend/writer fallbacks');
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
    'pm_lead',
    'plan_ready should default to pm_lead',
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
    'pm_lead',
    'development should default to pm_lead',
  );

  console.log('✓ plan_ready defaults to pm_lead');
  console.log('✓ development defaults to pm_lead');
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
