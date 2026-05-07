# Subagent Dispatch Migration

## Problem

Some specialist agents are configured as subagents, but older dispatch flows built primary-path commands for them.

## Migration

1. Resolve agent invocation semantics from workflow config.
2. Use primary-path commands only for `primary` or `all` agents.
3. Use subagent-safe task/session routing for `subagent` agents.
4. Keep PM as the only lane entrypoint.

## Why this matters

- It prevents specialist subagents from being invoked through the wrong primary path.
- It preserves `pm_workflow_caocao` as the single orchestrator.
- It keeps lane commands as thin UX wrappers instead of creating a second runtime.
