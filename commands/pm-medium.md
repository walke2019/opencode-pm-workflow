---
description: Medium-risk PM workflow lane with structured dispatch summaries
agent: pm_workflow_caocao
subtask: true
---

Use the pm-workflow runtime as the single source of truth.

Requirements:
1. Analyze the user task before choosing any specialist.
2. Pass lane context equivalent to:
   - lane=medium
   - risk=moderate
   - automation=assisted
   - topologyVerbosity=structured
   - reviewExpectation=standard
3. Prefer todo creation when the task needs 3 or more steps.
4. If a specialist is required, dispatch through PM orchestration; do not bypass directly to the specialist as the lane entry.
5. Minimize unnecessary user confirmations.
