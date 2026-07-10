import assert from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultWorkflowConfig,
  listGlobalOpenCodeModelKeys,
  readGlobalOpenCodeModelInventory,
  resolveGlobalOpenCodeModelAlias,
  resolveWorkflowAgentDefinition,
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
      'mini-gateway': {
        models: {
          'gpt-5.6-sol': {},
          'shared-model': {},
        },
      },
      omniroute: {
        models: {
          'gemini-3.5-flash': {},
          'shared-model': {},
        },
      },
    },
  }),
  'utf-8',
);
mkdirSync(join(opencodeDir, 'agents'), { recursive: true });
writeFileSync(
  join(opencodeDir, 'agents', 'qa_engineer.md'),
  [
    '---',
    'description: QA engineer from sandboxed frontmatter',
    'mode: all',
    'model: kr/claude-sonnet-4.5',
    '---',
    'QA engineer body',
  ].join('\n'),
  'utf-8',
);

try {
  process.env.XDG_CONFIG_HOME = configHome;

  const inventory = readGlobalOpenCodeModelInventory();
  assert.ok(inventory.models.some((entry) => entry.provider === 'bestool-route-cx'));
  assert.ok(inventory.models.some((entry) => entry.model === 'cx/gpt-5.5'));
  assert.ok(!listGlobalOpenCodeModelKeys().includes('bestool-route-cx/cx/gpt-5.5'));
  assert.ok(listGlobalOpenCodeModelKeys().includes('cx/gpt-5.5'));

  const portable = resolveGlobalOpenCodeModelAlias('gpt-5.6-sol');
  assert.strictEqual(portable.status, 'resolved');
  assert.strictEqual(portable.resolved, 'mini-gateway/gpt-5.6-sol');

  const explicit = resolveGlobalOpenCodeModelAlias('cx/gpt-5.5');
  assert.strictEqual(explicit.status, 'exact');
  assert.strictEqual(explicit.resolved, 'cx/gpt-5.5');

  const ambiguous = resolveGlobalOpenCodeModelAlias('shared-model');
  assert.strictEqual(ambiguous.status, 'ambiguous');
  assert.deepStrictEqual(ambiguous.candidates, [
    'mini-gateway/shared-model',
    'omniroute/shared-model',
  ]);

  const config = validateWorkflowConfigAgentModels(defaultWorkflowConfig());
  assert.strictEqual(config.agents.definitions.commander.model, undefined);
  assert.strictEqual(config.agents.definitions.backendcoder.model, undefined);
  assert.strictEqual(config.agents.definitions.designer.model, undefined);
  assert.strictEqual(config.agents.definitions.fixer.model, undefined);

  const resolvedQa = resolveWorkflowAgentDefinition({
    projectDir,
    semanticAgent: 'qa_engineer',
  });
  assert.strictEqual(resolvedQa.model, 'kr/claude-sonnet-4.5');
  assert.strictEqual(resolvedQa.mode, 'all');
  assert.strictEqual(resolvedQa.description, 'QA engineer from sandboxed frontmatter');

  const modelTemplate = JSON.parse(
    readFileSync(new URL('../pm-workflow.models.example.json', import.meta.url), 'utf-8'),
  );
  const expectedAgents = ['advisor', 'backendcoder', 'commander', 'designer', 'fixer', 'writer'];
  assert.deepStrictEqual(Object.keys(modelTemplate.agent_profiles).sort(), expectedAgents);
  assert.deepStrictEqual(Object.keys(modelTemplate.agent_models).sort(), expectedAgents);
  assert.deepStrictEqual(Object.keys(modelTemplate.agent_fallback_models).sort(), expectedAgents);
  assert.deepStrictEqual(modelTemplate.agent_models, {
    commander: 'gpt-5.6-sol',
    advisor: 'gpt-5.6-sol',
    backendcoder: 'gpt-5.6-terra',
    designer: 'gemini-3.5-flash',
    fixer: 'gpt-5.6-terra',
    writer: 'gpt-5.6-luna',
  });

  console.log('global OpenCode model inventory tests passed');
} finally {
  rmSync(projectDir, { recursive: true, force: true });
}
