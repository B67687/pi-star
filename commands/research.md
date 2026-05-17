---
description: Run the research phase only, with no file edits
---

This is research mode only.

First, read the normal startup files for the repo.

Run the prompt contract:
`bash ./scripts/prompt-contract.sh "$ARGUMENTS" --phase research`

If the folder is unfamiliar or the request is broad, run:
`bash ./scripts/repo-map.sh .`

Then use:
`bash ./scripts/retrieve-context.sh "$ARGUMENTS"`
when it helps narrow the local context.

Do not edit files yet.

Return a compact research note covering:
- the exact files involved
- the relevant flow or dependencies
- the main risks or edge cases
- what needs to be true before planning

<rationalizations>
### Common Rationalizations
| Shortcut | Why It Fails |
|---|---|
| "I know this repo already" | Repos change between sessions. Stale assumptions cause wrong file choices. |
| "I'll research as I implement" | Research mixed with edits creates confusion about what's fact vs guess. |
| "One quick grep is enough" | Surface-level search misses edge cases, hidden dependencies, and stale references. |
| "I can skip the repo map" | Unfamiliar folders need structural orientation before deep reading --- otherwise you read the wrong files first. |

</rationalizations>

<red_flags>
### Red Flags
- Starting to edit files before producing the research note
- Research note has no file paths or only guesses at dependencies
- Skipping repo-map on an unfamiliar folder
- "I already know this" without recent evidence
</red_flags>
