---
description: High-risk PM workflow lane with stronger review and automation posture
agent: pm_workflow_caocao
subtask: true
---

Use the pm-workflow runtime as the single source of truth.

Requirements:
1. Analyze the user task before choosing any specialist.
2. Pass lane context equivalent to:
   - lane=full
   - risk=high
   - automation=elevated
   - topologyVerbosity=structured
   - reviewExpectation=strict
3. Create phased todo tracking by default.
4. If a specialist is required, dispatch through PM orchestration; do not bypass directly to the specialist as the lane entry.
5. Minimize unnecessary user confirmations while preserving stricter review posture.
