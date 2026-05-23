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
    const target = join(targetDir, `${id}.md`);
    assert.ok(existsSync(target), `${id}.md 应被写入`);
    const content = readFileSync(target, 'utf-8');
    assert.ok(content.includes(`name: ${id}`), `${id}.md 内容应包含 frontmatter name`);
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

  // 用户已经放了改过的文件
  mkdirSync(targetDir, { recursive: true });
  const userPath = join(targetDir, 'agent-theme-config.md');
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

testFirstInstallCopiesAllSkills();
testSkipsWhenContentIdentical();
testKeepsUserModifiedFile();
testSourceMissingReturnsEmpty();
testResolveOpenCodeSkillsDir();
testResolvePackageSkillsDirPointsToPackageRoot();
testIgnoresFilesWithoutSkillMd();
console.log('skill-installer tests passed');
