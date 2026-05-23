import assert from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultWorkflowConfig,
  detectFeedbackStopSignal,
  evaluateAutoContinueGuard,
  markAutoContinueChainStart,
  recordAutoContinueStep,
  markAutoContinueAborted,
  readState,
  readWorkflowConfig,
} from '../dist/index.js';

function makeProject() {
  const projectDir = mkdtempSync(join(tmpdir(), 'pm-workflow-autocontinue-'));
  mkdirSync(join(projectDir, '.pm-workflow'), { recursive: true });
  return projectDir;
}

function writeProjectConfig(projectDir, partial) {
  writeFileSync(
    join(projectDir, '.pm-workflow', 'config.json'),
    JSON.stringify(partial, null, 2),
    'utf-8',
  );
}

// 1) detectFeedbackStopSignal：四种典型停止词命中
{
  assert.ok(detectFeedbackStopSignal('请你停下')?.matched);
  assert.ok(detectFeedbackStopSignal('不要再继续了')?.matched);
  assert.ok(detectFeedbackStopSignal('please STOP now')?.matched);
  assert.ok(detectFeedbackStopSignal('cancel the task')?.matched);
  assert.strictEqual(detectFeedbackStopSignal('正常输出'), undefined);
  assert.strictEqual(detectFeedbackStopSignal(''), undefined);
  assert.strictEqual(detectFeedbackStopSignal(null), undefined);
}

// 2) evaluateAutoContinueGuard：默认配置必拒（双总开关均默认 false）
{
  const projectDir = makeProject();
  try {
    writeProjectConfig(projectDir, {});
    const config = readWorkflowConfig(projectDir);
    const decision = evaluateAutoContinueGuard({
      projectDir,
      config,
      stepsAlreadyDone: 0,
    });
    assert.strictEqual(decision.allowed, false);
    assert.ok(
      decision.reasons.some((r) => r.includes('auto_continue.enabled=false')),
      `expect enabled reason, got ${decision.reasons.join('|')}`,
    );
    assert.ok(
      decision.reasons.some((r) =>
        r.includes('permissions.allow_auto_continue=false'),
      ),
      `expect permission reason, got ${decision.reasons.join('|')}`,
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 3) evaluateAutoContinueGuard：双总开关都打开后允许
{
  const projectDir = makeProject();
  try {
    writeProjectConfig(projectDir, {
      permissions: { allow_auto_continue: true },
      auto_continue: {
        enabled: true,
        max_steps: 3,
        cooldown_ms: 0,
        require_clean_tree: false,
        stop_on_feedback_signal: true,
      },
    });
    const config = readWorkflowConfig(projectDir);
    const decision = evaluateAutoContinueGuard({
      projectDir,
      config,
      stepsAlreadyDone: 0,
    });
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.reasons.length, 0);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 4) max_steps 上限拦截
{
  const projectDir = makeProject();
  try {
    writeProjectConfig(projectDir, {
      permissions: { allow_auto_continue: true },
      auto_continue: {
        enabled: true,
        max_steps: 2,
        cooldown_ms: 0,
        require_clean_tree: false,
        stop_on_feedback_signal: true,
      },
    });
    const config = readWorkflowConfig(projectDir);
    const decision = evaluateAutoContinueGuard({
      projectDir,
      config,
      stepsAlreadyDone: 2,
    });
    assert.strictEqual(decision.allowed, false);
    assert.ok(
      decision.reasons.some((r) => r.includes('max_steps reached')),
      `expect max_steps reason, got ${decision.reasons.join('|')}`,
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 5) 冷却期内被拒（注入固定 now，让上次步骤刚结束）
{
  const projectDir = makeProject();
  try {
    writeProjectConfig(projectDir, {
      permissions: { allow_auto_continue: true },
      auto_continue: {
        enabled: true,
        max_steps: 5,
        cooldown_ms: 5000,
        require_clean_tree: false,
        stop_on_feedback_signal: true,
      },
    });
    const config = readWorkflowConfig(projectDir);
    // 模拟"上一步在 1 秒前刚结束"
    const recentIso = new Date(Date.now() - 1000).toISOString();
    writeFileSync(
      join(projectDir, '.pm-workflow', 'state.json'),
      JSON.stringify(
        {
          ...readState(projectDir),
          auto_continue: {
            last_step_at: recentIso,
            steps_used: 1,
            aborted_reason: null,
          },
        },
        null,
        2,
      ),
      'utf-8',
    );
    const decision = evaluateAutoContinueGuard({
      projectDir,
      config,
      stepsAlreadyDone: 1,
      now: () => Date.parse(recentIso) + 1000,
    });
    assert.strictEqual(decision.allowed, false);
    assert.ok(
      decision.reasons.some((r) => r.includes('cooldown_ms')),
      `expect cooldown reason, got ${decision.reasons.join('|')}`,
    );
    assert.ok(
      typeof decision.cooldownRemainingMs === 'number' &&
        decision.cooldownRemainingMs > 0,
      'cooldownRemainingMs should be positive',
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 6) 冷却期外允许
{
  const projectDir = makeProject();
  try {
    writeProjectConfig(projectDir, {
      permissions: { allow_auto_continue: true },
      auto_continue: {
        enabled: true,
        max_steps: 5,
        cooldown_ms: 5000,
        require_clean_tree: false,
        stop_on_feedback_signal: true,
      },
    });
    const config = readWorkflowConfig(projectDir);
    // 上一步发生在 10 秒前
    const oldIso = new Date(Date.now() - 10_000).toISOString();
    writeFileSync(
      join(projectDir, '.pm-workflow', 'state.json'),
      JSON.stringify(
        {
          ...readState(projectDir),
          auto_continue: {
            last_step_at: oldIso,
            steps_used: 1,
            aborted_reason: null,
          },
        },
        null,
        2,
      ),
      'utf-8',
    );
    const decision = evaluateAutoContinueGuard({
      projectDir,
      config,
      stepsAlreadyDone: 1,
      now: () => Date.parse(oldIso) + 10_000,
    });
    assert.strictEqual(decision.allowed, true);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 7) 状态机生命周期：start → step → step → aborted
{
  const projectDir = makeProject();
  try {
    writeProjectConfig(projectDir, {});
    markAutoContinueChainStart(projectDir, { initialAction: 'start-development' });
    let state = readState(projectDir);
    assert.strictEqual(state.auto_continue.steps_used, 0);
    assert.strictEqual(state.auto_continue.aborted_reason, null);

    recordAutoContinueStep(projectDir, {
      stepIndex: 1,
      action: 'run-code-review',
      agent: 'fixer',
      exitCode: 0,
    });
    state = readState(projectDir);
    assert.strictEqual(state.auto_continue.steps_used, 1);
    assert.ok(state.auto_continue.last_step_at);

    recordAutoContinueStep(projectDir, {
      stepIndex: 2,
      action: 'continue-development',
      agent: 'commander',
      exitCode: 0,
    });
    state = readState(projectDir);
    assert.strictEqual(state.auto_continue.steps_used, 2);

    markAutoContinueAborted(projectDir, 'feedback-stop', { matched: '停下' });
    state = readState(projectDir);
    assert.strictEqual(state.auto_continue.aborted_reason, 'feedback-stop');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 8) defaultWorkflowConfig 默认值符合"安全优先"原则
{
  const config = defaultWorkflowConfig();
  assert.strictEqual(config.permissions.allow_auto_continue, false);
  assert.strictEqual(config.auto_continue.enabled, false);
  assert.ok(config.auto_continue.max_steps >= 1);
  assert.ok(config.auto_continue.cooldown_ms >= 0);
  assert.strictEqual(config.auto_continue.stop_on_feedback_signal, true);
}

console.log('auto-continue tests passed');
