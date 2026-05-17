---
description: Git operations --- probe state before editing, create worktrees for parallel work
---

## Probe (check branch state before editing)

Run:
`bash ./scripts/git-session-start.sh`

Respond compactly with: current branch state, whether anything looks risky, whether the task should stay here or move to a worktree, and whether it is safe to begin edits now.

## Worktree (create isolated branch for parallel work)

Run:
`bash ./scripts/git-worktree-branch.sh "$ARGUMENTS"`

If `$ARGUMENTS` is empty, ask for the branch name in one short sentence.

Return: created branch name, created path, what kind of work should happen there, and note that the current checkout should stay clean while the isolated work happens there.

<rationalizations>
### Common Rationalizations
| Shortcut | Why It Fails |
|---|---|
| "I don't need to probe --- I just started" | Branch state may be surprising (detached HEAD, dirty tree, ahead of remote). Always probe. |
| "I'll work directly on main, it's safe" | Direct-to-main work blocks other changes and makes reverts harder. Use a branch or worktree. |
| "Worktrees are overkill for one file" | Isolated work prevents accidental cross-contamination between tasks. |

</rationalizations>

<red_flags>
### Red Flags
- Starting edits without checking git state first
- Working on main for non-trivial changes
- Dirty worktree at session start (incomplete previous work)
- Force-pushing or rewriting shared history
</red_flags>
