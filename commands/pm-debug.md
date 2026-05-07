---
description: Debug-focused PM workflow lane for reproduce isolate fix verify loops
agent: pm_workflow_caocao
subtask: true
---

Use the pm-workflow runtime as the single source of truth.

Requirements:
1. Analyze the user task before choosing any specialist.
2. Pass lane context equivalent to:
   - lane=debug
   - risk=debug
   - automation=assisted
   - topologyVerbosity=structured
   - reviewExpectation=standard
3. Prefer reproduce / isolate / fix / verify style todo tracking.
4. If a specialist is required, dispatch through PM orchestration; do not bypass directly to the specialist as the lane entry.
5. Minimize unnecessary user confirmations while preserving debugging clarity.
