import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildDispatchCommand,
  buildAutoContinueDispatch,
  executeDispatchCommand,
  resolveAgentInvocationSemantics,
} from '../dist/index.js';

function withTempProject(setup, run) {
  const projectDir = mkdtempSync(join(tmpdir(), 'pm-workflow-dispatch-'));
  setup(projectDir);
  return run(projectDir);
}

function createDoc(projectDir, name, content = '# fixture\n') {
  writeFileSync(join(projectDir, name), content, 'utf8');
}

function createAgentDefinition(dir, id, frontmatter) {
  mkdirSync(dir, { recursive: true });
  const body = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  writeFileSync(
    join(dir, `${id}.md`),
    `---\n${body}\n---\n# ${id}\n`,
    'utf8',
  );
}

function createWorkflowConfig(projectDir, config) {
  mkdirSync(join(projectDir, '.pm-workflow'), { recursive: true });
  writeFileSync(
    join(projectDir, '.pm-workflow', 'config.json'),
    JSON.stringify(config, null, 2),
    'utf8',
  );
}

function buildEvaluation(agent = 'qa_engineer') {
  return {
    status: 'needs_verification',
    summary: '需要继续处理',
    matchedDeliverables: [],
    missingDeliverables: ['验证'],
    gaps: ['仍需继续处理'],
    recommendedNextAgent: agent,
    recommendedNextAction: 'continue-development',
    canAutoContinue: true,
    autoContinueSafe: true,
    nextAutoAction: 'continue-development',
  };
}

async function testInvocationSemantics() {
  assert.strictEqual(typeof buildDispatchCommand, 'function');
  assert.strictEqual(typeof executeDispatchCommand, 'function');

  const pm = resolveAgentInvocationSemantics('pm_workflow_caocao', 'primary');
  assert.deepStrictEqual(pm, {
    mode: 'primary',
    supportsDirectRun: true,
    requiresTaskPermission: false,
  });

  const specialist = resolveAgentInvocationSemantics('pm_workflow_frontend', 'subagent');
  assert.strictEqual(specialist.mode, 'subagent');
  assert.strictEqual(specialist.supportsDirectRun, false);
  assert.strictEqual(specialist.requiresTaskPermission, true);
}

async function testDispatchIncludesInvocationSemantics() {
  const pmDispatch = withTempProject(() => {}, (projectDir) =>
    buildDispatchCommand(projectDir, '请先收集需求并整理 Product-Spec'),
  );
  assert.deepStrictEqual(pmDispatch.invocation, {
    mode: 'primary',
    supportsDirectRun: true,
    requiresTaskPermission: false,
  });

  const specialistDispatch = withTempProject((projectDir) => {
    createDoc(projectDir, 'Product-Spec.md');
    createDoc(projectDir, 'DEV-PLAN.md');
    mkdirSync(join(projectDir, 'src'), { recursive: true });
  }, (projectDir) =>
    buildDispatchCommand(projectDir, '请完善设置页 UI、交互细节和响应式布局'),
  );
  assert.strictEqual(specialistDispatch.recommendedAgent, 'frontend');
  assert.deepStrictEqual(specialistDispatch.invocation, {
    mode: 'subagent',
    supportsDirectRun: false,
    requiresTaskPermission: true,
  });
  assert.ok(
    !specialistDispatch.command.includes('opencode run --agent'),
    'subagent dispatch should not be rendered as a direct opencode run --agent command',
  );
}

async function testAutoContinueDispatchUsesInvocationSemantics() {
  const projectDir = process.cwd();
  const autoDispatch = buildAutoContinueDispatch(
    projectDir,
    '请修复设置页交互问题并补 UI 回归验证',
    {
      status: 'needs_verification',
      summary: '需要 frontend 继续验证交互修复',
      matchedDeliverables: [],
      missingDeliverables: ['交互验证'],
      gaps: ['仍需前端继续处理'],
      recommendedNextAgent: 'frontend',
      recommendedNextAction: 'continue-development',
      canAutoContinue: true,
      autoContinueSafe: true,
      nextAutoAction: 'continue-development',
    },
  );
  assert.ok(autoDispatch, 'auto continue dispatch should be created');
  assert.deepStrictEqual(autoDispatch?.invocation, {
    mode: 'subagent',
    supportsDirectRun: false,
    requiresTaskPermission: true,
  });
  assert.ok(
    !autoDispatch?.command.includes('opencode run --agent'),
    'auto continue subagent dispatch should not use direct run --agent command',
  );
}

async function testAutoContinuePrefersExternalFrontmatterAndExposesDiagnostics() {
  const originalHome = process.env.HOME;
  withTempProject((projectDir) => {
    const configHome = join(projectDir, 'config-home');
    const globalAgentsDir = join(configHome, '.config', 'opencode', 'agents');
    createWorkflowConfig(projectDir, {
      retry: { max_attempts: 1, retryable_actions: [] },
      fallback: { max_attempts: 1, enabled_actions: [], agent_map: {} },
      agents: {
        enabled: true,
        default_mode: 'all',
        dispatch_map: { qa_engineer: 'qa_engineer' },
        definitions: {
          qa_engineer: {
            description: 'INTERNAL DESCRIPTION SHOULD NOT WIN',
            mode: 'primary',
            model: 'internal/model-should-not-win',
          },
        },
      },
      permissions: {
        allow_execute_tools: true,
        allow_repair_tools: true,
        allow_release_actions: true,
      },
      confirm: { require_confirm_for_execute: false },
      automation: { mode: 'assist' },
      docs: {
        storage_mode: 'legacy',
        read_legacy: true,
        write_legacy: true,
      },
    });
    createAgentDefinition(globalAgentsDir, 'qa_engineer', {
      description: 'QA 测试工程师：测试策略、自动化测试、回归与缺陷报告。',
      mode: 'subagent',
      model: 'bestool-route-kr/kr/claude-haiku-4.5',
    });
    process.env.HOME = configHome;

    const dispatch = buildAutoContinueDispatch(
      projectDir,
      '验证 QA 测试方案',
      buildEvaluation(),
    );

    assert.ok(dispatch, 'auto continue dispatch should be created');
    assert.strictEqual(dispatch?.executableAgent, 'qa_engineer');
    assert.strictEqual(dispatch?.invocation?.mode, 'subagent');
    assert.ok(
      !dispatch?.command.includes('opencode run --agent'),
      'resolved subagent should not use direct run --agent command',
    );
    assert.deepStrictEqual(dispatch?.resolvedAgent, {
      id: 'qa_engineer',
      mode: 'subagent',
      model: 'bestool-route-kr/kr/claude-haiku-4.5',
      description: 'QA 测试工程师：测试策略、自动化测试、回归与缺陷报告。',
      source: 'global',
      directoryKind: 'agents',
      filePath: join(globalAgentsDir, 'qa_engineer.md'),
      shadowedGlobal: true,
      usedFallback: false,
      fallbackReason: undefined,
    });
  }, () => undefined);
  process.env.HOME = originalHome;
}

await testInvocationSemantics();
await testDispatchIncludesInvocationSemantics();
await testAutoContinueDispatchUsesInvocationSemantics();
await testAutoContinuePrefersExternalFrontmatterAndExposesDiagnostics();
