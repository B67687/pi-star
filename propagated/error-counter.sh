#!/usr/bin/env bash
# =============================================================================
# error-counter.sh --- Error counter with human escalation (12-factor F9)
#
# Tracks consecutive failures per operation and escalates to a human after
# N failed attempts. Implements the "compact errors into context window"
# pattern: errors feed back into context for self-healing, with a counter
# to prevent infinite retry loops.
#
# Usage:
#   bash $(basename "$0") increment <operation> [error-message]
#     Increment the error counter for an operation.
#     If count >= threshold (default: 3), escalates to human via A2H.
#
#   bash $(basename "$0") check <operation>
#     Show current count and escalation status.
#
#   bash $(basename "$0") reset <operation>
#     Reset counter (call on success).
#
#   bash $(basename "$0") context <operation>
#     Output error context in compact XML format (for feeding into LLM context).
#
#   bash $(basename "$0") list
#     Show all tracked operations.
#
# Environment:
#   ERROR_THRESHOLD  Max retries before escalation (default: 3)
#
# Principle: "Add error counters to prevent infinite retry loops. Escalate
# to humans after N consecutive failures."
#   --- 12-Factor Agents, Factor 9
# =============================================================================

set -euo pipefail
trap 'echo "[ERROR] $BASH_SOURCE:$LINENO"' ERR

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COUNTER_DIR="$REPO_ROOT/.runtime/error-counter"
mkdir -p "$COUNTER_DIR"

THRESHOLD="${ERROR_THRESHOLD:-3}"

CMD="${1:-help}"
shift || true

usage() {
  cat <<'EOF'
Usage:
  error-counter.sh increment <operation> [error-message]
    Increment counter. Escalate to human after threshold.

  error-counter.sh check <operation>
    Show current count and escalation status.

  error-counter.sh reset <operation>
    Reset counter (on success).

  error-counter.sh context <operation>
    Output compact XML error context for LLM consumption.

  error-counter.sh list
    Show all tracked operations.

Environment:
  ERROR_THRESHOLD    Max retries before escalation (default: 3)
EOF
}

# Path for a counter file
counter_path() {
  local operation="$1"
  # Sanitize operation name for filename
  local safe_name
  safe_name=$(echo "$operation" | python3 -c "
import sys, re
name = sys.stdin.read().strip()
safe = re.sub(r'[^a-zA-Z0-9_-]', '_', name)
print(safe[:64])
" 2>/dev/null || echo "unknown")
  echo "$COUNTER_DIR/$safe_name.json"
}

# Load counter data
load_counter() {
  local file="$1"
  if [ -f "$file" ]; then
    cat "$file"
  else
    echo '{"count": 0, "last_error": "", "last_failure": null, "created": null}'
  fi
}

# Escalate to human after threshold reached
escalate() {
  local operation="$1"
  local count="$2"
  local error_msg="$3"

  echo "  [escalate] Operation '$operation' failed $count times (threshold: $THRESHOLD)"
  echo "  [escalate] Escalating to human..."

  # Try A2H contact if available
  if [ -f "$SCRIPT_DIR/a2h-contact.sh" ]; then
    bash "$SCRIPT_DIR/a2h-contact.sh" approve \
      "retry-$operation" \
      "{\"operation\": \"$operation\", \"failures\": $count, \"last_error\": $(echo "$error_msg" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()[:500]))" 2>/dev/null || echo "\"\"")}" \
      --urgency high --channel cli 2>&1 || true
  fi

  # Always write escalation notice
  local escalation_dir="$REPO_ROOT/.runtime/error-counter/escalations"
  mkdir -p "$escalation_dir"
  local timestamp
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local esc_file="$escalation_dir/$(echo "$operation" | tr ' /' '__')-$timestamp.json"
  cat > "$esc_file" <<EOF
{
  "operation": $(echo "$operation" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),
  "failures": $count,
  "threshold": $THRESHOLD,
  "timestamp": "$timestamp",
  "last_error": $(echo "$error_msg" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()[:500]))")
}
EOF
  echo "  [escalate] Escalation recorded: $esc_file"
}

# --- Commands ---

do_increment() {
  local operation="$1"
  local error_msg="${2:-unknown error}"
  local file
  file=$(counter_path "$operation")
  local timestamp
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Read current or create new
  local counter_data
  counter_data=$(load_counter "$file")
  local count
  count=$(echo "$counter_data" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('count', 0))" 2>/dev/null || echo "0")
  local created
  created=$(echo "$counter_data" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('created') or '$timestamp')" 2>/dev/null || echo "$timestamp")

  count=$((count + 1))

  # Write updated counter
  python3 - "$file" "$count" "$error_msg" "$timestamp" "$created" <<'PY'
import json, sys

file = sys.argv[1]
count = int(sys.argv[2])
error = sys.argv[3]
ts = sys.argv[4]
created = sys.argv[5]

data = {
    "operation": file.split("/")[-1].replace(".json", ""),
    "count": count,
    "last_error": error[:500],
    "last_failure": ts,
    "created": created,
    "threshold": int(sys.argv[6]) if len(sys.argv) > 6 else 3
}

with open(file, "w") as f:
    json.dump(data, f, indent=2)

print(f"Error count for {data['operation']}: {count}")
PY

  # Check threshold
  if [ "$count" -ge "$THRESHOLD" ]; then
    escalate "$operation" "$count" "$error_msg"
    return 2  # escalation triggered
  fi

  echo "  Retries remaining: $((THRESHOLD - count)) before escalation"
  return 0
}

do_check() {
  local operation="$1"
  local file
  file=$(counter_path "$operation")

  if [ ! -f "$file" ]; then
    echo "No errors recorded for: $operation"
    return 0
  fi

  python3 - "$file" "$THRESHOLD" <<'PY'
import json, sys

with open(sys.argv[1]) as f:
    d = json.load(f)

threshold = int(sys.argv[2])
count = d.get("count", 0)
needs_escalation = count >= threshold

print(f"Operation: {d.get('operation', '?')}")
print(f"  Consecutive failures: {count}")
print(f"  Threshold: {threshold}")
print(f"  Escalation needed: {'YES' if needs_escalation else 'no'}")
print(f"  Last failure: {d.get('last_failure', 'never')}")
print(f"  Last error: {str(d.get('last_error', ''))[:80]}")
PY
}

do_reset() {
  local operation="$1"
  local file
  file=$(counter_path "$operation")

  if [ -f "$file" ]; then
    rm "$file"
    echo "Reset error counter for: $operation"
  else
    echo "No counter found for: $operation"
  fi
}

do_context() {
  local operation="$1"
  local file
  file=$(counter_path "$operation")

  if [ ! -f "$file" ]; then
    echo "<!-- no errors for $operation -->"
    return 0
  fi

  # Output compact XML for LLM context window
  python3 - "$file" <<'PY'
import json, sys

with open(sys.argv[1]) as f:
    d = json.load(f)

count = d.get("count", 0)
error = d.get("last_error", "")[:200]
ts = d.get("last_failure", "")

print(f"<error_counter operation=\"{d.get('operation', '?')}\">")
print(f"  <consecutive_failures>{count}</consecutive_failures>")
if error:
    import xml.sax.saxutils as saxutils
    print(f"  <last_error>{saxutils.escape(error)}</last_error>")
if ts:
    print(f"  <last_failure>{ts}</last_failure>")
threshold = d.get('threshold', 3)
print(f"  <action>{'ESCALATE_TO_HUMAN' if count >= threshold else 'retry_possible'}</action>")
print("</error_counter>")
PY
}

do_list() {
  echo "=== Error Counters ==="
  local found=false
  for f in "$COUNTER_DIR"/*.json; do
    [ -f "$f" ] || continue
    found=true
    python3 - "$f" "$THRESHOLD" <<'PY'
import json, sys

with open(sys.argv[1]) as f:
    d = json.load(f)

count = d.get("count", 0)
threshold = int(sys.argv[2])
needs_esc = "ESCALATE" if count >= threshold else "ok"

print(f"  [{needs_esc}] {d.get('operation', '?')}")
print(f"    failures: {count}/{threshold}")
print(f"    last: {d.get('last_failure', 'never')}")
PY
  done

  # Check escalation records
  local esc_dir="$COUNTER_DIR/escalations"
  if [ -d "$esc_dir" ]; then
    local esc_count
    esc_count=$(ls "$esc_dir"/*.json 2>/dev/null | wc -l | tr -d ' ')
    if [ "$esc_count" -gt 0 ]; then
      echo ""
      echo "  Escalations recorded: $esc_count"
      echo "  See: $esc_dir/"
    fi
  fi

  if ! $found; then
    echo "  No tracked operations."
  fi
}

# --- Main dispatch ---
case "$CMD" in
  increment|inc)
    if [ $# -lt 1 ]; then
      echo "ERROR: operation name required" >&2
      usage >&2
      exit 2
    fi
    do_increment "$@"
    ;;
  check)
    if [ $# -lt 1 ]; then
      echo "ERROR: operation name required" >&2
      usage >&2
      exit 2
    fi
    do_check "$1"
    ;;
  reset)
    if [ $# -lt 1 ]; then
      echo "ERROR: operation name required" >&2
      usage >&2
      exit 2
    fi
    do_reset "$1"
    ;;
  context)
    if [ $# -lt 1 ]; then
      echo "ERROR: operation name required" >&2
      usage >&2
      exit 2
    fi
    do_context "$1"
    ;;
  list)
    do_list
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "Unknown command: $CMD" >&2
    usage >&2
    exit 2
    ;;
esac
