import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginContext } from "./runtime.js";
import { log } from "./runtime.js";

const PKG_NAME = "@walke/opencode-pm-workflow";
const NPM_REGISTRY = "https://registry.npmjs.org";

function ownDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function readOwnVersion(): string | null {
  try {
    const p = join(ownDir(), "..", "..", "package.json");
    return (JSON.parse(readFileSync(p, "utf-8")) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

function detectCacheTarget(): string | null {
  const home = homedir();
  if (!home || home === "/" || home === "\\") return null;
  return join(
    home,
    ".cache",
    "opencode",
    "packages",
    `@walke/opencode-pm-workflow@latest`,
    "node_modules",
    PKG_NAME,
  );
}

function readPluginMeta(): Record<string, unknown> {
  try {
    const p = join(
      homedir(),
      "Library",
      "Application Support",
      "ai.opencode.desktop",
      "opencode",
      "plugin-meta.json",
    );
    return JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writePluginMeta(meta: Record<string, unknown>): void {
  try {
    const p = join(
      homedir(),
      "Library",
      "Application Support",
      "ai.opencode.desktop",
      "opencode",
      "plugin-meta.json",
    );
    writeFileSync(p, JSON.stringify(meta, null, 2), "utf-8");
  } catch {
    // 非关键路径：写入失败不影响插件加载
  }
}

export interface SelfUpdateResult {
  status: "up-to-date" | "updated" | "fetch-failed" | "update-failed";
  currentVersion: string | null;
  latestVersion: string | null;
  detail?: string;
}

/** 供 plugin.ts 调用的非阻塞检查+自动更新入口 */
export async function checkAndLogSelfUpdate(ctx: PluginContext): Promise<void> {
  const result = checkSelfUpdate();
  if (result.status === "up-to-date") {
    await log(ctx.client, "debug", "pm-workflow self-update", result as unknown as Record<string, unknown>);
    return;
  }
  await log(ctx.client, result.status === "updated" ? "info" : "warn", "pm-workflow self-update", result as unknown as Record<string, unknown>);
}

export function checkSelfUpdate(): SelfUpdateResult {
  const currentVersion = readOwnVersion();
  if (!currentVersion) {
    return { status: "update-failed", currentVersion: null, latestVersion: null, detail: "无法读取自身版本号" };
  }

  let latestVersion: string | null = null;
  try {
    const url = `${NPM_REGISTRY}/${PKG_NAME.replace("/", "%2f")}/latest`;
    const resp = execSync(`curl -sSf "${url}"`, {
      timeout: 10000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const data = JSON.parse(resp) as { version?: string };
    latestVersion = data.version ?? null;
  } catch (err) {
    return {
      status: "fetch-failed",
      currentVersion,
      latestVersion: null,
      detail: `无法检查最新版本: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!latestVersion) {
    return { status: "fetch-failed", currentVersion, latestVersion: null, detail: "npm registry 返回无版本号" };
  }

  if (currentVersion === latestVersion) {
    return { status: "up-to-date", currentVersion, latestVersion };
  }

  // 需要更新
  const cacheTarget = detectCacheTarget();
  if (!cacheTarget) {
    return {
      status: "update-failed",
      currentVersion,
      latestVersion,
      detail: "无法确定缓存路径",
    };
  }

  try {
    const tgzName = `${PKG_NAME.replace("/", "-")}-${latestVersion}.tgz`;
    const tmpDir = join(homedir(), ".cache", "pm-workflow", "update-tmp");
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    // 从正确 registry 下载 tarball
    const tgzUrl = `${NPM_REGISTRY}/${PKG_NAME.replace("/", "%2f")}/-/${PKG_NAME.split("/")[1]}-${latestVersion}.tgz`;
    execSync(`curl -sSfL "${tgzUrl}" -o "${join(tmpDir, tgzName)}"`, {
      timeout: 30000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // 确保目标目录存在
    if (!existsSync(cacheTarget)) mkdirSync(cacheTarget, { recursive: true });

    // 解压到缓存
    execSync(`tar xzf "${join(tmpDir, tgzName)}" -C "${cacheTarget}" --strip-components=1`, {
      timeout: 15000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // 清理临时文件
    try {
      execSync(`rm -f "${join(tmpDir, tgzName)}"`, { timeout: 5000 });
    } catch {
      // 非关键
    }

    // 更新 plugin-meta.json
    const meta = readPluginMeta();
    const key = PKG_NAME;
    const targetPath = cacheTarget + "/package.json";
    const targetMeta = meta[key] as Record<string, unknown> | undefined;
    if (targetMeta || key in meta) {
      const entry = (targetMeta ?? {}) as Record<string, unknown>;
      entry.id = key;
      entry.source = "npm";
      entry.spec = key;
      entry.target = cacheTarget;
      entry.requested = "latest";
      entry.version = latestVersion;
      entry.last_time = Date.now();
      entry.time_changed = Date.now();
      entry.load_count = ((entry.load_count as number) ?? 0) + 1;
      entry.fingerprint = `${key}|latest|${latestVersion}`;
      (meta as Record<string, unknown>)[key] = entry;
    }
    writePluginMeta(meta);

    return {
      status: "updated",
      currentVersion,
      latestVersion,
      detail: `已从 ${currentVersion} 更新到 ${latestVersion}，重启 OpenCode 后生效`,
    };
  } catch (err) {
    return {
      status: "update-failed",
      currentVersion,
      latestVersion,
      detail: `自动更新失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
