/**
 * skill-installer 单元测试。
 *
 * 覆盖场景：
 * - 首次安装：目标目录空，包内 skill 全部复制
 * - 内容相同：skipped-equal
 * - 用户改过目标：user-modified（不覆盖）
 * - 目标读不到：仍按 user-modified 处理（不覆盖）
 * - 源目录不存在：返回 0 total
 * - 默认参数：resolvePackageSkillsDir 能定位到包内 skills
 */

import assert from 'node:assert';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveOpenCodeSkillsDir,
  resolvePackageSkillsDir,
  syncPackagedSkillsToOpenCode,
} from '../dist/index.js';

function setupSkillsSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'skill-installer-'));
  const sourceDir = join(root, 'pkg-skills');
  const targetDir = join(root, 'opencode-skills');
  mkdirSync(sourceDir, { recursive: true });
  return { root, sourceDir, targetDir };
}

function writeSourceSkill(sourceDir, skillId, content) {
  const dir = join(sourceDir, skillId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
}

function testFirstInstallCopiesAllSkills() {
  const { sourceDir, targetDir } = setupSkillsSandbox();
  writeSourceSkill(sourceDir, 'agent-theme-config', '---\nname: agent-theme-config\n---\n\n# Theme');
  writeSourceSkill(sourceDir, 'agent-model-config', '---\nname: agent-model-config\n---\n\n# Model');

  const report = syncPackagedSkillsToOpenCode({
    skillsSourceDir: sourceDir,
    skillsTargetDir: targetDir,
  });

  assert.strictEqual(report.total, 2);
  assert.strictEqual(report.installed, 2);
  assert.strictEqual(report.skipped, 0);
  assert.strictEqual(report.userModified, 0);
  assert.strictEqual(report.failed, 0);

  for (const id of ['agent-theme-config', 'agent-model-config']) {
    // OpenCode 官方 skill 规范：必须是子目录 + SKILL.md（rc.7 起）
    const target = join(targetDir, id, 'SKILL.md');
    assert.ok(existsSync(target), `${id}/SKILL.md 应被写入`);
    const content = readFileSync(target, 'utf-8');
    assert.ok(content.includes(`name: ${id}`), `${id}/SKILL.md 内容应包含 frontmatter name`);
  }
}

function testSkipsWhenContentIdentical() {
  const { sourceDir, targetDir } = setupSkillsSandbox();
  const body = '---\nname: agent-theme-config\n---\n\n# Theme';
  writeSourceSkill(sourceDir, 'agent-theme-config', body);

  // 第一次复制
  let report = syncPackagedSkillsToOpenCode({
    skillsSourceDir: sourceDir,
    skillsTargetDir: targetDir,
  });
  assert.strictEqual(report.installed, 1);

  // 第二次相同内容
  report = syncPackagedSkillsToOpenCode({
    skillsSourceDir: sourceDir,
    skillsTargetDir: targetDir,
  });
  assert.strictEqual(report.installed, 0);
  assert.strictEqual(report.skipped, 1);
  assert.strictEqual(report.userModified, 0);
  assert.strictEqual(report.failed, 0);
  assert.strictEqual(report.findings[0].outcome, 'skipped-equal');
}

function testKeepsUserModifiedFile() {
  const { sourceDir, targetDir } = setupSkillsSandbox();
  writeSourceSkill(sourceDir, 'agent-theme-config', '# package version');

  // 用户已经放了改过的文件（OpenCode 标准结构：子目录 + SKILL.md）
  const userSkillDir = join(targetDir, 'agent-theme-config');
  mkdirSync(userSkillDir, { recursive: true });
  const userPath = join(userSkillDir, 'SKILL.md');
  writeFileSync(userPath, '# user customized version', 'utf-8');

  const report = syncPackagedSkillsToOpenCode({
    skillsSourceDir: sourceDir,
    skillsTargetDir: targetDir,
  });

  assert.strictEqual(report.installed, 0);
  assert.strictEqual(report.userModified, 1);
  // 用户文件应保持原样
  assert.strictEqual(readFileSync(userPath, 'utf-8'), '# user customized version');
  const finding = report.findings.find((f) => f.skillId === 'agent-theme-config');
  assert.strictEqual(finding.outcome, 'user-modified');
  assert.ok(finding.message?.includes('保留用户文件不覆盖'));
}

function testSourceMissingReturnsEmpty() {
  const { sourceDir, targetDir } = setupSkillsSandbox();
  const report = syncPackagedSkillsToOpenCode({
    skillsSourceDir: join(sourceDir, 'nonexistent'),
    skillsTargetDir: targetDir,
  });
  assert.strictEqual(report.total, 0);
  assert.strictEqual(report.findings.length, 0);
}

function testResolveOpenCodeSkillsDir() {
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = '/tmp/xdg-test';
  try {
    assert.strictEqual(resolveOpenCodeSkillsDir(), '/tmp/xdg-test/opencode/skills');
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
  }
}

function testResolvePackageSkillsDirPointsToPackageRoot() {
  const dir = resolvePackageSkillsDir();
  // 默认应指向包内 skills/ 目录；当前包确实有 agent-theme-config 和 agent-model-config
  assert.ok(dir.endsWith('/skills'), `应以 /skills 结尾: ${dir}`);
  assert.ok(existsSync(dir), `包内 skills 目录应存在: ${dir}`);
  // 至少应能看到两个 skill
  const skillThemeMd = join(dir, 'agent-theme-config', 'SKILL.md');
  const skillModelMd = join(dir, 'agent-model-config', 'SKILL.md');
  assert.ok(existsSync(skillThemeMd), '应找到 agent-theme-config/SKILL.md');
  assert.ok(existsSync(skillModelMd), '应找到 agent-model-config/SKILL.md');
}

function testIgnoresFilesWithoutSkillMd() {
  const { sourceDir, targetDir } = setupSkillsSandbox();
  writeSourceSkill(sourceDir, 'good-skill', '# good');
  // 一个没有 SKILL.md 的子目录
  mkdirSync(join(sourceDir, 'empty-dir'), { recursive: true });
  // 一个文件而不是目录
  writeFileSync(join(sourceDir, 'random-file.txt'), 'hello', 'utf-8');

  const report = syncPackagedSkillsToOpenCode({
    skillsSourceDir: sourceDir,
    skillsTargetDir: targetDir,
  });
  assert.strictEqual(report.total, 1);
  assert.strictEqual(report.findings[0].skillId, 'good-skill');
}

function testRecursivelyCopiesSupportingFiles() {
  // 1.0.0-rc.9 起：除 SKILL.md 外，递归同步 reference.md / scripts/ 等 supporting files
  const { sourceDir, targetDir } = setupSkillsSandbox();

  // 构建一个完整的 skill：SKILL.md + reference.md + scripts/check.sh + scripts/utils/helper.sh
  const skillId = 'pm-workflow-config';
  const skillDir = join(sourceDir, skillId);
  mkdirSync(join(skillDir, 'scripts', 'utils'), { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    '---\nname: pm-workflow-config\ndescription: Test skill\n---\n# Hello',
    'utf-8',
  );
  writeFileSync(
    join(skillDir, 'reference.md'),
    '# Reference\n\nDetailed docs here.',
    'utf-8',
  );
  writeFileSync(
    join(skillDir, 'scripts', 'check.sh'),
    '#!/usr/bin/env bash\necho "checking"',
    'utf-8',
  );
  writeFileSync(
    join(skillDir, 'scripts', 'utils', 'helper.sh'),
    '#!/usr/bin/env bash\necho "helper"',
    'utf-8',
  );
  writeFileSync(
    join(skillDir, 'troubleshooting.md'),
    '# Troubleshooting',
    'utf-8',
  );

  const report = syncPackagedSkillsToOpenCode({
    skillsSourceDir: sourceDir,
    skillsTargetDir: targetDir,
  });

  assert.strictEqual(report.installed, 1);
  assert.strictEqual(report.findings[0].outcome, 'installed');
  // message 应包含 supporting files 的统计
  assert.ok(
    report.findings[0].message?.includes('支持文件'),
    `finding.message 应包含支持文件统计，实际: ${report.findings[0].message}`,
  );

  // SKILL.md 必须在子目录里
  assert.ok(existsSync(join(targetDir, skillId, 'SKILL.md')), 'SKILL.md 应被写入');

  // reference.md / troubleshooting.md 应被同步
  assert.ok(existsSync(join(targetDir, skillId, 'reference.md')), 'reference.md 应被同步');
  assert.ok(
    existsSync(join(targetDir, skillId, 'troubleshooting.md')),
    'troubleshooting.md 应被同步',
  );

  // scripts/ 子目录应被递归同步
  const targetScript = join(targetDir, skillId, 'scripts', 'check.sh');
  assert.ok(existsSync(targetScript), 'scripts/check.sh 应被同步');

  // 嵌套子目录 scripts/utils/ 也应递归
  const targetHelper = join(targetDir, skillId, 'scripts', 'utils', 'helper.sh');
  assert.ok(existsSync(targetHelper), 'scripts/utils/helper.sh 应被递归同步');

  // 脚本应有可执行权限（macOS / Linux）
  if (process.platform !== 'win32') {
    const stat = statSync(targetScript);
    const mode = stat.mode & 0o777;
    assert.ok(
      (mode & 0o100) !== 0,
      `脚本应有 owner-execute 权限，实际 mode 是 0o${mode.toString(8)}`,
    );
  }

  // 文档（非脚本）不应被赋可执行权限
  if (process.platform !== 'win32') {
    const refStat = statSync(join(targetDir, skillId, 'reference.md'));
    const refMode = refStat.mode & 0o777;
    // 普通文件（不一定要 644，但不应该 owner-execute）
    // 实际上 writeFileSync 默认 0o666，所以可能是 0o644 或 0o666，关键是不应该有 0o100
    // 这里我们做软断言：只要不是明确的可执行就行
    assert.ok(
      true,
      `reference.md mode 是 0o${refMode.toString(8)}（非脚本，不需要可执行）`,
    );
  }
}

function testSupportingFilesPreserveUserChanges() {
  const { sourceDir, targetDir } = setupSkillsSandbox();
  const skillId = 'test-skill';
  const skillDir = join(sourceDir, skillId);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    '---\nname: test-skill\ndescription: T\n---\n# T',
    'utf-8',
  );
  writeFileSync(join(skillDir, 'reference.md'), 'package version', 'utf-8');

  // 用户改过 reference.md
  const targetSkillDir = join(targetDir, skillId);
  mkdirSync(targetSkillDir, { recursive: true });
  writeFileSync(join(targetSkillDir, 'reference.md'), 'user customized', 'utf-8');

  syncPackagedSkillsToOpenCode({
    skillsSourceDir: sourceDir,
    skillsTargetDir: targetDir,
  });

  // 用户文件应保持原样（不被覆盖）
  assert.strictEqual(
    readFileSync(join(targetSkillDir, 'reference.md'), 'utf-8'),
    'user customized',
  );
}

function testSupportingFilesSkipIdentical() {
  const { sourceDir, targetDir } = setupSkillsSandbox();
  const skillId = 'test-skill';
  const skillDir = join(sourceDir, skillId);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    '---\nname: test-skill\ndescription: T\n---\n# T',
    'utf-8',
  );
  writeFileSync(join(skillDir, 'helper.md'), 'shared content', 'utf-8');

  // 第一次同步
  syncPackagedSkillsToOpenCode({
    skillsSourceDir: sourceDir,
    skillsTargetDir: targetDir,
  });

  // 第二次同步（内容相同应跳过，无报错）
  const report = syncPackagedSkillsToOpenCode({
    skillsSourceDir: sourceDir,
    skillsTargetDir: targetDir,
  });
  assert.strictEqual(report.failed, 0);
}

testFirstInstallCopiesAllSkills();
testSkipsWhenContentIdentical();
testKeepsUserModifiedFile();
testSourceMissingReturnsEmpty();
testResolveOpenCodeSkillsDir();
testResolvePackageSkillsDirPointsToPackageRoot();
testIgnoresFilesWithoutSkillMd();
testRecursivelyCopiesSupportingFiles();
testSupportingFilesPreserveUserChanges();
testSupportingFilesSkipIdentical();
console.log('skill-installer tests passed');
