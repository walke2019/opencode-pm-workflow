/**
 * resolveSafeProjectDir 兜底逻辑测试。
 *
 * 这是 1.0.0-rc.4 的核心修复点：避免 OpenCode 传 worktree="" / "/" 导致
 * mkdir('/.pm-workflow') ENOENT 让插件 abort。
 *
 * 1.0.0-rc.5 起改用 Node `os.homedir()` 与 `os.tmpdir()`，跨平台兼容
 * （macOS / Linux / Windows 一致）。
 *
 * 覆盖场景：
 * - 优先使用第一个非空非根目录候选
 * - 跳过空字符串、纯空白、"/"、"\"
 * - 全部不可用时回退到 <home>/.cache/pm-workflow/global
 * - home 也异常时回退到 os.tmpdir()/pm-workflow-global
 * - 永不返回 "/"
 * - getProjectDir 同样行为（基于 resolveSafeProjectDir）
 */

import assert from 'node:assert';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSafeProjectDir, getProjectDir } from '../dist/server/runtime.js';

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

function testFallbackUsesHomedir() {
  // 当所有候选都无效，应该回退到 <homedir>/.cache/pm-workflow/global
  // 用 Node 的 homedir() 自动跨平台（macOS/Linux/Windows）
  const got = resolveSafeProjectDir('', '/', undefined);
  const expected = join(homedir(), '.cache', 'pm-workflow', 'global');
  assert.strictEqual(got, expected);
}

function testFallbackPathDoesNotStartWithSlashOnPosix() {
  // 在 POSIX 系统上路径以 home 路径开头（macOS: /Users，Linux: /home）
  const got = resolveSafeProjectDir('', '/', undefined);
  if (process.platform === 'darwin') {
    assert.ok(got.startsWith('/Users/'), `macOS 应以 /Users/ 开头: ${got}`);
  } else if (process.platform === 'linux') {
    assert.ok(got.startsWith('/home/') || got.startsWith('/root/'), `Linux 应以 /home/ 或 /root/ 开头: ${got}`);
  } else if (process.platform === 'win32') {
    // Windows: C:\Users\<user>\.cache\... — 用 drive letter 开头
    assert.ok(/^[A-Z]:[\\/]/.test(got), `Windows 应以 drive letter 开头: ${got}`);
  }
}

function testNeverReturnsRoot() {
  // 模拟 OpenCode server 进程：process.cwd() 是 "/"，worktree/directory 都是空字符串
  const got = resolveSafeProjectDir('', '', '/');
  assert.notStrictEqual(got, '/');
  assert.notStrictEqual(got, '\\');
  assert.ok(got.length > 1, `兜底必须返回非根路径: ${got}`);
}

function testGetProjectDirUsesSafeFallback() {
  // OpenCode 实际场景：ctx 传空字符串
  const ctx = { worktree: '', directory: '', client: undefined };
  const got = getProjectDir(ctx);
  assert.notStrictEqual(got, '/');
  assert.notStrictEqual(got, '\\');
  // 当 process.cwd() 不是 "/" 时（实际跑测试时是仓库目录），应使用 cwd
  // 当 process.cwd() === "/" 时，回退到 <home>/.cache/pm-workflow/global
  assert.ok(got.length > 1);
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

function testCrossPlatformFallbackPathStructure() {
  // 验证 fallback 路径的 ".cache/pm-workflow/global" 结构在所有平台一致
  const got = resolveSafeProjectDir('', '/', undefined);
  // 注意 Windows 用反斜杠，所以用 path.sep 检查较稳健
  assert.ok(
    got.endsWith(join('.cache', 'pm-workflow', 'global')),
    `fallback 路径应以 .cache/pm-workflow/global 结尾: ${got}`,
  );
}

testPrefersFirstValidCandidate();
testSkipsEmptyString();
testSkipsWhitespaceOnly();
testSkipsRootSlash();
testSkipsBackslashOnWindowsRoot();
testSkipsUndefinedAndNull();
testFallbackUsesHomedir();
testFallbackPathDoesNotStartWithSlashOnPosix();
testNeverReturnsRoot();
testGetProjectDirUsesSafeFallback();
testGetProjectDirRespectsValidWorktree();
testTrimsWhitespaceAroundValidPath();
testCrossPlatformFallbackPathStructure();
console.log('runtime project-dir tests passed');
