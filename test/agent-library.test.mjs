import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  doctorAgentLibrary,
  listAgentLibrary,
  promoteProjectAgentToGlobal,
} from '../dist/index.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..');
const CLI_PATH = join(REPO_ROOT, 'scripts', 'cli', 'index.mjs');

function makeProject(agentFiles = {}) {
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-agentlib-'));
  const agentsDir = join(projectDir, '.opencode', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  for (const [name, body] of Object.entries(agentFiles)) {
    writeFileSync(join(agentsDir, name), body, 'utf-8');
  }
  return projectDir;
}

function makeXdgWithGlobalAgent(name, body) {
  const xdgHome = mkdtempSync(join(tmpdir(), 'pmw-xdg-'));
  const globalAgentsDir = join(xdgHome, 'opencode', 'agents');
  mkdirSync(globalAgentsDir, { recursive: true });
  writeFileSync(join(globalAgentsDir, name), body, 'utf-8');
  return xdgHome;
}

const COMPLETE_AGENT = [
  '---',
  'description: 完整 PM 主协调官',
  'mode: primary',
  'model: kr/claude-sonnet-4.5',
  'permission:',
  '  task:',
  '    backendcoder: allow',
  '---',
  '正文',
].join('\n');

const MINIMAL_AGENT = ['---', 'mode: subagent', '---', '后端'].join('\n');

// 1) listAgentLibrary：项目级 agent 全部识别，frontmatter 字段抽取正确
{
  const projectDir = makeProject({
    'commander.md': COMPLETE_AGENT,
    'backendcoder.md': MINIMAL_AGENT,
  });
  try {
    process.env.XDG_CONFIG_HOME = join(projectDir, 'xdg-empty');
    const report = listAgentLibrary(projectDir);
    assert.strictEqual(report.agents.length, 2);
    assert.deepStrictEqual(report.projectAgents, ['backendcoder', 'commander']);
    assert.deepStrictEqual(report.globalAgents, []);

    const lead = report.agents.find((a) => a.id === 'commander');
    assert.strictEqual(lead.source, 'project');
    assert.strictEqual(lead.description, '完整 PM 主协调官');
    assert.strictEqual(lead.mode, 'primary');
    assert.strictEqual(lead.model, 'kr/claude-sonnet-4.5');
    assert.strictEqual(lead.hasTaskPermission, true);
    assert.strictEqual(lead.findings.length, 0);

    const backend = report.agents.find((a) => a.id === 'backendcoder');
    assert.strictEqual(backend.findings.length, 2);
    assert.ok(backend.findings.some((f) => f.field === 'description'));
    assert.ok(backend.findings.some((f) => f.field === 'model'));
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 1b) listAgentLibrary：缺 frontmatter model 时读取 opencode.json.agent 的真实模型来源
{
  const projectDir = makeProject({
    'writer.md': ['---', 'description: writer', 'mode: subagent', '---', '正文'].join('\n'),
  });
  const xdgHome = mkdtempSync(join(tmpdir(), 'pmw-xdg-model-source-'));
  mkdirSync(join(xdgHome, 'opencode'), { recursive: true });
  writeFileSync(
    join(xdgHome, 'opencode', 'opencode.json'),
    JSON.stringify({
      agent: {
        writer: { model: 'cx/gpt-5.4' },
      },
    }),
    'utf-8',
  );
  try {
    process.env.XDG_CONFIG_HOME = xdgHome;
    const report = listAgentLibrary(projectDir);
    const writer = report.agents.find((a) => a.id === 'writer');
    assert.strictEqual(writer.model, 'cx/gpt-5.4');
    assert.strictEqual(writer.modelSource, 'opencode-global');
    assert.ok(
      !writer.findings.some((finding) => finding.field === 'model'),
      'opencode.json.agent 已配置 model 时不应再提示缺 model',
    );
  } finally {
    delete process.env.XDG_CONFIG_HOME;
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(xdgHome, { recursive: true, force: true });
  }
}

// 2) listAgentLibrary：项目覆盖全局
{
  const projectDir = makeProject({ 'commander.md': COMPLETE_AGENT });
  const xdgHome = makeXdgWithGlobalAgent('commander.md', MINIMAL_AGENT);
  try {
    process.env.XDG_CONFIG_HOME = xdgHome;
    const report = listAgentLibrary(projectDir);
    assert.deepStrictEqual(report.shadowedGlobals, ['commander']);
    // 同名时项目优先；agents 中 commander 来源应是 project
    const lead = report.agents.find((a) => a.id === 'commander');
    assert.strictEqual(lead.source, 'project');
    // global agents 列表仍包含 commander（提示有同名全局版本）
    assert.ok(report.globalAgents.includes('commander'));
  } finally {
    delete process.env.XDG_CONFIG_HOME;
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(xdgHome, { recursive: true, force: true });
  }
}

// 3) listAgentLibrary：同名时不重复列
{
  const projectDir = makeProject({ 'commander.md': COMPLETE_AGENT });
  const xdgHome = makeXdgWithGlobalAgent('commander.md', MINIMAL_AGENT);
  try {
    process.env.XDG_CONFIG_HOME = xdgHome;
    const report = listAgentLibrary(projectDir);
    const occurrences = report.agents.filter((a) => a.id === 'commander');
    assert.strictEqual(
      occurrences.length,
      1,
      '同名 agent 在 agents 列表中应只出现一次（项目优先）',
    );
  } finally {
    delete process.env.XDG_CONFIG_HOME;
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(xdgHome, { recursive: true, force: true });
  }
}

// 4) promoteProjectAgentToGlobal：成功路径
{
  const projectDir = makeProject({ 'commander.md': COMPLETE_AGENT });
  const xdgHome = mkdtempSync(join(tmpdir(), 'pmw-xdg-promote-'));
  try {
    process.env.XDG_CONFIG_HOME = xdgHome;
    const result = promoteProjectAgentToGlobal({
      projectDir,
      agentId: 'commander',
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.overwritten, false);
    assert.ok(existsSync(result.to));
    // 内容一致
    const projContent = readFileSync(result.from, 'utf-8');
    const globalContent = readFileSync(result.to, 'utf-8');
    assert.strictEqual(projContent, globalContent);
    // 项目级原文件保留
    assert.ok(existsSync(join(projectDir, '.opencode', 'agents', 'commander.md')));
  } finally {
    delete process.env.XDG_CONFIG_HOME;
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(xdgHome, { recursive: true, force: true });
  }
}

// 5) promoteProjectAgentToGlobal：项目级不存在 → 拒绝
{
  const projectDir = makeProject({});
  const xdgHome = mkdtempSync(join(tmpdir(), 'pmw-xdg-missing-'));
  try {
    process.env.XDG_CONFIG_HOME = xdgHome;
    const result = promoteProjectAgentToGlobal({
      projectDir,
      agentId: 'pm_unknown',
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.reason, /项目级 agent 不存在/);
  } finally {
    delete process.env.XDG_CONFIG_HOME;
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(xdgHome, { recursive: true, force: true });
  }
}

// 6) promoteProjectAgentToGlobal：全局已有 → 默认拒绝
{
  const projectDir = makeProject({ 'commander.md': COMPLETE_AGENT });
  const xdgHome = makeXdgWithGlobalAgent('commander.md', MINIMAL_AGENT);
  try {
    process.env.XDG_CONFIG_HOME = xdgHome;
    const result = promoteProjectAgentToGlobal({
      projectDir,
      agentId: 'commander',
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.reason, /全局已有同名/);
  } finally {
    delete process.env.XDG_CONFIG_HOME;
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(xdgHome, { recursive: true, force: true });
  }
}

// 7) promoteProjectAgentToGlobal：overwrite=true 强制
{
  const projectDir = makeProject({ 'commander.md': COMPLETE_AGENT });
  const xdgHome = makeXdgWithGlobalAgent('commander.md', MINIMAL_AGENT);
  try {
    process.env.XDG_CONFIG_HOME = xdgHome;
    const result = promoteProjectAgentToGlobal({
      projectDir,
      agentId: 'commander',
      overwrite: true,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.overwritten, true);
    // 全局内容已被项目版本替换
    const globalContent = readFileSync(result.to, 'utf-8');
    assert.match(globalContent, /完整 PM 主协调官/);
  } finally {
    delete process.env.XDG_CONFIG_HOME;
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(xdgHome, { recursive: true, force: true });
  }
}

// 8) doctorAgentLibrary：聚合计数与明细
{
  const projectDir = makeProject({
    'commander.md': COMPLETE_AGENT,
    'backendcoder.md': MINIMAL_AGENT, // 缺 description + model（mode=subagent，不触发 permission.task finding）
  });
  try {
    process.env.XDG_CONFIG_HOME = join(projectDir, 'xdg-empty');
    const report = doctorAgentLibrary(projectDir);
    assert.strictEqual(report.totalAgents, 2);
    assert.strictEqual(report.agentsWithFindings, 1);
    assert.strictEqual(report.totalFindings, 2);
    assert.strictEqual(report.byField.description, 1);
    assert.strictEqual(report.byField.model, 1);
    assert.strictEqual(report.bySeverity.warn, 1);
    assert.strictEqual(report.bySeverity.info, 1);
    assert.strictEqual(report.details.length, 1);
    assert.strictEqual(report.details[0].id, 'backendcoder');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 9) CLI: pmw agents list 输出关键字段
{
  const projectDir = makeProject({ 'commander.md': COMPLETE_AGENT });
  const xdgHome = mkdtempSync(join(tmpdir(), 'pmw-xdg-cli-list-'));
  try {
    const r = spawnSync(
      'node',
      [CLI_PATH, 'agents', 'list', '--cwd', projectDir],
      {
        encoding: 'utf-8',
        env: { ...process.env, XDG_CONFIG_HOME: xdgHome },
      },
    );
    assert.strictEqual(r.status, 0, `agents list 应成功，stderr:\n${r.stderr}`);
    assert.match(r.stdout, /pm-workflow agents/);
    assert.match(r.stdout, /commander/);
    assert.match(r.stdout, /mode=primary/);
    assert.match(r.stdout, /taskPerm=yes/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(xdgHome, { recursive: true, force: true });
  }
}

// 10) CLI: pmw agents promote 端到端
{
  const projectDir = makeProject({ 'commander.md': COMPLETE_AGENT });
  const xdgHome = mkdtempSync(join(tmpdir(), 'pmw-xdg-cli-promote-'));
  try {
    const r = spawnSync(
      'node',
      [CLI_PATH, 'agents', 'promote', 'commander', '--cwd', projectDir],
      {
        encoding: 'utf-8',
        env: { ...process.env, XDG_CONFIG_HOME: xdgHome },
      },
    );
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /agents promote commander ✓/);
    assert.ok(
      existsSync(join(xdgHome, 'opencode', 'agents', 'commander.md')),
      '应在 XDG_CONFIG_HOME 下创建全局 agent',
    );

    // 第二次默认拒绝
    const r2 = spawnSync(
      'node',
      [CLI_PATH, 'agents', 'promote', 'commander', '--cwd', projectDir],
      {
        encoding: 'utf-8',
        env: { ...process.env, XDG_CONFIG_HOME: xdgHome },
      },
    );
    assert.strictEqual(r2.status, 1);
    assert.match(r2.stderr, /全局已有同名/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(xdgHome, { recursive: true, force: true });
  }
}

// 11) CLI: pmw agents promote 缺参 → 退出码 2
{
  const r = spawnSync('node', [CLI_PATH, 'agents', 'promote'], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /用法: pmw agents promote/);
}

// 12) CLI: pmw agents 未知子命令
{
  const r = spawnSync('node', [CLI_PATH, 'agents', 'unknown'], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /未知 agents 子命令/);
}

// 13) CLI: pmw agents doctor --json
{
  const projectDir = makeProject({
    'commander.md': COMPLETE_AGENT,
    'backendcoder.md': MINIMAL_AGENT,
  });
  const xdgHome = mkdtempSync(join(tmpdir(), 'pmw-xdg-cli-doctor-'));
  try {
    const r = spawnSync(
      'node',
      [CLI_PATH, 'agents', 'doctor', '--cwd', projectDir, '--json'],
      {
        encoding: 'utf-8',
        env: { ...process.env, XDG_CONFIG_HOME: xdgHome },
      },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.totalAgents, 2);
    assert.strictEqual(parsed.agentsWithFindings, 1);
    assert.ok(Array.isArray(parsed.details));
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(xdgHome, { recursive: true, force: true });
  }
}

console.log('agent-library tests passed');
