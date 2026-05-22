import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHistoryReportSummary,
  renderHistoryReportHtml,
} from '../dist/index.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..');
const CLI_PATH = join(REPO_ROOT, 'scripts', 'cli', 'index.mjs');

function makeProjectWithHistory(events) {
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-report-'));
  const dir = join(projectDir, '.pm-workflow');
  mkdirSync(dir, { recursive: true });
  const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  appendFileSync(join(dir, 'history.jsonl'), lines, 'utf-8');
  return projectDir;
}

// 1) buildHistoryReportSummary：空 history 也返回结构化 summary
{
  const projectDir = mkdtempSync(join(tmpdir(), 'pmw-report-empty-'));
  try {
    const { summary, events } = buildHistoryReportSummary(projectDir);
    assert.strictEqual(summary.totalEvents, 0);
    assert.strictEqual(summary.dispatchCount, 0);
    assert.strictEqual(summary.dispatchFailures, 0);
    assert.deepStrictEqual(summary.byType, []);
    assert.ok(Array.isArray(events));
    assert.ok(summary.generatedAt);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 2) buildHistoryReportSummary：分类计数与失败识别
{
  const projectDir = makeProjectWithHistory([
    { at: '2026-05-22T10:00:00Z', type: 'dispatch.executed', exitCode: 0 },
    { at: '2026-05-22T10:01:00Z', type: 'dispatch.executed', exitCode: 1 },
    { at: '2026-05-22T10:02:00Z', type: 'fallback.foreground_switch', from_model: 'a', to_model: 'b' },
    { at: '2026-05-22T10:03:00Z', type: 'auto_continue.chain_start' },
    { at: '2026-05-22T10:04:00Z', type: 'auto_continue.step', exit_code: 0 },
    { at: '2026-05-22T10:05:00Z', type: 'auto_continue.step', exit_code: 0 },
    { at: '2026-05-22T10:06:00Z', type: 'auto_continue.aborted', reason: 'feedback-stop' },
    { at: '2026-05-22T10:07:00Z', type: 'routing.denied', candidate_agent: 'pm_researcher' },
  ]);
  try {
    const { summary } = buildHistoryReportSummary(projectDir);
    assert.strictEqual(summary.totalEvents, 8);
    assert.strictEqual(summary.dispatchCount, 2);
    assert.strictEqual(summary.dispatchFailures, 1);
    assert.strictEqual(summary.fallbackSwitches, 1);
    assert.strictEqual(summary.autoContinueChains, 1);
    assert.strictEqual(summary.autoContinueSteps, 2);
    assert.strictEqual(summary.autoContinueAborted, 1);
    assert.strictEqual(summary.routingDenied, 1);
    // byType 按数量倒序
    assert.ok(summary.byType.length >= 5);
    assert.ok(summary.byType[0].count >= summary.byType[summary.byType.length - 1].count);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 3) renderHistoryReportHtml：合法 HTML，包含关键节点与 XSS 转义
{
  const projectDir = makeProjectWithHistory([
    { at: '2026-05-22T10:00:00Z', type: 'dispatch.executed', exitCode: 0 },
    { at: '2026-05-22T10:01:00Z', type: 'malicious.test', payload: '<script>alert(1)</script>' },
  ]);
  try {
    const { summary, events } = buildHistoryReportSummary(projectDir);
    const html = renderHistoryReportHtml({
      summary,
      events,
      packageVersion: '0.9.0',
    });
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('pm-workflow 执行回执 dashboard'));
    assert.ok(html.includes('Dispatch 总数'));
    assert.ok(html.includes('Auto-continue 链'));
    assert.ok(html.includes('Routing 拒绝'));
    // XSS 转义检查：恶意 script 不应该作为可执行 script 出现，
    // events JSON 嵌入时 < 应被替换为 \u003c
    assert.ok(
      !html.includes('<script>alert(1)</script>'),
      'inline script payload 应被转义',
    );
    assert.ok(
      html.includes('\\u003cscript') || html.includes('&lt;script'),
      `应保留转义后的 payload；实际 html 头 800 字节: ${html.slice(0, 800)}`,
    );
    assert.ok(html.endsWith('</html>'));
    assert.ok(html.includes('v0.9.0'));
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 4) CLI: pmw report 默认输出到 .pm-workflow/report.html
{
  const projectDir = makeProjectWithHistory([
    { at: '2026-05-22T10:00:00Z', type: 'dispatch.executed', exitCode: 0 },
  ]);
  try {
    const r = spawnSync('node', [CLI_PATH, 'report', '--cwd', projectDir], {
      encoding: 'utf-8',
    });
    assert.strictEqual(r.status, 0, `report 应成功，stderr:\n${r.stderr}`);
    const reportPath = join(projectDir, '.pm-workflow', 'report.html');
    assert.ok(existsSync(reportPath), `应生成 ${reportPath}`);
    const html = readFileSync(reportPath, 'utf-8');
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('Dispatch 总数'));
    assert.match(r.stdout, /dashboard 已生成/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 5) CLI: pmw report --out 自定义路径
{
  const projectDir = makeProjectWithHistory([
    { at: '2026-05-22T10:00:00Z', type: 'dispatch.executed', exitCode: 0 },
  ]);
  const outPath = join(projectDir, 'custom-report.html');
  try {
    const r = spawnSync(
      'node',
      [CLI_PATH, 'report', '--cwd', projectDir, '--out', outPath],
      { encoding: 'utf-8' },
    );
    assert.strictEqual(r.status, 0, `report --out 应成功，stderr:\n${r.stderr}`);
    assert.ok(existsSync(outPath));
    assert.ok(!existsSync(join(projectDir, '.pm-workflow', 'report.html')), '指定 --out 时不应写默认路径');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 6) CLI: pmw report --json 仅输出 summary 不写文件
{
  const projectDir = makeProjectWithHistory([
    { at: '2026-05-22T10:00:00Z', type: 'dispatch.executed', exitCode: 0 },
  ]);
  try {
    const r = spawnSync(
      'node',
      [CLI_PATH, 'report', '--cwd', projectDir, '--json'],
      { encoding: 'utf-8' },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.totalEvents, 1);
    assert.strictEqual(parsed.dispatchCount, 1);
    assert.strictEqual(parsed.dispatchFailures, 0);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

console.log('report tests passed');
