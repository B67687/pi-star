---
description: Subagent-driven pipeline --- dispatch each plan task to an isolated @worker subagent
---

## When to use

Use this when a plan has 3+ well-defined, independent tasks that can be implemented in isolation. Each task gets its own fresh subagent context. The pipeline orchestrates: dispatch -> implement -> review -> integrate.

Do NOT use for:
- Single-file changes (just use `/implement` directly)
- Tightly coupled tasks that share deep context (one `/implement` session is better)
- Exploration or research (use `/research` instead)

## How it works

```
1. You have a plan with explicit tasks (from /plan)
2. Run /pipeline to create the pipeline state
3. Agent spawns a @worker subagent per task
4. Each worker implements in isolation
5. Agent reviews worker output, updates state
6. After all tasks: completion summary
```

## Usage

**Step 1: Init (create pipeline state from plan)**

`bash ./scripts/pipeline-run.sh init "Plan title" "Task 1 description" "Task 2 description"`

Run this with the task descriptions from your `/plan` output.

Then for each task, **loop**:

**Step 2: Get next task**

`bash ./scripts/pipeline-run.sh next <pipeline-id>`

**Step 3: Dispatch to subagent**

Use the `task` tool to spawn a `@worker` subagent:

```
Task(description="implement step N", prompt="...", subagent_type="worker")
```

The worker prompt must include the task description, files to modify, verification target, and constraint: "Implement only this task. Do not expand scope."

**Step 4: Review and update**

After the worker returns:
1. Read the worker's output
2. Verify against the plan's spec and verification target
3. Run: `bash ./scripts/pipeline-run.sh update <pipeline-id> <task-id> done|failed "notes"`

**Step 5: Continue or resolve**

- If success: repeat from Step 2
- If failed: fix and retry, or skip

**Step 6: Pipeline complete**

Report completion summary with files created/modified, verification results, and any issues.

## State management

Pipeline state lives in `.runtime/pipeline/<pipeline-id>.json`. Commands:

| Command | Function |
|---|---|
| `pipeline-run.sh list` | Show all pipelines |
| `pipeline-run.sh status <id>` | Show detailed pipeline status |
| `pipeline-run.sh update <id> <task> <status>` | Update task status |
| `pipeline-run.sh next <id>` | Get the next pending task |

## When it goes wrong

- **Worker returns bad code:** Set task status to "failed" with notes. Spawn a new worker or fix manually.
- **Task is no longer needed:** Set to "skipped".
- **Pipeline is blocked:** Investigate, fix, set status back to "pending", continue.
- **Context pressure:** Use checkpoint before continuing.
