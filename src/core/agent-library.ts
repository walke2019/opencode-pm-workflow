/**
 * 0.10.0：跨项目共享 agent 库（长期路线 §7.3）。
 *
 * 设计目标：
 * - 在已有的"项目 .opencode/agents/* > 全局 ~/.config/opencode/agents/* > legacy > fallback"
 *   四级解析体系上，提供三件套工具：list / promote / doctor，方便用户
 *   维护跨项目共享的 agent 库。
 * - 完全本地操作；不引入网络分发；不触碰 OpenCode 主循环。
 *
 * 提供能力：
 * - `listAgentLibrary`：列出项目级与全局级所有 agent，识别"项目覆盖全局"关系。
 * - `promoteProjectAgentToGlobal`：把项目级 agent 复制到全局，便于跨项目复用。
 * - `doctorAgentLibrary`：检查 frontmatter 完整性（description / mode / model /
 *   permission.task），返回结构化 findings。
 *
 * 不做的事情：
 * - 不实现 agent 名称重命名 / 删除。删除是用户决定的事。
 * - 不发布到任何远端 marketplace；这是本地工具增强。
 * - 不修改 dispatch_map；agent 库与运行时路由互不依赖。
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parseFrontmatterTaskPermission } from "./agent-routing.js";

export type AgentLibraryEntry = {
  /** agent id（不含 .md 扩展名） */
  id: string;
  /** 解析后绝对路径 */
  filePath: string;
  /** 来源：项目级或全局级 */
  source: "project" | "global";
  /** frontmatter 关键字段（缺则 undefined） */
  description?: string;
  mode?: string;
  model?: string;
  /** frontmatter 是否声明了 permission.task */
  hasTaskPermission: boolean;
  /** frontmatter 完整性 finding（空数组表示完整） */
  findings: AgentLibraryFinding[];
};

export type AgentLibraryFinding = {
  severity: "warn" | "info";
  field: "description" | "mode" | "model" | "permission.task";
  message: string;
};

export type AgentLibraryReport = {
  /** 全部 agent，按 id 排序 */
  agents: AgentLibraryEntry[];
  /** 项目级 agent id（与 global 同名时优先项目） */
  projectAgents: string[];
  /** 全局级 agent id */
  globalAgents: string[];
  /** 项目覆盖了全局的 agent id */
  shadowedGlobals: string[];
};

function getProjectAgentsDir(projectDir: string) {
  return join(projectDir, ".opencode", "agents");
}

function getGlobalAgentsDir() {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "opencode", "agents");
}

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

/**
 * 极简 frontmatter 字段抽取：复用与 agent-registry 同样的轻量解析逻辑，
 * 不依赖 yaml 包。仅识别顶层 `key: value` 行；不识别嵌套（嵌套结构由
 * parseFrontmatterTaskPermission 在另一个维度处理）。
 */
function extractTopLevelFields(raw: string): Record<string, string> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split(/\n/)) {
    if (!line.trim() || line.startsWith(" ") || line.startsWith("\t")) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line
      .slice(sep + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && value) {
      result[key] = value;
    }
  }
  return result;
}

function evaluateAgentFile(filePath: string): {
  description?: string;
  mode?: string;
  model?: string;
  hasTaskPermission: boolean;
  findings: AgentLibraryFinding[];
} {
  const raw = (() => {
    try {
      return readFileSync(filePath, "utf-8");
    } catch {
      return "";
    }
  })();

  const fields = extractTopLevelFields(raw);
  const { taskPermission } = parseFrontmatterTaskPermission(raw);
  const hasTaskPermission = Object.keys(taskPermission).length > 0;
  const findings: AgentLibraryFinding[] = [];

  if (!fields.description) {
    findings.push({
      severity: "warn",
      field: "description",
      message: "缺少 description；OpenCode 会显示空摘要",
    });
  }
  if (!fields.mode) {
    findings.push({
      severity: "warn",
      field: "mode",
      message: "缺少 mode；建议显式声明 primary / subagent / all",
    });
  }
  if (!fields.model) {
    findings.push({
      severity: "info",
      field: "model",
      message: "缺少 model；将走全局默认模型",
    });
  }
  if (!hasTaskPermission && fields.mode === "primary") {
    findings.push({
      severity: "info",
      field: "permission.task",
      message:
        "primary agent 建议显式声明 permission.task；否则路由走 dispatch_map 兜底",
    });
  }

  return {
    description: fields.description,
    mode: fields.mode,
    model: fields.model,
    hasTaskPermission,
    findings,
  };
}

/**
 * 列出项目级 + 全局级所有 agent。同名时按"项目优先"原则归类，并标注 shadow。
 */
export function listAgentLibrary(projectDir: string): AgentLibraryReport {
  const projectFiles = listMarkdownFiles(getProjectAgentsDir(projectDir));
  const globalFiles = listMarkdownFiles(getGlobalAgentsDir());

  const projectIds = new Set<string>(
    projectFiles.map((p) => basename(p, ".md")),
  );
  const globalIds = new Set<string>(
    globalFiles.map((p) => basename(p, ".md")),
  );

  const agents: AgentLibraryEntry[] = [];
  for (const filePath of projectFiles) {
    const id = basename(filePath, ".md");
    const meta = evaluateAgentFile(filePath);
    agents.push({
      id,
      filePath,
      source: "project",
      ...meta,
    });
  }
  for (const filePath of globalFiles) {
    const id = basename(filePath, ".md");
    if (projectIds.has(id)) continue; // 已被 project 覆盖，不重复列
    const meta = evaluateAgentFile(filePath);
    agents.push({
      id,
      filePath,
      source: "global",
      ...meta,
    });
  }

  agents.sort((a, b) => a.id.localeCompare(b.id));

  const shadowedGlobals = Array.from(projectIds).filter((id) =>
    globalIds.has(id),
  );

  return {
    agents,
    projectAgents: Array.from(projectIds).sort(),
    globalAgents: Array.from(globalIds).sort(),
    shadowedGlobals: shadowedGlobals.sort(),
  };
}

export type PromoteAgentResult =
  | { ok: true; from: string; to: string; overwritten: boolean }
  | { ok: false; reason: string };

/**
 * 把项目级 agent 复制到全局，便于跨项目复用。
 *
 * 安全规则：
 * - 项目级文件不存在 → 拒绝；不会创建空的全局 agent。
 * - 全局已有同名 → 默认拒绝；要求显式 `overwrite: true` 才覆盖。
 * - 不删除项目级原文件；让用户自己决定是否在 project 保留覆盖版本。
 */
export function promoteProjectAgentToGlobal(input: {
  projectDir: string;
  agentId: string;
  overwrite?: boolean;
}): PromoteAgentResult {
  const projectPath = join(getProjectAgentsDir(input.projectDir), `${input.agentId}.md`);
  const globalDir = getGlobalAgentsDir();
  const globalPath = join(globalDir, `${input.agentId}.md`);

  if (!existsSync(projectPath)) {
    return {
      ok: false,
      reason: `项目级 agent 不存在: ${projectPath}`,
    };
  }

  const overwritten = existsSync(globalPath);
  if (overwritten && !input.overwrite) {
    return {
      ok: false,
      reason: `全局已有同名 agent: ${globalPath}（如需覆盖请传 overwrite: true）`,
    };
  }

  if (!existsSync(globalDir)) {
    mkdirSync(globalDir, { recursive: true });
  }

  copyFileSync(projectPath, globalPath);
  // 验证写入成功
  try {
    statSync(globalPath);
  } catch {
    return {
      ok: false,
      reason: `复制后无法读取目标文件: ${globalPath}`,
    };
  }

  return {
    ok: true,
    from: projectPath,
    to: globalPath,
    overwritten,
  };
}

export type AgentLibraryDoctorReport = {
  totalAgents: number;
  totalFindings: number;
  agentsWithFindings: number;
  byField: Record<string, number>;
  bySeverity: Record<string, number>;
  details: Array<{
    id: string;
    source: "project" | "global";
    findings: AgentLibraryFinding[];
  }>;
};

/**
 * 检查所有 agent 的 frontmatter 完整性，返回聚合 + 明细两部分。
 *
 * 默认严格度：缺 description / mode 为 warn；缺 model 与 primary 缺
 * permission.task 为 info（不强制）。findings 是诊断建议，**不是错误**。
 */
export function doctorAgentLibrary(projectDir: string): AgentLibraryDoctorReport {
  const lib = listAgentLibrary(projectDir);
  const byField: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const details: AgentLibraryDoctorReport["details"] = [];
  let totalFindings = 0;
  let agentsWithFindings = 0;

  for (const agent of lib.agents) {
    if (agent.findings.length === 0) continue;
    agentsWithFindings += 1;
    totalFindings += agent.findings.length;
    for (const finding of agent.findings) {
      byField[finding.field] = (byField[finding.field] || 0) + 1;
      bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
    }
    details.push({
      id: agent.id,
      source: agent.source,
      findings: agent.findings,
    });
  }

  return {
    totalAgents: lib.agents.length,
    totalFindings,
    agentsWithFindings,
    byField,
    bySeverity,
    details,
  };
}
