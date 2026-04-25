import { appendFileSync, existsSync, readFileSync } from "fs";
import { ensureStateDir, getHistoryPath } from "./project.js";
import type { WorkflowHistoryEvent, WorkflowState } from "./types.js";

function nowIso() {
  return new Date().toISOString();
}

export function appendHistory(
  projectDir: string,
  payload: Record<string, unknown>,
) {
  ensureStateDir(projectDir);
  const historyPath = getHistoryPath(projectDir);
  appendFileSync(
    historyPath,
    `${JSON.stringify({ at: nowIso(), ...payload })}\n`,
    "utf-8",
  );
}

export function readHistory(projectDir: string): WorkflowHistoryEvent[] {
  const historyPath = getHistoryPath(projectDir);
  if (!existsSync(historyPath)) return [];

  return readFileSync(historyPath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as WorkflowHistoryEvent;
      } catch {
        return { type: "history.parse_failed", raw: line };
      }
    });
}

export function queryHistory(
  projectDir: string,
  options: {
    type?: string;
    action?: string;
    agent?: string;
    limit?: number;
  } = {},
) {
  const limit = Math.max(1, Math.min(100, options.limit || 20));
  const events = readHistory(projectDir).filter((event) => {
    if (options.type && event.type !== options.type) return false;
    if (options.action && event.action !== options.action) return false;
    if (options.agent && event.agent !== options.agent) return false;
    return true;
  });

  return events.slice(-limit).reverse();
}

export function getLastFailure(projectDir: string) {
  const events = readHistory(projectDir).reverse();
  return (
    events.find(
      (event) => typeof event.exitCode === "number" && event.exitCode !== 0,
    ) || null
  );
}

export function ensureHistoryBootstrap(
  projectDir: string,
  state: WorkflowState,
) {
  const historyPath = getHistoryPath(projectDir);
  if (existsSync(historyPath)) return;

  appendHistory(projectDir, {
    type: "state.bootstrap_history",
    stage: state.stage,
    review: state.review.status,
  });
}
