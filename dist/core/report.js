/**
 * 0.9.0：本地 HTML 执行回执 dashboard 生成器。
 *
 * 设计目标：
 * - 把 .pm-workflow/history.jsonl 中海量 JSON 事件渲染成可读视图。
 * - 完全本地渲染、不联网、不上传；产物是单个静态 HTML 文件。
 * - 不引入前端框架；嵌内联 CSS + 极简 JS 即可，体积 < 30KB。
 *
 * 不做的事情：
 * - 不开本地 HTTP server；不开端口；不做实时刷新。
 * - 不写入项目状态；纯只读读取 history.jsonl。
 * - 不预聚合上传到任何远端。
 */
import { readHistory } from "./history.js";
/**
 * 从 history.jsonl 计算 dashboard 摘要。仅做计数与分组，不做趋势预测或异常检测。
 */
export function buildHistoryReportSummary(projectDir) {
    const events = readHistory(projectDir);
    const byTypeMap = new Map();
    let dispatchCount = 0;
    let dispatchFailures = 0;
    let fallbackSwitches = 0;
    let autoContinueChains = 0;
    let autoContinueSteps = 0;
    let autoContinueAborted = 0;
    let routingDenied = 0;
    for (const event of events) {
        const type = event.type ?? "unknown";
        byTypeMap.set(type, (byTypeMap.get(type) ?? 0) + 1);
        if (type === "dispatch.executed") {
            dispatchCount += 1;
            if (typeof event.exitCode === "number" && event.exitCode !== 0) {
                dispatchFailures += 1;
            }
        }
        else if (type === "fallback.foreground_switch") {
            fallbackSwitches += 1;
        }
        else if (type === "auto_continue.chain_start") {
            autoContinueChains += 1;
        }
        else if (type === "auto_continue.step") {
            autoContinueSteps += 1;
        }
        else if (type === "auto_continue.aborted") {
            autoContinueAborted += 1;
        }
        else if (type === "routing.denied") {
            routingDenied += 1;
        }
    }
    const byType = Array.from(byTypeMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);
    return {
        events,
        summary: {
            totalEvents: events.length,
            generatedAt: new Date().toISOString(),
            projectDir,
            dispatchCount,
            dispatchFailures,
            fallbackSwitches,
            autoContinueChains,
            autoContinueSteps,
            autoContinueAborted,
            routingDenied,
            byType,
        },
    };
}
/**
 * 防 XSS：渲染到 HTML 时的最小转义。事件 JSON 原文中可能含 `<script>` 字符串
 * （比如某次 specialist 输出包含 HTML）。报告是离线本地查看，但仍要避免
 * 把恶意串作为 HTML 节点解释。
 */
function escapeHtml(input) {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function classForExitCode(exitCode) {
    if (typeof exitCode !== "number")
        return "neutral";
    return exitCode === 0 ? "ok" : "fail";
}
/**
 * 生成单文件 HTML 报告。
 *
 * - 嵌入所有事件为 `<script>` 中的 const events 数据。
 * - 嵌入内联 CSS（约 100 行），不引外链字体。
 * - 包含一段 ~100 行 vanilla JS 处理筛选 / 折叠。
 *
 * 报告体积：与 history 事件数量线性相关；事件 < 5000 时通常 < 1MB。
 */
export function renderHistoryReportHtml(input) {
    const { summary, events, packageVersion } = input;
    const eventsJson = JSON.stringify(events).replace(/</g, "\\u003c");
    const head = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>pm-workflow 执行回执 dashboard — ${escapeHtml(summary.projectDir)}</title>
<style>
  :root {
    --bg: #0f1115;
    --panel: #1a1d24;
    --text: #e3e6eb;
    --muted: #8b94a3;
    --accent: #60a5fa;
    --ok: #34d399;
    --fail: #f87171;
    --warn: #fbbf24;
    --neutral: #6b7280;
    --border: #2b313c;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
  }
  header {
    padding: 20px 32px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  header h1 { margin: 0 0 6px; font-size: 18px; }
  header .meta { color: var(--muted); font-size: 13px; }
  main { max-width: 1280px; margin: 0 auto; padding: 24px 32px; }
  section { margin-bottom: 32px; }
  h2 { font-size: 16px; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .stat-card { background: var(--panel); padding: 14px 16px; border-radius: 6px; border: 1px solid var(--border); }
  .stat-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-value { font-size: 24px; font-weight: 600; margin-top: 4px; }
  .stat-value.ok { color: var(--ok); }
  .stat-value.fail { color: var(--fail); }
  .stat-value.warn { color: var(--warn); }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: top; }
  th { background: rgba(96, 165, 250, 0.08); color: var(--accent); font-weight: 500; font-size: 12px; }
  tr:last-child td { border-bottom: none; }
  td.ts { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; white-space: nowrap; }
  td.type { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--accent); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .badge.ok { background: rgba(52, 211, 153, 0.16); color: var(--ok); }
  .badge.fail { background: rgba(248, 113, 113, 0.16); color: var(--fail); }
  .badge.neutral { background: rgba(107, 114, 128, 0.2); color: var(--muted); }
  details { background: var(--panel); padding: 8px 12px; border-radius: 4px; margin-top: 4px; border: 1px solid var(--border); }
  details summary { cursor: pointer; color: var(--muted); font-size: 12px; user-select: none; }
  pre { margin: 8px 0 0; padding: 10px; background: rgba(0, 0, 0, 0.25); border-radius: 4px; overflow-x: auto; font-size: 12px; line-height: 1.45; }
  .filter-bar { margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .filter-bar input, .filter-bar select { background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 6px 10px; font-size: 13px; }
  .filter-bar input { min-width: 240px; }
  .filter-bar label { color: var(--muted); font-size: 12px; }
  footer { color: var(--muted); font-size: 12px; padding: 24px 32px; border-top: 1px solid var(--border); text-align: center; }
  .empty { padding: 24px; text-align: center; color: var(--muted); background: var(--panel); border-radius: 6px; border: 1px dashed var(--border); }
</style>
</head>`;
    const body = `<body>
<header>
  <h1>pm-workflow 执行回执 dashboard</h1>
  <div class="meta">项目: <code>${escapeHtml(summary.projectDir)}</code> · 生成于 ${escapeHtml(summary.generatedAt)} · 共 ${summary.totalEvents} 条事件</div>
</header>
<main>
  <section>
    <h2>关键指标</h2>
    <div class="stats">
      <div class="stat-card"><div class="stat-label">Dispatch 总数</div><div class="stat-value">${summary.dispatchCount}</div></div>
      <div class="stat-card"><div class="stat-label">Dispatch 失败</div><div class="stat-value ${summary.dispatchFailures > 0 ? "fail" : "ok"}">${summary.dispatchFailures}</div></div>
      <div class="stat-card"><div class="stat-label">Fallback 切换</div><div class="stat-value ${summary.fallbackSwitches > 0 ? "warn" : "ok"}">${summary.fallbackSwitches}</div></div>
      <div class="stat-card"><div class="stat-label">Auto-continue 链</div><div class="stat-value">${summary.autoContinueChains}</div></div>
      <div class="stat-card"><div class="stat-label">Auto-continue 步</div><div class="stat-value">${summary.autoContinueSteps}</div></div>
      <div class="stat-card"><div class="stat-label">Auto-continue 中止</div><div class="stat-value ${summary.autoContinueAborted > 0 ? "warn" : "ok"}">${summary.autoContinueAborted}</div></div>
      <div class="stat-card"><div class="stat-label">Routing 拒绝</div><div class="stat-value ${summary.routingDenied > 0 ? "warn" : "ok"}">${summary.routingDenied}</div></div>
    </div>
  </section>

  <section>
    <h2>事件类型分布</h2>
    <table>
      <thead><tr><th>事件类型</th><th>数量</th><th>占比</th></tr></thead>
      <tbody>
        ${summary.byType
        .map((entry) => `<tr>
            <td class="type">${escapeHtml(entry.type)}</td>
            <td>${entry.count}</td>
            <td>${summary.totalEvents > 0 ? ((entry.count / summary.totalEvents) * 100).toFixed(1) : "0.0"}%</td>
          </tr>`)
        .join("")}
      </tbody>
    </table>
  </section>

  <section>
    <h2>事件流</h2>
    <div class="filter-bar">
      <label>过滤：</label>
      <input type="search" id="filter-text" placeholder="按类型 / agent / action 搜索...">
      <select id="filter-type">
        <option value="">全部类型</option>
        ${summary.byType.map((e) => `<option value="${escapeHtml(e.type)}">${escapeHtml(e.type)} (${e.count})</option>`).join("")}
      </select>
      <label>显示最近 <input type="number" id="filter-limit" value="100" min="1" max="${summary.totalEvents}" style="min-width: 80px"> 条</label>
    </div>
    <div id="event-list"></div>
  </section>
</main>
<footer>
  pm-workflow${packageVersion ? ` v${escapeHtml(packageVersion)}` : ""} · 本地静态报告，不联网，不上传 · 完全只读
</footer>
<script>
  const events = ${eventsJson};
  const listEl = document.getElementById('event-list');
  const textInput = document.getElementById('filter-text');
  const typeSelect = document.getElementById('filter-type');
  const limitInput = document.getElementById('filter-limit');

  function badge(exitCode) {
    if (typeof exitCode !== 'number') return '';
    const cls = exitCode === 0 ? 'ok' : 'fail';
    return '<span class="badge ' + cls + '">exit=' + exitCode + '</span>';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render() {
    const text = textInput.value.toLowerCase();
    const type = typeSelect.value;
    const limit = Math.max(1, parseInt(limitInput.value || '100', 10));

    let filtered = events;
    if (type) filtered = filtered.filter((e) => (e.type || '') === type);
    if (text) {
      filtered = filtered.filter((e) =>
        JSON.stringify(e).toLowerCase().includes(text),
      );
    }
    const recent = filtered.slice(-limit).reverse();

    if (recent.length === 0) {
      listEl.innerHTML = '<div class="empty">没有匹配的事件</div>';
      return;
    }

    const rows = recent.map((e) => {
      const at = e.at || '?';
      const t = e.type || '?';
      const others = Object.assign({}, e);
      delete others.at;
      delete others.type;
      const summary = Object.entries(others)
        .filter(([k]) => ['agent', 'action', 'exitCode', 'reason', 'from_model', 'to_model', 'trigger_kind', 'matched'].includes(k))
        .map(([k, v]) => k + '=' + escapeHtml(JSON.stringify(v)))
        .join(' · ');
      return '<tr>'
        + '<td class="ts">' + escapeHtml(at) + '</td>'
        + '<td class="type">' + escapeHtml(t) + '</td>'
        + '<td>' + summary + ' ' + badge(e.exitCode) + '</td>'
        + '<td><details><summary>展开</summary><pre>' + escapeHtml(JSON.stringify(e, null, 2)) + '</pre></details></td>'
        + '</tr>';
    });

    listEl.innerHTML = '<table><thead><tr><th>时间</th><th>类型</th><th>摘要</th><th>原文</th></tr></thead><tbody>'
      + rows.join('')
      + '</tbody></table>';
  }

  textInput.addEventListener('input', render);
  typeSelect.addEventListener('change', render);
  limitInput.addEventListener('change', render);
  render();
</script>
</body>
</html>`;
    return head + body;
}
