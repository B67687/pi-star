---
description: Turn the researched task into an explicit implementation plan
argument-hint: "<task>"
---
This is planning mode only.

Use the existing research context if it is already good. If not, say that research is incomplete and stop.

Run the prompt contract:
`bash ./prompt-contract.sh "$ARGUMENTS" --phase plan`

Before planning, run:
`bash ./plan-guard.sh "$ARGUMENTS"`

If the guard says `Plan decision: go-back`, stop and send the task back exactly one phase.

If the guard says `Plan decision: first-slice-only` or `Plan decision: stop-refining`, produce only: a coarse milestone ladder (≤5), one detailed next slice (≤5 steps), the verification target, and the next command.

Do not implement yet.

Return a compact plan with: the exact files that should change, the step-by-step sequence, the verification command or check for each step, what is explicitly out of scope, and where to checkpoint between phases.
