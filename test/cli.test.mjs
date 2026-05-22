import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..');
const CLI_PATH = join(REPO_ROOT, 'scripts', 'cli', 'index.mjs');

function runCli(args, options = {}) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, ...(options.env || {}) },
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// 1) --version 输出语义版本
{
  const r = runCli(['--version']);
  assert.strictEqual(r.status, 0);
  assert.match(
    r.stdout.trim(),
    /^\d+\.\d+\.\d+/,
    `version 输出应为 semver，实际：${r.stdout.trim()}`,
  );
}

// 2) --help 列出 5 个核心子命令
{
  const r = runCli(['--help']);
  assert.strictEqual(r.status, 0);
  for (const cmd of ['doctor', 'dispatch dry-run', 'state', 'history', 'verify']) {
    assert.ok(
      r.stdout.includes(cmd),
      `--help 应包含 "${cmd}"，实际输出：\n${r.stdout}`,
    );
  }
}

// 3) 无参数等同 --help
{
  const r = runCli([]);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /pm-workflow 离线诊断 CLI/);
}

// 4) 未知命令返回非零退出码
{
  const r = runCli(['unknown-command']);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /未知命令/);
}

// 5) doctor 子命令在临时项目里跑通
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-doctor-'));
  try {
    const r = runCli(['doctor', '--cwd', projectDir]);
    assert.strictEqual(r.status, 0, `doctor 应成功，stderr:\n${r.stderr}`);
    assert.match(r.stdout, /pm-workflow doctor/);
    assert.match(r.stdout, /state\.json/);
    assert.match(r.stdout, /config\.json/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 6) doctor --json 返回结构化 report
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-doctor-json-'));
  try {
    const r = runCli(['doctor', '--cwd', projectDir, '--json']);
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.ok(Array.isArray(parsed.checks), 'checks 应为数组');
    assert.ok(Array.isArray(parsed.warnings), 'warnings 应为数组');
    assert.ok(Array.isArray(parsed.blockers), 'blockers 应为数组');
    assert.ok(parsed.checks.length > 0, '至少应有一项 check');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 7) dispatch dry-run 输出推荐命令但不实际执行
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-dispatch-'));
  try {
    const r = runCli(['dispatch', 'dry-run', '--cwd', projectDir]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /推荐 Agent/);
    assert.match(r.stdout, /推荐动作/);
    assert.match(r.stdout, /execution plan/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 8) state --json 输出 WorkflowState 结构
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-state-'));
  try {
    const r = runCli(['state', '--cwd', projectDir, '--json']);
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.version, 1);
    assert.ok(parsed.project);
    assert.ok(parsed.stage);
    assert.ok(parsed.auto_continue, '0.5.0 起 state 应包含 auto_continue 节');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 9) history --limit 限制结果数量
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-history-'));
  try {
    // 先跑一次 doctor 触发 history bootstrap
    runCli(['doctor', '--cwd', projectDir]);
    const r = runCli(['history', '--cwd', projectDir, '--limit', '1', '--json']);
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length <= 1, `--limit 1 应至多返回 1 条，实际 ${parsed.length}`);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 10) dispatch 子命令但缺少 dry-run 时返回 2 退出码
{
  const r = runCli(['dispatch', 'unknown-sub']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /未知 dispatch 子命令/);
}

// 11) docs check 在当前仓库通过
{
  const r = runCli(['docs', 'check', '--json']);
  assert.strictEqual(r.status, 0, `docs check 应通过，stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.ok(Array.isArray(parsed.checks));
  assert.ok(parsed.checks.some((check) => check.name === 'readme-version'));
  assert.ok(parsed.checks.some((check) => check.name === 'main-doc-count'));
}

// 12) docs check 发现 README 版本漂移并返回非零
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-docs-check-'));
  try {
    mkdirSync(join(projectDir, 'docs'), { recursive: true });
    writeFileSync(
      join(projectDir, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.2.3' }),
      'utf-8',
    );
    writeFileSync(join(projectDir, 'CHANGELOG.md'), '# Changelog\n\n## 1.2.3\n\n- ok\n', 'utf-8');
    writeFileSync(join(projectDir, 'README.md'), '# Fixture\n\n当前发布版本：`1.2.2`。\n\n## Change Log\n', 'utf-8');
    for (const name of [
      '01-技术架构.md',
      '02-业务功能与任务流转.md',
      '03-使用与运维手册.md',
      '04-待办与演进清单.md',
    ]) {
      writeFileSync(join(projectDir, 'docs', name), `# ${name}\n\n## Change Log\n`, 'utf-8');
    }

    const r = runCli(['docs', 'check', '--cwd', projectDir, '--json']);
    assert.strictEqual(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.ok, false);
    assert.ok(
      parsed.blockers.some((blocker) => blocker.includes('readme-version')),
      `应报告 readme-version blocker，实际：${parsed.blockers.join('\n')}`,
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

console.log('cli tests passed');
