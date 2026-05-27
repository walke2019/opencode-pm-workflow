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
 *   pmw agents theme list [--json]   列出内置主题（default / sanguo / xiyou / marvel / workplace）
 *   pmw agents theme preview <id> [--scope project|global]   预览主题渲染（不写盘）
 *   pmw agents theme apply <id> [--scope project|global] [--no-preserve-model]   应用主题，写 6 个 md 到目标目录
 *   pmw models init --model <id> [--fallback <id>]  初始化 agent 模型与回退模型
 *   pmw models set --agent <id[,id]> --model <id>   写入 OpenCode opencode.json.agent 模型
 *   pmw models apply --map a=m,b=m      批量写入 OpenCode opencode.json.agent 模型
 *   pmw repair opencode-cache [--dry-run] [--json]  备份旧/坏 OpenCode npm plugin 缓存
 *   pmw docs check [--json]          检查 README / 主文档 / Change Log 治理规则
 *   pmw verify                       本地 typecheck + build + smoke + pack-dry-run
 *   pmw --help                       命令一览
 *   pmw --version                    输出 npm 包版本
 *
 * 不做的事情：
 * - 不实际执行 dispatch（不开 spawn）；dispatch dry-run 仅输出建议命令字符串。
 * - 不写文件（除非 doctor 自动 bootstrap 状态）；CLI 默认只读。
 */

import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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
    "  agents theme list     列出内置主题（default / sanguo / xiyou / marvel / workplace）",
    "  agents theme preview <id>   预览主题渲染（不写盘，--scope project|global 决定目标目录）",
    "  agents theme apply <id>     应用主题：把 6 个 agent 的 md 写入目标目录",
    "  agents theme override       局部覆盖 agent display_name，不重渲染主题",
    "  models init           初始化 agent 主模型与回退模型（默认写全局配置）",
    "  models set            写入 OpenCode opencode.json.agent.<id>.model",
    "  models apply          批量写入 OpenCode opencode.json.agent 模型",
    "  repair opencode-cache  检查并备份旧/坏 OpenCode npm plugin 缓存",
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
    "  pmw agents promote commander --overwrite",
    "  pmw agents doctor --json",
    "  pmw agents theme list",
    "  pmw agents theme preview sanguo",
    "  pmw agents theme apply sanguo --scope global",
    "  pmw agents theme apply default --scope project --agents backendcoder,designer",
    "  pmw agents theme override --scope global --names commander=诸葛亮,advisor=司马懿,writer=陈寿",
    "  pmw models init --model opencode/gpt-5 --fallback opencode/gpt-5-mini",
    "  pmw models init --scope project --agent backendcoder --model cx/gpt-5.5 --fallback cx/gpt-5.4",
    "  pmw models set --agent commander,advisor,writer,explore --model cx/gpt-5.5",
    "  pmw models apply --map commander=cx/gpt-5.5,advisor=kr/claude-sonnet-4.5,writer=cx/gpt-5.4",
    "  pmw repair opencode-cache",
    "  pmw repair opencode-cache --dry-run --json",
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

function resolveCacheBase() {
  return process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
}

function readJsonMaybe(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function readCachedPluginVersion(cacheDir) {
  const packageJson = readJsonMaybe(
    join(cacheDir, "node_modules", "@walke", "opencode-pm-workflow", "package.json"),
  );
  if (packageJson && typeof packageJson.version === "string") {
    return packageJson.version;
  }
  return undefined;
}

function buildCacheBackupPath(cacheDir, timestamp) {
  let candidate = `${cacheDir}.bak-${timestamp}`;
  let index = 2;
  while (existsSync(candidate)) {
    candidate = `${cacheDir}.bak-${timestamp}-${index}`;
    index += 1;
  }
  return candidate;
}

function inspectPmWorkflowCache({ cacheRoot, label, expectedVersion, timestamp, dryRun }) {
  const scopeDir = join(cacheRoot, "packages", "@walke");
  const findings = [];
  if (!existsSync(scopeDir)) return findings;

  for (const entry of readdirSync(scopeDir)) {
    if (!entry.startsWith("opencode-pm-workflow@")) continue;
    if (entry.includes(".bak-")) continue;
    const cacheDir = join(scopeDir, entry);
    const cachedVersion = readCachedPluginVersion(cacheDir);
    const stale = cachedVersion !== expectedVersion;
    const reason = cachedVersion
      ? stale
        ? `cached version ${cachedVersion} != expected ${expectedVersion}`
        : `cached version ${cachedVersion} matches expected ${expectedVersion}`
      : "cached package.json missing or unreadable";
    const backupPath = stale ? buildCacheBackupPath(cacheDir, timestamp) : null;
    if (stale && backupPath && !dryRun) {
      renameSync(cacheDir, backupPath);
    }
    findings.push({
      label,
      cacheDir,
      cachedVersion: cachedVersion ?? null,
      expectedVersion,
      stale,
      reason,
      action: stale ? (dryRun ? "would-backup" : "backed-up") : "kept",
      backupPath,
    });
  }
  return findings;
}

function repairOpenCodeCache(args) {
  const pkg = loadPackageJson();
  const expectedVersion = args.options["expected-version"]
    ? String(args.options["expected-version"])
    : pkg.version;
  const dryRun = Boolean(args.flags["dry-run"]);
  const cacheBase = resolve(args.options["cache-base"] || resolveCacheBase());
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const targets = [
    { label: "opencode", cacheRoot: join(cacheBase, "opencode") },
    { label: "kilo", cacheRoot: join(cacheBase, "kilo") },
  ];
  const findings = targets.flatMap((target) =>
    inspectPmWorkflowCache({
      ...target,
      expectedVersion,
      timestamp,
      dryRun,
    }),
  );
  const staleCount = findings.filter((finding) => finding.stale).length;
  const report = {
    ok: true,
    expectedVersion,
    cacheBase,
    dryRun,
    staleCount,
    repairedCount: dryRun ? 0 : staleCount,
    findings,
  };

  if (args.flags.json) {
    emit(args, report);
    return 0;
  }

  const lines = [
    "pmw repair opencode-cache",
    `- expected version: ${expectedVersion}`,
    `- cache base: ${cacheBase}`,
    `- dry-run: ${dryRun ? "yes" : "no"}`,
    `- stale caches: ${staleCount}`,
  ];
  if (findings.length === 0) {
    lines.push("", "未发现 pm-workflow OpenCode/Kilo plugin 缓存。");
  } else {
    lines.push("", "findings:");
    for (const finding of findings) {
      lines.push(`  - [${finding.action}] ${finding.label}: ${finding.cacheDir}`);
      lines.push(`    ${finding.reason}`);
      if (finding.backupPath) lines.push(`    backup: ${finding.backupPath}`);
    }
  }
  console.log(lines.join("\n"));
  return 0;
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
      `  - ${agent.id} [${tags.join(", ")}] mode=${agent.mode ?? "?"} model=${agent.model ?? "(inherited/default)"} source=${agent.modelSource ?? "default"} taskPerm=${agent.hasTaskPermission ? "yes" : "no"}`,
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

async function runAgentsThemeList(args) {
  const dist = await loadDist();
  const themes = dist.listAgentThemes();
  if (args.flags.json) {
    emit(args, themes);
    return 0;
  }
  const lines = [
    `pm-workflow agent themes (${themes.length} 个内置主题)`,
    "",
  ];
  for (const theme of themes) {
    lines.push(`  ${theme.id} — ${theme.label}`);
    lines.push(`    ${theme.summary}`);
    lines.push(`    包含角色: ${theme.roleCount}`);
    lines.push("");
  }
  lines.push("用法:");
  lines.push("  pmw agents theme preview <id>   预览渲染（不写盘）");
  lines.push("  pmw agents theme apply <id>     应用主题（写 6 个 md）");
  console.log(lines.join("\n"));
  return 0;
}

function parseThemePreserveOptions(args) {
  // 默认全保留；--no-preserve-<field> 显式关闭。
  const preserve = {};
  for (const field of ["model", "mode", "permission", "fallback_models", "temperature"]) {
    const flagKey = `no-preserve-${field}`;
    if (args.flags[flagKey] || args.options[flagKey] !== undefined) {
      preserve[field] = false;
    }
  }
  return preserve;
}

function parseThemeAgents(args) {
  const raw = args.options.agents;
  if (!raw) return undefined;
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseKeyValueList(raw) {
  if (!raw) return {};
  const result = {};
  for (const item of String(raw).split(",")) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf("=");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

async function runAgentsThemePreview(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const themeId = args._[3];
  if (!themeId) {
    console.error("用法: pmw agents theme preview <theme-id> [--scope project|global]");
    return 2;
  }
  const scope = args.options.scope === "project" ? "project" : "global";
  const result = (() => {
    try {
      return dist.previewAgentTheme({
        projectDir,
        themeId,
        scope,
        agents: parseThemeAgents(args),
        preserveExisting: parseThemePreserveOptions(args),
      });
    } catch (err) {
      console.error(`pmw agents theme preview 失败：${err.message}`);
      return null;
    }
  })();
  if (!result) return 1;

  if (args.flags.json) {
    emit(args, result);
    return 0;
  }

  const lines = [
    `pm-workflow agent theme preview — ${themeId}`,
    `- scope: ${result.scope}`,
    `- targetDir: ${result.targetDir}`,
    `- 待写入: ${result.written.length} 个 agent`,
    `- skipped: ${result.skipped.length}`,
    "",
  ];
  for (const item of result.written) {
    lines.push(`▼ ${item.agent} → ${item.filePath}${item.exists ? " (覆盖已有)" : ""}`);
    lines.push(item.content.split("\n").map((l) => `  ${l}`).join("\n"));
    lines.push("");
  }
  if (result.skipped.length > 0) {
    lines.push("skipped:");
    for (const s of result.skipped) lines.push(`  ${s.agent} — ${s.reason}`);
  }
  lines.push("（dry-run，未写入任何文件；用 apply 真正落盘）");
  console.log(lines.join("\n"));
  return 0;
}

async function runAgentsThemeApply(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const themeId = args._[3];
  if (!themeId) {
    console.error(
      "用法: pmw agents theme apply <theme-id> [--scope project|global] [--agents commander,backendcoder]",
    );
    return 2;
  }
  const scope = args.options.scope === "project" ? "project" : "global";

  let result;
  try {
    result = dist.applyAgentTheme({
      projectDir,
      themeId,
      scope,
      agents: parseThemeAgents(args),
      preserveExisting: parseThemePreserveOptions(args),
    });
  } catch (err) {
    console.error(`pmw agents theme apply 失败：${err.message}`);
    return 1;
  }

  if (args.flags.json) {
    emit(args, result);
    return result.skipped.length === 0 ? 0 : 1;
  }

  const lines = [
    `pmw agents theme apply ✓ — ${themeId}`,
    `- scope: ${result.scope}`,
    `- targetDir: ${result.targetDir}`,
    `- 已写入: ${result.written.length}`,
    `- skipped: ${result.skipped.length}`,
    "",
    "written:",
  ];
  for (const item of result.written) {
    const tag = item.exists ? "覆盖" : "新增";
    const fallback = item.fellBackToDefault ? " [default 兜底]" : "";
    lines.push(`  [${tag}] ${item.agent} → ${item.filePath}${fallback}`);
  }
  if (result.skipped.length > 0) {
    lines.push("", "skipped:");
    for (const s of result.skipped) lines.push(`  ${s.agent} — ${s.reason}`);
  }
  lines.push("");
  lines.push("提示: 主题只换皮肤；语义 ID（commander / backendcoder / ...）与路由不变。");
  lines.push("      用户已配的 model / mode / permission 默认保留。");
  console.log(lines.join("\n"));
  return result.skipped.length === 0 ? 0 : 1;
}

async function runAgentsThemeOverride(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const scope = args.options.scope === "project" ? "project" : "global";
  const names = parseKeyValueList(args.options.names);
  if (Object.keys(names).length === 0) {
    console.error("用法: pmw agents theme override --names commander=诸葛亮,advisor=司马懿");
    return 2;
  }

  const result = dist.applyAgentThemeOverrides({
    projectDir,
    scope,
    names,
    dryRun: Boolean(args.flags["dry-run"]),
  });

  if (args.flags.json) {
    emit(args, result);
    return result.skipped.length === 0 ? 0 : 1;
  }

  const lines = [
    "pmw agents theme override",
    `- scope: ${result.scope}`,
    `- targetDir: ${result.targetDir}`,
    `- dry-run: ${result.dryRun ? "yes" : "no"}`,
    `- updated: ${result.updated.length}`,
    `- skipped: ${result.skipped.length}`,
  ];
  if (result.updated.length > 0) {
    lines.push("", "updated:");
    for (const item of result.updated) {
      lines.push(`  - ${item.agent}: display_name=${item.displayName} -> ${item.filePath}`);
    }
  }
  if (result.skipped.length > 0) {
    lines.push("", "skipped:");
    for (const item of result.skipped) lines.push(`  - ${item.agent}: ${item.reason}`);
  }
  console.log(lines.join("\n"));
  return result.skipped.length === 0 ? 0 : 1;
}

async function runAgentsTheme(args) {
  const sub = args._[2];
  if (sub === "list") return await runAgentsThemeList(args);
  if (sub === "preview") return await runAgentsThemePreview(args);
  if (sub === "apply") return await runAgentsThemeApply(args);
  if (sub === "override") return await runAgentsThemeOverride(args);
  console.error(`未知 agents theme 子命令: ${sub ?? "<empty>"}`);
  console.error("当前支持: pmw agents theme list | preview <id> | apply <id> | override --names a=b");
  return 2;
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

async function runModelsInit(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const model = args.options.model ? String(args.options.model) : "";
  const fallbackModel = args.options.fallback
    ? String(args.options.fallback)
    : args.options["fallback-model"]
      ? String(args.options["fallback-model"])
      : undefined;
  const scope = args.options.scope === "project" ? "project" : "global";
  const agents = args.options.agent
    ? String(args.options.agent)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : undefined;

  if (!model) {
    console.error("用法: pmw models init --model <model-id> [--fallback <model-id>]");
    return 2;
  }

  const result = dist.configureWorkflowAgentModels({
    projectDir,
    model,
    fallbackModel,
    agents,
    scope,
    allowUnknown: Boolean(args.flags["allow-unknown"]),
  });

  if (args.flags.json) {
    emit(args, result);
    return result.ok ? 0 : 1;
  }

  if (!result.ok) {
    console.error("pmw models init 失败");
    for (const blocker of result.blockers) console.error(`- ${blocker}`);
    return 1;
  }

  const lines = [
    "pmw models init ✓",
    `- scope: ${result.scope}`,
    `- config: ${result.path}`,
    `- agents: ${result.agents.join(", ")}`,
    `- model: ${result.model}`,
    `- fallback: ${result.fallbackModel ?? "(none)"}`,
  ];
  if (result.warnings.length > 0) {
    lines.push("", "warnings:", ...result.warnings.map((item) => `  - ${item}`));
  }
  console.log(lines.join("\n"));
  return 0;
}

function parseModelAssignmentsFromMap(raw) {
  return Object.entries(parseKeyValueList(raw)).map(([agent, model]) => ({
    agent,
    model,
  }));
}

function formatOpenCodeModelResult(result) {
  const lines = [
    result.ok ? "pmw models update ✓" : "pmw models update failed",
    `- scope: ${result.scope}`,
    `- opencode.json: ${result.path}`,
    `- updated: ${result.updated ? "yes" : "no"}`,
    `- assignments: ${result.assignments.length}`,
  ];
  for (const assignment of result.assignments) {
    lines.push(`  - ${assignment.agent}: ${assignment.model}`);
  }
  if (result.warnings.length > 0) {
    lines.push("", "warnings:", ...result.warnings.map((item) => `  - ${item}`));
  }
  if (result.blockers.length > 0) {
    lines.push("", "blockers:", ...result.blockers.map((item) => `  - ${item}`));
  }
  return lines.join("\n");
}

async function runModelsSet(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const model = args.options.model ? String(args.options.model).trim() : "";
  const agents = args.options.agent
    ? String(args.options.agent)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const scope = args.options.scope === "project" ? "project" : "global";

  if (!model || agents.length === 0) {
    console.error("用法: pmw models set --agent commander,advisor --model <model-id>");
    return 2;
  }

  const result = dist.configureOpenCodeAgentModels({
    projectDir,
    scope,
    assignments: agents.map((agent) => ({ agent, model })),
    allowUnknown: Boolean(args.flags["allow-unknown"]),
  });

  if (args.flags.json) {
    emit(args, result);
    return result.ok ? 0 : 1;
  }
  console.log(formatOpenCodeModelResult(result));
  return result.ok ? 0 : 1;
}

async function runModelsApply(args) {
  const dist = await loadDist();
  const projectDir = getProjectDir(args);
  const scope = args.options.scope === "project" ? "project" : "global";
  let assignments = parseModelAssignmentsFromMap(args.options.map);
  if (assignments.length === 0 && args.options.model) {
    assignments = dist.buildDefaultOpenCodeAgentModelAssignments(
      String(args.options.model),
    );
  }
  if (assignments.length === 0) {
    console.error("用法: pmw models apply --map commander=model,advisor=model 或 --model <model-id>");
    return 2;
  }

  const result = dist.configureOpenCodeAgentModels({
    projectDir,
    scope,
    assignments,
    allowUnknown: Boolean(args.flags["allow-unknown"]),
  });

  if (args.flags.json) {
    emit(args, result);
    return result.ok ? 0 : 1;
  }
  console.log(formatOpenCodeModelResult(result));
  return result.ok ? 0 : 1;
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
      if (sub === "theme") return await runAgentsTheme(args);
      console.error(`未知 agents 子命令: ${sub ?? "<empty>"}`);
      console.error("当前支持: pmw agents list | promote <id> | doctor | theme list|preview|apply");
      return 2;
    }
    case "models": {
      const sub = args._[1];
      if (sub === "init") return await runModelsInit(args);
      if (sub === "set") return await runModelsSet(args);
      if (sub === "apply") return await runModelsApply(args);
      console.error(`未知 models 子命令: ${sub ?? "<empty>"}`);
      console.error("当前支持: pmw models init | set | apply");
      return 2;
    }
    case "repair": {
      const sub = args._[1];
      if (sub === "opencode-cache") return repairOpenCodeCache(args);
      console.error(`未知 repair 子命令: ${sub ?? "<empty>"}`);
      console.error("当前支持: pmw repair opencode-cache [--dry-run] [--json]");
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
