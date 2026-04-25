import { relative } from "path";
import {
  getAutomationMode,
  isAutomationCapabilityEnabled,
  syncState,
} from "../shared.js";
import {
  buildStagePrompt,
  checkReviewGate,
  extractChangedPathsFromPatch,
  isCodePath,
  log,
  type PluginContext,
  runPreCommitCheck,
  type TuiPromptOutput,
  type ToolInput,
  type ToolOutput,
  writeReviewMarker,
} from "./runtime.js";

export function createPmWorkflowHooks(projectDir: string, ctx: PluginContext) {
  return {
    event: async ({ event }: { event?: { type?: string } }) => {
      const mode = getAutomationMode(projectDir);
      const canSync = isAutomationCapabilityEnabled(mode, "event_sync");
      if (!canSync) return;

      if (event?.type === "session.created") {
        const status = syncState(projectDir);
        await log(ctx.client, "info", "pm-workflow stage detected", {
          stage: status.stage,
          review: status.review.status,
        });
      }

      if (event?.type === "session.idle") {
        syncState(projectDir);
        if (mode === "strict") {
          const stopGate = checkReviewGate(projectDir);
          if (!stopGate.ok) {
            await log(ctx.client, "warn", "review gate still pending", {
              projectDir,
              message: stopGate.message,
            });
          }
        }
      }
    },

    "tui.prompt.append": async (_input: unknown, output: TuiPromptOutput) => {
      const mode = getAutomationMode(projectDir);
      if (!isAutomationCapabilityEnabled(mode, "prompt_inject")) return;

      const stagePrompt = buildStagePrompt(projectDir);
      output.prompt = output.prompt
        ? `${output.prompt}\n\n${stagePrompt}`
        : stagePrompt;
    },

    "tool.execute.before": async (input: ToolInput, output: ToolOutput) => {
      const mode = getAutomationMode(projectDir);
      if (!isAutomationCapabilityEnabled(mode, "commit_gate")) return;

      if (input.tool !== "bash") return;

      const command = String(output.args?.command || "");
      if (!/\bgit\s+commit\b/.test(command)) return;

      const preCheck = runPreCommitCheck(projectDir);
      if (!preCheck.ok) {
        throw new Error(
          [
            "pm-workflow pre-commit gate blocked the commit.",
            preCheck.stdout.trim(),
            preCheck.stderr.trim(),
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
    },

    "tool.execute.after": async (input: ToolInput, _output: ToolOutput) => {
      const mode = getAutomationMode(projectDir);
      const allowReviewMarker = isAutomationCapabilityEnabled(
        mode,
        "review_marker",
      );
      const allowEventSync = isAutomationCapabilityEnabled(mode, "event_sync");

      if (input.tool === "edit" || input.tool === "write") {
        const filePath = String(input.args?.filePath || "");
        if (filePath && isCodePath(filePath)) {
          if (allowReviewMarker) {
            writeReviewMarker(projectDir);
          }

          if (allowEventSync) {
            syncState(projectDir);
          }

          await log(ctx.client, "info", "review marker updated", {
            filePath,
            relativePath: relative(projectDir, filePath),
            mode,
            reviewMarkerUpdated: allowReviewMarker,
          });
        }
        return;
      }

      if (input.tool === "apply_patch") {
        const patchText = String(input.args?.patchText || "");
        const changedPaths = extractChangedPathsFromPatch(patchText);
        if (
          allowReviewMarker &&
          changedPaths.some((filePath) => isCodePath(filePath))
        ) {
          writeReviewMarker(projectDir);
          if (allowEventSync) {
            syncState(projectDir);
          }
          await log(ctx.client, "info", "review marker updated from patch", {
            changedPaths,
            mode,
          });
        }
      }
    },
  };
}
