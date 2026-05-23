/**
 * agent-theme 模块单元测试。
 *
 * 覆盖：
 * - 主题渲染：default / sanguo / xiyou / marvel / workplace 都能产出完整 6 个 agent。
 * - apply (project / global)：写到正确目录、文件名 = agent ID、frontmatter 含主题字段。
 * - preserveExisting：apply 到已有文件时不覆盖用户配置（model / mode / permission）。
 * - dryRun：不写盘，仅返回渲染结果。
 * - registry 解析：display_name / theme 字段正确回填到 ResolvedAgentDefinition。
 */

import assert from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyAgentTheme,
  FIXED_AGENT_IDS,
  getBuiltinTheme,
  listAgentThemes,
  listBuiltinThemes,
  previewAgentTheme,
  renderAgentMdForTheme,
  resolveThemeTargetDir,
  resolveWorkflowAgentDefinition,
} from '../dist/index.js';

function testListThemesContainsBuiltins() {
  const list = listAgentThemes();
  const ids = list.map((t) => t.id);
  for (const expected of ['default', 'sanguo', 'xiyou', 'marvel', 'workplace']) {
    assert.ok(ids.includes(expected), `内置主题缺失: ${expected}`);
  }
  for (const item of list) {
    assert.ok(item.label.length > 0, `${item.id} 缺少 label`);
    assert.ok(item.summary.length > 0, `${item.id} 缺少 summary`);
    assert.ok(item.roleCount >= 1, `${item.id} 至少要有 1 个角色`);
  }
}

function testEachBuiltinThemeHasFullSixAgents() {
  for (const theme of listBuiltinThemes()) {
    const skinKeys = Object.keys(theme.roles);
    for (const expected of FIXED_AGENT_IDS) {
      assert.ok(
        skinKeys.includes(expected),
        `主题 ${theme.id} 缺少 ${expected} 角色皮肤`,
      );
    }
    for (const skin of Object.values(theme.roles)) {
      assert.ok(skin.display_name.length > 0, `${theme.id} 有空 display_name`);
      assert.ok(skin.display_name.length <= 12, `${theme.id} display_name 超过 12 字: ${skin.display_name}`);
      assert.ok(skin.description.length > 0, `${theme.id} 有空 description`);
      assert.ok(skin.body.length > 0, `${theme.id} 有空 body`);
    }
  }
}

function testGetBuiltinThemeReturnsCopy() {
  const theme = getBuiltinTheme('sanguo');
  assert.ok(theme, 'sanguo 主题应该存在');
  assert.strictEqual(theme.id, 'sanguo');
  // mutation 不应回流到下一次 get
  theme.label = 'mutated';
  const fresh = getBuiltinTheme('sanguo');
  assert.strictEqual(fresh.label, '三国');
}

function testGetBuiltinThemeUnknownReturnsUndefined() {
  const theme = getBuiltinTheme('nonexistent-theme-id');
  assert.strictEqual(theme, undefined);
}

function testRenderAgentMdProducesValidFrontmatter() {
  const rendered = renderAgentMdForTheme({
    agent: 'commander',
    themeId: 'sanguo',
  });
  assert.ok(rendered.content.startsWith('---\n'), '应该以 frontmatter 开头');
  assert.ok(rendered.content.includes('description: '), '应包含 description');
  assert.ok(rendered.content.includes('display_name: 诸葛亮'), '应包含主题展示名');
  assert.ok(rendered.content.includes('theme: sanguo'), '应包含 theme 字段');
  assert.ok(rendered.content.includes('诸葛亮'), 'body 应包含主题角色名');
  assert.strictEqual(rendered.fellBackToDefault, false);
}

function testApplyThemeToProjectScopeWritesFiles() {
  const sandbox = mkdtempSync(join(tmpdir(), 'agent-theme-project-'));
  const result = applyAgentTheme({
    projectDir: sandbox,
    themeId: 'sanguo',
    scope: 'project',
  });

  assert.strictEqual(result.dryRun, false);
  assert.strictEqual(result.themeId, 'sanguo');
  assert.strictEqual(result.scope, 'project');
  assert.ok(result.targetDir.endsWith('/.opencode/agents'), '应写到 .opencode/agents/');
  assert.strictEqual(result.written.length, 6, '应写 6 个 agent');
  assert.strictEqual(result.skipped.length, 0);

  for (const agent of FIXED_AGENT_IDS) {
    const filePath = join(result.targetDir, `${agent}.md`);
    assert.ok(existsSync(filePath), `${agent}.md 应被写入`);
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('theme: sanguo'));
    assert.ok(content.includes('display_name: '));
  }
}

function testApplyThemeToGlobalScopeRespectsXdgConfigHome() {
  const sandbox = mkdtempSync(join(tmpdir(), 'agent-theme-global-'));
  const xdgHome = join(sandbox, 'xdg');
  const projectDir = join(sandbox, 'project');
  mkdirSync(projectDir, { recursive: true });

  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = xdgHome;
  try {
    const result = applyAgentTheme({
      projectDir,
      themeId: 'marvel',
      scope: 'global',
    });
    assert.ok(
      result.targetDir.includes(xdgHome),
      `global scope 应使用 XDG_CONFIG_HOME，得到的是: ${result.targetDir}`,
    );
    assert.ok(result.targetDir.endsWith('/opencode/agents'));
    assert.strictEqual(result.written.length, 6);

    const leadFile = join(result.targetDir, 'commander.md');
    const content = readFileSync(leadFile, 'utf-8');
    assert.ok(content.includes('display_name: 美国队长'));
    assert.ok(content.includes('theme: marvel'));
  } finally {
    if (previousXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousXdg;
    }
  }
}

function testDryRunDoesNotWriteFiles() {
  const sandbox = mkdtempSync(join(tmpdir(), 'agent-theme-dryrun-'));
  const result = previewAgentTheme({
    projectDir: sandbox,
    themeId: 'xiyou',
    scope: 'project',
  });

  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.written.length, 6);
  for (const item of result.written) {
    assert.ok(!existsSync(item.filePath), `dry-run 不应写文件: ${item.filePath}`);
    assert.ok(item.content.length > 0, '渲染内容应非空');
  }
}

function testApplyPreservesExistingModelAndMode() {
  const sandbox = mkdtempSync(join(tmpdir(), 'agent-theme-preserve-'));
  const targetDir = join(sandbox, '.opencode', 'agents');
  mkdirSync(targetDir, { recursive: true });

  // 用户已有的 backendcoder.md，配了模型和 mode
  const existingPath = join(targetDir, 'backendcoder.md');
  writeFileSync(
    existingPath,
    [
      '---',
      'description: 旧描述',
      'mode: subagent',
      'model: bestool/claude-opus-4.x',
      'temperature: 0.3',
      'display_name: 旧名称',
      '---',
      '',
      '旧 body 内容',
      '',
    ].join('\n'),
    'utf-8',
  );

  const result = applyAgentTheme({
    projectDir: sandbox,
    themeId: 'sanguo',
    scope: 'project',
    agents: ['backendcoder'],
  });
  assert.strictEqual(result.written.length, 1);

  const after = readFileSync(existingPath, 'utf-8');
  assert.ok(after.includes('display_name: 吕布'), 'display_name 应被主题覆盖');
  assert.ok(after.includes('theme: sanguo'), 'theme 应被写入');
  assert.ok(after.includes('description: 吕布 — 后端攻坚'), 'description 应被主题覆盖');
  // 关键：用户的 model / mode 必须保留（preserveExisting 守护）
  assert.ok(after.includes('mode: subagent'), 'mode 应被保留');
  assert.ok(after.includes('model: bestool/claude-opus-4.x'), 'model 应被保留');
  // 1.0.0-rc.8 起 temperature 由主题强制写入，不再受 preserveExisting 影响
  // backendcoder 主题强制 temperature=0.2，旧值 0.3 会被覆盖
  assert.ok(after.includes('temperature: 0.2'), 'temperature 应被主题强制写为 0.2');
  // body 应被替换为主题 body
  assert.ok(after.includes('吕布'), '主题 body 应替换旧 body');
  assert.ok(!after.includes('旧 body 内容'), '旧 body 应被替换');
}

function testApplyForcesThemePermissionOverUserCustom() {
  // 1.0.0-rc.8 起：主题强制写入 permission，不再受 preserveExisting 影响。
  // 这是 OpenCode UI 与 task 白名单的核心约束——不允许用户自定义破坏。
  const sandbox = mkdtempSync(join(tmpdir(), 'agent-theme-perm-'));
  const targetDir = join(sandbox, '.opencode', 'agents');
  mkdirSync(targetDir, { recursive: true });

  // 用户已有的 commander.md 配了"宽松"的 permission（edit: allow，task 没白名单）
  const existingPath = join(targetDir, 'commander.md');
  writeFileSync(
    existingPath,
    [
      '---',
      'description: 旧描述',
      'mode: primary',
      'permission:',
      '  edit: allow',     // 用户配的宽松值
      '  bash: allow',     // 用户配的宽松值
      '  task:',
      '    custom-agent: allow',  // 用户曾经允许的第三方 agent
      '---',
      '',
      '旧 body',
      '',
    ].join('\n'),
    'utf-8',
  );

  const result = applyAgentTheme({
    projectDir: sandbox,
    themeId: 'sanguo',
    scope: 'project',
    agents: ['commander'],
  });
  assert.strictEqual(result.skipped.length, 0);

  const after = readFileSync(existingPath, 'utf-8');

  // 主题字段被覆盖
  assert.ok(after.includes('display_name: 诸葛亮'));
  assert.ok(after.includes('mode: primary'), 'commander mode 应是 primary');

  // 主题强制 commander 的 permission：edit/bash 都是 ask（防止误操作）
  assert.ok(after.includes('edit: ask'), 'commander permission.edit 应被主题强制为 ask');
  assert.ok(after.includes('bash: ask'), 'commander permission.bash 应被主题强制为 ask');
  // 用户原本的 edit/bash: allow 应被覆盖
  assert.ok(!after.match(/edit: allow/), '用户原 edit:allow 应被主题覆盖');

  // 主题强制 task 严格白名单
  assert.ok(after.includes('webfetch: allow'), 'commander permission.webfetch 应是 allow');
  assert.ok(after.includes('task:'), 'task 块应存在');
  assert.ok(after.match(/"\*": deny/) || after.match(/'\*': deny/), 'task "*" 应是 deny');
  assert.ok(after.includes('advisor: allow'), 'task.advisor 应允许');
  assert.ok(after.includes('backendcoder: allow'), 'task.backendcoder 应允许');
  assert.ok(after.includes('designer: allow'), 'task.designer 应允许');
  assert.ok(after.includes('fixer: allow'), 'task.fixer 应允许');
  assert.ok(after.includes('writer: allow'), 'task.writer 应允许');
  assert.ok(after.includes('explore: allow'), 'task.explore 应允许（OpenCode 内置只读）');
  assert.ok(after.includes('scout: allow'), 'task.scout 应允许（OpenCode 内置只读）');

  // 用户原本的 custom-agent 不在主题白名单里，应该被移除
  assert.ok(
    !after.includes('custom-agent: allow'),
    '用户自定义 task.custom-agent 应被主题覆盖移除',
  );
}

function testPreserveOptOutDropsExistingFields() {
  const sandbox = mkdtempSync(join(tmpdir(), 'agent-theme-no-preserve-'));
  const targetDir = join(sandbox, '.opencode', 'agents');
  mkdirSync(targetDir, { recursive: true });

  const existingPath = join(targetDir, 'backendcoder.md');
  writeFileSync(
    existingPath,
    [
      '---',
      'description: 旧描述',
      'mode: subagent',
      'model: bestool/claude-opus-4.x',
      '---',
      '',
      '旧 body',
      '',
    ].join('\n'),
    'utf-8',
  );

  applyAgentTheme({
    projectDir: sandbox,
    themeId: 'sanguo',
    scope: 'project',
    agents: ['backendcoder'],
    preserveExisting: { model: false, mode: false },
  });

  const after = readFileSync(existingPath, 'utf-8');
  assert.ok(!after.includes('model: bestool/claude-opus-4.x'), 'model 不应保留');
  // 1.0.0-rc.6 起 mode 由主题强制写入（commander = primary，其他 = subagent），
  // preserveExisting.mode 不再影响这个写入。这是核心 UI 修复——避免 OpenCode
  // 切换列表显示全部 6 个 agent。
  // backendcoder 主题里 mode = "subagent"，所以这里期望 mode: subagent 仍存在。
  assert.ok(after.includes('mode: subagent'), 'mode 必须由主题强制写入为 subagent');
  assert.ok(after.includes('display_name: 吕布'));
}

function testApplyOnUnknownThemeThrows() {
  const sandbox = mkdtempSync(join(tmpdir(), 'agent-theme-unknown-'));
  assert.throws(
    () =>
      applyAgentTheme({
        projectDir: sandbox,
        themeId: 'no-such-theme',
        scope: 'project',
      }),
    /unknown theme/,
  );
}

function testResolveThemeTargetDirRoutes() {
  const projectDir = '/tmp/some-project';
  const projectTarget = resolveThemeTargetDir('project', projectDir);
  assert.strictEqual(projectTarget, '/tmp/some-project/.opencode/agents');

  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = '/tmp/xdg-test';
  try {
    const globalTarget = resolveThemeTargetDir('global', projectDir);
    assert.strictEqual(globalTarget, '/tmp/xdg-test/opencode/agents');
  } finally {
    if (previousXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousXdg;
    }
  }
}

function testRegistryExtractsDisplayNameAndTheme() {
  const sandbox = mkdtempSync(join(tmpdir(), 'agent-theme-registry-'));
  const projectDir = join(sandbox, 'project');
  mkdirSync(join(projectDir, '.opencode', 'agents'), { recursive: true });

  applyAgentTheme({
    projectDir,
    themeId: 'sanguo',
    scope: 'project',
    agents: ['commander'],
  });

  const resolved = resolveWorkflowAgentDefinition({
    projectDir,
    semanticAgent: 'commander',
  });

  assert.strictEqual(resolved.id, 'commander');
  assert.strictEqual(resolved.displayName, '诸葛亮');
  assert.strictEqual(resolved.theme, 'sanguo');
  assert.ok(resolved.description?.startsWith('诸葛亮'));
}

function testRegistryHandlesAgentWithoutDisplayName() {
  // 未跑过 theme apply 的 fallback 路径，display_name / theme 应为 undefined。
  // 隔离 XDG_CONFIG_HOME 避免命中真实 ~/.config/opencode/agents/commander.md
  // （该文件是 rc.6 默认主题安装产物）。
  const xdgSandbox = mkdtempSync(join(tmpdir(), 'agent-theme-no-theme-'));
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = xdgSandbox;
  try {
    const resolved = resolveWorkflowAgentDefinition({
      projectDir: process.cwd(),
      semanticAgent: 'commander',
    });
    assert.strictEqual(resolved.displayName, undefined);
    assert.strictEqual(resolved.theme, undefined);
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
  }
}

function testApplyOnlySubsetOfAgents() {
  const sandbox = mkdtempSync(join(tmpdir(), 'agent-theme-subset-'));
  const result = applyAgentTheme({
    projectDir: sandbox,
    themeId: 'workplace',
    scope: 'project',
    agents: ['backendcoder', 'designer'],
  });
  assert.strictEqual(result.written.length, 2);
  const writtenAgents = result.written.map((w) => w.agent);
  assert.deepStrictEqual(writtenAgents.sort(), ['backendcoder', 'designer']);

  const targetDir = result.targetDir;
  assert.ok(existsSync(join(targetDir, 'backendcoder.md')));
  assert.ok(existsSync(join(targetDir, 'designer.md')));
  assert.ok(!existsSync(join(targetDir, 'commander.md')), '未指定的 agent 不应被写');
}

testListThemesContainsBuiltins();
testEachBuiltinThemeHasFullSixAgents();
testGetBuiltinThemeReturnsCopy();
testGetBuiltinThemeUnknownReturnsUndefined();
testRenderAgentMdProducesValidFrontmatter();
testApplyThemeToProjectScopeWritesFiles();
testApplyThemeToGlobalScopeRespectsXdgConfigHome();
testDryRunDoesNotWriteFiles();
testApplyPreservesExistingModelAndMode();
testApplyForcesThemePermissionOverUserCustom();
testPreserveOptOutDropsExistingFields();
testApplyOnUnknownThemeThrows();
testResolveThemeTargetDirRoutes();
testRegistryExtractsDisplayNameAndTheme();
testRegistryHandlesAgentWithoutDisplayName();
testApplyOnlySubsetOfAgents();
console.log('agent-theme tests passed');
