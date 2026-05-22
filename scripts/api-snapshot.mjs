#!/usr/bin/env node
/**
 * 0.12.0：公开 API 快照工具。
 *
 * 设计目标：
 * - 把 dist/index.js 的全部 named export 列出，与 tools/api-snapshot.json 对比。
 * - 新增 export 自动追加进快照。
 * - 删除 / 改名 export = breaking change，必须 deny；CI / verify-release 会失败。
 * - 这是 1.0.0 SemVer 承诺的载体：从 1.0.0 起，删除/改名走 deprecation 周期。
 *
 * 使用：
 *   node scripts/api-snapshot.mjs check     仅校验，不修改快照（默认）
 *   node scripts/api-snapshot.mjs update    生成或更新快照（用户确认变更后用）
 *
 * 不做的事情：
 * - 不解析类型签名（仅符号名）；类型签名变化由 tsc / typecheck 自然兜底。
 * - 不依赖第三方 api-extractor；保持零额外依赖。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DIST_INDEX = join(REPO_ROOT, "dist", "index.js");
const SNAPSHOT_PATH = join(REPO_ROOT, "tools", "api-snapshot.json");

// 系统符号（每次都会出现的非业务 export），从快照中排除
const IGNORED_SYMBOLS = new Set(["__esModule", "default"]);

async function loadCurrentExports() {
  const mod = await import(DIST_INDEX);
  return Object.keys(mod)
    .filter((k) => !IGNORED_SYMBOLS.has(k))
    .sort();
}

function loadSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8"));
  } catch (err) {
    throw new Error(
      `[api-snapshot] 解析失败：${SNAPSHOT_PATH}\n${err.message}`,
    );
  }
}

function writeSnapshot(snapshot) {
  const dir = dirname(SNAPSHOT_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const formatted = JSON.stringify(snapshot, null, 2) + "\n";
  writeFileSync(SNAPSHOT_PATH, formatted, "utf-8");
}

function diff(prev, next) {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  const added = next.filter((s) => !prevSet.has(s));
  const removed = prev.filter((s) => !nextSet.has(s));
  return { added, removed };
}

function buildSnapshot(symbols) {
  const pkg = JSON.parse(
    readFileSync(join(REPO_ROOT, "package.json"), "utf-8"),
  );
  return {
    _doc: "pm-workflow 公开 API 快照。从 1.0.0 起作为 SemVer 承诺的载体：新增（minor）+ 删除/改名（major + deprecation 周期）。本文件由 scripts/api-snapshot.mjs 自动维护；prepare-publish 会校验当前 dist 与本快照一致。",
    schema_version: 1,
    package_version: pkg.version,
    generated_at: new Date().toISOString(),
    public_symbols: symbols,
  };
}

async function main() {
  const mode = process.argv[2] || "check";

  if (mode !== "check" && mode !== "update") {
    console.error(`未知模式：${mode}\n用法：node scripts/api-snapshot.mjs [check|update]`);
    process.exit(2);
  }

  const current = await loadCurrentExports();
  const snapshot = loadSnapshot();

  if (!snapshot) {
    if (mode === "check") {
      console.error(
        `[api-snapshot] 快照不存在：${SNAPSHOT_PATH}\n请先运行 \`node scripts/api-snapshot.mjs update\` 生成初始快照。`,
      );
      process.exit(1);
    }
    const next = buildSnapshot(current);
    writeSnapshot(next);
    console.log(
      `[api-snapshot] 已生成初始快照 (${current.length} 个公开符号)：${SNAPSHOT_PATH}`,
    );
    return 0;
  }

  const { added, removed } = diff(snapshot.public_symbols, current);

  if (added.length === 0 && removed.length === 0) {
    if (mode === "check") {
      console.log(
        `[api-snapshot] ✓ 公开 API 与快照一致 (${current.length} 个符号)`,
      );
    } else {
      // update 模式但无变化，仅刷新元数据
      const next = buildSnapshot(current);
      writeSnapshot(next);
      console.log(
        `[api-snapshot] 公开 API 无变化，已刷新快照元数据 (${current.length} 个符号)`,
      );
    }
    return 0;
  }

  console.log(`[api-snapshot] 公开 API 变化检测：`);
  if (added.length > 0) {
    console.log(`  新增 (${added.length}):`);
    for (const s of added) console.log(`    + ${s}`);
  }
  if (removed.length > 0) {
    console.log(`  删除 (${removed.length}):`);
    for (const s of removed) console.log(`    - ${s}`);
  }

  if (mode === "check") {
    if (removed.length > 0) {
      console.error(
        `\n[api-snapshot] ✗ 检测到 ${removed.length} 个 breaking 变更（删除符号）。\n请确认这是有意为之的 major bump，并跑 \`node scripts/api-snapshot.mjs update\` 更新快照。`,
      );
      process.exit(1);
    }
    if (added.length > 0) {
      console.log(
        `\n[api-snapshot] ⚠ 检测到 ${added.length} 个新增符号（minor 变更）。请跑 \`node scripts/api-snapshot.mjs update\` 更新快照。`,
      );
      process.exit(1);
    }
    return 0;
  }

  // update 模式：把当前 dist 写回快照
  const next = buildSnapshot(current);
  writeSnapshot(next);
  console.log(
    `\n[api-snapshot] 已更新快照 (${current.length} 个符号)：${SNAPSHOT_PATH}`,
  );
  return 0;
}

main().catch((err) => {
  console.error("[api-snapshot] 命令执行失败：", err && err.message ? err.message : err);
  process.exit(1);
});
