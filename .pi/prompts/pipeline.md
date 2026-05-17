---
description: Subagent-driven pipeline --- dispatch each plan task to an isolated @worker subagent
argument-hint: "<plan-title> task1 task2 ..."
---

## When to use

Use this when a plan has 3+ well-defined, independent tasks that can be implemented in isolation. Each task gets its own fresh subagent context.

Do NOT use for: single-file changes, tightly coupled tasks, exploration, or research.

## Usage

**Step 1: Init**

`bash ./pipeline-run.sh init "Plan title" "Task 1" "Task 2"`

**Step 2: Loop per task**

1. `bash ./pipeline-run.sh next <id>` --- get next pending task
2. Dispatch to `@worker` subagent via `task` tool
3. Review worker output
4. `bash ./pipeline-run.sh update <id> <task> done|failed "notes"`

**Step 3: Completion**

Report summary when all tasks done.
