/**
 * Skill auto-install：把 npm 包内的 skills/*\/SKILL.md 同步到 OpenCode 标准目录
 * `~/.config/opencode/skills/<skill-id>.md`，让 OpenCode 在启动时能自动发现并把
 * skill 注入给 AI。
 *
 * 设计原则：
 * - 一次性、幂等：内容相同就跳过；不存在就复制；已存在但内容不同**不覆盖**（避免
 *   覆盖用户自己改过的版本）。
 * - 失败不阻断插件加载：写 warning log，但不抛错。
 * - 不动 OpenCode runtime / 不写 history.jsonl / 不写 state.json；这是纯 UX 增强。
 *
 * 不做的事情：
 * - 不删除用户已有的 skill 文件，即使从 npm 包里删除了同名 skill。
 * - 不引入 yaml 依赖；只做按字节对比与拷贝。
 * - 不递归 skill 子目录（如 skills/foo/SKILL.md/sub/...）；当前所有 skill 都是
 *   一级目录 + 单一 SKILL.md。
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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type SkillSyncOutcome = "skipped-equal" | "installed" | "user-modified" | "failed";

export interface SkillSyncFinding {
  skillId: string;
  source: string;
  target: string;
  outcome: SkillSyncOutcome;
  message?: string;
}

export interface SkillSyncReport {
  skillsDir: string;
  total: number;
  installed: number;
  skipped: number;
  userModified: number;
  failed: number;
  findings: SkillSyncFinding[];
}

/** OpenCode 标准 skill 目录：`$XDG_CONFIG_HOME/opencode/skills`，未设则 `~/.config/opencode/skills`。 */
export function resolveOpenCodeSkillsDir(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "opencode", "skills");
}

/** 定位 npm 包内的 skills 源目录。运行时通常在 `dist/server/` 下，向上回溯到包根。 */
export function resolvePackageSkillsDir(): string {
  // 编译后位置：<pkg>/dist/server/skill-installer.js
  // 运行 import.meta.url → file:///.../dist/server/skill-installer.js
  // 包根在向上两级。
  const here = dirname(fileURLToPath(import.meta.url));
  // 包根候选：dist/server/.. -> dist；dist/.. -> 包根
  const packageRoot = resolve(here, "..", "..");
  return join(packageRoot, "skills");
}

function listSkillIds(skillsSourceDir: string): string[] {
  if (!existsSync(skillsSourceDir)) return [];
  let entries: string[] = [];
  try {
    entries = readdirSync(skillsSourceDir);
  } catch {
    return [];
  }
  return entries.filter((name) => {
    const candidate = join(skillsSourceDir, name);
    if (!existsSync(candidate)) return false;
    try {
      if (!statSync(candidate).isDirectory()) return false;
    } catch {
      return false;
    }
    return existsSync(join(candidate, "SKILL.md"));
  });
}

/**
 * 同步包内 skills 到 OpenCode 标准目录。返回 SkillSyncReport 供 plugin 装配时打 log。
 *
 * 调用时机：plugin 首次激活（first activation）时调一次。重复装配（hot-reload）
 * 由 plugin 层的 guardPluginActivation 兜底跳过。
 */
export function syncPackagedSkillsToOpenCode(input?: {
  skillsSourceDir?: string;
  skillsTargetDir?: string;
}): SkillSyncReport {
  const skillsSourceDir = input?.skillsSourceDir ?? resolvePackageSkillsDir();
  const skillsTargetDir = input?.skillsTargetDir ?? resolveOpenCodeSkillsDir();

  const findings: SkillSyncFinding[] = [];
  const skillIds = listSkillIds(skillsSourceDir);

  // 确保目标目录存在；若创建失败也不阻断，仅记录到第一个 finding 上（后续逐个 skill 仍尝试）。
  if (!existsSync(skillsTargetDir)) {
    try {
      mkdirSync(skillsTargetDir, { recursive: true });
    } catch (err) {
      return {
        skillsDir: skillsTargetDir,
        total: skillIds.length,
        installed: 0,
        skipped: 0,
        userModified: 0,
        failed: skillIds.length,
        findings: skillIds.map((id) => ({
          skillId: id,
          source: join(skillsSourceDir, id, "SKILL.md"),
          target: join(skillsTargetDir, `${id}.md`),
          outcome: "failed" as const,
          message: `创建 skill 目录失败: ${err instanceof Error ? err.message : String(err)}`,
        })),
      };
    }
  }

  for (const id of skillIds) {
    const source = join(skillsSourceDir, id, "SKILL.md");
    // OpenCode 官方 skill 规范（参见 https://opencode.ai/docs/skills）：
    // 每个 skill 必须是子目录 + SKILL.md（**大写、子目录**）：
    //   ~/.config/opencode/skills/<id>/SKILL.md
    // 之前 1.0.0-rc.3 至 1.0.0-rc.6 错误地写成扁平 <id>.md，OpenCode 不识别。
    // 1.0.0-rc.7 起改为正确的子目录结构。
    const target = join(skillsTargetDir, id, "SKILL.md");

    let sourceContent = "";
    try {
      sourceContent = readFileSync(source, "utf-8");
    } catch (err) {
      findings.push({
        skillId: id,
        source,
        target,
        outcome: "failed",
        message: `读取源 skill 失败: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const targetExists = existsSync(target);
    if (targetExists) {
      let existing = "";
      try {
        existing = readFileSync(target, "utf-8");
      } catch {
        // 目标可读失败时视为冲突，不覆盖
        findings.push({
          skillId: id,
          source,
          target,
          outcome: "user-modified",
          message: "目标已存在但读取失败；保留用户文件不覆盖",
        });
        continue;
      }
      if (existing === sourceContent) {
        findings.push({
          skillId: id,
          source,
          target,
          outcome: "skipped-equal",
        });
      } else {
        findings.push({
          skillId: id,
          source,
          target,
          outcome: "user-modified",
          message:
            "目标已存在且与包内版本不同；保留用户文件不覆盖。如需同步包内最新版，请手动删除目标文件后重启 OpenCode。",
        });
      }
      continue;
    }

    try {
      // 确保父目录存在（理论上前面已建过；防止极端情况下被外部删掉）
      const parent = dirname(target);
      if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
      copyFileSync(source, target);
      findings.push({
        skillId: id,
        source,
        target,
        outcome: "installed",
      });
    } catch (err) {
      findings.push({
        skillId: id,
        source,
        target,
        outcome: "failed",
        message: `写入 skill 失败: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const installed = findings.filter((f) => f.outcome === "installed").length;
  const skipped = findings.filter((f) => f.outcome === "skipped-equal").length;
  const userModified = findings.filter((f) => f.outcome === "user-modified").length;
  const failed = findings.filter((f) => f.outcome === "failed").length;

  return {
    skillsDir: skillsTargetDir,
    total: findings.length,
    installed,
    skipped,
    userModified,
    failed,
    findings,
  };
}
