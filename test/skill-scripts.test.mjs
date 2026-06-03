import assert from 'node:assert';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..');
const CHECK_SCRIPT = join(REPO_ROOT, 'skills', 'pm-workflow', 'scripts', 'check.sh');
const UPGRADE_SCRIPT = join(REPO_ROOT, 'skills', 'pm-workflow', 'scripts', 'upgrade.sh');
const REGISTRY_JSON = JSON.stringify({
  'dist-tags': {
    latest: '1.0.3',
    rc: '1.0.0-rc.23',
  },
});

function writeExecutable(path, body) {
  writeFileSync(path, body, 'utf-8');
  chmodSync(path, 0o755);
}

function makeFixture(pluginRef, pmwVersion = '1.0.3', cacheVersion = '1.0.3', layout = 'packages') {
  const root = mkdtempSync(join(tmpdir(), 'pmw-skill-scripts-'));
  const binDir = join(root, 'bin');
  const configDir = join(root, 'config', 'opencode');
  const cacheRoot = join(root, 'cache', 'opencode');
  const cacheBase = join(cacheRoot, 'packages');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  mkdirSync(cacheBase, { recursive: true });

  const opencodeJson = join(configDir, 'opencode.json');
  writeFileSync(opencodeJson, JSON.stringify({ plugin: [pluginRef] }), 'utf-8');

  const target = pluginRef.includes('@rc') ? 'rc' : 'latest';
  const packageJson =
    layout === 'node_modules'
      ? join(cacheRoot, 'node_modules', '@walke', 'opencode-pm-workflow', 'package.json')
      : join(
          cacheBase,
          `@walke/opencode-pm-workflow@${target}`,
          'node_modules',
          '@walke',
          'opencode-pm-workflow',
          'package.json',
        );
  mkdirSync(resolve(packageJson, '..'), { recursive: true });
  writeFileSync(packageJson, JSON.stringify({ version: cacheVersion }), 'utf-8');

  writeExecutable(join(binDir, 'pmw'), `#!/usr/bin/env bash\necho "${pmwVersion}"\n`);
  writeExecutable(join(binDir, 'curl'), `#!/usr/bin/env bash\ncat <<'JSON'\n${REGISTRY_JSON}\nJSON\n`);
  writeExecutable(join(binDir, 'npm'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "10.9.2"; else exit 0; fi\n');
  writeExecutable(join(binDir, 'node'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "v22.14.0"; else exit 0; fi\n');

  return {
    root,
    env: {
      ...process.env,
      HOME: root,
      PATH: `${binDir}:${process.env.PATH}`,
      OPENCODE_CONFIG_FILE: opencodeJson,
      OPENCODE_CACHE_ROOT: cacheRoot,
      OPENCODE_CACHE_BASE: cacheBase,
    },
  };
}

function makeProjectOverrideFixture() {
  const fixture = makeFixture('@walke/opencode-pm-workflow@latest', '1.0.0-rc.23', '1.0.0-rc.23');
  const projectDir = join(fixture.root, 'project', 'nested');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(fixture.root, 'project', 'opencode.json'),
    JSON.stringify({ plugin: ['@walke/opencode-pm-workflow@rc'] }),
    'utf-8',
  );
  return { ...fixture, projectDir };
}

function runScript(script, fixture, args = []) {
  const result = spawnSync('bash', [script, ...args], {
    cwd: fixture.projectDir || REPO_ROOT,
    encoding: 'utf-8',
    env: fixture.env,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// check.sh: @latest 配置应对比 latest，不应因 rc tag 更低而误报。
{
  const fixture = makeFixture('@walke/opencode-pm-workflow@latest');
  try {
    const result = runScript(CHECK_SCRIPT, fixture);
    assert.strictEqual(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /npm latest tag 目标版本: 1\.0\.3/);
    assert.doesNotMatch(result.stdout, /rc tag/);
    assert.doesNotMatch(result.stdout, /落后于 npm rc tag/);
    assert.doesNotMatch(result.stdout, /建议升级/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

// check.sh: 官方 node_modules cache 布局应优先识别。
{
  const fixture = makeFixture('@walke/opencode-pm-workflow@latest', '1.0.3', '1.0.3', 'node_modules');
  try {
    const result = runScript(CHECK_SCRIPT, fixture);
    assert.strictEqual(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /cache 布局: node_modules/);
    assert.match(result.stdout, /cache 版本: 1\.0\.3/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

// check.sh: @rc 配置仍应对比 rc tag。
{
  const fixture = makeFixture('@walke/opencode-pm-workflow@rc', '1.0.0-rc.23', '1.0.0-rc.23');
  try {
    const result = runScript(CHECK_SCRIPT, fixture);
    assert.strictEqual(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /npm rc tag 目标版本: 1\.0\.0-rc\.23/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

// check.sh: 项目级 opencode.json 应覆盖全局 latest。
{
  const fixture = makeProjectOverrideFixture();
  try {
    const result = runScript(CHECK_SCRIPT, fixture);
    assert.strictEqual(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /opencode\.json 含 plugin: @walke\/opencode-pm-workflow@rc/);
    assert.match(result.stdout, /npm rc tag 目标版本: 1\.0\.0-rc\.23/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

// upgrade.sh --yes: @latest 已对齐时应直接退出，不触发 @rc 安装路径。
{
  const fixture = makeFixture('@walke/opencode-pm-workflow@latest');
  try {
    const result = runScript(UPGRADE_SCRIPT, fixture, ['--yes']);
    assert.strictEqual(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /升级目标: @walke\/opencode-pm-workflow@latest/);
    assert.match(result.stdout, /已是目标版本/);
    assert.doesNotMatch(result.stdout, /@walke\/opencode-pm-workflow@rc/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}
