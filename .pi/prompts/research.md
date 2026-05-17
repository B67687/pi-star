---
description: Run the research phase only, with no file edits
argument-hint: "<task>"
---
This is research mode only.

First, read the normal startup files for the repo.

Run the prompt contract:
`bash ./prompt-contract.sh "$ARGUMENTS" --phase research`

If the folder is unfamiliar or the request is broad, run:
`bash ./repo-map.sh .`

Then use:
`bash ./retrieve-context.sh "$ARGUMENTS"`
when it helps narrow the local context.

Do not edit files yet.

Return a compact research note covering: the exact files involved, the relevant flow or dependencies, the main risks or edge cases, and what needs to be true before planning.
