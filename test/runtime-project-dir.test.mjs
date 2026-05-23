/**
 * resolveSafeProjectDir 兜底逻辑测试。
 *
 * 这是 1.0.0-rc.4 的核心修复点：避免 OpenCode 传 worktree="" / "/" 导致
 * mkdir('/.pm-workflow') ENOENT 让插件 abort。
 *
 * 覆盖场景：
 * - 优先使用第一个非空非根目录候选
 * - 跳过空字符串、纯空白、"/"、"\"
 * - 全部不可用时回退到 ~/.cache/pm-workflow/global
 * - HOME 也异常时回退到 $TMPDIR/pm-workflow-global
 * - 永不返回 "/"
 * - getProjectDir 同样行为（基于 resolveSafeProjectDir）
 */

import assert from 'node:assert';
import { join } from 'node:path';
import { resolveSafeProjectDir, getProjectDir } from '../dist/server/runtime.js';

function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function testPrefersFirstValidCandidate() {
  const got = resolveSafeProjectDir('/Users/foo/proj', '/Users/foo/dir', '/somewhere');
  assert.strictEqual(got, '/Users/foo/proj');
}

function testSkipsEmptyString() {
  const got = resolveSafeProjectDir('', '/Users/foo/dir', '/Users/foo/cwd');
  assert.strictEqual(got, '/Users/foo/dir');
}

function testSkipsWhitespaceOnly() {
  const got = resolveSafeProjectDir('   ', '/Users/foo/dir');
  assert.strictEqual(got, '/Users/foo/dir');
}

function testSkipsRootSlash() {
  // 这是核心修复——OpenCode 在 system service 模式下确实会传 "/"
  const got = resolveSafeProjectDir('/', '/Users/foo/dir');
  assert.strictEqual(got, '/Users/foo/dir');
}

function testSkipsBackslashOnWindowsRoot() {
  const got = resolveSafeProjectDir('\\', '/Users/foo/dir');
  assert.strictEqual(got, '/Users/foo/dir');
}

function testSkipsUndefinedAndNull() {
  const got = resolveSafeProjectDir(undefined, null, '/Users/foo/dir');
  assert.strictEqual(got, '/Users/foo/dir');
}

function testFallbackToCacheWhenAllInvalid() {
  withEnv({ HOME: '/Users/testuser', USERPROFILE: undefined, TMPDIR: undefined }, () => {
    const got = resolveSafeProjectDir('', '/', undefined);
    assert.strictEqual(got, '/Users/testuser/.cache/pm-workflow/global');
  });
}

function testFallbackToTmpWhenNoHome() {
  withEnv({ HOME: '', USERPROFILE: '', TMPDIR: '/custom-tmp' }, () => {
    const got = resolveSafeProjectDir('', '/', undefined);
    assert.strictEqual(got, '/custom-tmp/pm-workflow-global');
  });
}

function testFallbackToTmpWhenHomeIsRoot() {
  withEnv({ HOME: '/', USERPROFILE: '/', TMPDIR: '/another-tmp' }, () => {
    const got = resolveSafeProjectDir('', '/', undefined);
    assert.strictEqual(got, '/another-tmp/pm-workflow-global');
  });
}

function testNeverReturnsRoot() {
  // 模拟 OpenCode server 进程：process.cwd() 是 "/"，worktree/directory 都是空字符串
  withEnv({ HOME: '/Users/testuser' }, () => {
    const got = resolveSafeProjectDir('', '', '/');
    assert.notStrictEqual(got, '/');
    assert.notStrictEqual(got, '\\');
    assert.ok(got.length > 1, `兜底必须返回非根路径: ${got}`);
  });
}

function testGetProjectDirUsesSafeFallback() {
  // OpenCode 实际场景：ctx 传空字符串
  withEnv({ HOME: '/Users/testuser' }, () => {
    const ctx = { worktree: '', directory: '', client: undefined };
    const got = getProjectDir(ctx);
    assert.notStrictEqual(got, '/');
    // 当 process.cwd() 不是 "/" 时，应使用 cwd（实际跑测试时是仓库目录）
    // 当 process.cwd() === "/" 时，回退到 ~/.cache/pm-workflow/global
    assert.ok(got.length > 1);
  });
}

function testGetProjectDirRespectsValidWorktree() {
  const ctx = { worktree: '/some/valid/worktree', directory: '/different/dir', client: undefined };
  const got = getProjectDir(ctx);
  assert.strictEqual(got, '/some/valid/worktree');
}

function testTrimsWhitespaceAroundValidPath() {
  const got = resolveSafeProjectDir('  /Users/foo/proj  ', '');
  assert.strictEqual(got, '/Users/foo/proj');
}

testPrefersFirstValidCandidate();
testSkipsEmptyString();
testSkipsWhitespaceOnly();
testSkipsRootSlash();
testSkipsBackslashOnWindowsRoot();
testSkipsUndefinedAndNull();
testFallbackToCacheWhenAllInvalid();
testFallbackToTmpWhenNoHome();
testFallbackToTmpWhenHomeIsRoot();
testNeverReturnsRoot();
testGetProjectDirUsesSafeFallback();
testGetProjectDirRespectsValidWorktree();
testTrimsWhitespaceAroundValidPath();
console.log('runtime project-dir tests passed');
