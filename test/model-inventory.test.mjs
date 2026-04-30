import assert from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultWorkflowConfig,
  listGlobalOpenCodeModelKeys,
  readGlobalOpenCodeModelInventory,
  validateWorkflowConfigAgentModels,
} from '../dist/index.js';

const projectDir = mkdtempSync(join(tmpdir(), 'pm-workflow-models-'));
const configHome = join(projectDir, 'config-home');
const opencodeDir = join(configHome, 'opencode');
mkdirSync(opencodeDir, { recursive: true });
writeFileSync(
  join(opencodeDir, 'opencode.json'),
  JSON.stringify({
    provider: {
      'bestool-route-cx': {
        models: {
          'cx/gpt-5.5': {},
          'cx/gpt-5.4': {},
          'cx/gpt-5.3-codex': {},
        },
      },
      'bestool-route-kr': {
        models: {
          'kr/claude-haiku-4.5': {},
          'kr/claude-sonnet-4.5': {},
        },
      },
      antigravity: {
        models: {
          'antigravity/gemini-3-flash-preview': {},
        },
      },
    },
  }),
  'utf-8',
);

try {
  process.env.XDG_CONFIG_HOME = configHome;

  const inventory = readGlobalOpenCodeModelInventory();
  assert.ok(inventory.models.some((entry) => entry.provider === 'bestool-route-cx'));
  assert.ok(inventory.models.some((entry) => entry.model === 'cx/gpt-5.5'));
  assert.ok(!listGlobalOpenCodeModelKeys().includes('bestool-route-cx/cx/gpt-5.5'));

  const config = validateWorkflowConfigAgentModels(defaultWorkflowConfig());
  assert.strictEqual(config.agents.definitions.pm_workflow_caocao.model, 'cx/gpt-5.5');
  assert.strictEqual(config.agents.definitions.pm_workflow_lvbu.model, 'cx/gpt-5.3-codex');
  assert.strictEqual(
    config.agents.definitions.pm_workflow_diaochan.model,
    'antigravity/gemini-3-flash-preview',
  );
  assert.strictEqual(config.agents.definitions.pm_workflow_writer.model, 'kr/claude-haiku-4.5');

  console.log('global OpenCode model inventory tests passed');
} finally {
  rmSync(projectDir, { recursive: true, force: true });
}
