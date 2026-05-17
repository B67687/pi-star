<!-- Managed-By: AI-Prompting-Library -->
<!-- Template: CLAUDE -->

<!-- AGENTS.md is the canonical operating contract. This file is a
     Claude Code compatibility shim that delegates to AGENTS.md.
     Keep synchronized if AGENTS.md's startup order or key file refs change. -->

# Project Instructions

This file bridges Claude Code with the project's operating contract.

@AGENTS.md

## Startup Order
1. `session-state.json` --- active session state; read first on every resume
2. `AGENTS.md` --- full operating contract (this file delegates to it)
3. Task-specific files only when needed

## Key Files
| File | Purpose |
|------|---------|
| `session-state.json` | Active session state, current task, verification status |
| `AGENTS.md` | Canonical operating contract --- read this for full rules |
| `buglog.json` | Past bugs and fixes across sessions |
| `propagated/tools.sh` | Tool registry --- all agent-callable tools |
| `propagated/search-index.sh` | BM25 search across all text files |

## Quick Commands
```bash
bash ./propagated/tools.sh                   # Tool registry
bash ./propagated/session-status.sh          # Workspace orientation
bash ./propagated/search-index.sh "query"    # BM25 search
bash ./propagated/checkpoint-commit.sh -m "msg"  # Safe commit
```

## Commit Protocol
After any meaningful change, run:
```bash
bash ./propagated/checkpoint-commit.sh -m "summary of changes"
```

Never leave verified work uncommitted.
