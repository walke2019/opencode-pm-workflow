import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'api-snapshot.mjs');
const SNAPSHOT_PATH = join(REPO_ROOT, 'tools', 'api-snapshot.json');

function runScript(args, options = {}) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, ...(options.env || {}) },
  });
}

function backupSnapshot() {
  const backup = mkdtempSync(join(tmpdir(), 'pmw-api-snap-'));
  const dest = join(backup, 'api-snapshot.json');
  copyFileSync(SNAPSHOT_PATH, dest);
  return { dir: backup, dest };
}

function restoreSnapshot(backup) {
  copyFileSync(backup.dest, SNAPSHOT_PATH);
  rmSync(backup.dir, { recursive: true, force: true });
}

// 1) check 模式：当前 dist 与快照一致 → exit 0
{
  const r = runScript(['check']);
  assert.strictEqual(r.status, 0, `check 应成功，stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /公开 API 与快照一致/);
}

// 2) 默认参数（无 mode）等同 check
{
  const r = runScript([]);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /公开 API 与快照一致/);
}

// 3) 未知 mode → exit 2
{
  const r = runScript(['rebuild']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /未知模式/);
}

// 4) 删除符号：模拟 breaking → check 应 exit 1，update 应允许
{
  const backup = backupSnapshot();
  try {
    const original = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
    // 添加一个"伪造的已删除符号"模拟历史快照里有但当前 dist 没有的符号
    const fake = {
      ...original,
      public_symbols: [...original.public_symbols, '__faked_removed_symbol__'].sort(),
    };
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(fake, null, 2) + '\n', 'utf-8');

    const checkResult = runScript(['check']);
    assert.strictEqual(checkResult.status, 1, `应以 exit=1 报 breaking，stdout:\n${checkResult.stdout}`);
    assert.match(checkResult.stdout, /__faked_removed_symbol__/);
    assert.match(checkResult.stderr + checkResult.stdout, /breaking/);

    const updateResult = runScript(['update']);
    assert.strictEqual(updateResult.status, 0, `update 应允许同步，stdout:\n${updateResult.stdout}\nstderr:\n${updateResult.stderr}`);
    assert.match(updateResult.stdout, /已更新快照/);

    // 同步后再 check 应成功
    const reCheck = runScript(['check']);
    assert.strictEqual(reCheck.status, 0);
  } finally {
    restoreSnapshot(backup);
  }
}

// 5) 新增符号：模拟 minor 变更 → check 应 exit 1（要求 update）
{
  const backup = backupSnapshot();
  try {
    const original = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
    // 移除一个真实符号，模拟"快照少了一项"的场景
    const fake = {
      ...original,
      public_symbols: original.public_symbols.filter((s) => s !== 'buildDoctorReport'),
    };
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(fake, null, 2) + '\n', 'utf-8');

    const checkResult = runScript(['check']);
    assert.strictEqual(checkResult.status, 1, `新增符号应以 exit=1 提示，stdout:\n${checkResult.stdout}`);
    assert.match(checkResult.stdout, /buildDoctorReport/);
    assert.match(checkResult.stdout + checkResult.stderr, /新增|minor/);
  } finally {
    restoreSnapshot(backup);
  }
}

// 6) 快照文件结构合法
{
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
  assert.strictEqual(snapshot.schema_version, 1);
  assert.ok(typeof snapshot.package_version === 'string');
  assert.ok(typeof snapshot.generated_at === 'string');
  assert.ok(Array.isArray(snapshot.public_symbols));
  assert.ok(snapshot.public_symbols.length >= 100, '应有 >=100 个公开符号');
  // 排序检查
  const sorted = [...snapshot.public_symbols].sort();
  assert.deepStrictEqual(snapshot.public_symbols, sorted, 'public_symbols 应按字母排序');
  // 不应含系统符号
  assert.ok(!snapshot.public_symbols.includes('__esModule'));
  assert.ok(!snapshot.public_symbols.includes('default'));
}

// 7) 快照存在性 = prepare-publish 前置条件
{
  // 模拟"删除快照后 check"的场景：临时删快照
  const backup = backupSnapshot();
  try {
    unlinkSync(SNAPSHOT_PATH);
    const r = runScript(['check']);
    assert.strictEqual(r.status, 1, '快照不存在时 check 应失败');
    assert.match(r.stderr, /快照不存在/);
  } finally {
    restoreSnapshot(backup);
  }
}

console.log('api-snapshot tests passed');
