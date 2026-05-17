---
description: Multi-perspective review for product shaping, milestone selection, architecture, and tradeoffs
---

Use this for product shaping, milestone selection, architecture review, optimization review, or decisions that are expensive to misunderstand. Do not use for ordinary implementation unless the work is already split into separate bounded worktree tasks.

## Gate (decide whether counsel is needed)

Run:
`bash ./scripts/counsel-gate.sh "$ARGUMENTS"`

If counsel is needed and the user asks about model choice, run:
`bash ./scripts/counsel-model-select.sh lite`

Return a compact counsel note with: whether counsel is needed, the roles to use if needed, the decision being reviewed, the strongest supporting view, the strongest objection, the missing facts, the compressed recommendation, and the next command to use.

## Run (execute the counsel review)

Use this after the gate says counsel is useful and the decision is worth the extra model calls.

First run dry:
`bash ./scripts/counsel-run.sh "$ARGUMENTS" --dry-run`

Only run live when `OPENROUTER_API_KEY` is set and the user explicitly wants live counsel calls:
`bash ./scripts/counsel-run.sh "$ARGUMENTS" --mode lite`

Return only the compressed recommendation, not all intermediate model chatter, unless the user asks for the role views.

<rationalizations>
### Common Rationalizations
| Shortcut | Why It Fails |
|---|---|
| "I already know the answer" | Counsel surfaces blind spots one perspective always misses. |
| "Counsel takes too long" | A wrong decision costs 10x the counsel time. Use the gate to decide if it's needed. |
| "Only one model review is enough" | Divergent models catch different failure modes --- that's the point. |

</rationalizations>

<red_flags>
### Red Flags
- Using counsel for trivial implementation decisions
- Running counsel live without the user explicitly asking for it
- Summarizing intermediate model chatter instead of the compressed recommendation
</red_flags>
