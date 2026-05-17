---
description: Implement only after the plan is clear
argument-hint: "<task>"
---
This is implementation mode.

Only proceed if the task already has enough research and a clear plan. If not, stop and say whether `research` or `plan` should happen first.

Run the prompt contract:
`bash ./prompt-contract.sh "$ARGUMENTS" --phase implement`

Before implementation, run:
`bash ./implement-preflight.sh "$ARGUMENTS"`

If `Implement decision: block`, do not implement. Send the task back exactly one phase.

If `Implement decision: caution`, fix the checkout state first or move the work into a worktree before implementing.

Keep the active context narrow. Execute in small verified slices. Review each change before moving to the next.

Do not silently expand the slice. If the current slice is no longer the right one, stop and go back to `/plan`.
