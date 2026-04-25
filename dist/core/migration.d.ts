export declare function hashFileSha256(path: string): string;
export declare function listFilesRecursively(path: string): string[];
export declare function migrateLegacyProjectArtifacts(projectDir: string): {
    migrated: boolean;
    reason: string;
    docsCopied?: undefined;
    docsConflicts?: undefined;
    feedbackCopied?: undefined;
    feedbackConflicts?: undefined;
} | {
    migrated: boolean;
    docsCopied: number;
    docsConflicts: number;
    feedbackCopied: number;
    feedbackConflicts: number;
    reason?: undefined;
};
export declare function getMigrationReport(projectDir: string): {
    last_run_at: string;
    docs: {
        copied_count: number;
        conflicts_count: number;
        copied: Array<{
            source: string;
            target: string;
        }>;
        conflicts: Array<{
            source: string;
            target: string;
        }>;
    };
    feedback: {
        copied_count: number;
        conflicts_count: number;
        copied: Array<{
            source: string;
            target: string;
        }>;
        conflicts: Array<{
            source: string;
            target: string;
        }>;
    };
};
