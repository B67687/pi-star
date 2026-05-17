---
description: Decide whether optimization should happen now and at what scope
---

Use this when the task is about speed, memory, architecture performance, or suspected bottlenecks.

Pass the plain task on the same line, like:
`/optimize reduce the cost of this architecture bottleneck`

First run:
`bash ./scripts/optimize-gate.sh "$ARGUMENTS"`

Then return a compact optimization note with:
- the optimization scope
- the evidence class
- whether to wait, measure first, optimize now, or do an architecture review
- the smallest level that should change
- the proof required
- the next command to use
