import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// 6.1) preferred_session_id 缺失不应让 doctor overall 失败
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-doctor-session-'));
  try {
    const r = runCli(['doctor', '--cwd', projectDir, '--json']);
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.ok, true);
    assert.deepStrictEqual(parsed.blockers, []);
    const preferredSessionCheck = parsed.checks.find(
      (check) => check.name === 'preferred_session_id',
    );
    assert.ok(
      !preferredSessionCheck || preferredSessionCheck.ok === true,
      'preferred_session_id should be optional and non-blocking',
    );
    assert.ok(
      parsed.warnings.some((warning) => warning.includes('仅影响可选 session 复用')),
      'doctor should describe missing preferred_session_id as optional',
    );
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

// 13) models init 写入全局 agent 主模型与回退模型
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-models-'));
  const configHome = join(projectDir, 'config-home');
  const opencodeDir = join(configHome, 'opencode');
  mkdirSync(opencodeDir, { recursive: true });
  writeFileSync(
    join(opencodeDir, 'opencode.json'),
    JSON.stringify({
      provider: {
        openai: {
          models: {
            'gpt-5': {},
            'gpt-5-mini': {},
          },
        },
      },
    }),
    'utf-8',
  );
  try {
    const r = runCli(
      [
        'models',
        'init',
        '--cwd',
        projectDir,
        '--model',
        'gpt-5',
        '--fallback',
        'gpt-5-mini',
        '--json',
      ],
      { env: { XDG_CONFIG_HOME: configHome } },
    );
    assert.strictEqual(r.status, 0, `models init 应成功，stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.scope, 'global');
    assert.ok(parsed.agents.includes('commander'));
    assert.ok(parsed.warnings.some((warning) => warning.includes('openai/gpt-5')));

    const config = JSON.parse(
      readFileSync(join(opencodeDir, 'pm-workflow.config.json'), 'utf-8'),
    );
    assert.strictEqual(config.agents.definitions.commander.model, 'openai/gpt-5');
    assert.deepStrictEqual(
      config.agents.definitions.commander.fallback_models,
      ['openai/gpt-5-mini'],
    );
    assert.deepStrictEqual(config.fallback.chains.commander, ['openai/gpt-5-mini']);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 14) models init 对未知模型返回 blocker
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-models-invalid-'));
  const configHome = join(projectDir, 'config-home');
  const opencodeDir = join(configHome, 'opencode');
  mkdirSync(opencodeDir, { recursive: true });
  writeFileSync(
    join(opencodeDir, 'opencode.json'),
    JSON.stringify({
      provider: {
        openai: {
          models: {
            'gpt-5': {},
          },
        },
      },
    }),
    'utf-8',
  );
  try {
    const r = runCli(
      ['models', 'init', '--cwd', projectDir, '--model', 'unknown/model', '--json'],
      { env: { XDG_CONFIG_HOME: configHome } },
    );
    assert.strictEqual(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.ok, false);
    assert.ok(
      parsed.blockers.some((blocker) => blocker.includes('unknown/model')),
      `应报告未知模型 blocker，实际：${parsed.blockers.join('\n')}`,
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 14b) models set 写入 OpenCode 官方 opencode.json.agent.<id>.model
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-models-set-'));
  const configHome = join(projectDir, 'config-home');
  const opencodeDir = join(configHome, 'opencode');
  mkdirSync(opencodeDir, { recursive: true });
  writeFileSync(
    join(opencodeDir, 'opencode.json'),
    JSON.stringify({
      provider: {
        cx: {
          models: {
            'gpt-5.5': {},
          },
        },
      },
    }),
    'utf-8',
  );
  try {
    const r = runCli(
      [
        'models',
        'set',
        '--cwd',
        projectDir,
        '--agent',
        'commander,advisor,writer,explore',
        '--model',
        'cx/gpt-5.5',
        '--json',
      ],
      { env: { XDG_CONFIG_HOME: configHome } },
    );
    assert.strictEqual(r.status, 0, `models set 应成功，stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.assignments.length, 4);

    const opencode = JSON.parse(readFileSync(join(opencodeDir, 'opencode.json'), 'utf-8'));
    assert.strictEqual(opencode.agent.commander.model, 'cx/gpt-5.5');
    assert.strictEqual(opencode.agent.advisor.model, 'cx/gpt-5.5');
    assert.strictEqual(opencode.agent.writer.model, 'cx/gpt-5.5');
    assert.strictEqual(opencode.agent.explore.model, 'cx/gpt-5.5');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 14c) models apply --map 支持给 6 个 agent + explore 写不同模型并校验模型 ID
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-models-apply-'));
  const configHome = join(projectDir, 'config-home');
  const opencodeDir = join(configHome, 'opencode');
  mkdirSync(opencodeDir, { recursive: true });
  writeFileSync(
    join(opencodeDir, 'opencode.json'),
    JSON.stringify({
      provider: {
        cx: { models: { 'gpt-5.5': {}, 'gpt-5.4': {} } },
        kr: { models: { 'claude-sonnet-4.5': {} } },
      },
    }),
    'utf-8',
  );
  try {
    const r = runCli(
      [
        'models',
        'apply',
        '--cwd',
        projectDir,
        '--map',
        [
          'commander=cx/gpt-5.5',
          'advisor=kr/claude-sonnet-4.5',
          'backendcoder=cx/gpt-5.5',
          'designer=cx/gpt-5.5',
          'fixer=cx/gpt-5.4',
          'writer=cx/gpt-5.4',
          'explore=cx/gpt-5.4',
        ].join(','),
        '--json',
      ],
      { env: { XDG_CONFIG_HOME: configHome } },
    );
    assert.strictEqual(r.status, 0, `models apply 应成功，stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.assignments.length, 7);
    const opencode = JSON.parse(readFileSync(join(opencodeDir, 'opencode.json'), 'utf-8'));
    assert.strictEqual(opencode.agent.commander.model, 'cx/gpt-5.5');
    assert.strictEqual(opencode.agent.advisor.model, 'kr/claude-sonnet-4.5');
    assert.strictEqual(opencode.agent.explore.model, 'cx/gpt-5.4');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 14d) models apply --defaults 将便携别名解析为当前用户的完整 provider/model-id
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-models-defaults-'));
  const configHome = join(projectDir, 'config-home');
  const opencodeDir = join(configHome, 'opencode');
  mkdirSync(opencodeDir, { recursive: true });
  writeFileSync(
    join(opencodeDir, 'opencode.json'),
    JSON.stringify({
      provider: {
        'mini-gateway': {
          models: {
            'gpt-5.6-sol': {},
            'gpt-5.6-terra': {},
            'gpt-5.6-luna': {},
          },
        },
        omniroute: {
          models: {
            'gemini-3.5-flash': {},
          },
        },
      },
    }),
    'utf-8',
  );
  try {
    const r = runCli(
      ['models', 'apply', '--cwd', projectDir, '--defaults', '--json'],
      { env: { XDG_CONFIG_HOME: configHome } },
    );
    assert.strictEqual(r.status, 0, `models apply --defaults 应成功，stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.assignments.length, 6);
    assert.ok(parsed.warnings.some((item) => item.includes('gpt-5.6-sol')));

    const opencode = JSON.parse(readFileSync(join(opencodeDir, 'opencode.json'), 'utf-8'));
    assert.strictEqual(opencode.agent.commander.model, 'mini-gateway/gpt-5.6-sol');
    assert.strictEqual(opencode.agent.advisor.model, 'mini-gateway/gpt-5.6-sol');
    assert.strictEqual(opencode.agent.backendcoder.model, 'mini-gateway/gpt-5.6-terra');
    assert.strictEqual(opencode.agent.designer.model, 'omniroute/gemini-3.5-flash');
    assert.strictEqual(opencode.agent.fixer.model, 'mini-gateway/gpt-5.6-terra');
    assert.strictEqual(opencode.agent.writer.model, 'mini-gateway/gpt-5.6-luna');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

function writeCachedPluginVersion(cacheBase, family, entry, version) {
  const packageDir = join(
    cacheBase,
    family,
    'packages',
    '@walke',
    entry,
    'node_modules',
    '@walke',
    'opencode-pm-workflow',
  );
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify({ name: '@walke/opencode-pm-workflow', version }),
    'utf-8',
  );
}

function writeNodeModulesCachedPluginVersion(cacheBase, family, version) {
  const packageDir = join(
    cacheBase,
    family,
    'node_modules',
    '@walke',
    'opencode-pm-workflow',
  );
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify({ name: '@walke/opencode-pm-workflow', version }),
    'utf-8',
  );
}

// 15) repair opencode-cache --dry-run 只报告旧缓存，不移动目录
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-cache-dry-run-'));
  const cacheBase = join(projectDir, 'cache-home');
  try {
    writeCachedPluginVersion(cacheBase, 'opencode', 'opencode-pm-workflow@latest', '0.3.1');
    const r = runCli(
      [
        'repair',
        'opencode-cache',
        '--expected-version',
        '1.0.1',
        '--cache-base',
        cacheBase,
        '--dry-run',
        '--json',
      ],
    );
    assert.strictEqual(r.status, 0, `repair dry-run 应成功，stderr:\n${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.dryRun, true);
    assert.strictEqual(parsed.staleCount, 1);
    assert.strictEqual(parsed.repairedCount, 0);
    assert.strictEqual(parsed.findings[0].action, 'would-backup');
    assert.ok(
      readFileSync(
        join(
          cacheBase,
          'opencode',
          'packages',
          '@walke',
          'opencode-pm-workflow@latest',
          'node_modules',
          '@walke',
          'opencode-pm-workflow',
          'package.json',
        ),
        'utf-8',
      ).includes('0.3.1'),
      'dry-run 不应移动缓存目录',
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 16) repair opencode-cache 支持官方 node_modules 缓存布局
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-cache-node-modules-'));
  const cacheBase = join(projectDir, 'cache-home');
  const staleDir = join(
    cacheBase,
    'opencode',
    'node_modules',
    '@walke',
    'opencode-pm-workflow',
  );
  try {
    writeNodeModulesCachedPluginVersion(cacheBase, 'opencode', '0.3.1');
    const r = runCli(
      [
        'repair',
        'opencode-cache',
        '--expected-version',
        '1.0.1',
        '--cache-base',
        cacheBase,
        '--json',
      ],
    );
    assert.strictEqual(r.status, 0, `repair node_modules 应成功，stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.staleCount, 1);
    assert.strictEqual(parsed.repairedCount, 1);
    assert.strictEqual(parsed.findings[0].layout, 'node_modules');
    assert.strictEqual(parsed.findings[0].action, 'backed-up');
    assert.throws(
      () => readFileSync(join(staleDir, 'package.json')),
      /ENOENT/,
      'node_modules 旧缓存包目录应被移动到备份路径',
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 17) repair opencode-cache 备份旧缓存并保留版本一致的缓存
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-cache-repair-'));
  const cacheBase = join(projectDir, 'cache-home');
  const staleDir = join(
    cacheBase,
    'opencode',
    'packages',
    '@walke',
    'opencode-pm-workflow@latest',
  );
  const freshDir = join(
    cacheBase,
    'kilo',
    'packages',
    '@walke',
    'opencode-pm-workflow@1.0.1',
  );
  try {
    writeCachedPluginVersion(cacheBase, 'opencode', 'opencode-pm-workflow@latest', '0.3.1');
    writeCachedPluginVersion(cacheBase, 'kilo', 'opencode-pm-workflow@1.0.1', '1.0.1');
    const r = runCli(
      [
        'repair',
        'opencode-cache',
        '--expected-version',
        '1.0.1',
        '--cache-base',
        cacheBase,
        '--json',
      ],
    );
    assert.strictEqual(r.status, 0, `repair 应成功，stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.staleCount, 1);
    assert.strictEqual(parsed.repairedCount, 1);
    assert.strictEqual(parsed.findings.find((item) => item.label === 'opencode').action, 'backed-up');
    assert.strictEqual(parsed.findings.find((item) => item.label === 'kilo').action, 'kept');
    assert.throws(
      () => readFileSync(join(staleDir, 'node_modules', '@walke', 'opencode-pm-workflow', 'package.json')),
      /ENOENT/,
      '旧缓存目录应被移动到备份路径',
    );
    assert.ok(
      readFileSync(join(freshDir, 'node_modules', '@walke', 'opencode-pm-workflow', 'package.json'), 'utf-8').includes('1.0.1'),
      '版本一致的缓存应保留',
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 18) repair agents 备份旧 agent 残留并重建无 model 的新版 agent md
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-repair-agents-'));
  const configHome = join(projectDir, 'config-home');
  const agentsDir = join(configHome, 'opencode', 'agents');
  const legacyDir = join(configHome, 'opencode', 'agent');
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'commander.md'),
    ['---', 'description: old', 'mode: all', 'model: stale/model', 'theme: default', '---', '', 'old'].join('\n'),
    'utf-8',
  );
  writeFileSync(
    join(legacyDir, 'pm_lead.md'),
    ['---', 'description: old lead', 'mode: primary', '---', '', 'old'].join('\n'),
    'utf-8',
  );
  try {
    const r = runCli(
      ['repair', 'agents', '--cwd', projectDir, '--scope', 'global', '--json'],
      { env: { XDG_CONFIG_HOME: configHome } },
    );
    assert.strictEqual(r.status, 0, `repair agents 应成功，stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.written.length, 6);
    assert.ok(parsed.backedUp.length >= 2, '应备份旧文件');

    const commander = readFileSync(join(agentsDir, 'commander.md'), 'utf-8');
    assert.match(commander, /mode: primary/);
    assert.ok(!commander.includes('model: stale/model'), '新版 commander md 不应保留旧 model');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 19) repair install-sync 使用项目级 plugin 引用作为目标
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-install-sync-'));
  const configHome = join(projectDir, 'config-home');
  const globalOpenCodeDir = join(configHome, 'opencode');
  const cacheBase = join(projectDir, 'cache-home');
  mkdirSync(globalOpenCodeDir, { recursive: true });
  writeFileSync(
    join(globalOpenCodeDir, 'opencode.json'),
    JSON.stringify({ plugin: ['@walke/opencode-pm-workflow@latest'] }),
    'utf-8',
  );
  writeFileSync(
    join(projectDir, 'opencode.json'),
    JSON.stringify({ plugin: ['@walke/opencode-pm-workflow@1.0.1'] }),
    'utf-8',
  );
  try {
    writeNodeModulesCachedPluginVersion(cacheBase, 'opencode', '0.3.1');
    const r = runCli(
      [
        'repair',
        'install-sync',
        '--expected-version',
        '1.0.1',
        '--cache-base',
        cacheBase,
        '--json',
      ],
      { cwd: projectDir, env: { XDG_CONFIG_HOME: configHome } },
    );
    assert.strictEqual(r.status, 0, `install-sync 应成功，stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.targetSpec, '1.0.1');
    assert.strictEqual(parsed.targetVersion, '1.0.1');
    assert.strictEqual(parsed.selectedPluginRef.ref, '@walke/opencode-pm-workflow@1.0.1');
    assert.strictEqual(parsed.staleCount, 1);
    assert.ok(parsed.suggestions.some((item) => item.includes('npm install -g @walke/opencode-pm-workflow@1.0.1')));
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 20) repair install-sync --apply 备份旧 node_modules cache
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-cli-install-sync-apply-'));
  const configHome = join(projectDir, 'config-home');
  const globalOpenCodeDir = join(configHome, 'opencode');
  const cacheBase = join(projectDir, 'cache-home');
  const staleDir = join(
    cacheBase,
    'opencode',
    'node_modules',
    '@walke',
    'opencode-pm-workflow',
  );
  mkdirSync(globalOpenCodeDir, { recursive: true });
  writeFileSync(
    join(globalOpenCodeDir, 'opencode.json'),
    JSON.stringify({ plugin: ['@walke/opencode-pm-workflow@latest'] }),
    'utf-8',
  );
  try {
    writeNodeModulesCachedPluginVersion(cacheBase, 'opencode', '0.3.1');
    const r = runCli(
      [
        'repair',
        'install-sync',
        '--expected-version',
        '1.0.1',
        '--cache-base',
        cacheBase,
        '--apply',
        '--json',
      ],
      { cwd: projectDir, env: { XDG_CONFIG_HOME: configHome } },
    );
    assert.strictEqual(r.status, 0, `install-sync --apply 应成功，stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.repairedCount, 1);
    assert.strictEqual(parsed.findings[0].action, 'backed-up');
    assert.throws(
      () => readFileSync(join(staleDir, 'package.json')),
      /ENOENT/,
      'install-sync --apply 应移动旧 node_modules cache',
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

console.log('cli tests passed');
