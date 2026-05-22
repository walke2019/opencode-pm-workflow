import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export type DocsCheckSeverity = "ok" | "warn" | "blocker";

export interface IDocsCheckFinding {
  severity: DocsCheckSeverity;
  name: string;
  detail: string;
}

export interface IDocsCheckReport {
  ok: boolean;
  packageVersion: string;
  checks: IDocsCheckFinding[];
  warnings: string[];
  blockers: string[];
}

const MAIN_DOCS = [
  "README.md",
  "docs/01-技术架构.md",
  "docs/02-业务功能与任务流转.md",
  "docs/03-使用与运维手册.md",
  "docs/04-待办与演进清单.md",
];

const FORBIDDEN_DOC_DIRS = [
  "docs/dev",
  "docs/runbooks",
  "docs/specs",
  "docs/superpowers",
];

const FORBIDDEN_REFERENCE_PATTERNS = [
  "docs/dev/",
  "docs/runbooks/",
  "docs/specs/",
  "docs/superpowers/",
];

function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

function readJsonObject(path: string): Record<string, unknown> {
  return JSON.parse(readText(path)) as Record<string, unknown>;
}

function findCurrentReadmeVersion(readme: string): string | undefined {
  const match = readme.match(/当前发布版本：`([^`]+)`/);
  return match?.[1];
}

function buildFinding(
  severity: DocsCheckSeverity,
  name: string,
  detail: string,
): IDocsCheckFinding {
  return { severity, name, detail };
}

function listMarkdownDocs(projectDir: string): string[] {
  const docsDir = join(projectDir, "docs");
  if (!existsSync(docsDir)) return [];
  return readdirSync(docsDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => `docs/${name}`)
    .sort();
}

/**
 * 检查文档治理规则：版本同步、主文档总量、Change Log 与旧路径引用。
 *
 * 这是只读检查，不写文件、不读取 node_modules，也不依赖 OpenCode runtime。
 */
export function buildDocsCheckReport(projectDir: string): IDocsCheckReport {
  const packageJson = readJsonObject(join(projectDir, "package.json"));
  const packageVersion =
    typeof packageJson.version === "string" ? packageJson.version : "unknown";
  const checks: IDocsCheckFinding[] = [];

  for (const relativePath of MAIN_DOCS) {
    const exists = existsSync(join(projectDir, relativePath));
    checks.push(
      buildFinding(
        exists ? "ok" : "blocker",
        `main-doc:${relativePath}`,
        exists ? "主文档存在" : "主文档缺失",
      ),
    );
  }

  const markdownDocs = listMarkdownDocs(projectDir);
  const allowedDocs = new Set(MAIN_DOCS.filter((path) => path.startsWith("docs/")));
  const extraDocs = markdownDocs.filter((path) => !allowedDocs.has(path));
  checks.push(
    buildFinding(
      extraDocs.length === 0 ? "ok" : "blocker",
      "main-doc-count",
      extraDocs.length === 0
        ? "docs/ 下仅包含 4 篇主文档"
        : `docs/ 下存在额外 markdown 文档: ${extraDocs.join(", ")}`,
    ),
  );

  const readmePath = join(projectDir, "README.md");
  if (existsSync(readmePath)) {
    const readme = readText(readmePath);
    const readmeVersion = findCurrentReadmeVersion(readme);
    checks.push(
      buildFinding(
        readmeVersion === packageVersion ? "ok" : "blocker",
        "readme-version",
        readmeVersion === packageVersion
          ? `README 当前发布版本与 package.json 一致: ${packageVersion}`
          : `README 当前发布版本(${readmeVersion ?? "未找到"})与 package.json(${packageVersion})不一致`,
      ),
    );
  }

  const changelogPath = join(projectDir, "CHANGELOG.md");
  if (existsSync(changelogPath)) {
    const changelog = readText(changelogPath);
    checks.push(
      buildFinding(
        changelog.includes(`## ${packageVersion}`) ? "ok" : "blocker",
        "changelog-version",
        changelog.includes(`## ${packageVersion}`)
          ? `CHANGELOG 包含 ${packageVersion} 版本节`
          : `CHANGELOG 缺少 ${packageVersion} 版本节`,
      ),
    );
  } else {
    checks.push(
      buildFinding("blocker", "changelog-version", "CHANGELOG.md 缺失"),
    );
  }

  for (const relativePath of MAIN_DOCS) {
    const filePath = join(projectDir, relativePath);
    if (!existsSync(filePath)) continue;
    const text = readText(filePath);
    checks.push(
      buildFinding(
        text.includes("## Change Log") ? "ok" : "blocker",
        `change-log:${relativePath}`,
        text.includes("## Change Log")
          ? "文档包含 Change Log"
          : "文档缺少 Change Log",
      ),
    );
  }

  for (const relativeDir of FORBIDDEN_DOC_DIRS) {
    const dirPath = join(projectDir, relativeDir);
    checks.push(
      buildFinding(
        existsSync(dirPath) ? "blocker" : "ok",
        `forbidden-dir:${relativeDir}`,
        existsSync(dirPath)
          ? `禁止保留旧文档目录: ${relativeDir}`
          : `未发现旧文档目录: ${relativeDir}`,
      ),
    );
  }

  for (const relativePath of MAIN_DOCS) {
    const filePath = join(projectDir, relativePath);
    if (!existsSync(filePath)) continue;
    const text = readText(filePath);
    const hits = FORBIDDEN_REFERENCE_PATTERNS.filter((pattern) =>
      text.includes(pattern),
    );
    checks.push(
      buildFinding(
        hits.length === 0 ? "ok" : "blocker",
        `legacy-reference:${basename(relativePath)}`,
        hits.length === 0
          ? "未发现旧文档路径引用"
          : `发现旧文档路径引用: ${hits.join(", ")}`,
      ),
    );
  }

  const warnings = checks
    .filter((finding) => finding.severity === "warn")
    .map((finding) => `${finding.name}: ${finding.detail}`);
  const blockers = checks
    .filter((finding) => finding.severity === "blocker")
    .map((finding) => `${finding.name}: ${finding.detail}`);

  return {
    ok: blockers.length === 0,
    packageVersion,
    checks,
    warnings,
    blockers,
  };
}
