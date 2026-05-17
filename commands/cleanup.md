---
description: Analyze and clean project disk bloat - caches, build artifacts, git bloat
---

Use this when disk space is tight, builds feel slow, or you want to
reclaim space in the current project.

`/cleanup`                - scan only (dry run)
`/cleanup --apply`        - apply safe cleanups (git gc, build/, npm cache)
`/cleanup --aggressive`   - apply + clean big artifacts

First run the scanner:

```bash
bash ./scripts/cleanup-project.sh "$ARGUMENTS"
```

The scanner checks:
- **Git** - loose objects, pack size, prune-packable objects
- **Node.js** - node_modules, npm cache
- **Gradle** - cache directories
- **Dart and Flutter** - .dart_tool, build/ artifacts
- **Rust** - target/ directory
- **Python** - __pycache__, virtual envs
- **Build artifacts** - build/, dist/, .next/, coverage/

In `--apply` mode, it runs:
- `git gc --aggressive --prune=now` (if prune-packable objects exist)
- Cleans Flutter `build/` (if >10MB)
- Cleans npm cache, pip cache

Return the results as:
- **Size before and after** for each cleaned area
- **Total reclaimed**
- **Residual risk** (none for safe cleanups)
- **Leftover recommendations** (user-decision items)
