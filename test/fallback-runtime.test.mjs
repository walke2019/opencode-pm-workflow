import assert from 'node:assert';
import {
  buildForegroundFallbackPlan,
  defaultWorkflowConfig,
  detectFallbackTrigger,
  pickNextFallbackModel,
  resolveFallbackChain,
} from '../dist/index.js';

// 1) detectFallbackTrigger：exitCode = 0 时永远不触发
{
  const signal = detectFallbackTrigger({
    exitCode: 0,
    stderr: 'rate limit reached',
  });
  assert.strictEqual(signal, undefined, 'exit=0 时不应触发降级');
}

// 2) detectFallbackTrigger：四种触发器分别命中
{
  const rateLimit = detectFallbackTrigger({
    exitCode: 1,
    stderr: 'HTTP 429 Too Many Requests',
  });
  assert.ok(rateLimit, '429 应触发');
  assert.strictEqual(rateLimit.kind, 'rate_limit');
  assert.strictEqual(rateLimit.source, 'stderr');

  const timeout = detectFallbackTrigger({
    exitCode: 1,
    stdout: 'request timed out after 30s',
  });
  assert.ok(timeout);
  assert.strictEqual(timeout.kind, 'timeout');
  assert.strictEqual(timeout.source, 'stdout');

  const overflow = detectFallbackTrigger({
    exitCode: 1,
    stderr: 'maximum context length exceeded',
  });
  assert.ok(overflow);
  assert.strictEqual(overflow.kind, 'context_overflow');

  const unavailable = detectFallbackTrigger({
    exitCode: 1,
    stderr: 'model not found: kr/deprecated-model',
  });
  assert.ok(unavailable);
  assert.strictEqual(unavailable.kind, 'model_unavailable');
}

// 3) detectFallbackTrigger：stderr 优先于 stdout，避免误归因
{
  const signal = detectFallbackTrigger({
    exitCode: 1,
    stdout: 'normal output',
    stderr: 'rate-limit hit',
  });
  assert.ok(signal);
  assert.strictEqual(signal.source, 'stderr');
}

// 4) detectFallbackTrigger：未命中任何模式时返回 undefined
{
  const signal = detectFallbackTrigger({
    exitCode: 1,
    stderr: 'syntax error in user prompt',
  });
  assert.strictEqual(
    signal,
    undefined,
    '通用错误（非降级类）不应触发',
  );
}

// 5) resolveFallbackChain：按 agent + 按 model 双索引合并去重
{
  const config = defaultWorkflowConfig();
  config.fallback.chains = {
    commander: ['provider/a', 'provider/b'],
    'provider/c': ['provider/d', 'provider/a'],
  };

  const byAgentOnly = resolveFallbackChain({
    config,
    semanticAgent: 'commander',
  });
  assert.deepStrictEqual(byAgentOnly, ['provider/a', 'provider/b']);

  const merged = resolveFallbackChain({
    config,
    semanticAgent: 'commander',
    currentModel: 'provider/c',
  });
  // commander 链路 + provider/c 链路合并；去重保留首次出现。
  // currentModel='provider/c' 自身不在两条链路里，因此不会出现在 merged 里。
  assert.deepStrictEqual(merged, ['provider/a', 'provider/b', 'provider/d']);

  const empty = resolveFallbackChain({
    config,
    semanticAgent: 'backendcoder',
  });
  assert.deepStrictEqual(empty, [], '未配置 chain 的 agent 应得空数组');
}

// 6) resolveFallbackChain：currentModel 在链路里时保留位置（让 pickNext 按位置走）
{
  const config = defaultWorkflowConfig();
  config.fallback.chains = {
    commander: ['provider/a', 'provider/b', 'provider/c'],
  };

  const chain = resolveFallbackChain({
    config,
    semanticAgent: 'commander',
    currentModel: 'provider/b',
  });
  // 保留位置便于 pickNext 按位置推进；去重保证不重复出现。
  assert.deepStrictEqual(chain, ['provider/a', 'provider/b', 'provider/c']);
  assert.strictEqual(
    pickNextFallbackModel({ chain, currentModel: 'provider/b' }),
    'provider/c',
    'currentModel 在中间时应取下一个',
  );
}

// 7) pickNextFallbackModel：边界场景
{
  // 空链路 → undefined
  assert.strictEqual(pickNextFallbackModel({ chain: [] }), undefined);

  // 没有 currentModel → 取第一个
  assert.strictEqual(
    pickNextFallbackModel({ chain: ['x', 'y'] }),
    'x',
  );

  // currentModel 不在链路 → 取第一个
  assert.strictEqual(
    pickNextFallbackModel({
      chain: ['x', 'y'],
      currentModel: 'z',
    }),
    'x',
  );

  // currentModel 在链路中间 → 取下一个
  assert.strictEqual(
    pickNextFallbackModel({
      chain: ['x', 'y', 'z'],
      currentModel: 'y',
    }),
    'z',
  );

  // currentModel 是链路最后一个 → undefined（用尽）
  assert.strictEqual(
    pickNextFallbackModel({
      chain: ['x', 'y', 'z'],
      currentModel: 'z',
    }),
    undefined,
  );
}

// 8) buildForegroundFallbackPlan：完整集成
{
  const config = defaultWorkflowConfig();
  config.fallback.chains = {
    backendcoder: ['fallback/a', 'fallback/b'],
  };

  // 8a) 未触发：成功执行
  const ok = buildForegroundFallbackPlan({
    config,
    semanticAgent: 'backendcoder',
    exitCode: 0,
  });
  assert.strictEqual(ok.triggered, false);
  assert.strictEqual(ok.nextModel, undefined);

  // 8b) 触发但无链路：未配置 chain 的 agent
  const noChain = buildForegroundFallbackPlan({
    config,
    semanticAgent: 'commander',
    exitCode: 1,
    stderr: '429 rate limit',
  });
  assert.strictEqual(noChain.triggered, true);
  assert.strictEqual(noChain.nextModel, undefined);
  assert.deepStrictEqual(noChain.chain, []);
  assert.match(noChain.reason, /chain exhausted/);

  // 8c) 触发且可降级：第一次切换
  const first = buildForegroundFallbackPlan({
    config,
    semanticAgent: 'backendcoder',
    exitCode: 1,
    stderr: '429 too many requests',
  });
  assert.strictEqual(first.triggered, true);
  assert.strictEqual(first.nextModel, 'fallback/a');
  assert.strictEqual(first.signal?.kind, 'rate_limit');
  assert.match(first.reason, /switching to fallback\/a/);

  // 8d) 已用过第一个备选，触发再次切换
  const second = buildForegroundFallbackPlan({
    config,
    semanticAgent: 'backendcoder',
    currentModel: 'fallback/a',
    exitCode: 1,
    stderr: 'request timed out',
  });
  assert.strictEqual(second.triggered, true);
  assert.strictEqual(second.nextModel, 'fallback/b');

  // 8e) 链路用尽
  const exhausted = buildForegroundFallbackPlan({
    config,
    semanticAgent: 'backendcoder',
    currentModel: 'fallback/b',
    exitCode: 1,
    stderr: 'rate limit hit',
  });
  assert.strictEqual(exhausted.triggered, true);
  assert.strictEqual(exhausted.nextModel, undefined);
  assert.match(exhausted.reason, /chain exhausted/);
}

console.log('fallback-runtime tests passed');
