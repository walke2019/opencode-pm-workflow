import assert from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isSubagentAllowedByDeclarativeRouting,
  parseFrontmatterTaskPermission,
  resolveAgentTaskRouting,
} from '../dist/index.js';

function makeProjectWithAgent(filename, body) {
  const projectDir = mkdtempSync(join(tmpdir(), 'pm-workflow-routing-'));
  const agentsDir = join(projectDir, '.opencode', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, filename), body, 'utf-8');
  return projectDir;
}

// 1) parseFrontmatterTaskPermission：典型完整 frontmatter
{
  const raw = [
    '---',
    'description: PM 主协调官',
    'mode: primary',
    'permission:',
    '  task:',
    '    backendcoder: allow',
    '    designer: allow',
    '    fixer: ask',
    '    advisor: deny',
    '---',
    '',
    '正文不影响解析',
  ].join('\n');

  const { taskPermission } = parseFrontmatterTaskPermission(raw);
  assert.strictEqual(taskPermission.backendcoder, 'allow');
  assert.strictEqual(taskPermission.designer, 'allow');
  assert.strictEqual(taskPermission.fixer, 'ask');
  assert.strictEqual(taskPermission.advisor, 'deny');
}

// 2) parseFrontmatterTaskPermission：无 frontmatter 或无 permission 节
{
  const noFrontmatter = parseFrontmatterTaskPermission('# 普通 markdown 文档\n');
  assert.deepStrictEqual(noFrontmatter.taskPermission, {});

  const noPermission = parseFrontmatterTaskPermission(
    '---\ndescription: x\nmode: primary\n---\n',
  );
  assert.deepStrictEqual(noPermission.taskPermission, {});

  const permissionWithoutTask = parseFrontmatterTaskPermission(
    '---\npermission:\n  edit: allow\n  write: allow\n---\n',
  );
  assert.deepStrictEqual(permissionWithoutTask.taskPermission, {});
}

// 3) parseFrontmatterTaskPermission：只识别合法 value，错值跳过
{
  const raw = [
    '---',
    'permission:',
    '  task:',
    '    backendcoder: allow',
    '    designer: yes',
    '    fixer: 1',
    '---',
  ].join('\n');
  const { taskPermission } = parseFrontmatterTaskPermission(raw);
  assert.strictEqual(taskPermission.backendcoder, 'allow');
  assert.strictEqual(taskPermission.designer, undefined);
  assert.strictEqual(taskPermission.fixer, undefined);
}

// 4) parseFrontmatterTaskPermission：带引号的 value 也能解析
{
  const raw = [
    '---',
    'permission:',
    '  task:',
    '    backendcoder: "allow"',
    "    designer: 'deny'",
    '---',
  ].join('\n');
  const { taskPermission } = parseFrontmatterTaskPermission(raw);
  assert.strictEqual(taskPermission.backendcoder, 'allow');
  assert.strictEqual(taskPermission.designer, 'deny');
}

// 5) resolveAgentTaskRouting：项目级 agent 命中
{
  const projectDir = makeProjectWithAgent(
    'commander.md',
    [
      '---',
      'description: x',
      'permission:',
      '  task:',
      '    backendcoder: allow',
      '    advisor: deny',
      '---',
    ].join('\n'),
  );
  try {
    const routing = resolveAgentTaskRouting({
      projectDir,
      primaryAgent: 'commander',
    });
    assert.strictEqual(routing.source, 'project');
    assert.deepStrictEqual(routing.allowedSubagents.sort(), ['backendcoder']);
    assert.deepStrictEqual(routing.deniedSubagents.sort(), ['advisor']);
    assert.ok(routing.filePath);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 6) resolveAgentTaskRouting：找不到 markdown 时 source=none
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pm-workflow-routing-empty-'));
  try {
    const routing = resolveAgentTaskRouting({
      projectDir,
      primaryAgent: 'commander',
    });
    assert.strictEqual(routing.source, 'none');
    assert.deepStrictEqual(routing.allowedSubagents, []);
    assert.deepStrictEqual(routing.deniedSubagents, []);
    assert.deepStrictEqual(routing.taskPermission, {});
    assert.strictEqual(routing.filePath, undefined);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 7) resolveAgentTaskRouting：ask 也算 allowedSubagents
{
  const projectDir = makeProjectWithAgent(
    'commander.md',
    [
      '---',
      'permission:',
      '  task:',
      '    fixer: ask',
      '---',
    ].join('\n'),
  );
  try {
    const routing = resolveAgentTaskRouting({
      projectDir,
      primaryAgent: 'commander',
    });
    assert.deepStrictEqual(routing.allowedSubagents, ['fixer']);
    assert.strictEqual(routing.taskPermission.fixer, 'ask');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 8) isSubagentAllowedByDeclarativeRouting：deny 优先
{
  const projectDir = makeProjectWithAgent(
    'commander.md',
    [
      '---',
      'permission:',
      '  task:',
      '    backendcoder: deny',
      '    fixer: allow',
      '---',
    ].join('\n'),
  );
  try {
    const routing = resolveAgentTaskRouting({
      projectDir,
      primaryAgent: 'commander',
    });

    const denied = isSubagentAllowedByDeclarativeRouting({
      routing,
      candidate: 'backendcoder',
    });
    assert.strictEqual(denied.allowed, false);
    assert.match(denied.reason, /deny/);

    const allowed = isSubagentAllowedByDeclarativeRouting({
      routing,
      candidate: 'fixer',
    });
    assert.strictEqual(allowed.allowed, true);
    assert.match(allowed.reason, /allow/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 9) isSubagentAllowedByDeclarativeRouting：未声明的 candidate 走 fallback
{
  const projectDir = makeProjectWithAgent(
    'commander.md',
    [
      '---',
      'permission:',
      '  task:',
      '    backendcoder: allow',
      '---',
    ].join('\n'),
  );
  try {
    const routing = resolveAgentTaskRouting({
      projectDir,
      primaryAgent: 'commander',
    });

    const fallbackTrue = isSubagentAllowedByDeclarativeRouting({
      routing,
      candidate: 'pm_unknown',
    });
    assert.strictEqual(fallbackTrue.allowed, true, 'fallback default true 应允许');

    const fallbackFalse = isSubagentAllowedByDeclarativeRouting({
      routing,
      candidate: 'pm_unknown',
      fallbackAllow: false,
    });
    assert.strictEqual(fallbackFalse.allowed, false, 'fallbackAllow=false 应拒绝');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 10) isSubagentAllowedByDeclarativeRouting：source=none 时按 fallback 决定
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pm-workflow-routing-none-'));
  try {
    const routing = resolveAgentTaskRouting({
      projectDir,
      primaryAgent: 'commander',
    });
    assert.strictEqual(routing.source, 'none');

    const decision = isSubagentAllowedByDeclarativeRouting({
      routing,
      candidate: 'backendcoder',
    });
    assert.strictEqual(decision.allowed, true);
    assert.match(decision.reason, /no frontmatter routing|legacy dispatch_map/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

console.log('permission-task-routing tests passed');
