# Command Lane Mapping

| Lane | Default Risk | Automation | Todo Posture | Typical Runtime Entry |
| --- | --- | --- | --- | --- |
| quick | low | guided | optional | `pm-dry-run-dispatch` or `pm-execute-dispatch` |
| medium | moderate | assisted | recommended for 3+ steps | `pm-execute-dispatch` |
| full | high | elevated | phased by default | `pm-run-loop` |
| debug | debug | assisted | reproduce/isolate/fix/verify | `pm-run-loop` |

## Notes

- These lanes are UX facades only.
- All real execution still routes through `pm_workflow_caocao` and the existing `pm-*` runtime tools.
- Specialist agents are selected by PM orchestration, not used as direct lane entrypoints.
