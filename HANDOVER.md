# Pi-Star Session Handover

## North Star

> Build the best agent harness based on research — studying existing tools as
> data points, letting evidence dictate architecture. Governed by phase-discipline
> methodology. Cheap enough to self-iterate. Used to build the next version.

**Strategy**: OpenCode (agentic-workflows) is the development harness. Design
and harden concepts there first, then port patterns to Pi-Star's extension
architecture. Goal: strengthen both until Pi-Star can self-iterate, then shift.

## Current State

| Repo | Branch | Status |
|------|--------|--------|
| pi-star | main | All pushed, 14 extensions live |
| agentic-workflows | feat/decomposition-enforcement | PR #19 open (ahead of main) |

```bash
# Liveliness
pi-star --print "hello"    # quick check
bash scripts/goal-tree.sh current  # see active goal
```

## Active Goal Tree

Full tree: `.runtime/goal-tree.json` (agentic-workflows) or
`~/.pi/runtime/goal-tree.json` (Pi-Star).

```
Pi-Star Mastery
├── Goal Tree System ← ACTIVE (3 remaining subtasks)
├── Determinism Framework
├── Code Quality
├── Change Visibility
├── Reliability
└── Daily Use
```

## Last Session (2026-05-18 — B + A + C)

Built across 3 items, all following research→plan→implement→verify:

**B — Decomposition Enforcement** ✅
- `decomposition-gate.sh`: generate/validate milestone ladders
- Gate plugin in `phase-gate.sh`, step in `decision-pipeline plan→implement`
- Ported to Pi-Star: `/milestone-ladder` command, `set-phase` blocks plan→implement
- Commits: agentic-workflows `208189d`, pi-star `61e275e6`

**A — Workflow Self-Check** ✅
- `workflow-check.sh`: deterministic validation of `workflow-state.json`
- `--json` and `--fix` modes, exit codes 0/1/2
- Ported to Pi-Star: `/workflow-check` command validates governance-state.json
- Commits: agentic-workflows `a2fbef7`, pi-star on main

**C — Integration Tests** ✅
- `scripts/pi-star-dry-run-test.ts`: loads all 14 extensions with mock API
- Caught TDZ bug in governance-layer.ts (`MILESTONE_LADDER_FILE` before `STATE_DIR`)
- All 14 pass: 24 commands, 8 tools, 20 hooks

**Goal Tree System** ⏳ (this session, in progress)
- `scripts/goal-tree.sh`: init/branch/close/cancel/status/current
- Session-start integration: tree path displayed at session start
- HANDOVER restructured to 200 lines (this file)
- Remaining: Port to Pi-Star

## Key Links

| Doc | Location | Purpose |
|-----|----------|---------|
| Goal tree (raw) | `.runtime/goal-tree.json` | Full macro/meso/micro tree |
| Architecture | `ARCHITECTURE.md` (pi-star) | 5-layer design, 11 tools analyzed |
| All extensions | `.pi/extensions/*.ts` | 14 total, all 5 layers + utilities |
| Root workflow | `workflow.d/root.yaml` (agentic-workflows) | Entry point for all work |

## Commands

```bash
# OpenCode
bash scripts/goal-tree.sh status     # show full goal tree
bash scripts/goal-tree.sh current    # active path to root
bash scripts/goal-tree.sh branch <p> <t>  # branch new sub-goal
bash scripts/workflow-check.sh       # validate workflow state
bash scripts/decomposition-gate.sh validate  # check milestone ladder

# Pi-Star
pi-star --print "hello"
/phase          # show governance phase
/milestone-ladder validate  # check decomposition
/workflow-check             # validate governance state
/goal-tree status           # show goal tree (when ported)
```
