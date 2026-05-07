import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { getConfiguredExecutableAgent, readWorkflowConfig } from "./config.js";
import type { ResolveWorkflowAgentInput, ResolvedAgentDefinition } from "./types.js";

type CandidateMeta = {
  id: string;
  source: "project" | "global";
  directoryKind: "agents" | "agent";
  filePath: string;
  raw: string;
};

function getAgentSearchDirs(projectDir: string) {
  const globalBase = join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "opencode",
  );

  return [
    {
      source: "project" as const,
      directoryKind: "agents" as const,
      dir: join(projectDir, ".opencode", "agents"),
    },
    {
      source: "global" as const,
      directoryKind: "agents" as const,
      dir: join(globalBase, "agents"),
    },
    {
      source: "project" as const,
      directoryKind: "agent" as const,
      dir: join(projectDir, ".opencode", "agent"),
    },
    {
      source: "global" as const,
      directoryKind: "agent" as const,
      dir: join(globalBase, "agent"),
    },
  ];
}

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name));
}

function collectAgentCandidates(projectDir: string): Map<string, CandidateMeta[]> {
  const result = new Map<string, CandidateMeta[]>();

  for (const searchDir of getAgentSearchDirs(projectDir)) {
    for (const filePath of listMarkdownFiles(searchDir.dir)) {
      const id = basename(filePath, ".md");
      const list = result.get(id) || [];
      list.push({
        id,
        source: searchDir.source,
        directoryKind: searchDir.directoryKind,
        filePath,
        raw: readFileSync(filePath, "utf-8"),
      });
      result.set(id, list);
    }
  }

  return result;
}

function parseSimpleFrontmatter(raw: string): Record<string, string> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const line of match[1].split(/\n+/)) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) {
      result[key] = value;
    }
  }

  return result;
}

function normalizeResolvedField(value?: string | null) {
  return typeof value === "string" ? value : undefined;
}

function resolveFallbackReason(params: {
  parseFailed: boolean;
  missingDescription: boolean;
  missingModel: boolean;
  missingMode: boolean;
}) {
  if (params.parseFailed) {
    return "parse-failed" as const;
  }
  if (params.missingDescription) {
    return "missing-description" as const;
  }
  if (params.missingMode) {
    return "missing-mode" as const;
  }
  if (params.missingModel) {
    return "missing-model" as const;
  }
  return undefined;
}

export function resolveWorkflowAgentDefinition(
  input: ResolveWorkflowAgentInput,
): ResolvedAgentDefinition {
  const candidates = collectAgentCandidates(input.projectDir).get(input.semanticAgent) || [];
  const resolved = candidates[0];
  const config = readWorkflowConfig(input.projectDir);
  const executableAgent = getConfiguredExecutableAgent(input.semanticAgent, config);
  const fallbackDefinition = config.agents.definitions[executableAgent];

  if (resolved) {
    const frontmatter = parseSimpleFrontmatter(resolved.raw);
    const parseFailed = resolved.raw.trimStart().startsWith("---") && Object.keys(frontmatter).length === 0;
    const missingModel = !frontmatter.model && !!fallbackDefinition?.model;
    const missingMode = !frontmatter.mode && !!fallbackDefinition?.mode;
    const missingDescription = !frontmatter.description && !!fallbackDefinition?.description;
    const usedFallback = parseFailed || missingModel || missingMode || missingDescription;

    return {
      id: executableAgent,
      model: normalizeResolvedField(frontmatter.model || fallbackDefinition?.model),
      mode: normalizeResolvedField(frontmatter.mode || fallbackDefinition?.mode),
      description: normalizeResolvedField(
        frontmatter.description || fallbackDefinition?.description,
      ),
      source: resolved.source,
      directoryKind: resolved.directoryKind,
      filePath: resolved.filePath,
      shadowedGlobal: candidates.some((candidate) => candidate.source === "global"),
      usedFallback,
      fallbackReason: usedFallback
          ? resolveFallbackReason({
              parseFailed,
              missingDescription,
              missingModel,
              missingMode,
            })
        : undefined,
    };
  }

  return {
    id: executableAgent,
    source: "fallback",
    directoryKind: "fallback",
    shadowedGlobal: false,
    usedFallback: true,
    fallbackReason: "missing-agent",
  };
}
