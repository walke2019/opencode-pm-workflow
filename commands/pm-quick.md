---
description: Low-risk PM workflow lane for quick guided progress
agent: pm_lead
subtask: true
---

Use the pm-workflow runtime as the single source of truth.

Requirements:
1. Analyze the user task before choosing any specialist.
2. Pass lane context equivalent to:
   - lane=quick
   - risk=low
   - automation=guided
   - topologyVerbosity=minimal
   - reviewExpectation=light
3. Keep todo creation optional unless the task clearly needs 3 or more steps.
4. If a specialist is required, dispatch through PM orchestration; do not bypass directly to the specialist as the lane entry.
5. Minimize unnecessary user confirmations.
