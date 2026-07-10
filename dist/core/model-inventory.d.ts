export type OpenCodeModelInventoryEntry = {
    provider: string;
    model: string;
};
export type OpenCodeModelInventory = {
    sourcePath: string;
    models: OpenCodeModelInventoryEntry[];
};
export type OpenCodeModelAliasResolutionStatus = "exact" | "resolved" | "ambiguous" | "not_found";
export interface IOpenCodeModelAliasResolution {
    input: string;
    status: OpenCodeModelAliasResolutionStatus;
    resolved?: string;
    candidates: string[];
}
export declare function getGlobalOpenCodeConfigPath(): string;
export declare function readGlobalOpenCodeModelInventory(sourcePath?: string): OpenCodeModelInventory;
export declare function listGlobalOpenCodeModelKeys(sourcePath?: string): string[];
/**
 * Resolve a portable model alias against the user's configured providers.
 *
 * OpenCode ultimately requires `provider/model-id`. Templates may omit the
 * provider to stay portable, but only an exact, unique provider model match is
 * safe to expand automatically. Ambiguous aliases are returned as blockers so
 * callers can ask the user to select a provider explicitly.
 */
export declare function resolveGlobalOpenCodeModelAlias(input: string, sourcePath?: string): IOpenCodeModelAliasResolution;
export declare function isGlobalOpenCodeModelKey(model: string, sourcePath?: string): boolean;
