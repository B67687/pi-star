# Workflow Definition Schema (v1)

> A YAML-based state machine format for session-scoped workflow execution.
> Each file in `workflow.d/` defines one workflow as an ordered list of steps.
> The agent reads the current workflow at session start, advances through steps,
> and persists state to `workflow-state.json`.

---

## File Format

```yaml
# workflow.d/<name>.yaml

id: <string>              # unique workflow identifier
description: <string>     # what this workflow does
next: <path>              # optional — next workflow to propose on completion

steps:
  - id: <string>          # unique step identifier within this workflow
    kind: deterministic | deliberative
    script: <path>        # only for deterministic — path relative to repo root
    description: <string> # what this step does (for the agent)
    branches:             # optional — only for branching workflows
      <result>: <target>  # result → next step id or "workflow/<name>.yaml"
```

## Rules

1. **Linear by default.** If a step has no `branches`, the agent advances to the next step in the list on completion.
2. **Deterministic steps** run a script, capture stdout as `result`. The agent does not converse — it executes, reads, advances.
3. **Deliberative steps** have no script. The agent reasons, proposes options, and goes back and forth with the user until consensus. The `result` is the agreed outcome.
4. **Branches** replace the linear advance. The agent matches the step result against branch keys and follows the target (next step id or another workflow file).
5. **Context passing.** The agent writes step results to `workflow-state.json` under `context`. Subsequent steps read from context to know what to do.
6. **Resume.** If `workflow-state.json` has an active workflow at session start, the agent resumes at the current step instead of reading root.
7. **Completion proposes next.** When all steps complete, check `next:`. If set, the agent proposes to the user: "X is done. Proceed to Y?" User authorizes or redirects. This keeps the cycle flowing without re-entering root.

## Step Lifecycle

```
1. Agent reads current step from workflow-state.json
2. If deterministic: run script, capture output
   If deliberative: reason, propose, back-and-forth until consensus
3. Save result to workflow-state.json (context + trace entry)
4. If branches: follow matching branch
   Else: advance to next step in list
5. If no steps remain:
     If next: propose next workflow to user. User authorizes → load next.
     Else: mark workflow complete, report summary.
```

## Phase Cycle

The default cycle for complex tasks:

```
research  →  design  →  implement  →  verify  →  done
                ↑                              │
                └──────── needs_fixes ──────────┘
```

Each phase proposes the next. The user authorizes transitions. Unless the user rejects, the cycle completes naturally. The agent drives the process; the user steers.
