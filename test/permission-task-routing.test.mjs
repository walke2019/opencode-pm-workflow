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
    '    pm_backend: allow',
    '    pm_frontend: allow',
    '    pm_reviewer: ask',
    '    pm_researcher: deny',
    '---',
    '',
    '正文不影响解析',
  ].join('\n');

  const { taskPermission } = parseFrontmatterTaskPermission(raw);
  assert.strictEqual(taskPermission.pm_backend, 'allow');
  assert.strictEqual(taskPermission.pm_frontend, 'allow');
  assert.strictEqual(taskPermission.pm_reviewer, 'ask');
  assert.strictEqual(taskPermission.pm_researcher, 'deny');
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
    '    pm_backend: allow',
    '    pm_frontend: yes',
    '    pm_reviewer: 1',
    '---',
  ].join('\n');
  const { taskPermission } = parseFrontmatterTaskPermission(raw);
  assert.strictEqual(taskPermission.pm_backend, 'allow');
  assert.strictEqual(taskPermission.pm_frontend, undefined);
  assert.strictEqual(taskPermission.pm_reviewer, undefined);
}

// 4) parseFrontmatterTaskPermission：带引号的 value 也能解析
{
  const raw = [
    '---',
    'permission:',
    '  task:',
    '    pm_backend: "allow"',
    "    pm_frontend: 'deny'",
    '---',
  ].join('\n');
  const { taskPermission } = parseFrontmatterTaskPermission(raw);
  assert.strictEqual(taskPermission.pm_backend, 'allow');
  assert.strictEqual(taskPermission.pm_frontend, 'deny');
}

// 5) resolveAgentTaskRouting：项目级 agent 命中
{
  const projectDir = makeProjectWithAgent(
    'pm_lead.md',
    [
      '---',
      'description: x',
      'permission:',
      '  task:',
      '    pm_backend: allow',
      '    pm_researcher: deny',
      '---',
    ].join('\n'),
  );
  try {
    const routing = resolveAgentTaskRouting({
      projectDir,
      primaryAgent: 'pm_lead',
    });
    assert.strictEqual(routing.source, 'project');
    assert.deepStrictEqual(routing.allowedSubagents.sort(), ['pm_backend']);
    assert.deepStrictEqual(routing.deniedSubagents.sort(), ['pm_researcher']);
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
      primaryAgent: 'pm_lead',
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
    'pm_lead.md',
    [
      '---',
      'permission:',
      '  task:',
      '    pm_reviewer: ask',
      '---',
    ].join('\n'),
  );
  try {
    const routing = resolveAgentTaskRouting({
      projectDir,
      primaryAgent: 'pm_lead',
    });
    assert.deepStrictEqual(routing.allowedSubagents, ['pm_reviewer']);
    assert.strictEqual(routing.taskPermission.pm_reviewer, 'ask');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 8) isSubagentAllowedByDeclarativeRouting：deny 优先
{
  const projectDir = makeProjectWithAgent(
    'pm_lead.md',
    [
      '---',
      'permission:',
      '  task:',
      '    pm_backend: deny',
      '    pm_reviewer: allow',
      '---',
    ].join('\n'),
  );
  try {
    const routing = resolveAgentTaskRouting({
      projectDir,
      primaryAgent: 'pm_lead',
    });

    const denied = isSubagentAllowedByDeclarativeRouting({
      routing,
      candidate: 'pm_backend',
    });
    assert.strictEqual(denied.allowed, false);
    assert.match(denied.reason, /deny/);

    const allowed = isSubagentAllowedByDeclarativeRouting({
      routing,
      candidate: 'pm_reviewer',
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
    'pm_lead.md',
    [
      '---',
      'permission:',
      '  task:',
      '    pm_backend: allow',
      '---',
    ].join('\n'),
  );
  try {
    const routing = resolveAgentTaskRouting({
      projectDir,
      primaryAgent: 'pm_lead',
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
      primaryAgent: 'pm_lead',
    });
    assert.strictEqual(routing.source, 'none');

    const decision = isSubagentAllowedByDeclarativeRouting({
      routing,
      candidate: 'pm_backend',
    });
    assert.strictEqual(decision.allowed, true);
    assert.match(decision.reason, /no frontmatter routing|legacy dispatch_map/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

console.log('permission-task-routing tests passed');
