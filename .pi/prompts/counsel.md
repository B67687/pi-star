---
description: Multi-perspective review for product shaping, milestone selection, architecture, and tradeoffs
argument-hint: "<decision-or-task>"
---
## Gate (decide whether counsel is needed)

Run:
`bash ./counsel-gate.sh "$ARGUMENTS"`

Return: whether counsel is needed, the roles to use, the strongest supporting view, the strongest objection, the missing facts, and the compressed recommendation.

## Run (execute the counsel review)

First run dry:
`bash ./counsel-run.sh "$ARGUMENTS" --dry-run`

Only run live when user explicitly wants it:
`bash ./counsel-run.sh "$ARGUMENTS" --mode lite`

Return only the compressed recommendation, not intermediate model chatter.
