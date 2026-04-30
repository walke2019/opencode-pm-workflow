import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
export function getGlobalOpenCodeConfigPath() {
    const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(configHome, "opencode", "opencode.json");
}
function readJsonFile(path) {
    return JSON.parse(readFileSync(path, "utf-8"));
}
function collectModelKeysFromProvider(providerName, providerConfig) {
    if (!providerConfig || typeof providerConfig !== "object")
        return [];
    const provider = providerConfig;
    const models = provider.models;
    if (!models || typeof models !== "object" || Array.isArray(models))
        return [];
    return Object.keys(models).map((model) => ({
        provider: providerName,
        model,
    }));
}
export function readGlobalOpenCodeModelInventory(sourcePath = getGlobalOpenCodeConfigPath()) {
    if (!existsSync(sourcePath)) {
        return { sourcePath, models: [] };
    }
    const parsed = readJsonFile(sourcePath);
    if (!parsed || typeof parsed !== "object") {
        return { sourcePath, models: [] };
    }
    const providerRoot = parsed.provider;
    if (!providerRoot || typeof providerRoot !== "object" || Array.isArray(providerRoot)) {
        return { sourcePath, models: [] };
    }
    const models = Object.entries(providerRoot).flatMap(([providerName, providerConfig]) => collectModelKeysFromProvider(providerName, providerConfig));
    return { sourcePath, models };
}
export function listGlobalOpenCodeModelKeys(sourcePath = getGlobalOpenCodeConfigPath()) {
    return Array.from(new Set(readGlobalOpenCodeModelInventory(sourcePath).models.map((entry) => entry.model))).sort();
}
export function isGlobalOpenCodeModelKey(model, sourcePath = getGlobalOpenCodeConfigPath()) {
    return listGlobalOpenCodeModelKeys(sourcePath).includes(model);
}
