import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { readWorkflowConfig } from "./config.js";

export const REVIEW_MARKER_FILENAME = ".needs-review";
const STATE_DIRNAME = ".pm-workflow";
const STATE_FILENAME = "state.json";
const HISTORY_FILENAME = "history.jsonl";
const CONFIG_FILENAME = "config.json";
const MIGRATION_MANIFEST_FILENAME = "migration-manifest.json";
const PROJECT_DOCS_DIRNAME = "docs";
const PROJECT_FEEDBACK_DIRNAME = "feedback";

export const DOC_FILENAMES = {
  product_spec: "Product-Spec.md",
  design_brief: "Design-Brief.md",
  dev_plan: "DEV-PLAN.md",
} as const;

export type WorkflowDocName = keyof typeof DOC_FILENAMES;

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function getStateDir(projectDir: string) {
  return join(projectDir, STATE_DIRNAME);
}

export function getStatePath(projectDir: string) {
  return join(getStateDir(projectDir), STATE_FILENAME);
}

export function getHistoryPath(projectDir: string) {
  return join(getStateDir(projectDir), HISTORY_FILENAME);
}

export function getConfigPath(projectDir: string) {
  return join(getStateDir(projectDir), CONFIG_FILENAME);
}

export function getMigrationManifestPath(projectDir: string) {
  return join(getStateDir(projectDir), MIGRATION_MANIFEST_FILENAME);
}

export function getProjectDocsDir(projectDir: string) {
  return join(getStateDir(projectDir), PROJECT_DOCS_DIRNAME);
}

export function getProjectFeedbackDir(projectDir: string) {
  return join(getStateDir(projectDir), PROJECT_FEEDBACK_DIRNAME);
}

export function ensureProjectStorageDirs(projectDir: string) {
  ensureDir(getProjectDocsDir(projectDir));
  ensureDir(getProjectFeedbackDir(projectDir));
}

export function ensureStateDir(projectDir: string) {
  const stateDir = getStateDir(projectDir);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
}

function getLegacyDocPath(projectDir: string, docName: WorkflowDocName) {
  return join(projectDir, DOC_FILENAMES[docName]);
}

export function getProjectScopedDocPath(
  projectDir: string,
  docName: WorkflowDocName,
) {
  return join(getProjectDocsDir(projectDir), DOC_FILENAMES[docName]);
}

export function resolveDocReadPath(
  projectDir: string,
  docName: WorkflowDocName,
) {
  const config = readWorkflowConfig(projectDir);
  const projectScoped = getProjectScopedDocPath(projectDir, docName);
  const legacy = getLegacyDocPath(projectDir, docName);

  if (config.docs.storage_mode === "project_scoped") {
    if (existsSync(projectScoped)) return projectScoped;
    if (config.docs.read_legacy && existsSync(legacy)) return legacy;
    return projectScoped;
  }

  if (existsSync(legacy)) return legacy;
  if (config.docs.read_legacy && existsSync(projectScoped))
    return projectScoped;
  return legacy;
}

export function resolveDocWritePath(
  projectDir: string,
  docName: WorkflowDocName,
) {
  const config = readWorkflowConfig(projectDir);
  if (config.docs.storage_mode === "legacy" && config.docs.write_legacy) {
    return getLegacyDocPath(projectDir, docName);
  }
  return getProjectScopedDocPath(projectDir, docName);
}

export function getFeedbackReadRoots(projectDir: string) {
  const config = readWorkflowConfig(projectDir);
  const roots = [getProjectFeedbackDir(projectDir)];
  if (config.docs.read_legacy) {
    roots.push(join(projectDir, "feedback"));
    roots.push(join(projectDir, ".claude", "feedback"));
  }
  return roots;
}
