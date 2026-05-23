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
  assert.strictEqual(config.agents.definitions.commander.model, undefined, 'Model should be read from global config');
  assert.strictEqual(config.agents.definitions.backendcoder.model, undefined, 'Model should be read from global config');
  assert.strictEqual(config.agents.definitions.designer.model, undefined, 'Model should be read from global config');
  // 1.0.0-rc.6 起 reviewer 拆成 fixer + writer 两个独立 agent
  assert.ok(
    config.agents.definitions.fixer.description.includes('测试'),
    'Fixer definition should include 测试',
  );
  assert.ok(
    config.agents.definitions.fixer.description.includes('发布') ||
      config.agents.definitions.fixer.description.includes('部署'),
    'Fixer definition should include 发布 or 部署',
  );
  assert.ok(
    config.agents.definitions.writer.description.includes('文档'),
    'Writer definition should include 文档',
  );
  assert.ok(
    config.agents.definitions.advisor.description.includes('顾问'),
    'Advisor definition should describe advisor role',
  );
  assert.ok(
    !config.agents.definitions.advisor.description.includes('总指挥'),
    'Advisor definition should no longer describe commander as the primary coordinator',
  );
  assert.ok(
    config.agents.definitions.advisor.prompt.includes('顾问'),
    'Advisor prompt should describe advisor role',
  );
  assert.ok(
    !config.agents.definitions.advisor.prompt.includes('总指挥'),
    'Advisor prompt should no longer describe commander as the primary coordinator',
  );
  console.log('✓ role-specific model defaults are configured');
  console.log('✓ allow_execute_tools is true');
  console.log('✓ require_confirm_for_execute is false');
  console.log('✓ Reviewer definition correctly mapped to reviewer role');
  console.log('✓ Reviewer definition correctly includes 文档 responsibilities');
  console.log('✓ Advisor definition correctly mapped to advisor-only role');

  assert.strictEqual(
    config.fallback.agent_map.advisor,
    'advisor',
    'Fallback agent map should support advisor',
  );
  assert.strictEqual(
    config.agents.dispatch_map.advisor,
    'advisor',
    'Dispatch map should support advisor',
  );
  assert.ok(
    config.agents.definitions.advisor,
    'Built-in researcher definition should exist for executable researcher defaults',
  );
  assert.ok(
    config.agents.definitions.advisor.description.includes('调研') ||
      config.agents.definitions.advisor.description.includes('搜索') ||
      config.agents.definitions.advisor.description.includes('资料'),
    'Researcher definition should describe research/search behavior',
  );
  assert.ok(
    config.agents.definitions.advisor.prompt.includes('不直接承担实现工作') ||
      config.agents.definitions.advisor.prompt.includes('不替代开发'),
    'Researcher definition prompt should state non-implementation by default',
  );
  const researcherPrompt = buildExecutablePrompt('advisor', '帮我调研一下官方鉴权方案');
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
  const advisorPrompt = buildExecutablePrompt('advisor', '测试任务');
  assert.ok(advisorPrompt.includes('拆解顾问'), 'Advisor prompt should include 拆解顾问');
  assert.ok(advisorPrompt.includes('【核心任务】'), 'Prompt should be structured');
  assert.ok(advisorPrompt.includes('顾问'), 'Commander prompt should describe advisor role');
  assert.ok(
    !advisorPrompt.includes('总指挥'),
    'Commander prompt should no longer describe commander as the primary coordinator',
  );
  console.log('✓ Advisor prompt correctly mapped to 拆解顾问');

  const backendPrompt = buildExecutablePrompt('backendcoder', '修复 Bug');
  assert.ok(backendPrompt.includes('后端'), 'Backend prompt should include 后端');
  console.log('✓ Backend prompt correctly mapped to 后端角色');

  // 1.0.0-rc.6 起 reviewer 拆成 fixer + writer：
  // - "审查代码" / "测试" / "修复 bug" / "打包发版" → fixer
  // - "整理发布说明" / "写文档" → writer
  const fixerPrompt = buildExecutablePrompt('fixer', '执行代码审查');
  assert.ok(
    fixerPrompt.includes('测试') || fixerPrompt.includes('修复'),
    'Fixer prompt should include 测试 or 修复',
  );
  console.log('✓ Fixer prompt correctly mapped to 测试/修复职责');

  const writerPrompt = buildExecutablePrompt('writer', '整理发布说明');
  assert.ok(writerPrompt.includes('文档'), 'Writer prompt should include 文档');
  console.log('✓ Writer prompt correctly mapped to 文档职责');
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
  // 1.0.0-rc.6 起 writer 与 fixer 是独立 agent；纯文档任务路由到 writer
  assert.strictEqual(simpleWriterDispatch.recommendedAgent, 'writer');
  assert.ok(
    !simpleWriterDispatch.executablePrompt.includes('commander 作为主 agent'),
    'Executable prompt should not describe commander as the primary agent',
  );
  console.log('✓ Simple writer task routes to writer (not commander)');
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
  assert.strictEqual(backendDispatch.recommendedAgent, 'backendcoder');
  assert.ok(backendDispatch.analysis.expectedNextAgents.includes('fixer'));
  assert.ok(backendDispatch.executablePrompt.includes('Workflow 标准'));
  assert.ok(backendDispatch.executablePrompt.includes('todo'));
  console.log('✓ Backend dispatch routes implementation work to backendcoder with reviewer follow-up');

  const gatedDispatch = await withTempProject(() => {}, (projectDir) =>
    buildDispatchCommand(
      projectDir,
      '实现 OpenCode plugin 工具调用和 workflow 路由，并补齐测试',
    ),
  );
  assert.strictEqual(gatedDispatch.recommendedAction, 'collect-spec');
  assert.strictEqual(
    gatedDispatch.recommendedAgent,
    'commander',
    'Spec gate should keep collect-spec on commander instead of routing to backend',
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
  assert.strictEqual(researcherDispatch.recommendedAgent, 'advisor');
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
  assert.strictEqual(researcherBackendCollisionDispatch.recommendedAgent, 'advisor');
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
  assert.strictEqual(backendRoutingDispatch.recommendedAgent, 'backendcoder');

  const writerRoutingDispatch = await withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
  }, (projectDir) =>
    buildDispatchCommand(
      projectDir,
      '把这段说明整理成文档，并更新 README',
    ),
  );
  assert.strictEqual(writerRoutingDispatch.recommendedAgent, 'writer');
  console.log('✓ Writer task routes to writer agent');
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
    'commander',
    'plan_ready should default to commander',
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
    'commander',
    'development should default to commander',
  );

  console.log('✓ plan_ready defaults to commander');
  console.log('✓ development defaults to commander');
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
