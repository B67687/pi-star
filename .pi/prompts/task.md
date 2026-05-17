---
description: Default intake for any task --- classify, grill, shape, and slice as needed
argument-hint: "<task>"
---
Use this as the default first command for any serious task. The user states the goal in normal language; this file tells you how to handle it internally.

If the arguments accidentally begin with a slash command, treat that prefix as wrapper noise and classify only the underlying task.

## Default: Route

First run:
`bash ./task-intake.sh "$ARGUMENTS"`

Then respond compactly with: the recommended lane, the goal horizon, the iteration strategy, the recommended git lane, whether editing is safe now, and the next command to use.

Prefer one next command or one immediate action. Do not return a menu unless the user needs to choose between materially different paths.

Based on the lane, follow the appropriate section below instead of generic output.

## Grill (when ambiguous or costly to misunderstand)

Use this when the request has multiple possible interpretations, wrong assumptions would create wasted code, or the task is expensive or upstream-facing.

Run:
`bash ./task-intake.sh "$ARGUMENTS"`

If the recommended lane is `grill`, challenge the assumptions:
1. What is the real goal --- not the stated request?
2. Who is this for, and what does "done" look like?
3. What constraints or boundaries are unstated?
4. What would be the worst thing to get wrong?

Return a compact grilling note. Do not proceed until wrong-direction risk is low.

## Shape Product (when the end-state is underspecified)

Run:
`bash ./product-shape.sh "$ARGUMENTS"`

Return a compact product-shaping note with the final product promise, fidelity anchors, edge cases, simplification options, and the smallest proof of direction.

## North Star (for long-horizon goals)

Run:
`bash ./north-star.sh "$ARGUMENTS"`

Return a compact north-star note with the big goal, what must feel faithful, what success proves, and what not to solve all at once.

## Task Tree (for goals too large to hold in one line)

Run:
`bash ./task-tree.sh "$ARGUMENTS"`

Return a compact decomposition tree with major domains, first milestone candidates, dependency order, and the recommended first slice.

## Shape Milestone (when the north-star is clear)

Run:
`bash ./milestone-shape.sh "$ARGUMENTS"`

Return a compact milestone note with one bet, appetite, proof of worth, what's not in scope, and the first slice target.

## Slice (when the task is too large for one cycle)

Run:
`bash ./task-slice.sh "$ARGUMENTS"`

Return a compact slice note with a coarse milestone ladder (≤5), a detailed first milestone, stop line, and verification target.

If the slice output says normal planning is enough, recommend `/plan $ARGUMENTS` instead.
