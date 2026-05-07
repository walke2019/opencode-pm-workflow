import assert from 'node:assert';
import {
  analyzeDispatchTask,
  inferTopologyFromAnalysis,
  summarizeLaneDispatch,
} from '../dist/index.js';

async function testTopologyInference() {
  const simple = analyzeDispatchTask({
    prompt: '帮我补 README 的安装说明',
    stage: 'development',
    blockedReasons: [],
  });
  assert.strictEqual(inferTopologyFromAnalysis(simple).topology, 'single');

  const composite = analyzeDispatchTask({
    prompt: '把 onboarding 流程的前端实现、说明文档和拆解方案一起补齐',
    stage: 'plan_ready',
    blockedReasons: [],
  });
  assert.strictEqual(inferTopologyFromAnalysis(composite).topology, 'hybrid');

  const summary = summarizeLaneDispatch({ analysis: composite, lane: 'medium' });
  assert.strictEqual(summary.todo.shouldCreate, true);
  assert.strictEqual(summary.topology.topology, 'hybrid');
}

await testTopologyInference();
