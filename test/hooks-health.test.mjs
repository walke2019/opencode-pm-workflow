import assert from 'node:assert';
import {
  DEFAULT_HEALTH_THRESHOLDS,
  _resetPluginActivationGuardForTesting,
  evaluatePluginHealth,
  guardPluginActivation,
  releasePluginActivation,
} from '../dist/index.js';

// 1) 满足全部阈值时无 finding，ok=true
{
  const report = evaluatePluginHealth({
    inputs: { agentsCount: 6, toolsCount: 20, mcpsCount: 0 },
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.findings.length, 0);
}

// 2) agents 不达标 → warn finding
{
  const report = evaluatePluginHealth({
    inputs: { agentsCount: 0, toolsCount: 20, mcpsCount: 0 },
  });
  assert.strictEqual(report.ok, true, 'warn 不应让整体不通过');
  assert.strictEqual(report.findings.length, 1);
  assert.strictEqual(report.findings[0].category, 'agents');
  assert.strictEqual(report.findings[0].severity, 'warn');
  assert.strictEqual(report.findings[0].expected, DEFAULT_HEALTH_THRESHOLDS.minAgents);
  assert.strictEqual(report.findings[0].actual, 0);
}

// 3) tools 不达标 → warn finding
{
  const report = evaluatePluginHealth({
    inputs: { agentsCount: 6, toolsCount: 1, mcpsCount: 0 },
  });
  assert.strictEqual(report.findings.length, 1);
  assert.strictEqual(report.findings[0].category, 'tools');
  assert.strictEqual(report.findings[0].severity, 'warn');
}

// 4) 自定义阈值覆盖
{
  const report = evaluatePluginHealth({
    thresholds: { minAgents: 10 },
    inputs: { agentsCount: 6, toolsCount: 20, mcpsCount: 0 },
  });
  assert.strictEqual(report.findings.length, 1);
  assert.strictEqual(report.findings[0].category, 'agents');
  assert.strictEqual(report.findings[0].expected, 10);
  assert.strictEqual(report.findings[0].actual, 6);
}

// 5) mcps 阈值仅 info（不做硬约束）
{
  const report = evaluatePluginHealth({
    thresholds: { minMcps: 3 },
    inputs: { agentsCount: 6, toolsCount: 20, mcpsCount: 0 },
  });
  assert.strictEqual(report.findings.length, 1);
  assert.strictEqual(report.findings[0].category, 'mcps');
  assert.strictEqual(report.findings[0].severity, 'info');
}

// 6) guardPluginActivation：首次返回 first，再次返回 duplicate
{
  _resetPluginActivationGuardForTesting();
  assert.strictEqual(guardPluginActivation('test.plugin'), 'first');
  assert.strictEqual(guardPluginActivation('test.plugin'), 'duplicate');
  assert.strictEqual(guardPluginActivation('test.plugin'), 'duplicate');
}

// 7) 不同 plugin id 互不影响
{
  _resetPluginActivationGuardForTesting();
  assert.strictEqual(guardPluginActivation('plugin.a'), 'first');
  assert.strictEqual(guardPluginActivation('plugin.b'), 'first');
  assert.strictEqual(guardPluginActivation('plugin.a'), 'duplicate');
}

// 8) reset 后重新计算
{
  _resetPluginActivationGuardForTesting();
  assert.strictEqual(guardPluginActivation('p1'), 'first');
  _resetPluginActivationGuardForTesting();
  assert.strictEqual(guardPluginActivation('p1'), 'first', 'reset 后应重新视为首次');
}

// 9) release 后同一 plugin id 可重新 first
{
  _resetPluginActivationGuardForTesting();
  assert.strictEqual(guardPluginActivation('p2'), 'first');
  assert.strictEqual(guardPluginActivation('p2'), 'duplicate');
  releasePluginActivation('p2');
  assert.strictEqual(guardPluginActivation('p2'), 'first');
}

console.log('hooks-health tests passed');
