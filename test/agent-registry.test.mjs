import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveWorkflowAgentDefinition } from '../dist/index.js';

function testResolvedAgentShape() {
  const resolved = resolveWorkflowAgentDefinition({
    projectDir: process.cwd(),
    semanticAgent: 'frontend',
  });

  assert.strictEqual(typeof resolved.id, 'string');
  assert.ok(['project', 'global', 'fallback'].includes(resolved.source));
  assert.ok(['agents', 'agent', 'fallback', undefined].includes(resolved.directoryKind));
  assert.strictEqual(typeof resolved.usedFallback, 'boolean');
}

function testProjectAgentsDirectoryWinsOverLegacyAndGlobal() {
  const sandboxDir = mkdtempSync(join(tmpdir(), 'agent-registry-'));
  const projectDir = join(sandboxDir, 'project');
  const configHome = join(sandboxDir, 'xdg');

  mkdirSync(join(projectDir, '.opencode', 'agents'), { recursive: true });
  mkdirSync(join(projectDir, '.opencode', 'agent'), { recursive: true });
  mkdirSync(join(configHome, 'opencode', 'agents'), { recursive: true });

  writeFileSync(
    join(projectDir, '.opencode', 'agents', 'frontend.md'),
    ['---', 'description: Frontend agent from project agents', 'mode: subagent', 'model: project-agents-model', '---', 'Project agents body'].join('\n'),
  );
  writeFileSync(
    join(projectDir, '.opencode', 'agent', 'frontend.md'),
    ['---', 'description: Legacy project agent', 'mode: primary', 'model: project-agent-model', '---', 'Project agent body'].join('\n'),
  );
  writeFileSync(
    join(configHome, 'opencode', 'agents', 'frontend.md'),
    ['---', 'description: Global frontend agent', 'mode: subagent', 'model: global-agents-model', '---', 'Global agents body'].join('\n'),
  );

  const previousConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = configHome;

  try {
    const resolved = resolveWorkflowAgentDefinition({
      projectDir,
      semanticAgent: 'frontend',
    });

    assert.strictEqual(resolved.source, 'project');
    assert.strictEqual(resolved.directoryKind, 'agents');
    assert.strictEqual(resolved.model, 'project-agents-model');
    assert.strictEqual(resolved.mode, 'subagent');
    assert.strictEqual(resolved.description, 'Frontend agent from project agents');
    assert.strictEqual(resolved.usedFallback, false);
    assert.ok(resolved.filePath.endsWith('/.opencode/agents/frontend.md'));
    assert.strictEqual(resolved.shadowedGlobal, true);
  } finally {
    if (previousConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousConfigHome;
    }
  }
}

function testGlobalAgentsWinsOverLegacyProjectAgent() {
  const sandboxDir = mkdtempSync(join(tmpdir(), 'agent-registry-'));
  const projectDir = join(sandboxDir, 'project');
  const configHome = join(sandboxDir, 'xdg');

  mkdirSync(join(projectDir, '.opencode', 'agent'), { recursive: true });
  mkdirSync(join(configHome, 'opencode', 'agents'), { recursive: true });
  mkdirSync(join(configHome, 'opencode', 'agent'), { recursive: true });

  writeFileSync(
    join(projectDir, '.opencode', 'agent', 'frontend.md'),
    ['---', 'description: Legacy project agent', 'mode: primary', 'model: project-agent-model', '---', 'Project agent body'].join('\n'),
  );
  writeFileSync(
    join(configHome, 'opencode', 'agents', 'frontend.md'),
    ['---', 'description: Global frontend agent', 'mode: subagent', 'model: global-agents-model', '---', 'Global agents body'].join('\n'),
  );
  writeFileSync(
    join(configHome, 'opencode', 'agent', 'frontend.md'),
    ['---', 'description: Global legacy agent', 'mode: primary', 'model: global-agent-model', '---', 'Global agent body'].join('\n'),
  );

  const previousConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = configHome;

  try {
    const resolved = resolveWorkflowAgentDefinition({
      projectDir,
      semanticAgent: 'frontend',
    });

    assert.strictEqual(resolved.source, 'global');
    assert.strictEqual(resolved.directoryKind, 'agents');
    assert.strictEqual(resolved.model, 'global-agents-model');
    assert.strictEqual(resolved.mode, 'subagent');
    assert.strictEqual(resolved.description, 'Global frontend agent');
    assert.strictEqual(resolved.usedFallback, false);
    assert.ok(resolved.filePath.endsWith('/opencode/agents/frontend.md'));
  } finally {
    if (previousConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousConfigHome;
    }
  }
}

function testFrontmatterFieldsAreNotOverriddenByFallbackDefinition() {
  const sandboxDir = mkdtempSync(join(tmpdir(), 'agent-registry-'));
  const projectDir = join(sandboxDir, 'project');

  mkdirSync(join(projectDir, '.pm-workflow'), { recursive: true });
  mkdirSync(join(projectDir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(
    join(projectDir, '.pm-workflow', 'config.json'),
    JSON.stringify({
      agents: {
        dispatch_map: {
          frontend: 'pm_frontend',
        },
      },
    }),
    'utf-8',
  );

  writeFileSync(
    join(projectDir, '.opencode', 'agents', 'frontend.md'),
    [
      '---',
      'description: Frontend from frontmatter',
      'mode: subagent',
      'model: custom-frontend-model',
      '---',
      'Project agents body',
    ].join('\n'),
  );

  const resolved = resolveWorkflowAgentDefinition({
    projectDir,
    semanticAgent: 'frontend',
  });

  assert.strictEqual(resolved.id, 'pm_frontend');
  assert.strictEqual(resolved.model, 'custom-frontend-model');
  assert.strictEqual(resolved.description, 'Frontend from frontmatter');
  assert.strictEqual(resolved.mode, 'subagent');
  assert.strictEqual(resolved.usedFallback, false);
}

function testFallbackOnlyFillsMissingFields() {
  const sandboxDir = mkdtempSync(join(tmpdir(), 'agent-registry-'));
  const projectDir = join(sandboxDir, 'project');

  mkdirSync(join(projectDir, '.pm-workflow'), { recursive: true });
  mkdirSync(join(projectDir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(
    join(projectDir, '.pm-workflow', 'config.json'),
    JSON.stringify({
      agents: {
        dispatch_map: {
          frontend: 'pm_frontend',
        },
      },
    }),
    'utf-8',
  );

  writeFileSync(
    join(projectDir, '.opencode', 'agents', 'frontend.md'),
    [
      '---',
      'description: Frontend from frontmatter',
      'model: custom-frontend-model',
      '---',
      'Project agents body',
    ].join('\n'),
  );

  const resolved = resolveWorkflowAgentDefinition({
    projectDir,
    semanticAgent: 'frontend',
  });

  assert.strictEqual(resolved.id, 'pm_frontend');
  assert.strictEqual(resolved.model, 'custom-frontend-model');
  assert.strictEqual(resolved.description, 'Frontend from frontmatter');
  assert.strictEqual(resolved.mode, 'all');
  assert.strictEqual(resolved.usedFallback, true);
  assert.strictEqual(resolved.fallbackReason, 'missing-mode');
}

function testMissingAgentUsesExecutableFallbackId() {
  const sandboxDir = mkdtempSync(join(tmpdir(), 'agent-registry-'));
  const projectDir = join(sandboxDir, 'project');
  const configHome = join(sandboxDir, 'xdg');

  mkdirSync(join(projectDir, '.pm-workflow'), { recursive: true });
  mkdirSync(join(configHome, 'opencode'), { recursive: true });
  writeFileSync(
    join(projectDir, '.pm-workflow', 'config.json'),
    JSON.stringify({
      agents: {
        dispatch_map: {
          frontend: 'pm_frontend',
        },
      },
    }),
    'utf-8',
  );

  const previousConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = configHome;

  try {
    const resolved = resolveWorkflowAgentDefinition({
      projectDir,
      semanticAgent: 'frontend',
    });

    assert.strictEqual(resolved.id, 'pm_frontend');
    assert.strictEqual(resolved.source, 'fallback');
    assert.strictEqual(resolved.usedFallback, true);
    assert.strictEqual(resolved.fallbackReason, 'missing-agent');
  } finally {
    if (previousConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousConfigHome;
    }
  }
}

function testMissingDescriptionUsesFallbackReason() {
  const sandboxDir = mkdtempSync(join(tmpdir(), 'agent-registry-'));
  const projectDir = join(sandboxDir, 'project');
  const configHome = join(sandboxDir, 'xdg');

  mkdirSync(join(projectDir, '.pm-workflow'), { recursive: true });
  mkdirSync(join(projectDir, '.opencode', 'agents'), { recursive: true });
  mkdirSync(join(configHome, 'opencode'), { recursive: true });
  writeFileSync(
    join(projectDir, '.pm-workflow', 'config.json'),
    JSON.stringify({
      agents: {
        dispatch_map: {
          frontend: 'pm_frontend',
        },
      },
    }),
    'utf-8',
  );

  writeFileSync(
    join(projectDir, '.opencode', 'agents', 'frontend.md'),
    [
      '---',
      'mode: subagent',
      'model: custom-frontend-model',
      '---',
      'Project agents body',
    ].join('\n'),
  );

  const previousConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = configHome;

  try {
    const resolved = resolveWorkflowAgentDefinition({
      projectDir,
      semanticAgent: 'frontend',
    });

    assert.strictEqual(resolved.id, 'pm_frontend');
    assert.strictEqual(resolved.model, 'custom-frontend-model');
    assert.strictEqual(resolved.mode, 'subagent');
    assert.strictEqual(resolved.description, '你是 pm-workflow 的前端 agent。负责前端实现、UI/UX、组件拆分、响应式布局、可访问性和视觉一致性。');
    assert.strictEqual(resolved.usedFallback, true);
    assert.strictEqual(resolved.fallbackReason, 'missing-description');
  } finally {
    if (previousConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousConfigHome;
    }
  }
}

testResolvedAgentShape();
testProjectAgentsDirectoryWinsOverLegacyAndGlobal();
testGlobalAgentsWinsOverLegacyProjectAgent();
testFrontmatterFieldsAreNotOverriddenByFallbackDefinition();
testFallbackOnlyFillsMissingFields();
testMissingAgentUsesExecutableFallbackId();
testMissingDescriptionUsesFallbackReason();
console.log('agent registry tests passed');
