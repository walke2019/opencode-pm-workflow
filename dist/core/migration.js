import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync, } from "fs";
import { createHash } from "crypto";
import { dirname, join, relative } from "path";
import { readWorkflowConfig } from "./config.js";
import { appendHistory } from "./history.js";
import { DOC_FILENAMES, ensureProjectStorageDirs, ensureStateDir, getMigrationManifestPath, getProjectDocsDir, getProjectFeedbackDir, getProjectScopedDocPath, } from "./project.js";
function nowIso() {
    return new Date().toISOString();
}
function ensureDir(path) {
    if (!existsSync(path)) {
        writeFileSync(join(path, "..", ".opencode-dir-probe"), "", { flag: "a" });
    }
}
function ensureParentDir(path) {
    const parent = dirname(path);
    if (existsSync(parent))
        return;
    const parts = parent.split(/[\\/]+/).filter(Boolean);
    let current = parent.startsWith("/") ? "/" : parts.shift() || "";
    if (parent.includes(":") && current && !current.endsWith("\\")) {
        current = `${current}\\`;
    }
    for (const part of parts) {
        current = current ? join(current, part) : part;
        if (!existsSync(current)) {
            writeFileSync(join(current, "..", ".opencode-dir-probe"), "", {
                flag: "a",
            });
        }
    }
}
function getLegacyDocPath(projectDir, docName) {
    return join(projectDir, DOC_FILENAMES[docName]);
}
export function hashFileSha256(path) {
    const content = readFileSync(path);
    return createHash("sha256").update(content).digest("hex");
}
export function listFilesRecursively(path) {
    if (!existsSync(path))
        return [];
    const results = [];
    const entries = readdirSync(path);
    for (const entry of entries) {
        const fullPath = join(path, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            results.push(...listFilesRecursively(fullPath));
        }
        else {
            results.push(fullPath);
        }
    }
    return results;
}
function dedupeMigrationPairs(list) {
    const seen = new Set();
    const result = [];
    for (const item of list) {
        const key = `${item.source}::${item.target}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(item);
    }
    return result;
}
function readMigrationManifest(projectDir) {
    const path = getMigrationManifestPath(projectDir);
    if (!existsSync(path)) {
        return {
            version: 1,
            last_run_at: nowIso(),
            docs: { copied: [], conflicts: [] },
            feedback: { copied: [], conflicts: [] },
        };
    }
    try {
        return JSON.parse(readFileSync(path, "utf-8"));
    }
    catch {
        return {
            version: 1,
            last_run_at: nowIso(),
            docs: { copied: [], conflicts: [] },
            feedback: { copied: [], conflicts: [] },
        };
    }
}
function writeMigrationManifest(projectDir, manifest) {
    const path = getMigrationManifestPath(projectDir);
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}
export function migrateLegacyProjectArtifacts(projectDir) {
    const config = readWorkflowConfig(projectDir);
    ensureStateDir(projectDir);
    ensureProjectStorageDirs(projectDir);
    if (config.docs.storage_mode !== "project_scoped") {
        return {
            migrated: false,
            reason: "docs.storage_mode is not project_scoped",
        };
    }
    const manifest = readMigrationManifest(projectDir);
    manifest.last_run_at = nowIso();
    for (const docName of Object.keys(DOC_FILENAMES)) {
        const source = getLegacyDocPath(projectDir, docName);
        const target = getProjectScopedDocPath(projectDir, docName);
        if (!existsSync(source))
            continue;
        ensureParentDir(join(getProjectDocsDir(projectDir), ".keep"));
        if (!existsSync(target)) {
            copyFileSync(source, target);
            manifest.docs.copied.push({ source, target });
            continue;
        }
        if (hashFileSha256(source) !== hashFileSha256(target)) {
            manifest.docs.conflicts.push({ source, target });
        }
    }
    const feedbackSources = [
        join(projectDir, "feedback"),
        join(projectDir, ".claude", "feedback"),
    ];
    const feedbackTargetRoot = getProjectFeedbackDir(projectDir);
    ensureParentDir(join(feedbackTargetRoot, ".keep"));
    for (const sourceRoot of feedbackSources) {
        if (!existsSync(sourceRoot))
            continue;
        for (const source of listFilesRecursively(sourceRoot)) {
            const relativePath = relative(sourceRoot, source);
            const target = join(feedbackTargetRoot, relativePath);
            ensureParentDir(target);
            if (!existsSync(target)) {
                copyFileSync(source, target);
                manifest.feedback.copied.push({ source, target });
                continue;
            }
            if (hashFileSha256(source) !== hashFileSha256(target)) {
                manifest.feedback.conflicts.push({ source, target });
            }
        }
    }
    manifest.docs.copied = dedupeMigrationPairs(manifest.docs.copied);
    manifest.docs.conflicts = dedupeMigrationPairs(manifest.docs.conflicts);
    manifest.feedback.copied = dedupeMigrationPairs(manifest.feedback.copied);
    manifest.feedback.conflicts = dedupeMigrationPairs(manifest.feedback.conflicts);
    writeMigrationManifest(projectDir, manifest);
    if (manifest.docs.copied.length || manifest.feedback.copied.length) {
        appendHistory(projectDir, {
            type: "docs.migrate_legacy_to_project_scoped",
            docs_copied: manifest.docs.copied.length,
            docs_conflicts: manifest.docs.conflicts.length,
            feedback_copied: manifest.feedback.copied.length,
            feedback_conflicts: manifest.feedback.conflicts.length,
        });
    }
    return {
        migrated: true,
        docsCopied: manifest.docs.copied.length,
        docsConflicts: manifest.docs.conflicts.length,
        feedbackCopied: manifest.feedback.copied.length,
        feedbackConflicts: manifest.feedback.conflicts.length,
    };
}
export function getMigrationReport(projectDir) {
    const manifest = readMigrationManifest(projectDir);
    return {
        last_run_at: manifest.last_run_at,
        docs: {
            ...manifest.docs,
            copied_count: manifest.docs.copied.length,
            conflicts_count: manifest.docs.conflicts.length,
        },
        feedback: {
            ...manifest.feedback,
            copied_count: manifest.feedback.copied.length,
            conflicts_count: manifest.feedback.conflicts.length,
        },
    };
}
