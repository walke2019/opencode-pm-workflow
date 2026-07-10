import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export type OpenCodeModelInventoryEntry = {
  provider: string;
  model: string;
};

export type OpenCodeModelInventory = {
  sourcePath: string;
  models: OpenCodeModelInventoryEntry[];
};

export type OpenCodeModelAliasResolutionStatus =
  | "exact"
  | "resolved"
  | "ambiguous"
  | "not_found";

export interface IOpenCodeModelAliasResolution {
  input: string;
  status: OpenCodeModelAliasResolutionStatus;
  resolved?: string;
  candidates: string[];
}

export function getGlobalOpenCodeConfigPath() {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "opencode", "opencode.json");
}

function readJsonFile(path: string) {
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function collectModelKeysFromProvider(
  providerName: string,
  providerConfig: unknown,
): OpenCodeModelInventoryEntry[] {
  if (!providerConfig || typeof providerConfig !== "object") return [];
  const provider = providerConfig as Record<string, unknown>;
  const models = provider.models;
  if (!models || typeof models !== "object" || Array.isArray(models)) return [];

  return Object.keys(models as Record<string, unknown>).map((model) => ({
    provider: providerName,
    model,
  }));
}

export function readGlobalOpenCodeModelInventory(
  sourcePath = getGlobalOpenCodeConfigPath(),
): OpenCodeModelInventory {
  if (!existsSync(sourcePath)) {
    return { sourcePath, models: [] };
  }

  const parsed = readJsonFile(sourcePath);
  if (!parsed || typeof parsed !== "object") {
    return { sourcePath, models: [] };
  }

  const providerRoot = (parsed as Record<string, unknown>).provider;
  if (!providerRoot || typeof providerRoot !== "object" || Array.isArray(providerRoot)) {
    return { sourcePath, models: [] };
  }

  const models = Object.entries(providerRoot as Record<string, unknown>).flatMap(
    ([providerName, providerConfig]) =>
      collectModelKeysFromProvider(providerName, providerConfig),
  );

  return { sourcePath, models };
}

export function listGlobalOpenCodeModelKeys(
  sourcePath = getGlobalOpenCodeConfigPath(),
) {
  return Array.from(
    new Set(
      readGlobalOpenCodeModelInventory(sourcePath).models.flatMap((entry) => {
        if (entry.model.includes("/")) return [entry.model];
        return [entry.model, `${entry.provider}/${entry.model}`];
      }),
    ),
  ).sort();
}

function getConfiguredModelKey(entry: OpenCodeModelInventoryEntry): string {
  // Preserve existing installations whose provider model key is already a
  // fully-qualified route such as `cx/gpt-5.5`.
  return entry.model.includes("/")
    ? entry.model
    : `${entry.provider}/${entry.model}`;
}

/**
 * Resolve a portable model alias against the user's configured providers.
 *
 * OpenCode ultimately requires `provider/model-id`. Templates may omit the
 * provider to stay portable, but only an exact, unique provider model match is
 * safe to expand automatically. Ambiguous aliases are returned as blockers so
 * callers can ask the user to select a provider explicitly.
 */
export function resolveGlobalOpenCodeModelAlias(
  input: string,
  sourcePath = getGlobalOpenCodeConfigPath(),
): IOpenCodeModelAliasResolution {
  const normalized = input.trim();
  if (!normalized) {
    return { input: normalized, status: "not_found", candidates: [] };
  }

  const candidates = Array.from(
    new Set(
      readGlobalOpenCodeModelInventory(sourcePath).models
        .filter((entry) => {
          const configuredKey = getConfiguredModelKey(entry);
          return configuredKey === normalized || entry.model === normalized;
        })
        .map(getConfiguredModelKey),
    ),
  ).sort();

  if (candidates.length === 0) {
    return { input: normalized, status: "not_found", candidates };
  }
  if (candidates.length > 1) {
    return { input: normalized, status: "ambiguous", candidates };
  }

  const resolved = candidates[0];
  return {
    input: normalized,
    status: resolved === normalized ? "exact" : "resolved",
    resolved,
    candidates,
  };
}

export function isGlobalOpenCodeModelKey(
  model: string,
  sourcePath = getGlobalOpenCodeConfigPath(),
) {
  return listGlobalOpenCodeModelKeys(sourcePath).includes(model);
}
