---
description: Session lifecycle --- checkpoint, handoff, boundary, close, and finish
---

## Session Boundary (decide continue, checkpoint, or restart)

Use the repo's session-boundary helper when you need to decide whether to continue, checkpoint, or restart.

Run:
`bash ./scripts/session-boundary.sh $ARGUMENTS`

If `$ARGUMENTS` is empty, infer from the current phase and recent thread state as best you can, then run the helper with explicit flags (`phase`, `turns`, `verified`, `phase-change`, `topic-shift`, `quality-drop`, `task-complete`).

Return only: the decision, the reason, and the next action.

## Handoff (when work continues in a new session)

Use this before a new session, after compaction pressure rises, or when a phase ends but work is not fully done.

Run:
`bash ./scripts/handoff.sh "$ARGUMENTS" --phase unknown --turns 0`

Return a compact handoff packet with: goal, current phase, verified so far, key decisions, open risks, exact files, next command.
Keep the packet short. Preserve only what the next session needs.

## Checkpoint (wrap up a verified phase)

Use this at the end of a phase. If the task is actually over, obsolete, or misframed, use Close Task first so the ending gets classified cleanly.

First, run the deterministic checkpoint review:
`bash ./scripts/checkpoint-review.sh $ARGUMENTS`

Then respond compactly with: what was completed, what must go into session-state.json, whether a checkpoint commit is appropriate now, and whether the next step should start in a new session.

If the review says `Checkpoint commit ready: yes`, run immediately:
`bash ./scripts/checkpoint-commit.sh -m "checkpoint summary"`

Do not ask. Commit is the default action after a verified phase, not a suggestion.

## Close Task (classify and close a resolved task)

Use this when a task is effectively over and should be classified cleanly. Supported outcomes: `fixed`, `obsolete`, `not-reproducible`, `wrong-framing`, `parked`.

Run:
`bash ./scripts/close-task.sh $ARGUMENTS`

Then respond compactly with: the closure classification, what must go into session-state.json, what prior path is now dead or obsolete, and whether to archive, delete, or simply stop.

If the task is resolved or obsolete, prefer Close Task before the final Checkpoint.

## Finish Task (close + checkpoint in one step)

Use this when a task is truly over and you want both closure classification and checkpointing in one command.

Run:
`bash ./scripts/finish-task.sh $ARGUMENTS`

Then respond compactly with: the closure classification, what must go into session-state.json, what prior path is now obsolete, whether a checkpoint commit is appropriate now, and whether the next step should be archive, delete, or stop.

<rationalizations>
### Common Rationalizations
| Shortcut | Why It Fails |
|---|---|
| "I'll commit at the end" | Large commits hide bugs and make rollback impossible. Commit each verified phase. |
| "No need to checkpoint --- I'll remember" | Sessions degrade. session-state.json is the durable record. |
| "The task just faded out, no need to classify" | Unclassified tasks leave stale state. Always close or park explicitly. |
| "I can hand off by summarizing in chat" | Chat summaries degrade over handoffs. Use the structured handoff packet. |

</rationalizations>

<red_flags>
### Red Flags
- Leaving the session without updating session-state.json
- Ending a task without classifying it as fixed/obsolete/wrong-framing
- Handing off without a structured packet
- Skipping the checkpoint commit because "it's just a small change"
- Context degraded but continuing instead of restarting
</red_flags>
