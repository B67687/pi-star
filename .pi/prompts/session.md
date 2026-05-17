---
description: Session lifecycle --- checkpoint, handoff, boundary, close, and finish
argument-hint: "[action] [phase-or-task]"
---
## Session Boundary (decide continue, checkpoint, or restart)

Run:
`bash ./session-boundary.sh $ARGUMENTS`

Return only: the decision, the reason, and the next action.

## Handoff (when work continues in a new session)

Run:
`bash ./handoff.sh "$ARGUMENTS" --phase unknown --turns 0`

Return a compact handoff packet with: goal, current phase, verified so far, key decisions, open risks, exact files, next command.

## Checkpoint (wrap up a verified phase)

First, run:
`bash ./checkpoint-review.sh $ARGUMENTS`

Then respond compactly with: what was completed, what must go into session-state.json, whether a checkpoint commit is appropriate now, and whether the next step should start in a new session.

If the review says `Checkpoint commit ready: yes`, run immediately:
`bash ./checkpoint-commit.sh -m "checkpoint summary"`

Do not ask. Commit is the default action after a verified phase.

## Close Task (classify and close a resolved task)

Supported outcomes: `fixed`, `obsolete`, `not-reproducible`, `wrong-framing`, `parked`.

Run:
`bash ./close-task.sh $ARGUMENTS`

Then respond compactly with: the closure classification, what must go into session-state.json, what prior path is now dead, and whether to archive, delete, or stop.

## Finish Task (close + checkpoint in one step)

Run:
`bash ./finish-task.sh $ARGUMENTS`

Return: closure classification, session-state.json updates, whether to commit, and whether to archive, delete, or stop.
