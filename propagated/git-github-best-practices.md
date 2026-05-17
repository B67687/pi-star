<!-- Managed-By: AI-Prompting-Library -->
<!-- Template: Git-GitHub-Best-Practices -->
# Git & GitHub Best Practices

Principles for working effectively with Git and GitHub.

## Essential Rules

### Before Editing
1. **Fetch first** --- Always `git fetch` to see what's changed
2. **Check your branch** --- Know where you are relative to remote
3. **Never push with conflicts** --- Resolve locally first
4. **Read contribution guidance first** --- Read `CONTRIBUTING.md` before preparing a PR or upstream-facing change. If it does not exist, read the closest equivalent guidance in the repo `README`, maintainer docs, or `meta/`.

### Commit Messages
- **What** changed + **Why** (context)
- Imperative mood: "Add feature" not "Added feature"
- One logical change per commit

### Branching
- Keep branches short-lived (hours/days, never weeks)
- Clear names: `feature/user-auth`, `fix/login-loop`
- Main branch stays deployable

### For AI Agents
- Always confirm repo state is current before editing
- Check `git status` before committing
- Never assume remote is in sync with local

## Key Commands

```bash
# Before starting work
git fetch
git status

# Before committing
git diff
git log --oneline -5

# Create meaningful commit
git add -A
git commit -m "Add user authentication - enables login flow with OAuth"
```

## Common Mistakes to Avoid

- Working on stale branches (always fetch first)
- Committing incomplete work ("just for backup")
- Pushing with unresolved conflicts
- Using vague commit messages ("fix", "update", "changes")
