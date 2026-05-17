---
description: Git operations --- probe state before editing, create worktrees for parallel work
argument-hint: "[probe|worktree] [branch-name]"
---
## Probe (check branch state before editing)

Run:
`bash ./git-session-start.sh`

Respond compactly with: current branch state, whether anything looks risky, whether the task should stay here or move to a worktree, and whether it is safe to begin edits now.

## Worktree (create isolated branch for parallel work)

Run:
`bash ./git-worktree-branch.sh "$ARGUMENTS"`

Return: created branch name, created path, what kind of work should happen there, and note that the current checkout should stay clean.
