#!/usr/bin/env node
/**
 * 0.13.0：测试覆盖率守门工具。
 *
 * 设计目标：
 * - 用 Node 22 内置 --experimental-test-coverage 跑全套测试，零依赖。
 * - 仅守门关键模块（fallback-runtime / auto-continue / agent-routing /
 *   agent-library / report / agent-stats），阈值 85% 行覆盖。
 * - 其他模块不做硬阈值，只输出报告供参考。
 *
 * 不做的事情：
 * - 不引入第三方覆盖率工具（c8 / istanbul / nyc）。
 * - 不强制全仓库阈值；那是 1.0.0 之后的迭代目标。
 * - 不改变测试本身的运行方式；npm test 仍是各文件独立 spawn。
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TEST_DIR = join(REPO_ROOT, "test");

// 关键模块列表（dist 路径基础名）。从 1.0.0 起作为 SemVer 前置守护。
const CRITICAL_MODULES = [
  { name: "core/fallback-runtime", threshold: 85 },
  { name: "core/auto-continue", threshold: 85 },
  { name: "core/agent-routing", threshold: 85 },
  { name: "core/agent-library", threshold: 85 },
  { name: "core/report", threshold: 85 },
  { name: "core/agent-stats", threshold: 85 },
];

function listTestFiles() {
  return readdirSync(TEST_DIR)
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join(TEST_DIR, name))
    .sort();
}

function runCoverage() {
  const tests = listTestFiles();
  if (tests.length === 0) {
    console.error("[coverage] 找不到任何 test/*.test.mjs 文件");
    process.exit(1);
  }

  const result = spawnSync(
    "node",
    [
      "--experimental-test-coverage",
      "--test-coverage-include=dist/core/**",
      "--test-coverage-include=dist/orchestrator/**",
      "--test",
      ...tests,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      maxBuffer: 32 * 1024 * 1024,
    },
  );

  // Node test runner 在没有 test()/it() 块的脚本里会报告 "tests 0 / fail 0" 但仍 exit 1。
  // 我们的测试是直接 console.log 风格脚本，所以即便所有 assert 都通过、也会 exit 1。
  // 因此不能直接用 result.status 判定失败；改为：
  // - 如果 stdout 里出现 "end of coverage report"，说明 Node 至少完成了覆盖率收集；
  // - 同时 stderr 里没有真实 throw（AssertionError / uncaughtException 等），则视为成功。
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const hasReport = stdout.includes("end of coverage report");
  // 真实抛错通常出现在 stderr 中，且形式是 "AssertionError [ERR_ASSERTION]" 或
  // "throw new Error" 后面的栈帧；只检查 stderr 避免误识别 stdout 里的报告文本。
  const hasRealError =
    /AssertionError\b|Error: |throw new |Uncaught/i.test(stderr);

  if (!hasReport || hasRealError) {
    console.error("[coverage] 测试运行失败或未生成覆盖率报告：");
    if (stdout) console.error(stdout.split("\n").slice(-40).join("\n"));
    if (stderr) console.error(stderr.split("\n").slice(-20).join("\n"));
    process.exit(1);
  }

  return stdout;
}

/**
 * 解析 Node test runner 的覆盖率输出。
 *
 * 输出格式（v22）：
 *   # ----...
 *   # file                | line% | branch% | funcs% | uncovered
 *   # core/foo.js         | 92.3  | 100     | 100    | 12-15
 *   # ----...
 *
 * 我们只取 line% 列，对每个匹配 CRITICAL_MODULES 的行做断言。
 */
function parseCoverage(stdout) {
  const lines = stdout.split("\n");
  const fileEntries = [];
  for (const line of lines) {
    // 跳过表头与分隔行；只匹配像 "#   foo/bar.js  | 92.3 | 100 | 100 | ..." 的数据行
    if (!line.startsWith("#")) continue;
    const cells = line
      .replace(/^#\s*/, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 5) continue;
    const fileName = cells[0];
    if (!fileName.endsWith(".js") && !fileName.endsWith(".mjs")) continue;
    const lineCoverage = parseFloat(cells[1]);
    if (Number.isNaN(lineCoverage)) continue;
    fileEntries.push({ path: fileName, lineCoverage });
  }
  return fileEntries;
}

function findEntry(fileEntries, moduleName) {
  // 报告里的 file 列只有 basename（如 "agent-stats.js"），没有 core/ 前缀。
  // 我们的 CRITICAL_MODULES 用 "core/agent-stats" 形式声明便于阅读，
  // 实际匹配时只看末尾的 basename。
  const baseName = moduleName.split("/").pop() + ".js";
  return fileEntries.find(
    (e) => e.path === baseName && !e.path.endsWith(".test.mjs"),
  );
}

function main() {
  console.log("[coverage] 跑全套测试 + 覆盖率（Node 22 内置）...");
  const stdout = runCoverage();
  const fileEntries = parseCoverage(stdout);

  console.log("[coverage] 关键模块覆盖率（阈值 85%）:");
  let failed = 0;
  for (const mod of CRITICAL_MODULES) {
    const entry = findEntry(fileEntries, mod.name);
    if (!entry) {
      console.log(`  ? ${mod.name} — 未找到覆盖率数据`);
      failed += 1;
      continue;
    }
    const pass = entry.lineCoverage >= mod.threshold;
    const status = pass ? "✓" : "✗";
    console.log(
      `  ${status} ${mod.name}: ${entry.lineCoverage.toFixed(1)}% (阈值 ${mod.threshold}%)`,
    );
    if (!pass) failed += 1;
  }

  // 把完整覆盖率附在末尾以便排查
  console.log("\n[coverage] 全量报告（参考）:");
  for (const entry of fileEntries) {
    if (!entry.path.startsWith("core/") && !entry.path.startsWith("orchestrator/")) {
      continue;
    }
    console.log(`  ${entry.path}: ${entry.lineCoverage.toFixed(1)}%`);
  }

  if (failed > 0) {
    console.error(`\n[coverage] ✗ ${failed} 个关键模块未达 85% 阈值`);
    process.exit(1);
  }
  console.log("\n[coverage] ✓ 所有关键模块达标");
  return 0;
}

main();
