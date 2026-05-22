#!/usr/bin/env node
/**
 * 0.8.0：pm-workflow CLI 子命令入口（pmw）。
 *
 * 设计目标：
 * - 让 `pm-doctor` / `pm-dry-run-dispatch` / `pm-verify` 等高频离线诊断命令
 *   不再依赖 OpenCode runtime。CI / 服务器 / 没装 OpenCode 的环境也能用。
 * - 复用 dist/ 中已经纯函数化的 core / orchestrator 模块，零额外依赖。
 * - 不接管 OpenCode 主循环；CLI 仅做诊断、预演、状态查询；运行时 dispatch
 *   仍走插件路径。
 *
 * 命令一览：
 *   pmw doctor [--json]              输出 doctor 报告
 *   pmw dispatch dry-run [prompt...] dispatch 预演（不执行）
 *   pmw state [--json]               输出当前 state.json 摘要
 *   pmw history [--limit N] [--type T] 查询历史事件
 *   pmw report [--out path] [--json] 生成本地 HTML 执行回执 dashboard（默认输出到 .pm-workflow/report.html）
 *   pmw agents list [--json]         列出项目级 + 全局级 agent，标注覆盖关系
 *   pmw agents promote <id> [--overwrite]  把项目级 agent 复制到 ~/.config/opencode/agents
 *   pmw agents doctor [--json]       检查所有 agent 的 frontmatter 完整性
 *   pmw docs check [--json]          检查 README / 主文档 / Change Log 治理规则
 *   pmw verify                       本地 typecheck + build + smoke + pack-dry-run
 *   pmw --help                       命令一览
 *   pmw --version                    输出 npm 包版本
 *
 * 不做的事情：
 * - 不实际执行 dispatch（不开 spawn）；dispatch dry-run 仅输出建议命令字符串。
 * - 不写文件（除非 doctor 自动 bootstrap 状态）；CLI 默认只读。
 */

import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..", "..");

function loadPackageJson() {
  return JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8"),
  );
}

async function loadDist() {
  // 通过 dist 加载，确保 CLI 使用与运行时一致的代码路径。
  const distPath = join(PACKAGE_ROOT, "dist", "index.js");
  return await import(distPath);
}

function parseArgs(argv) {
  // 极简 argv 解析：--key=value / --key value / --flag / 余下作为 positional。
  const args = { _: [], flags: {}, options: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const stripped = token.slice(2);
      const eqIndex = stripped.indexOf("=");
      if (eqIndex !== -1) {
        args.options[stripped.slice(0, eqIndex)] = stripped.slice(eqIndex + 1);
      } else if (
        i + 1 < argv.length &&
        !argv[i + 1].startsWith("--")
      ) {
        args.options[stripped] = argv[i + 1];
        i += 1;
      } else {
        args.flags[stripped] = true;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function printHelp() {
  const pkg = loadPackageJson();
  const help = [
    `pmw v${pkg.version} — pm-workflow 离线诊断 CLI`,
    "",
    "USAGE:",
    "  pmw <command> [options]",
    "",
    "COMMANDS:",
    "  doctor                输出当前项目 doctor 报告（state/config/history/gates 健康度）",
    "  dispatch dry-run [prompt]  dispatch 预演：不执行，输出推荐 agent / action / 命令",
    "  state                 输出当前 state.json 摘要",
    "  history               查询 history.jsonl 事件",
    "  report                生成本地 HTML 执行回执 dashboard（默认 .pm-workflow/report.html）",
    "  agents list           列出项目级 + 全局级 agent，标注覆盖关系",
    "  agents promote <id>   把项目级 agent 复制到 ~/.config/opencode/agents（--overwrite 可覆盖）",
    "  agents doctor         检查所有 agent 的 frontmatter 完整性",
    "  docs check            检查 README 版本、主文档数量、Change Log 与旧路径引用",
    "  verify                本地跑 typecheck + build + smoke + pack-dry-run",
    "  --help                显示本帮助",
    "  --version             输出 npm 包版本",
    "",
    "GLOBAL OPTIONS:",
    "  --json                JSON 输出（便于 CI 消费）",
    "  --cwd <path>          指定项目目录；默认 process.cwd()",
    "",
    "EXAMPLES:",
    "  pmw doctor",
    "  pmw doctor --json",
    "  pmw dispatch dry-run '修复登录接口 401'",
    "  pmw history --limit 5 --type fallback.foreground_switch",
    "  pmw report --out ./report.html",
    "  pmw agents list",
    "  pmw agents promote pm_lead --overwrite",
    "  pmw agents doctor --json",
    "  pmw docs check",
    "  pmw verify",
  ];
  console.log(help.join("\n"));
}

function getProjectDir(args) {
  return args.options.cwd
    ? resolve(String(args.options.cwd))
    : process.cwd();
}

function emit(args, payload) {
  if (args.flags.json || args.options.json !== undefined) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (typeof payload === "string") {
    console.log(payload);
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

async function runDoctor(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const report = dist.buildDoctorReport(projectDir);
  if (args.flags.json) {
    emit(args, report);
    return report.blockers.length === 0 ? 0 : 1;
  }
  const lines = [
    `pm-workflow doctor — ${projectDir}`,
    `- ok: ${report.checks.filter((c) => c.ok).length}/${report.checks.length}`,
    `- warnings: ${report.warnings.length}`,
    `- blockers: ${report.blockers.length}`,
    "",
    "checks:",
    ...report.checks.map(
      (c) => `  ${c.ok ? "✓" : "✗"} ${c.name} — ${c.detail}`,
    ),
  ];
  if (report.warnings.length > 0) {
    lines.push("", "warnings:", ...report.warnings.map((w) => `  - ${w}`));
  }
  if (report.blockers.length > 0) {
    lines.push("", "blockers:", ...report.blockers.map((b) => `  - ${b}`));
  }
  console.log(lines.join("\n"));
  return report.blockers.length === 0 ? 0 : 1;
}

async function runDispatchDryRun(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const prompt = args._.slice(2).join(" ").trim() || undefined;
  const dispatch = dist.buildDispatchCommand(projectDir, prompt);
  const plan = dist.buildExecutionPlan(projectDir, prompt);

  if (args.flags.json) {
    emit(args, { dispatch, plan });
    return 0;
  }
  const lines = [
    `pm-workflow dispatch dry-run — ${projectDir}`,
    `- 当前阶段: ${dispatch.stageLabel}`,
    `- 推荐 Agent: ${dispatch.recommendedAgent}`,
    `- 可执行 Agent: ${dispatch.executableAgent}`,
    `- 推荐动作: ${dispatch.recommendedAction}`,
    `- 是否阻塞: ${dispatch.blocked ? "yes" : "no"}`,
    dispatch.blockedReasons.length
      ? `- 阻塞原因: ${dispatch.blockedReasons.join("；")}`
      : "- 阻塞原因: 无",
    `- 推荐命令: ${dispatch.command}`,
    "",
    "execution plan:",
    `- mode: ${plan.mode}`,
    `- steps: ${plan.steps.length}`,
    ...plan.steps.map(
      (s, i) =>
        `  step ${i + 1}: ${s.id} | ${s.mode} | ${s.agent ?? "local"} | ${s.action}`,
    ),
  ];
  console.log(lines.join("\n"));
  return 0;
}

async function runState(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const summary = dist.buildStateSummary(projectDir);
  if (args.flags.json) {
    emit(args, summary);
    return 0;
  }
  console.log(JSON.stringify(summary, null, 2));
  return 0;
}

async function runHistory(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const limit = Number.parseInt(String(args.options.limit || "20"), 10);
  const filterType = args.options.type ? String(args.options.type) : undefined;
  const events = dist.queryHistory(projectDir, {
    type: filterType,
    limit,
  });
  if (args.flags.json) {
    emit(args, events);
    return 0;
  }
  if (events.length === 0) {
    console.log(
      `pm-workflow history — ${projectDir}\n（无事件${filterType ? ` type=${filterType}` : ""}）`,
    );
    return 0;
  }
  console.log(`pm-workflow history — ${projectDir} (最近 ${events.length} 条)`);
  for (const e of events) {
    const at = e.at ?? "?";
    const type = e.type ?? "?";
    const summary = JSON.stringify({ ...e, at: undefined, type: undefined });
    console.log(`  ${at} [${type}] ${summary}`);
  }
  return 0;
}

async function runReport(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const { summary, events } = dist.buildHistoryReportSummary(projectDir);
  const pkg = loadPackageJson();
  const html = dist.renderHistoryReportHtml({
    summary,
    events,
    packageVersion: pkg.version,
  });

  if (args.flags.json) {
    emit(args, summary);
    return 0;
  }

  const outPath = args.options.out
    ? resolve(String(args.options.out))
    : join(projectDir, ".pm-workflow", "report.html");

  writeFileSync(outPath, html, "utf-8");
  console.log(`pm-workflow 执行回执 dashboard 已生成`);
  console.log(`- 项目: ${projectDir}`);
  console.log(`- 事件数: ${summary.totalEvents}`);
  console.log(`- Dispatch: ${summary.dispatchCount}（失败 ${summary.dispatchFailures}）`);
  console.log(`- Fallback 切换: ${summary.fallbackSwitches}`);
  console.log(`- Auto-continue 链: ${summary.autoContinueChains} / 步: ${summary.autoContinueSteps} / 中止: ${summary.autoContinueAborted}`);
  console.log(`- Routing 拒绝: ${summary.routingDenied}`);
  console.log(`- 输出: ${outPath}`);
  console.log(`  在浏览器中打开即可查看（不联网，不上传）`);
  return 0;
}

async function runAgentsList(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const report = dist.listAgentLibrary(projectDir);

  if (args.flags.json) {
    emit(args, report);
    return 0;
  }

  const lines = [
    `pm-workflow agents — ${projectDir}`,
    `- 项目级: ${report.projectAgents.length}`,
    `- 全局级: ${report.globalAgents.length}`,
    `- 项目覆盖全局: ${report.shadowedGlobals.length}${
      report.shadowedGlobals.length > 0
        ? ` (${report.shadowedGlobals.join(", ")})`
        : ""
    }`,
    "",
    "agents:",
  ];
  for (const agent of report.agents) {
    const tags = [agent.source];
    if (report.shadowedGlobals.includes(agent.id)) tags.push("shadows-global");
    if (agent.findings.length > 0) tags.push(`${agent.findings.length} finding(s)`);
    lines.push(
      `  - ${agent.id} [${tags.join(", ")}] mode=${agent.mode ?? "?"} model=${agent.model ?? "(default)"} taskPerm=${agent.hasTaskPermission ? "yes" : "no"}`,
    );
    lines.push(`    ${agent.filePath}`);
  }
  console.log(lines.join("\n"));
  return 0;
}

async function runAgentsPromote(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const agentId = args._[2];

  if (!agentId) {
    console.error("用法: pmw agents promote <agent-id> [--overwrite]");
    return 2;
  }

  const result = dist.promoteProjectAgentToGlobal({
    projectDir,
    agentId,
    overwrite: Boolean(args.flags.overwrite),
  });

  if (args.flags.json) {
    emit(args, result);
    return result.ok ? 0 : 1;
  }

  if (!result.ok) {
    console.error(`pmw agents promote ${agentId} 失败：${result.reason}`);
    return 1;
  }
  console.log(`pmw agents promote ${agentId} ✓`);
  console.log(`- 来源: ${result.from}`);
  console.log(`- 目标: ${result.to}`);
  console.log(`- 覆盖已有: ${result.overwritten ? "是" : "否"}`);
  return 0;
}

async function runAgentsDoctor(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const report = dist.doctorAgentLibrary(projectDir);

  if (args.flags.json) {
    emit(args, report);
    return report.totalFindings === 0 ? 0 : 0; // findings 是建议，不是错误
  }

  const lines = [
    `pm-workflow agents doctor — ${projectDir}`,
    `- 总 agent 数: ${report.totalAgents}`,
    `- 含 findings: ${report.agentsWithFindings}`,
    `- findings 总数: ${report.totalFindings}`,
  ];
  if (Object.keys(report.byField).length > 0) {
    lines.push(
      `- 按字段: ${Object.entries(report.byField)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
    lines.push(
      `- 按严重度: ${Object.entries(report.bySeverity)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
  }

  if (report.details.length === 0) {
    lines.push("", "✓ 所有 agent frontmatter 均完整");
  } else {
    lines.push("", "明细:");
    for (const entry of report.details) {
      lines.push(`  ${entry.id} (${entry.source})`);
      for (const finding of entry.findings) {
        lines.push(`    - [${finding.severity}] ${finding.field}: ${finding.message}`);
      }
    }
  }

  console.log(lines.join("\n"));
  return 0;
}

async function runDocsCheck(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const report = dist.buildDocsCheckReport(projectDir);

  if (args.flags.json) {
    emit(args, report);
    return report.ok ? 0 : 1;
  }

  const passed = report.checks.filter((finding) => finding.severity === "ok");
  const warnings = report.checks.filter((finding) => finding.severity === "warn");
  const blockers = report.checks.filter((finding) => finding.severity === "blocker");
  const lines = [
    `pm-workflow docs check — ${projectDir}`,
    `- package version: ${report.packageVersion}`,
    `- ok: ${passed.length}/${report.checks.length}`,
    `- warnings: ${warnings.length}`,
    `- blockers: ${blockers.length}`,
    "",
    "checks:",
    ...report.checks.map((finding) => {
      const icon =
        finding.severity === "ok"
          ? "✓"
          : finding.severity === "warn"
            ? "!"
            : "✗";
      return `  ${icon} ${finding.name} — ${finding.detail}`;
    }),
  ];
  if (report.blockers.length > 0) {
    lines.push("", "blockers:", ...report.blockers.map((item) => `  - ${item}`));
  }
  console.log(lines.join("\n"));
  return report.ok ? 0 : 1;
}

function runVerify() {
  // 直接调用本包的 verify-release 脚本；保留 stdio 流式输出以便 CI 看清。
  try {
    execSync("npm run verify-release", {
      cwd: PACKAGE_ROOT,
      stdio: "inherit",
    });
    return 0;
  } catch (err) {
    return err && typeof err.status === "number" ? err.status : 1;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.flags.version) {
    console.log(loadPackageJson().version);
    return 0;
  }
  if (args.flags.help || args._.length === 0) {
    printHelp();
    return 0;
  }

  const command = args._[0];
  switch (command) {
    case "doctor":
      return await runDoctor(args);
    case "dispatch":
      if (args._[1] === "dry-run") return await runDispatchDryRun(args);
      console.error(`未知 dispatch 子命令: ${args._[1] ?? "<empty>"}`);
      console.error("当前仅支持: pmw dispatch dry-run [prompt...]");
      return 2;
    case "state":
      return await runState(args);
    case "history":
      return await runHistory(args);
    case "report":
      return await runReport(args);
    case "agents": {
      const sub = args._[1];
      if (sub === "list") return await runAgentsList(args);
      if (sub === "promote") return await runAgentsPromote(args);
      if (sub === "doctor") return await runAgentsDoctor(args);
      console.error(`未知 agents 子命令: ${sub ?? "<empty>"}`);
      console.error("当前支持: pmw agents list | promote <id> | doctor");
      return 2;
    }
    case "docs": {
      const sub = args._[1];
      if (sub === "check") return await runDocsCheck(args);
      console.error(`未知 docs 子命令: ${sub ?? "<empty>"}`);
      console.error("当前支持: pmw docs check");
      return 2;
    }
    case "verify":
      return runVerify();
    default:
      console.error(`未知命令: ${command}`);
      printHelp();
      return 2;
  }
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error("[pmw] 命令执行失败:", err && err.message ? err.message : err);
    process.exit(1);
  });
