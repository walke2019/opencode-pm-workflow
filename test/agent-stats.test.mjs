import assert from 'node:assert';
import {
  AGENT_STATS_LIBRARY,
  analyzeDispatchTask,
  buildHandoffPacket,
  pickAgentStats,
} from '../dist/index.js';

// 1) AGENT_STATS_LIBRARY：6 个核心 agent 都有完整卡片
{
  const expectedAgents = [
    'commander',
    'advisor',
    'backendcoder',
    'designer',
    'fixer',
    'advisor',
  ];
  for (const agent of expectedAgents) {
    const card = AGENT_STATS_LIBRARY[agent];
    assert.ok(card, `应有 ${agent} 的卡片`);
    assert.strictEqual(card.agent, agent);
    assert.ok(card.role, `${agent} 应有 role`);
    assert.ok(card.speed, `${agent} 应有 speed`);
    assert.ok(card.cost, `${agent} 应有 cost`);
    assert.ok(card.quality, `${agent} 应有 quality`);
    assert.ok(Array.isArray(card.delegateWhen));
    assert.ok(Array.isArray(card.dontDelegateWhen));
    assert.ok(card.ruleOfThumb);
  }
}

// 2) pickAgentStats：单候选场景不注入（节省 token）
{
  const stats = pickAgentStats({
    targetAgent: 'backendcoder',
    fallbackAgents: [],
  });
  assert.strictEqual(
    stats,
    undefined,
    '单候选场景应返回 undefined，避免无意义 token',
  );
}

// 3) pickAgentStats：多候选时 target 排第一
{
  const stats = pickAgentStats({
    targetAgent: 'backendcoder',
    fallbackAgents: ['fixer'],
  });
  assert.ok(stats);
  assert.strictEqual(stats.length, 2);
  assert.strictEqual(stats[0].agent, 'backendcoder', 'target 总是第一张');
  assert.strictEqual(stats[1].agent, 'fixer');
}

// 4) pickAgentStats：最多 3 张卡片
{
  const stats = pickAgentStats({
    targetAgent: 'commander',
    fallbackAgents: ['backendcoder', 'designer', 'fixer', 'advisor'],
  });
  assert.ok(stats);
  assert.strictEqual(stats.length, 3, '上限 3 张');
  assert.strictEqual(stats[0].agent, 'commander');
}

// 5) pickAgentStats：去重 - target 出现在 fallbackAgents 时不重复
{
  const stats = pickAgentStats({
    targetAgent: 'backendcoder',
    fallbackAgents: ['backendcoder', 'fixer'],
  });
  assert.ok(stats);
  assert.strictEqual(stats.length, 2);
  assert.strictEqual(stats[0].agent, 'backendcoder');
  assert.strictEqual(stats[1].agent, 'fixer');
  // target 不应被 fallback 中的同名再加一次
  const occurrences = stats.filter((c) => c.agent === 'backendcoder').length;
  assert.strictEqual(occurrences, 1);
}

// 6) buildHandoffPacket：单候选时不注入 agentStats
{
  const analysis = analyzeDispatchTask({
    prompt: '帮我补 README 安装说明',
    stage: 'development',
    blockedReasons: [],
  });
  // 无候选时确保无 agentStats
  if (analysis.fallbackAgents.length === 0) {
    const packet = buildHandoffPacket({
      prompt: '帮我补 README 安装说明',
      analysis,
    });
    assert.strictEqual(
      packet.agentStats,
      undefined,
      '单候选 handoff 不应注入 agentStats',
    );
  }
}

// 7) buildHandoffPacket：多候选时注入 agentStats
{
  const analysis = analyzeDispatchTask({
    prompt: '把 onboarding 流程的前端实现、说明文档和拆解方案一起补齐',
    stage: 'plan_ready',
    blockedReasons: [],
  });
  // 复合任务通常会出现多 fallback
  if (analysis.fallbackAgents.length > 0) {
    const packet = buildHandoffPacket({
      prompt: '把 onboarding 流程的前端实现、说明文档和拆解方案一起补齐',
      analysis,
    });
    assert.ok(packet.agentStats, '多候选 handoff 应注入 agentStats');
    assert.ok(packet.agentStats.length >= 2);
    assert.strictEqual(
      packet.agentStats[0].agent,
      analysis.recommendedAgent,
      'target 总是第一张卡片',
    );
  }
}

console.log('agent-stats tests passed');
