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
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
/** OpenCode 标准 skill 目录：`$XDG_CONFIG_HOME/opencode/skills`，未设则 `~/.config/opencode/skills`。 */
export function resolveOpenCodeSkillsDir() {
    const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(configHome, "opencode", "skills");
}
/** 定位 npm 包内的 skills 源目录。运行时通常在 `dist/server/` 下，向上回溯到包根。 */
export function resolvePackageSkillsDir() {
    // 编译后位置：<pkg>/dist/server/skill-installer.js
    // 运行 import.meta.url → file:///.../dist/server/skill-installer.js
    // 包根在向上两级。
    const here = dirname(fileURLToPath(import.meta.url));
    // 包根候选：dist/server/.. -> dist；dist/.. -> 包根
    const packageRoot = resolve(here, "..", "..");
    return join(packageRoot, "skills");
}
function listSkillIds(skillsSourceDir) {
    if (!existsSync(skillsSourceDir))
        return [];
    let entries = [];
    try {
        entries = readdirSync(skillsSourceDir);
    }
    catch {
        return [];
    }
    return entries.filter((name) => {
        const candidate = join(skillsSourceDir, name);
        if (!existsSync(candidate))
            return false;
        try {
            if (!statSync(candidate).isDirectory())
                return false;
        }
        catch {
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
export function syncPackagedSkillsToOpenCode(input) {
    const skillsSourceDir = input?.skillsSourceDir ?? resolvePackageSkillsDir();
    const skillsTargetDir = input?.skillsTargetDir ?? resolveOpenCodeSkillsDir();
    const findings = [];
    const skillIds = listSkillIds(skillsSourceDir);
    // 确保目标目录存在；若创建失败也不阻断，仅记录到第一个 finding 上（后续逐个 skill 仍尝试）。
    if (!existsSync(skillsTargetDir)) {
        try {
            mkdirSync(skillsTargetDir, { recursive: true });
        }
        catch (err) {
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
                    outcome: "failed",
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
        }
        catch (err) {
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
            }
            catch {
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
            }
            else {
                findings.push({
                    skillId: id,
                    source,
                    target,
                    outcome: "user-modified",
                    message: "目标已存在且与包内版本不同；保留用户文件不覆盖。如需同步包内最新版，请手动删除目标文件后重启 OpenCode。",
                });
            }
            continue;
        }
        try {
            // 确保父目录存在（理论上前面已建过；防止极端情况下被外部删掉）
            const parent = dirname(target);
            if (!existsSync(parent))
                mkdirSync(parent, { recursive: true });
            copyFileSync(source, target);
            // 1.0.0-rc.9 起：递归同步 supporting files（reference.md / scripts/ 等）。
            // OpenCode skill 规范支持子文件 + 子目录（参见 SKILL.md 引用 reference.md /
            // scripts/check.sh 等场景）。我们这里把整个 skill 源目录里除 SKILL.md 之外
            // 的所有内容复制到目标目录（保留权限，递归）。
            //
            // 同步规则与 SKILL.md 相同：
            // - 不存在 → 复制
            // - 内容相同 → 跳过
            // - 已存在但内容不同 → 保留用户版本（user-modified）
            // - 失败 → 记录到 finding（但不中断 SKILL.md 主流程）
            const supportingDelta = syncSupportingFiles({
                sourceDir: join(skillsSourceDir, id),
                targetDir: join(skillsTargetDir, id),
            });
            const message = supportingDelta.installed > 0 || supportingDelta.userModified > 0
                ? `+ ${supportingDelta.installed} 支持文件 / ${supportingDelta.userModified} 保留用户版`
                : undefined;
            findings.push({
                skillId: id,
                source,
                target,
                outcome: "installed",
                message,
            });
        }
        catch (err) {
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
/**
 * 递归同步 skill supporting files（reference.md / scripts/ 等子文件与子目录）。
 *
 * 规则：
 * - 跳过 SKILL.md（已由主流程单独处理）
 * - 子文件：内容相同跳过；不存在则复制；已存在不同则保留用户版本
 * - 子目录：递归处理
 * - 脚本（.sh / .bash / .zsh / .py / .mjs）：复制后赋可执行权限
 *
 * 失败不抛错，只在返回值里记录数量。主流程会把信息合并到 SKILL.md 的 finding 里。
 *
 * 注意：本函数不删除目标目录里源目录没有的文件——避免把用户自己加的脚本
 * 或文档误删。如果源目录删了某个 supporting file，目标里会保留旧文件。
 */
function syncSupportingFiles(input) {
    const result = { installed: 0, skipped: 0, userModified: 0, failed: 0 };
    if (!existsSync(input.sourceDir))
        return result;
    let entries = [];
    try {
        entries = readdirSync(input.sourceDir);
    }
    catch {
        return result;
    }
    for (const entry of entries) {
        if (entry === "SKILL.md")
            continue; // 主流程已处理
        const srcPath = join(input.sourceDir, entry);
        const dstPath = join(input.targetDir, entry);
        let srcStat;
        try {
            srcStat = statSync(srcPath);
        }
        catch {
            result.failed += 1;
            continue;
        }
        if (srcStat.isDirectory()) {
            // 递归子目录（如 scripts/）
            try {
                if (!existsSync(dstPath))
                    mkdirSync(dstPath, { recursive: true });
            }
            catch {
                result.failed += 1;
                continue;
            }
            const sub = syncSupportingFiles({
                sourceDir: srcPath,
                targetDir: dstPath,
            });
            result.installed += sub.installed;
            result.skipped += sub.skipped;
            result.userModified += sub.userModified;
            result.failed += sub.failed;
            continue;
        }
        if (!srcStat.isFile())
            continue; // 忽略 symlink 等
        let srcContent = "";
        try {
            srcContent = readFileSync(srcPath, "utf-8");
        }
        catch {
            result.failed += 1;
            continue;
        }
        if (existsSync(dstPath)) {
            let dstContent = "";
            try {
                dstContent = readFileSync(dstPath, "utf-8");
            }
            catch {
                result.userModified += 1; // 不可读视为用户修改过
                continue;
            }
            if (dstContent === srcContent) {
                result.skipped += 1;
            }
            else {
                result.userModified += 1;
            }
            continue;
        }
        // 不存在 → 复制
        try {
            const parent = dirname(dstPath);
            if (!existsSync(parent))
                mkdirSync(parent, { recursive: true });
            writeFileSync(dstPath, srcContent, "utf-8");
            // 脚本类文件赋可执行权限（rwxr-xr-x = 0o755）
            if (/\.(sh|bash|zsh|py|mjs|js)$/.test(entry)) {
                try {
                    chmodSync(dstPath, 0o755);
                }
                catch {
                    // chmod 失败不影响安装本身（OpenCode 可能在没有 chmod 权限的容器里）
                }
            }
            result.installed += 1;
        }
        catch {
            result.failed += 1;
        }
    }
    return result;
}
