---
description: Default intake for any task --- classify, grill, shape, and slice as needed
---

Use this as the default first command for any serious task. The user states the goal in normal language; this file tells you how to handle it internally.

If the arguments accidentally begin with a slash command, treat that prefix as wrapper noise and classify only the underlying task.

## Default: Route

First run:
`bash ./scripts/task-intake.sh "$ARGUMENTS"`

Then respond compactly with:
- the recommended lane
- the goal horizon
- the iteration strategy
- the recommended git lane
- whether editing is safe now
- the next command to use

Prefer one next command or one immediate action. Do not return a menu unless the user needs to choose between materially different paths.

If the intake output looks too optimistic or too pessimistic, explain why briefly and correct it.

Based on the lane, follow the appropriate section below instead of generic output.

## Grill (when ambiguous or costly to misunderstand)

Use this when the request has multiple possible interpretations, wrong assumptions would create wasted code, or the task is expensive or upstream-facing.

Run:
`bash ./scripts/task-intake.sh "$ARGUMENTS"`

If the recommended lane is `grill`, challenge the assumptions:

1. What is the real goal --- not the stated request?
2. Who is this for, and what does "done" look like?
3. What constraints or boundaries are unstated?
4. What would be the worst thing to get wrong?

Then return a compact grilling note clarifying scope, hidden assumptions, and risks. Do not proceed to research or planning until the task is clear enough that wrong-direction risk is low.

If the output says normal planning is enough, recommend `/research $ARGUMENTS`.
If the output says grilling is needed, return the grilling note.
If the output says the task is misframed, explain why and recommend a correction.

## Shape Product (when the end-state is underspecified)

Use this when the final product experience is too broad, emotional, or underspecified to plan safely.

Run:
`bash ./scripts/product-shape.sh "$ARGUMENTS"`

Return a compact product-shaping note with:
- the final product promise in one plain sentence
- the most important fidelity anchors
- the most important edge cases
- what can be simplified in the first milestone
- the smallest proof that would make the direction feel real
- the next command to use

## North Star (for long-horizon goals)

Use this for long-horizon goals that should stay ambitious without turning into one giant execution plan.

Run:
`bash ./scripts/north-star.sh "$ARGUMENTS"`

Return a compact north-star note with:
- the big user-facing goal
- what must feel faithful
- what success would prove
- what should explicitly not be solved all at once
- the next command to use

## Task Tree (for goals too large to hold in one line)

Use this when the goal needs a map of workstreams before choosing the first milestone.

Run:
`bash ./scripts/task-tree.sh "$ARGUMENTS"`

Return a compact decomposition tree with:
- the one-line goal
- the major domains
- first milestone candidates per domain
- dependency order
- the recommended first milestone and slice
- the next command to use

Keep the tree coarse. Detail only the recommended first slice.

## Shape Milestone (when the north-star is clear)

Use this after the north-star is clear or when a big goal needs one meaningful next bet.

Run:
`bash ./scripts/milestone-shape.sh "$ARGUMENTS"`

Return a compact milestone note with:
- one milestone bet
- the appetite for that bet
- what proves the milestone was worth doing
- what is explicitly not in this milestone
- the first slice target
- the next command to use

## Slice (when the task is too large for one cycle)

Use this when the task is too large for one efficient cycle.

Run:
`bash ./scripts/task-slice.sh "$ARGUMENTS"`

Return a compact slice note with:
- a coarse milestone ladder with at most 5 milestones
- the first milestone in enough detail to execute next
- the stop line for what must wait
- the verification target for the first slice
- the next command to use

If the slice output says normal planning is enough, recommend `/plan $ARGUMENTS` instead.

<rationalizations>
### Common Rationalizations
| Shortcut | Why It Fails |
|---|---|
| "The request is clear enough" | Clear-seeming requests hide unstated constraints and implicit scope boundaries. Run intake. |
| "I'll figure out the stop line later" | Without explicit stop lines, scope creeps during implementation. Define "not now" before starting. |
| "All milestones are equally clear" | Only the first milestone should be detailed. Detailing the rest is false precision. |
| "This can be one big plan" | Oversized plans lose precision. Milestone ladder + one detailed first slice is more robust. |
| "Verification target can wait" | Undefined success criteria cause "done but wrong." Define what correct looks like before starting. |

</rationalizations>

<red_flags>
### Red Flags
- Proceeding to research or planning without stating any assumptions
- Accepting "fix the real problem" without asking what "fixed" looks like
- Producing a flat plan instead of a milestone ladder for a task >5 steps
- First slice has no explicit verification target
- Stop line is empty or says "nothing is out of scope"
</red_flags>
