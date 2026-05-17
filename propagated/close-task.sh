#!/usr/bin/env bash
# =============================================================================
# close-task.sh - Deterministic task closure classification
# =============================================================================

set -euo pipefail

OUTCOME=""
TASK=""
NOTE=""
OBSOLETE_PATHS=()

usage() {
  cat <<'EOF'
Usage: ./scripts/close-task.sh OUTCOME "task" [options]

Outcomes:
  fixed
  obsolete
  not-reproducible
  wrong-framing
  parked

Options:
  --note "extra closure note"
  --obsolete PATH
EOF
}

if [[ $# -lt 2 ]]; then
  usage >&2
  exit 2
fi

OUTCOME="$1"
TASK="$2"
shift 2

while [[ $# -gt 0 ]]; do
  case "$1" in
    --note)
      NOTE="${2:-}"
      shift 2
      ;;
    --obsolete)
      OBSOLETE_PATHS+=("${2:-}")
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$OUTCOME" in
  fixed|obsolete|not-reproducible|wrong-framing|parked) ;;
  *)
    echo "ERROR: invalid outcome: $OUTCOME" >&2
    usage >&2
    exit 2
    ;;
esac

CLOSURE_DECISION=""
MUST_RECORD=""
NEXT=""

case "$OUTCOME" in
  fixed)
    CLOSURE_DECISION="task is resolved in the current state"
    MUST_RECORD="what was actually verified, what prior path is now obsolete, and why the resolved path is trusted"
    NEXT="update session-state.json, prune obsolete branches, then checkpoint or archive"
    ;;
  obsolete)
    CLOSURE_DECISION="task is no longer worth pursuing because the original path is superseded"
    MUST_RECORD="what changed, which path is obsolete now, and what replaces it if anything"
    NEXT="update session-state.json, mark obsolete files or branches, then archive or delete low-value leftovers"
    ;;
  not-reproducible)
    CLOSURE_DECISION="the issue cannot currently be reproduced"
    MUST_RECORD="what was tested, what did not fail, and what conditions would reopen the task"
    NEXT="update session-state.json, keep only short evidence, then close the thread"
    ;;
  wrong-framing)
    CLOSURE_DECISION="the original question was aimed at the wrong layer or wrong mechanism"
    MUST_RECORD="the corrected framing, what prior assumptions were wrong, and the new task if one exists"
    NEXT="update session-state.json, prune the dead branch, then restart with the corrected task if needed"
    ;;
  parked)
    CLOSURE_DECISION="task remains open but is intentionally deferred"
    MUST_RECORD="why it is parked, what blocks it, and the exact trigger for resuming"
    NEXT="update session-state.json with a clean resume trigger, then stop active work"
    ;;
esac

echo "Outcome: $OUTCOME"
echo "Task: $TASK"
echo "Closure decision: $CLOSURE_DECISION"
echo "Must record: $MUST_RECORD"
if [[ ${#OBSOLETE_PATHS[@]} -gt 0 ]]; then
  echo "Obsolete paths:"
  printf '%s\n' "${OBSOLETE_PATHS[@]}"
fi
if [[ -n "$NOTE" ]]; then
  echo "Closure note: $NOTE"
fi
echo "Next: $NEXT"

# Worktree cleanup hint
if git rev-parse --git-common-dir 2>/dev/null | grep -q "worktrees"; then
  echo ""
  echo "ℹ  You're in a session worktree. When ready:"
  echo "   bash $(dirname "$0")/session-fork.sh --close"
fi
