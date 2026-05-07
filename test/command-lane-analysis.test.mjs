import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  inferTopologyFromAnalysis,
  resolveLaneContext,
  shouldCreateTodoForLane,
} from '../dist/index.js';
import { listPmWorkflowCommandSpecs } from '../dist/tui/commands.js';
import { formatLaneToast } from '../dist/tui/toasts.js';

async function testLaneDefaults() {
  assert.strictEqual(typeof inferTopologyFromAnalysis, 'function');

  const medium = resolveLaneContext('medium');
  assert.deepStrictEqual(medium, {
    lane: 'medium',
    risk: 'moderate',
    automation: 'assisted',
    topologyVerbosity: 'structured',
    reviewExpectation: 'standard',
  });
  assert.strictEqual(shouldCreateTodoForLane(medium, 3), true);

  const quick = resolveLaneContext('quick');
  assert.strictEqual(shouldCreateTodoForLane(quick, 2), false);
}

async function testLaneCommandsRegistered() {
  assert.strictEqual(typeof listPmWorkflowCommandSpecs, 'function');

  const specs = listPmWorkflowCommandSpecs({
    showConfigToast: () => {},
    showDispatchToast: () => {},
    showDoctorToast: () => {},
    showDryRunDispatchToast: () => {},
    showDryRunLoopToast: () => {},
    showExecutePermissionToggleToast: () => {},
    showExecutionReceiptsToast: () => {},
    showExecutionPlanToast: () => {},
    showExecutionSummaryToast: () => {},
    showHistoryToast: () => {},
    showLastExecutionToast: () => {},
    showMigrationReportToast: () => {},
    showModeToast: () => {},
    showPermissionsToast: () => {},
    showProjectStageToast: () => {},
    showRecoverySummaryToast: () => {},
    showReviewGateToast: () => {},
    showSafetyReportToast: () => {},
    switchModeToast: () => {},
    showLaneToast: () => {},
  });

  const values = specs.map((spec) => spec.value);
  assert.ok(values.includes('pm-lane-quick'));
  assert.ok(values.includes('pm-lane-medium'));
  assert.ok(values.includes('pm-lane-full'));
  assert.ok(values.includes('pm-lane-debug'));
}

async function testLaneCommandsTriggerCorrectLane() {
  const captured = [];
  const specs = listPmWorkflowCommandSpecs({
    showConfigToast: () => {},
    showDispatchToast: () => {},
    showDoctorToast: () => {},
    showDryRunDispatchToast: () => {},
    showDryRunLoopToast: () => {},
    showExecutePermissionToggleToast: () => {},
    showExecutionReceiptsToast: () => {},
    showExecutionPlanToast: () => {},
    showExecutionSummaryToast: () => {},
    showHistoryToast: () => {},
    showLastExecutionToast: () => {},
    showMigrationReportToast: () => {},
    showModeToast: () => {},
    showPermissionsToast: () => {},
    showProjectStageToast: () => {},
    showRecoverySummaryToast: () => {},
    showReviewGateToast: () => {},
    showSafetyReportToast: () => {},
    switchModeToast: () => {},
    showLaneToast: (lane) => captured.push(lane),
  });

  specs.find((spec) => spec.value === 'pm-lane-quick')?.onSelect?.();
  specs.find((spec) => spec.value === 'pm-lane-medium')?.onSelect?.();
  specs.find((spec) => spec.value === 'pm-lane-full')?.onSelect?.();
  specs.find((spec) => spec.value === 'pm-lane-debug')?.onSelect?.();

  assert.deepStrictEqual(captured, ['quick', 'medium', 'full', 'debug']);
}

async function testLaneCommandsExposeShortSlashAliases() {
  const specs = listPmWorkflowCommandSpecs({
    showConfigToast: () => {},
    showDispatchToast: () => {},
    showDoctorToast: () => {},
    showDryRunDispatchToast: () => {},
    showDryRunLoopToast: () => {},
    showExecutePermissionToggleToast: () => {},
    showExecutionReceiptsToast: () => {},
    showExecutionPlanToast: () => {},
    showExecutionSummaryToast: () => {},
    showHistoryToast: () => {},
    showLastExecutionToast: () => {},
    showMigrationReportToast: () => {},
    showModeToast: () => {},
    showPermissionsToast: () => {},
    showProjectStageToast: () => {},
    showRecoverySummaryToast: () => {},
    showReviewGateToast: () => {},
    showSafetyReportToast: () => {},
    switchModeToast: () => {},
    showLaneToast: () => {},
  });

  const slashNames = specs.map((spec) => spec.slash?.name).filter(Boolean);
  assert.ok(slashNames.includes('quick'));
  assert.ok(slashNames.includes('medium'));
  assert.ok(slashNames.includes('full'));
  assert.ok(slashNames.includes('debug'));
}

async function testLaneToastFormatting() {
  const medium = formatLaneToast({
    laneContext: resolveLaneContext('medium'),
    recommendedAgent: 'frontend',
    recommendedAction: 'continue-development',
    blocked: false,
  });

  assert.strictEqual(medium.title, 'pm-workflow medium lane');
  assert.ok(medium.message.includes('medium'));
  assert.ok(medium.message.includes('moderate'));
  assert.ok(medium.message.includes('assisted'));
  assert.ok(medium.message.includes('standard'));
  assert.ok(medium.message.includes('frontend/continue-development'));

  const debug = formatLaneToast({
    laneContext: resolveLaneContext('debug'),
    recommendedAgent: 'pm',
    recommendedAction: 'blocked',
    blocked: true,
  });

  assert.strictEqual(debug.variant, 'warning');
  assert.ok(debug.message.includes('debug'));
  assert.ok(debug.message.includes('assisted'));
  assert.ok(debug.message.includes('standard'));
}

async function testPackagePublishesCommandsDirectory() {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
  );

  assert.ok(pkg.files.includes('commands'), 'commands directory must be published');
  assert.ok(
    pkg.scripts.test.includes('command-lane-analysis.test.mjs'),
    'test script should include command lane analysis coverage',
  );
}

async function testReadmeDocumentsCommandLanesAndModeAwareDispatch() {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf-8');

  assert.ok(readme.includes('Command Lanes'), 'README should document command lanes');
  assert.ok(
    readme.includes('mode-aware dispatch'),
    'README should explain specialist routing changes',
  );
}

await testLaneDefaults();
await testLaneCommandsRegistered();
await testLaneCommandsTriggerCorrectLane();
await testLaneCommandsExposeShortSlashAliases();
await testLaneToastFormatting();
await testPackagePublishesCommandsDirectory();
await testReadmeDocumentsCommandLanesAndModeAwareDispatch();
