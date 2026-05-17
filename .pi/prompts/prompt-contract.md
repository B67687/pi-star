---
description: Build a compact self-prompt contract before phase work
argument-hint: "<task>"
---
Use this internally before non-trivial research, planning, implementation, or review.

Run:
`bash ./prompt-contract.sh "$ARGUMENTS"`

Then use the output as a compact self-check: outcome, context, constraints, examples, verification, and ask/proceed policy.

Ask the user only when missing information would materially change the work. Otherwise proceed with stated assumptions.
