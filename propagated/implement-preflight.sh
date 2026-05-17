#!/usr/bin/env bash
# =============================================================================
# implement-preflight.sh - Deterministic repo + phase preflight for implementation
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TASK=""
FETCH=true
SEPARATE_WORK=false
UPSTREAM_FACING=false
SIZE="medium"
CLARITY="mixed"
RISK="medium"
VERIFICATION="normal"
RESEARCH_DONE=false
PLAN_DONE=false
SCOPE_BOUNDED=false
VERIFICATION_KNOWN=false
CONTRIBUTION_READ=false

usage() {
  cat <<EOF
Usage: $(basename "$0") "task" [options]

Task intake options:
  --size light|medium|heavy
  --clarity clear|mixed|ambiguous
  --risk low|medium|high
  --verification simple|normal|unclear
  --separate-work
  --upstream-facing
  --no-fetch

Phase gate options:
  --research-done
  --plan-done
  --scope-bounded
  --verification-known
  --contribution-read
EOF
}

if [[ $# -eq 0 ]]; then
  usage >&2
  exit 2
fi

TASK="$1"
shift

INTAKE_ARGS=()
GATE_ARGS=(implement)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --size|--clarity|--risk|--verification)
      if [[ $# -lt 2 ]]; then
        echo "ERROR: missing value for $1" >&2
        usage >&2
        exit 2
      fi
      INTAKE_ARGS+=("$1" "$2")
      case "$1" in
        --size) SIZE="$2" ;;
        --clarity) CLARITY="$2" ;;
        --risk) RISK="$2" ;;
        --verification) VERIFICATION="$2" ;;
      esac
      shift 2
      ;;
    --separate-work)
      SEPARATE_WORK=true
      INTAKE_ARGS+=("$1")
      shift
      ;;
    --upstream-facing)
      UPSTREAM_FACING=true
      INTAKE_ARGS+=("$1")
      GATE_ARGS+=("$1")
      shift
      ;;
    --no-fetch)
      FETCH=false
      INTAKE_ARGS+=("$1")
      shift
      ;;
    --research-done|--plan-done|--scope-bounded|--verification-known|--contribution-read)
      GATE_ARGS+=("$1")
      case "$1" in
        --research-done) RESEARCH_DONE=true ;;
        --plan-done) PLAN_DONE=true ;;
        --scope-bounded) SCOPE_BOUNDED=true ;;
        --verification-known) VERIFICATION_KNOWN=true ;;
        --contribution-read) CONTRIBUTION_READ=true ;;
      esac
      shift
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

INTAKE_OUTPUT="$(bash "$SCRIPT_DIR/task-intake.sh" "$TASK" "${INTAKE_ARGS[@]}")"
GATE_OUTPUT="$(bash "$SCRIPT_DIR/phase-gate.sh" "${GATE_ARGS[@]}")"

extract_field() {
  local label="$1"
  local text="$2"
  printf '%s\n' "$text" | awk -F': ' -v key="$label" '$1 == key {print $2; exit}'
}

INTAKE_LANE="$(extract_field "Recommended lane" "$INTAKE_OUTPUT")"
GIT_LANE="$(extract_field "Git lane" "$INTAKE_OUTPUT")"
SAFE_TO_EDIT="$(extract_field "Safe to edit now" "$INTAKE_OUTPUT")"
INTAKE_NEXT="$(extract_field "Next command" "$INTAKE_OUTPUT")"
GATE_DECISION="$(extract_field "Decision" "$GATE_OUTPUT")"
GATE_REASON="$(extract_field "Reason" "$GATE_OUTPUT")"
GATE_NEXT="$(extract_field "Next" "$GATE_OUTPUT")"

IMPLEMENT_DECISION="allow"
IMPLEMENT_REASON="repo state and phase gate allow implementation"
IMPLEMENT_NEXT="proceed with implementation in small verified slices"

if [[ "$GATE_DECISION" == "block" ]]; then
  IMPLEMENT_DECISION="block"
  IMPLEMENT_REASON="$GATE_REASON"
  IMPLEMENT_NEXT="$GATE_NEXT"
elif [[ "$INTAKE_LANE" == "grill" ]]; then
  IMPLEMENT_DECISION="block"
  IMPLEMENT_REASON="task intake still routes this work to grill before implementation"
  IMPLEMENT_NEXT="$INTAKE_NEXT"
elif [[ "$INTAKE_LANE" == "research" ]]; then
  IMPLEMENT_DECISION="block"
  IMPLEMENT_REASON="task intake still routes this work to research before implementation"
  IMPLEMENT_NEXT="$INTAKE_NEXT"
elif [[ "$GIT_LANE" == "worktree" ]]; then
  IMPLEMENT_DECISION="caution"
  IMPLEMENT_REASON="implementation should move into an isolated worktree first"
  IMPLEMENT_NEXT="run /git-worktree branch-name before editing"
elif [[ "$SAFE_TO_EDIT" == "caution" ]]; then
  IMPLEMENT_DECISION="caution"
  IMPLEMENT_REASON="repo state needs a quick sanity check before editing"
  IMPLEMENT_NEXT="resolve the safety note from task intake, then rerun preflight"
fi

# --- Human-in-the-loop approval gate for high-risk operations (12-factor F7) ---
if [[ "$RISK" == "high" ]]; then
  APPROVAL_OUTPUT=$(bash "$SCRIPT_DIR/a2h-contact.sh" approve \
    "implement: $TASK" \
    "{\"size\": \"$SIZE\", \"risk\": \"$RISK\", \"clarity\": \"$CLARITY\"}" \
    --urgency high --channel cli 2>&1 || true)

  # Check if approval was granted (exit code 0 from approve with CLI = granted)
  if echo "$APPROVAL_OUTPUT" | grep -q "approved: true"; then
    IMPLEMENT_DECISION="allow"
    IMPLEMENT_REASON="human approved high-risk operation"
    IMPLEMENT_NEXT="proceed with implementation"
  elif echo "$APPROVAL_OUTPUT" | grep -q "Approved: True"; then
    IMPLEMENT_DECISION="allow"
    IMPLEMENT_REASON="human approved high-risk operation"
    IMPLEMENT_NEXT="proceed with implementation"
  elif echo "$APPROVAL_OUTPUT" | grep -q "pending"; then
    IMPLEMENT_DECISION="block"
    IMPLEMENT_REASON="high-risk operation awaiting human approval --- check .runtime/a2h/ for pending approvals"
    IMPLEMENT_NEXT="run: bash $SCRIPT_DIR/a2h-contact.sh list --pending"
  fi
fi

printf '%s\n' "$INTAKE_OUTPUT"
printf '%s\n' "$GATE_OUTPUT"
echo "Implement decision: $IMPLEMENT_DECISION"
echo "Implement reason: $IMPLEMENT_REASON"
echo "Implement next: $IMPLEMENT_NEXT"
