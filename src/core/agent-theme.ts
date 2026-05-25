/**
 * Agent 主题（agent-theme）：把 6 个固定语义 agent 包装成不同"皮肤"显示名。
 *
 * 关键约束（与"稳定任务域"治理原则一致）：
 * - 主题只影响 frontmatter `description` / `display_name` / `theme` 与 body 文案。
 * - 永不影响语义 ID（commander / backendcoder / ...）、dispatch 路由、history 记录、
 *   permission 规则、retry/fallback 链路。
 * - 用户已配置的 model / mode / permission / fallback_models / temperature 字段
 *   在 apply 时默认保留（preserveExisting）。
 *
 * 不做的事情：
 * - 不引入网络请求；主题数据全部内置。
 * - 不修改 dispatch_map；主题切换不破坏路由锚点。
 * - 不写 history.jsonl；主题切换是 UX 层动作。
 *
 * 该模块是 1.0.0-rc.2 的核心新增能力，与 0.10.0 的 agent-library 共存：
 * - agent-library 负责"agent 维度的工具"（list / promote / doctor）。
 * - agent-theme 负责"主题维度的工具"（list / preview / apply）。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  AgentThemeDefinition,
  AgentThemeId,
  AgentThemePreserveExisting,
  AgentThemeRoleSkin,
  AgentThemeWriteScope,
  ApplyAgentThemeInput,
  ApplyAgentThemeResult,
  DispatchAgent,
  RenderedAgentMd,
} from "./types.js";
import {
  FIXED_AGENT_IDS,
  getBuiltinTheme,
  getDefaultTheme,
  listBuiltinThemes,
} from "./agent-theme-data.js";

const DEFAULT_PRESERVE: AgentThemePreserveExisting = {
  model: true,
  mode: true,
  permission: true,
  fallback_models: true,
  temperature: true,
};

/** 列出所有内置主题的元数据（id / label / summary）。 */
export function listAgentThemes(): Array<{
  id: AgentThemeId;
  label: string;
  summary: string;
  roleCount: number;
}> {
  return listBuiltinThemes().map((theme) => ({
    id: theme.id,
    label: theme.label,
    summary: theme.summary,
    roleCount: Object.keys(theme.roles).length,
  }));
}

/**
 * 推导某 scope 对应的目标目录。
 * - global → ~/.config/opencode/agents（XDG_CONFIG_HOME 优先）
 * - project → <projectDir>/.opencode/agents
 */
export function resolveThemeTargetDir(
  scope: AgentThemeWriteScope,
  projectDir: string,
): string {
  if (scope === "project") {
    return join(projectDir, ".opencode", "agents");
  }
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "opencode", "agents");
}

/**
 * 极简 frontmatter 解析：识别顶层 `key: value` 行，不识别嵌套。
 *
 * 与 agent-registry / agent-library 的解析保持同样轻量：
 * - 不引入 yaml 包；
 * - 嵌套结构（permission.task / permission 子对象）按"原文保留段"处理。
 *
 * 返回值包含两部分：
 * - `topLevel`：扁平 key→value 映射，仅顶层字段；
 * - `nestedRaw`：嵌套块的原文（含缩进），按 key 分组；apply 时整段保留。
 */
function parseFrontmatter(raw: string): {
  hasFrontmatter: boolean;
  topLevel: Record<string, string>;
  nestedRaw: Record<string, string>;
  bodyAfter: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return {
      hasFrontmatter: false,
      topLevel: {},
      nestedRaw: {},
      bodyAfter: raw,
    };
  }

  const [, fmText, bodyAfter] = match;
  const lines = fmText.split(/\n/);
  const topLevel: Record<string, string> = {};
  const nestedRaw: Record<string, string> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    // 嵌套：当前 key 行后跟缩进行（形如 `permission:` + 缩进）
    const sep = line.indexOf(":");
    if (sep === -1) {
      i += 1;
      continue;
    }
    const key = line.slice(0, sep).trim();
    const inlineValue = line
      .slice(sep + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    // 看下一行是否缩进，判断是否嵌套块
    const next = lines[i + 1];
    const isNestedStart = inlineValue === "" && next && /^\s+\S/.test(next);
    if (isNestedStart) {
      const block: string[] = [line];
      i += 1;
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === "")) {
        block.push(lines[i]);
        i += 1;
      }
      // 去掉块尾连续空行
      while (block.length > 1 && block[block.length - 1].trim() === "") {
        block.pop();
      }
      nestedRaw[key] = block.join("\n");
      continue;
    }
    if (key) {
      topLevel[key] = inlineValue;
    }
    i += 1;
  }

  return {
    hasFrontmatter: true,
    topLevel,
    nestedRaw,
    bodyAfter,
  };
}

/**
 * 渲染 frontmatter：按固定顺序组合字段，便于人工 diff。
 *
 * 顺序：
 *   description → mode → model → fallback_models → temperature →
 *   display_name → theme → 其他顶层字段（按 key 排序） → 嵌套块（按 key 排序）
 */
function renderFrontmatter(input: {
  topLevel: Record<string, string>;
  nestedRaw: Record<string, string>;
}): string {
  const ordered = [
    "description",
    "mode",
    "model",
    "fallback_models",
    "temperature",
    "display_name",
    "theme",
  ];
  const seen = new Set<string>();
  const lines: string[] = ["---"];

  for (const key of ordered) {
    const value = input.topLevel[key];
    if (value !== undefined && value !== "") {
      lines.push(`${key}: ${quoteIfNeeded(value)}`);
      seen.add(key);
    }
  }
  // 其他顶层字段，按 key 排序，避免无谓 diff
  const otherKeys = Object.keys(input.topLevel)
    .filter((k) => !seen.has(k))
    .sort();
  for (const key of otherKeys) {
    const value = input.topLevel[key];
    if (value !== undefined && value !== "") {
      lines.push(`${key}: ${quoteIfNeeded(value)}`);
    }
  }
  // 嵌套块，按 key 排序，原样保留
  const nestedKeys = Object.keys(input.nestedRaw).sort();
  for (const key of nestedKeys) {
    lines.push(input.nestedRaw[key]);
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * 字符串引号策略：包含冒号、井号或前导/末尾空格时加双引号；否则原样输出。
 * 已含引号的不重复包裹。
 */
function quoteIfNeeded(value: string): string {
  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) return value;
  if (/[:#]|^\s|\s$/.test(value)) {
    // 转义已有的双引号
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * 把主题角色皮肤渲染成完整 md 文本。
 *
 * 关键规则：
 * - 如果目标文件已存在，按 preserveExisting 保留用户的 model / mode /
 *   permission / fallback_models / temperature；其余字段（含 description /
 *   display_name / theme）由主题强制覆盖。
 * - 如果目标文件不存在，从主题渲染初始内容；mode / model 等用户没设的字段不写入，
 *   交给 OpenCode 与 pm-workflow 默认配置兜底。
 */
function renderAgentMd(input: {
  agent: DispatchAgent;
  theme: AgentThemeDefinition;
  filePath: string;
  preserve: AgentThemePreserveExisting;
}): RenderedAgentMd {
  const skin = input.theme.roles[input.agent] || getDefaultTheme().roles[input.agent];
  const fellBackToDefault = !input.theme.roles[input.agent];
  if (!skin) {
    // 理论上不会发生：default 主题始终包含全部 6 个 agent。
    throw new Error(
      `agent-theme: default theme missing skin for ${input.agent}; this is a build-time invariant violation`,
    );
  }

  const exists = existsSync(input.filePath);
  let topLevel: Record<string, string> = {};
  let nestedRaw: Record<string, string> = {};
  let _bodyAfter = "";

  if (exists) {
    const raw = readFileSync(input.filePath, "utf-8");
    const parsed = parseFrontmatter(raw);
    topLevel = { ...parsed.topLevel };
    nestedRaw = { ...parsed.nestedRaw };
    _bodyAfter = parsed.bodyAfter;

    // 不保留 description / display_name / theme：这些就是主题要换的皮肤
    delete topLevel.description;
    delete topLevel.display_name;
    delete topLevel.theme;

    // 按 preserve 决定是否保留
    if (!input.preserve.model) delete topLevel.model;
    if (!input.preserve.mode) delete topLevel.mode;
    if (!input.preserve.fallback_models) delete topLevel.fallback_models;
    if (!input.preserve.temperature) delete topLevel.temperature;
    if (!input.preserve.permission) {
      delete topLevel.permission;
      delete nestedRaw.permission;
    }
  }

  // 写入主题字段
  topLevel.description = skin.description;
  topLevel.display_name = skin.display_name;
  topLevel.theme = input.theme.id;

  // 关键修复（1.0.0-rc.6）：写入 mode 字段。这是修 UI bug 的核心——
  // 之前主题渲染没写 mode 字段，OpenCode 默认当 `all` 处理，导致 6 个 agent
  // 全部出现在切换列表里。1.0.0-rc.6 起所有内置主题强制声明 mode：
  //   - commander = primary（唯一显示在 OpenCode 切换列表里的 agent）
  //   - 其他 5 个 = subagent（通过 task tool 被 commander 调用，不进切换列表）
  //
  // 注意：preserveExisting.mode 不影响这个写入。主题对 mode 的语义约束是
  // 强约束（commander 必须 primary，其他必须 subagent），不允许用户自定义破坏
  // 这个边界。如果用户想把某个 subagent 改成 primary，应该是手动改 md 文件，
  // 而不是通过主题切换实现。
  topLevel.mode = skin.mode;

  // 1.0.0-rc.8 起：写入 temperature / tools / permission 字段，使 agent md
  // 完全符合 OpenCode 官方 agent 规范（参见 https://opencode.ai/docs/agents）。
  //
  // - temperature：按角色调优（commander/backendcoder=0.2，advisor/writer=0.3，designer=0.4，fixer=0.1）
  // - tools：控制工具集合（advisor 关 edit/write，writer 关 bash 等）
  // - permission：细粒度权限（commander 用 task 白名单约束 dispatch 链路）
  //
  // 这三个字段都由主题数据强制写入，preserveExisting 不影响——理由同 mode：
  // 主题对它们的语义约束是强约束，不允许用户自定义破坏（特别是 permission.task
  // 白名单是 pm-workflow 路由设计的核心）。
  topLevel.temperature = String(skin.temperature);

  // 1.0.1 起：steps 字段（仅 commander 设，限制内部迭代次数防 LLM 演戏 stream 超时）
  if (typeof skin.steps === "number" && skin.steps > 0) {
    topLevel.steps = String(skin.steps);
  }

  // tools 是嵌套对象 → 渲染成 YAML 嵌套块
  nestedRaw.tools = renderToolsBlock(skin.tools);

  // permission 是嵌套对象 → 渲染成 YAML 嵌套块
  // 注意：rc.7 之前 permission 嵌套块由 preserveExisting 守护，可能保留用户旧
  // permission。rc.8 起主题强制写入 permission，确保 commander 的 task 白名单
  // 不被旧文件残留覆盖。
  nestedRaw.permission = renderPermissionBlock(skin.permission);

  const frontmatter = renderFrontmatter({ topLevel, nestedRaw });
  const content = `${frontmatter}\n\n${skin.body}\n`;

  return {
    agent: input.agent,
    filePath: input.filePath,
    content,
    exists,
    fellBackToDefault,
  };
}

/**
 * 渲染 tools 字段为 YAML 嵌套块。
 *
 * 输入：{ write: true, edit: true, bash: false }
 * 输出：
 *   tools:
 *     write: true
 *     edit: true
 *     bash: false
 */
function renderToolsBlock(tools: AgentThemeRoleSkin["tools"]): string {
  const lines = ["tools:"];
  // 固定顺序，便于人工 diff
  const order: Array<keyof AgentThemeRoleSkin["tools"]> = [
    "write",
    "edit",
    "bash",
    "webfetch",
    "task",
  ];
  for (const key of order) {
    const value = tools[key];
    if (value === undefined) continue;
    lines.push(`  ${key}: ${value}`);
  }
  return lines.join("\n");
}

/**
 * 渲染 permission 字段为 YAML 嵌套块。
 *
 * 支持三种值形态：
 * - 字符串："allow" | "ask" | "deny"
 * - 嵌套对象（bash 的 glob 模式 / task 的白名单）：{ "*": "deny", "advisor": "allow", ... }
 *
 * 输出示例：
 *   permission:
 *     edit: ask
 *     bash:
 *       "*": deny
 *       "git log*": allow
 *     webfetch: allow
 *     task:
 *       "*": deny
 *       advisor: allow
 *       backendcoder: allow
 */
function renderPermissionBlock(
  permission: AgentThemeRoleSkin["permission"],
): string {
  const lines = ["permission:"];
  // 固定字段顺序
  const fieldOrder: Array<keyof AgentThemeRoleSkin["permission"]> = [
    "edit",
    "bash",
    "webfetch",
    "task",
  ];
  for (const key of fieldOrder) {
    const value = permission[key];
    if (value === undefined) continue;
    if (typeof value === "string") {
      // 简单形式：edit: ask
      lines.push(`  ${key}: ${value}`);
    } else {
      // 嵌套对象：bash glob / task 白名单
      // YAML 子缩进 4 空格，键名带引号防止 glob 字符冲突
      lines.push(`  ${key}:`);
      // 保持插入顺序——OpenCode 文档说"最后匹配的规则优先"，所以 "*" 应该在前
      const subKeys = Object.keys(value);
      // 把 "*" 放最前（如果存在）
      const ordered = ["*", ...subKeys.filter((k) => k !== "*")];
      for (const sk of ordered) {
        if (!(sk in value)) continue;
        const sv = value[sk];
        // 含 glob 字符或冒号或纯 "*" 时加引号
        const quotedKey = /[*?:#"\s]/.test(sk) ? `"${sk}"` : sk;
        lines.push(`    ${quotedKey}: ${sv}`);
      }
    }
  }
  return lines.join("\n");
}

/**
 * 应用主题：渲染 6 个 agent 的 md 文件，按 scope 写入目标目录。
 *
 * 默认行为：
 * - dryRun = false：渲染并写文件；返回 written/skipped 列表。
 * - dryRun = true：渲染但不写；返回的 written 列表里 content 字段可被前端预览。
 *
 * 错误处理：
 * - 主题不存在 → throw（CLI 层捕获并展示候选）。
 * - 写文件失败 → 该 agent 进 skipped，附带 reason，其他 agent 继续。
 */
export function applyAgentTheme(input: ApplyAgentThemeInput): ApplyAgentThemeResult {
  const theme = getBuiltinTheme(input.themeId);
  if (!theme) {
    const available = listBuiltinThemes()
      .map((t) => t.id)
      .join(", ");
    throw new Error(
      `agent-theme: unknown theme "${input.themeId}". Available: ${available}`,
    );
  }

  const targetDir =
    input.targetDirOverride ?? resolveThemeTargetDir(input.scope, input.projectDir);
  const preserve: AgentThemePreserveExisting = {
    ...DEFAULT_PRESERVE,
    ...(input.preserveExisting || {}),
  };
  const agents = (input.agents && input.agents.length > 0
    ? input.agents
    : FIXED_AGENT_IDS) as DispatchAgent[];
  const dryRun = input.dryRun === true;

  if (!dryRun && !existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const written: RenderedAgentMd[] = [];
  const skipped: ApplyAgentThemeResult["skipped"] = [];

  for (const agent of agents) {
    const filePath = join(targetDir, `${agent}.md`);
    let rendered: RenderedAgentMd;
    try {
      rendered = renderAgentMd({
        agent,
        theme,
        filePath,
        preserve,
      });
    } catch (err) {
      skipped.push({
        agent,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!dryRun) {
      try {
        const dir = dirname(filePath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, rendered.content, "utf-8");
      } catch (err) {
        skipped.push({
          agent,
          reason: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    written.push(rendered);
  }

  return {
    themeId: theme.id,
    scope: input.scope,
    targetDir,
    written,
    skipped,
    dryRun,
  };
}

/**
 * 预览主题：纯计算，不写盘。等价于 applyAgentTheme({ dryRun: true })，
 * 但更适合 CLI / UI 直接渲染。
 */
export function previewAgentTheme(input: ApplyAgentThemeInput): ApplyAgentThemeResult {
  return applyAgentTheme({ ...input, dryRun: true });
}

/** 单纯渲染一个 agent 的内容文本（测试与展示用，不写盘）。 */
export function renderAgentMdForTheme(input: {
  agent: DispatchAgent;
  themeId: AgentThemeId;
  filePath?: string;
  preserveExisting?: Partial<AgentThemePreserveExisting>;
}): RenderedAgentMd {
  const theme = getBuiltinTheme(input.themeId);
  if (!theme) {
    throw new Error(`agent-theme: unknown theme "${input.themeId}"`);
  }
  const preserve: AgentThemePreserveExisting = {
    ...DEFAULT_PRESERVE,
    ...(input.preserveExisting || {}),
  };
  return renderAgentMd({
    agent: input.agent,
    theme,
    filePath: input.filePath || `/dev/null/${input.agent}.md`,
    preserve,
  });
}
