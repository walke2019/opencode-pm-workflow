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
    new Set(readGlobalOpenCodeModelInventory(sourcePath).models.map((entry) => entry.model)),
  ).sort();
}

export function isGlobalOpenCodeModelKey(
  model: string,
  sourcePath = getGlobalOpenCodeConfigPath(),
) {
  return listGlobalOpenCodeModelKeys(sourcePath).includes(model);
}
