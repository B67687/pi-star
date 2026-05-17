---
description: Decide whether optimization should happen now and at what scope
argument-hint: "<task>"
---
Use this when the task is about speed, memory, architecture performance, or suspected bottlenecks.

First run:
`bash ./optimize-gate.sh "$ARGUMENTS"`

Then return a compact optimization note with: the optimization scope, the evidence class, whether to wait/measure/optimize/review, the smallest level that should change, the proof required, and the next command.
