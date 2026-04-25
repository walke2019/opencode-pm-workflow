import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { getConfigPath, getHistoryPath, ensureStateDir } from "./project.js";
import type {
  AutomationMode,
  DispatchAction,
  PermissionKey,
  WorkflowConfig,
} from "./types.js";

function nowIso() {
  return new Date().toISOString();
}

function appendConfigHistory(
  projectDir: string,
  payload: Record<string, unknown>,
) {
  ensureStateDir(projectDir);
  const historyPath = getHistoryPath(projectDir);
  const historyDir = historyPath.replace(/[\\/][^\\/]+$/, "");
  if (!existsSync(historyDir)) {
    mkdirSync(historyDir, { recursive: true });
  }
  const line = `${JSON.stringify({ at: nowIso(), ...payload })}\n`;
  writeFileSync(
    historyPath,
    existsSync(historyPath) ? readFileSync(historyPath, "utf-8") + line : line,
    "utf-8",
  );
}

export function defaultWorkflowConfig(): WorkflowConfig {
  return {
    retry: {
      max_attempts: 2,
      retryable_actions: [
        "collect-spec",
        "create-design-brief",
        "create-dev-plan",
        "start-development",
        "run-code-review",
        "continue-development",
      ],
    },
    fallback: {
      max_attempts: 1,
      enabled_actions: [
        "collect-spec",
        "create-design-brief",
        "create-dev-plan",
        "start-development",
        "run-code-review",
        "continue-development",
      ],
      agent_map: {
        plan: "build",
        build: "plan",
      },
    },
    permissions: {
      allow_execute_tools: false,
      allow_repair_tools: true,
      allow_release_actions: false,
    },
    confirm: {
      require_confirm_for_execute: true,
    },
    automation: {
      mode: "observe",
    },
    docs: {
      storage_mode: "project_scoped",
      read_legacy: true,
      write_legacy: false,
    },
  };
}

export function readWorkflowConfig(projectDir: string): WorkflowConfig {
  ensureStateDir(projectDir);
  const configPath = getConfigPath(projectDir);
  const defaults = defaultWorkflowConfig();

  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(defaults, null, 2));
    appendConfigHistory(projectDir, {
      type: "config.init",
      path: configPath,
    });
    return defaults;
  }

  try {
    const parsed = JSON.parse(
      readFileSync(configPath, "utf-8"),
    ) as Partial<WorkflowConfig>;
    const merged: WorkflowConfig = {
      retry: {
        ...defaults.retry,
        ...(parsed.retry || {}),
      },
      fallback: {
        ...defaults.fallback,
        ...(parsed.fallback || {}),
        agent_map: {
          ...defaults.fallback.agent_map,
          ...(parsed.fallback?.agent_map || {}),
        },
      },
      permissions: {
        ...defaults.permissions,
        ...(parsed.permissions || {}),
      },
      confirm: {
        ...defaults.confirm,
        ...(parsed.confirm || {}),
      },
      automation: {
        ...defaults.automation,
        ...(parsed.automation || {}),
      },
      docs: {
        ...defaults.docs,
        ...(parsed.docs || {}),
      },
    };
    const migrationTypes: string[] = [];
    if (!parsed.permissions)
      migrationTypes.push("config.migrate_permissions_v1");
    if (!parsed.confirm) migrationTypes.push("config.migrate_confirm_v1");
    if (!parsed.automation) migrationTypes.push("config.migrate_automation_v1");
    if (!parsed.docs) migrationTypes.push("config.migrate_docs_v1");

    if (migrationTypes.length > 0) {
      writeFileSync(configPath, JSON.stringify(merged, null, 2));
      for (const type of migrationTypes) {
        appendConfigHistory(projectDir, {
          type,
          permissions: merged.permissions,
          confirm: merged.confirm,
          automation: merged.automation,
          docs: merged.docs,
        });
      }
    }
    return merged;
  } catch {
    appendConfigHistory(projectDir, {
      type: "config.read_failed",
      path: configPath,
    });
    return defaults;
  }
}

export function getAutomationMode(projectDir: string) {
  return readWorkflowConfig(projectDir).automation.mode;
}

export function setPermission(
  projectDir: string,
  key: PermissionKey,
  value: boolean,
) {
  const config = readWorkflowConfig(projectDir);
  const previous = config.permissions[key];
  const next: WorkflowConfig = {
    ...config,
    permissions: {
      ...config.permissions,
      [key]: value,
    },
  };

  writeFileSync(getConfigPath(projectDir), JSON.stringify(next, null, 2));
  appendConfigHistory(projectDir, {
    type: "config.permission_updated",
    key,
    previous,
    next: value,
  });

  return next;
}

export function setAutomationMode(projectDir: string, mode: AutomationMode) {
  const config = readWorkflowConfig(projectDir);
  const previous = config.automation.mode;
  const next: WorkflowConfig = {
    ...config,
    automation: {
      ...config.automation,
      mode,
    },
  };

  writeFileSync(getConfigPath(projectDir), JSON.stringify(next, null, 2));
  appendConfigHistory(projectDir, {
    type: "config.automation_mode_updated",
    previous,
    next: mode,
  });

  return next;
}
