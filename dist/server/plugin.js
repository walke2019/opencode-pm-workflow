import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { applyAgentTheme, getAutomationMode, buildOpenCodeAgentConfig, migrateLegacyProjectArtifacts, FIXED_AGENT_IDS, seedWorkflowConfig, syncState, resolveThemeTargetDir, } from "../shared.js";
import { getProjectDir, log, } from "./runtime.js";
import { createPmWorkflowHooks } from "./hooks.js";
import { evaluatePluginHealth, guardPluginActivation, reportPluginHealth, releasePluginActivation, } from "./hooks-health.js";
import { syncPackagedSkillsToOpenCode } from "./skill-installer.js";
import { showAgentThemeBanner } from "./agent-theme-banner.js";
import { createAdminTools } from "./tools/admin-tools.js";
import { createDiagnosticTools } from "./tools/diagnostic-tools.js";
import { createDispatchTools } from "./tools/dispatch-tools.js";
import { createExecutionTools } from "./tools/execution-tools.js";
import { createStateTools } from "./tools/state-tools.js";
const PLUGIN_ID = "local.pm-workflow-plugin";
export const PmWorkflowPlugin = async (ctx, options) => {
    const projectDir = getProjectDir(ctx);
    // 防御层：所有依赖 projectDir 的 IO（mkdir / writeFile）单独包 try/catch。
    // 如果某一步抛错（比如 ctx 给的 directory 是 / 或不可写），插件仍然可加载，
    // 至少 skill auto-install 与 tool 注册能完成，让 OpenCode 内的对话式入口可用。
    let config;
    let initialState;
    let migration = null;
    let bootstrapError = null;
    try {
        config = seedWorkflowConfig(projectDir, options);
        migration = migrateLegacyProjectArtifacts(projectDir);
        initialState = syncState(projectDir);
    }
    catch (err) {
        bootstrapError = err instanceof Error ? err.message : String(err);
        // 提供降级 config / state，让插件仍能注册 tool 与 hooks。
        config = seedWorkflowConfig(
        // 强制 fallback 到 <home>/.cache/pm-workflow/global，避开异常路径。
        // 跨平台用 Node `os.homedir()` 与 `os.tmpdir()`，不依赖 HOME/TMPDIR 环境变量。
        (() => {
            const home = homedir();
            if (home && home !== "/" && home !== "\\") {
                return join(home, ".cache", "pm-workflow", "global");
            }
            return join(tmpdir(), "pm-workflow-global");
        })(), options);
        // syncState / migration 在异常路径下我们不做；后续真实分派时会按需重试
        initialState = { stage: "idea" };
    }
    const automationMode = config.automation.mode || getAutomationMode(projectDir);
    const adminTools = createAdminTools();
    const dispatchTools = createDispatchTools();
    const diagnosticTools = createDiagnosticTools();
    const executionTools = createExecutionTools();
    const stateTools = createStateTools();
    // Hook 注册去重：防止 hot-reload 场景下同一进程多次装配导致事件回调被重复触发。
    // 重复装配时仍返回完整的 tool / config 集合（无副作用），但跳过 hooks 与 health log，
    // 避免 syncState / 写 review marker 等动作被错误地执行多遍。
    const activation = guardPluginActivation(PLUGIN_ID);
    let bannerTimer;
    const hooks = activation === "first"
        ? createPmWorkflowHooks(projectDir, ctx)
        : {};
    await log(ctx.client, bootstrapError ? "warn" : "info", "pm-workflow plugin loaded", {
        projectDir,
        stage: initialState.stage,
        automationMode,
        migration,
        standalone: true,
        activation,
        bootstrapError,
        ctxWorktree: ctx.worktree ?? null,
        ctxDirectory: ctx.directory ?? null,
    });
    // Skill auto-install：把包内 skills/<id>/SKILL.md 同步到 ~/.config/opencode/skills/<id>/SKILL.md。
    // **每次激活都跑**（不仅 first activation）：幂等的，相同内容跳过；用户改过的不覆盖。
    // 也**不依赖 projectDir**：即使 bootstrap 出错（路径异常）skill 仍能落盘，确保对话式
    // 入口可用。这是 1.0.0-rc.4 的关键修复点——之前放在 first activation 分支里，
    // 任何前置异常都会让它无法触发。
    try {
        const skillSync = syncPackagedSkillsToOpenCode();
        const summary = {
            skillsDir: skillSync.skillsDir,
            total: skillSync.total,
            installed: skillSync.installed,
            skipped: skillSync.skipped,
            userModified: skillSync.userModified,
            failed: skillSync.failed,
        };
        const level = skillSync.failed > 0 ? "warn" : skillSync.installed > 0 ? "info" : "debug";
        await log(ctx.client, level, "pm-workflow skill auto-install", summary);
        // 任何 user-modified 的条目，单独打 info 提示，方便用户决定是否手动同步。
        for (const finding of skillSync.findings) {
            if (finding.outcome === "user-modified" && finding.message) {
                await log(ctx.client, "info", "pm-workflow skill kept user version", {
                    skillId: finding.skillId,
                    target: finding.target,
                    note: finding.message,
                });
            }
            if (finding.outcome === "failed" && finding.message) {
                await log(ctx.client, "warn", "pm-workflow skill install failed", {
                    skillId: finding.skillId,
                    target: finding.target,
                    note: finding.message,
                });
            }
        }
    }
    catch (err) {
        // 兜底：syncPackagedSkillsToOpenCode 内部已经把所有 IO 异常包成 finding，
        // 这里只接住意外错误（比如 fileURLToPath 路径计算失败）；不阻断加载。
        await log(ctx.client, "warn", "pm-workflow skill auto-install crashed", {
            message: err instanceof Error ? err.message : String(err),
        });
    }
    // Agent .md 自动补齐：检查 ~/.config/opencode/agents/ 下 6 个角色 .md 是否存在。
    // 如果缺失任何一个，用默认主题自动创建。已存在的文件不受影响（applyAgentTheme 的
    // preserveExisting 默认保留用户的 model/mode/permission/fallback_models/temperature 配置）。
    // 跨平台：resolveThemeTargetDir 内部用 os.homedir() + XDG_CONFIG_HOME 自动适配
    // macOS/Linux/Windows（Windows 走 %USERPROFILE%\.config 路径）。
    try {
        const agentsDir = resolveThemeTargetDir("global", projectDir);
        const missingAgents = FIXED_AGENT_IDS.filter((id) => !existsSync(join(agentsDir, `${id}.md`)));
        if (missingAgents.length > 0) {
            await log(ctx.client, "info", "pm-workflow auto-creating missing agent .md files", {
                agentsDir,
                missing: missingAgents,
            });
            const result = applyAgentTheme({
                projectDir,
                themeId: "default",
                scope: "global",
            });
            await log(ctx.client, "info", "pm-workflow agent auto-create complete", {
                written: result.written.map((w) => w.agent),
                skipped: result.skipped.map((s) => ({ agent: s.agent, reason: s.reason })),
                targetDir: result.targetDir,
            });
        }
    }
    catch (err) {
        // 兜底：agent .md 创建失败不阻断插件加载。
        // 用户仍可通过 `pmw agents theme apply default` 手动修复。
        await log(ctx.client, "warn", "pm-workflow agent auto-create failed", {
            message: err instanceof Error ? err.message : String(err),
        });
    }
    if (activation === "first") {
        const toolsCount = Object.keys(adminTools).length +
            Object.keys(dispatchTools).length +
            Object.keys(diagnosticTools).length +
            Object.keys(executionTools).length +
            Object.keys(stateTools).length;
        const agentsCount = Object.keys(config.agents.definitions).length;
        const health = evaluatePluginHealth({
            thresholds: options?.health,
            inputs: {
                agentsCount,
                toolsCount,
                // server 侧没有 mcp 计数能力；保留 0，由 TUI 侧未来补全。
                mcpsCount: 0,
            },
        });
        await reportPluginHealth(ctx, health);
        // 1.0.0-rc.16 起：从 server 侧推 toast 显示当前主题与 6 个 agent 的角色名。
        // OpenCode 1.15 不支持外部 TUI plugin 注册（rc.14/rc.15 实测验证），所以
        // 不再依赖 src/tui/agent-theme-banner.ts，改用 SDK v1 的 client.tui.showToast()
        // 直接从 server 侧推 toast。失败不阻断 plugin 加载。
        //
        // 1.0.0-rc.16 调整：用 setTimeout 异步触发，**不 await**——
        // server plugin 的 first activation 早于 TUI 启动，直接 await showToast 会卡住
        // 等 TUI server 起来。把 banner 调用挪到 setTimeout(2s) 里让 plugin 立刻完成
        // first activation，TUI 起来后再发 toast。
        bannerTimer = setTimeout(() => {
            void (async () => {
                try {
                    const bannerResult = await showAgentThemeBanner({
                        client: ctx.client,
                    });
                    await log(ctx.client, "info", "pm-workflow agent theme banner", {
                        shown: bannerResult.shown,
                        reason: bannerResult.reason,
                    });
                }
                catch (err) {
                    await log(ctx.client, "warn", "pm-workflow agent theme banner crashed", {
                        message: err instanceof Error ? err.message : String(err),
                    });
                }
            })();
        }, 2000);
    }
    return {
        dispose: async () => {
            if (bannerTimer) {
                clearTimeout(bannerTimer);
                bannerTimer = undefined;
            }
            releasePluginActivation(PLUGIN_ID);
            await log(ctx.client, "info", "pm-workflow plugin disposed", {
                projectDir,
                activation,
            });
        },
        config: async (input) => {
            if (!config.agents.enabled)
                return;
            const existingAgents = input.agent && typeof input.agent === "object"
                ? input.agent
                : {};
            input.agent = {
                ...buildOpenCodeAgentConfig(config),
                ...existingAgents,
            };
        },
        tool: {
            ...adminTools,
            ...dispatchTools,
            ...diagnosticTools,
            ...executionTools,
            ...stateTools,
        },
        ...hooks,
    };
};
export default {
    id: PLUGIN_ID,
    server: PmWorkflowPlugin,
};
