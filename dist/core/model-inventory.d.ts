export type OpenCodeModelInventoryEntry = {
    provider: string;
    model: string;
};
export type OpenCodeModelInventory = {
    sourcePath: string;
    models: OpenCodeModelInventoryEntry[];
};
export declare function getGlobalOpenCodeConfigPath(): string;
export declare function readGlobalOpenCodeModelInventory(sourcePath?: string): OpenCodeModelInventory;
export declare function listGlobalOpenCodeModelKeys(sourcePath?: string): string[];
export declare function isGlobalOpenCodeModelKey(model: string, sourcePath?: string): boolean;
