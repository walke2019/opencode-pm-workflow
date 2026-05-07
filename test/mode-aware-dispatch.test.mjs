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

await testInvocationSemantics();
await testDispatchIncludesInvocationSemantics();
await testAutoContinueDispatchUsesInvocationSemantics();
