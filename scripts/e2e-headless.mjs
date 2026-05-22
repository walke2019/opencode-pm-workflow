#!/usr/bin/env node
/**
 * 1.0.0-rc.0：e2e 验收辅助脚本（headless 部分）。
 *
 * 不依赖真实 OpenCode 进程；在 mkdtemp 隔离的项目里自动跑通如下场景：
 *
 * - 场景 1：pmw doctor（dist/index.js 直接调）
 * - 场景 5：声明式路由 routing.denied（写一个 pm_lead.md 后调
 *   buildAutoContinueDispatch 看是否被 deny，并写 history）
 * - 场景 7：pmw report（写若干 history 后渲染 HTML，校验关键指标）
 *
 * 该脚本是真实 OpenCode 端到端验证的子集：覆盖代码层闭环，但不替代场景 2/3/4/6
 * 那种"真实 spawn opencode 子进程"的人工验证。
 *
 * 使用：
 *   node scripts/e2e-headless.mjs
 *   (退出码 0 = 全部 headless 场景通过；非 0 = 有失败)
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DIST = join(REPO_ROOT, "dist", "index.js");

const dist = await import(DIST);

let failed = 0;
const reports = [];

function pass(scenario, detail) {
  reports.push({ scenario, ok: true, detail });
  console.log(`  ✓ ${scenario}: ${detail}`);
}

function fail(scenario, detail) {
  reports.push({ scenario, ok: false, detail });
  console.error(`  ✗ ${scenario}: ${detail}`);
  failed += 1;
}

function makeProject(name) {
  const dir = mkdtempSync(join(tmpdir(), `pmw-e2e-${name}-`));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name }), "utf-8");
  return dir;
}

function appendHistoryRaw(projectDir, event) {
  const dir = join(projectDir, ".pm-workflow");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(
    join(dir, "history.jsonl"),
    JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n",
    "utf-8",
  );
}

// 场景 1：pmw doctor 在新项目跑通
{
  const projectDir = makeProject("doctor");
  try {
    const report = dist.buildDoctorReport(projectDir);
    if (!Array.isArray(report.checks) || report.checks.length < 5) {
      fail("scenario-1-doctor", `checks 数量不足: ${report.checks.length}`);
    } else if (report.blockers.length > 0) {
      fail(
        "scenario-1-doctor",
        `不应有 blockers，实际：${report.blockers.join("; ")}`,
      );
    } else {
      pass(
        "scenario-1-doctor",
        `checks=${report.checks.length} warnings=${report.warnings.length} blockers=0`,
      );
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 场景 5：声明式路由 routing.denied
{
  const projectDir = makeProject("routing");
  try {
    const agentsDir = join(projectDir, ".opencode", "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, "pm_lead.md"),
      [
        "---",
        "description: PM 主协调官",
        "mode: primary",
        "permission:",
        "  task:",
        "    pm_researcher: deny",
        "    pm_backend: allow",
        "---",
      ].join("\n"),
      "utf-8",
    );

    // 调声明式路由判定：pm_researcher 应被拒绝
    const routing = dist.resolveAgentTaskRouting({
      projectDir,
      primaryAgent: "pm_lead",
    });
    if (routing.source !== "project") {
      fail(
        "scenario-5-routing",
        `routing.source 应为 project，实际：${routing.source}`,
      );
    } else if (!routing.deniedSubagents.includes("pm_researcher")) {
      fail(
        "scenario-5-routing",
        `deniedSubagents 应含 pm_researcher，实际：${routing.deniedSubagents.join(",")}`,
      );
    } else {
      const denyDecision = dist.isSubagentAllowedByDeclarativeRouting({
        routing,
        candidate: "pm_researcher",
      });
      const allowDecision = dist.isSubagentAllowedByDeclarativeRouting({
        routing,
        candidate: "pm_backend",
      });
      if (denyDecision.allowed) {
        fail(
          "scenario-5-routing",
          `pm_researcher 应被拒绝，实际允许：${denyDecision.reason}`,
        );
      } else if (!allowDecision.allowed) {
        fail(
          "scenario-5-routing",
          `pm_backend 应被允许，实际拒绝：${allowDecision.reason}`,
        );
      } else {
        pass(
          "scenario-5-routing",
          `deny=${denyDecision.allowed === false} allow=${allowDecision.allowed === true}`,
        );
      }
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// 场景 7：pmw report 渲染 HTML + 关键指标计数
{
  const projectDir = makeProject("report");
  try {
    // 注入 mock history 事件覆盖 4 类业务指标
    appendHistoryRaw(projectDir, {
      type: "dispatch.executed",
      exitCode: 0,
      agent: "pm_lead",
    });
    appendHistoryRaw(projectDir, {
      type: "dispatch.executed",
      exitCode: 1,
      agent: "pm_backend",
    });
    appendHistoryRaw(projectDir, {
      type: "fallback.foreground_switch",
      from_model: "a",
      to_model: "b",
      trigger_kind: "rate_limit",
    });
    appendHistoryRaw(projectDir, {
      type: "auto_continue.chain_start",
      initial_action: "start-development",
    });
    appendHistoryRaw(projectDir, {
      type: "auto_continue.step",
      step_index: 1,
      exit_code: 0,
    });
    appendHistoryRaw(projectDir, {
      type: "auto_continue.aborted",
      reason: "feedback-stop",
      matched: "停下",
    });
    appendHistoryRaw(projectDir, {
      type: "routing.denied",
      candidate_agent: "pm_researcher",
    });

    const { summary, events } = dist.buildHistoryReportSummary(projectDir);
    const html = dist.renderHistoryReportHtml({
      summary,
      events,
      packageVersion: "1.0.0-rc.0",
    });

    if (summary.dispatchCount !== 2 || summary.dispatchFailures !== 1) {
      fail(
        "scenario-7-report",
        `dispatch 计数错误：count=${summary.dispatchCount} failures=${summary.dispatchFailures}`,
      );
    } else if (summary.fallbackSwitches !== 1) {
      fail(
        "scenario-7-report",
        `fallback 切换计数错误：${summary.fallbackSwitches}`,
      );
    } else if (summary.autoContinueChains !== 1 || summary.autoContinueSteps !== 1) {
      fail(
        "scenario-7-report",
        `auto-continue 计数错误：chain=${summary.autoContinueChains} step=${summary.autoContinueSteps}`,
      );
    } else if (summary.routingDenied !== 1) {
      fail(
        "scenario-7-report",
        `routing 拒绝计数错误：${summary.routingDenied}`,
      );
    } else if (!html.includes("<!DOCTYPE html>") || !html.endsWith("</html>")) {
      fail("scenario-7-report", "HTML 结构非法");
    } else {
      pass(
        "scenario-7-report",
        `events=${summary.totalEvents} html=${(html.length / 1024).toFixed(1)}KB`,
      );
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

console.log("\n[e2e-headless] 总结:");
console.log(`  通过: ${reports.filter((r) => r.ok).length} / ${reports.length}`);
if (failed > 0) {
  console.error(`\n[e2e-headless] ✗ ${failed} 个场景失败`);
  process.exit(1);
}
console.log("[e2e-headless] ✓ 全部 headless 场景通过");
console.log(
  "  注：场景 2/3/4/6 需在真实 OpenCode 工作区手动验证，见 docs/sandbox/e2e-checklist.md。",
);
