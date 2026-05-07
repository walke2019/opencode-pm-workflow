import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { getConfiguredExecutableAgent, readWorkflowConfig } from "./config.js";
function getAgentSearchDirs(projectDir) {
    const globalBase = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode");
    return [
        {
            source: "project",
            directoryKind: "agents",
            dir: join(projectDir, ".opencode", "agents"),
        },
        {
            source: "global",
            directoryKind: "agents",
            dir: join(globalBase, "agents"),
        },
        {
            source: "project",
            directoryKind: "agent",
            dir: join(projectDir, ".opencode", "agent"),
        },
        {
            source: "global",
            directoryKind: "agent",
            dir: join(globalBase, "agent"),
        },
    ];
}
function listMarkdownFiles(dir) {
    if (!existsSync(dir)) {
        return [];
    }
    return readdirSync(dir)
        .filter((name) => name.endsWith(".md"))
        .map((name) => join(dir, name));
}
function collectAgentCandidates(projectDir) {
    const result = new Map();
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
function parseSimpleFrontmatter(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
        return {};
    }
    const result = {};
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
function normalizeResolvedField(value) {
    return typeof value === "string" ? value : undefined;
}
function resolveFallbackReason(params) {
    if (params.parseFailed) {
        return "parse-failed";
    }
    if (params.missingDescription) {
        return "missing-description";
    }
    if (params.missingMode) {
        return "missing-mode";
    }
    if (params.missingModel) {
        return "missing-model";
    }
    return undefined;
}
export function resolveWorkflowAgentDefinition(input) {
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
            description: normalizeResolvedField(frontmatter.description || fallbackDefinition?.description),
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
