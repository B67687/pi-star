#!/usr/bin/env bash
# =============================================================================
# a2h-contact.sh --- Agent-to-Human contact protocol (12-factor F7, A2H spec)
#
# Implements the core A2H pattern: agents contact humans as a tool call.
# Supports human contacts (questions) and function approvals (authorization).
#
# Usage:
#   bash $(basename "$0") contact <message> [options]
#     Create a human contact request. Agent asks a human a question.
#     Options: --urgency low|medium|high  --channel slack|cli|file  --subject ""
#
#   bash $(basename "$0") approve <operation> <details> [options]
#     Request human approval for a high-stakes operation.
#     Options: --urgency high|medium|low  --channel slack|cli|file
#
#   bash $(basename "$0") respond <contact-id> <response>
#     Record a human response to a pending contact.
#
#   bash $(basename "$0") list [--pending]
#     List all pending contacts/approvals.
#
# Principle: "Contact humans with tool calls. The LLM can request a human
# response or human approval with the same mechanism as any other tool."
#   --- 12-Factor Agents, Factor 7
# =============================================================================

set -euo pipefail
trap 'echo "[ERROR] $BASH_SOURCE:$LINENO"' ERR

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A2H_DIR="$REPO_ROOT/.runtime/a2h"
mkdir -p "$A2H_DIR"

CMD="${1:-help}"
shift || true

usage() {
  cat <<'EOF'
Usage:
  a2h-contact.sh contact <message> [options]
    Create a human contact request.
    Options: --urgency low|medium|high  --channel slack|cli|file  --subject ""

  a2h-contact.sh approve <operation> <details-json> [options]
    Request human approval for a high-stakes operation.
    Options: --urgency high|medium|low  --channel slack|cli|file

  a2h-contact.sh respond <contact-id> <response>
    Record a human response to a pending contact/approval.

  a2h-contact.sh list [--pending]
    List all pending contacts/approvals.
EOF
}

generate_id() {
  echo "a2h-$(date -u +%Y%m%d%H%M%S)-$RANDOM"
}

# --- Write notification to file (audit trail) ---
notify() {
  local message="$1"
  local urgency="${2:-medium}"
  local channel="${3:-all}"

  local notify_id
  notify_id="a2h-notify-$(date -u +%Y%m%d%H%M%S)-$RANDOM"
  local timestamp
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local notify_dir="$REPO_ROOT/.runtime/notifications"
  mkdir -p "$notify_dir"

  cat > "$notify_dir/$notify_id.json" << EOF
{
  "id": "$notify_id",
  "timestamp": "$timestamp",
  "urgency": "$urgency",
  "channel": "$channel",
  "message": $(echo "$message" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"\"")
}
EOF

  # Also print to CLI for visibility
  local prefix=""
  case "$urgency" in
    high)   prefix="[HIGH] " ;;
    medium) prefix="[MED]  " ;;
    low)    prefix="[LOW]  " ;;
  esac
  echo "[a2h] ${prefix}${message}" >&2
}

# --- Handle contact creation ---
do_contact() {
  local message="$1"
  shift
  local urgency="medium"
  local channel="all"
  local subject=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --urgency) urgency="$2"; shift 2 ;;
      --channel) channel="$2"; shift 2 ;;
      --subject) subject="$2"; shift 2 ;;
      *) break ;;
    esac
  done

  local contact_id
  contact_id=$(generate_id)
  local timestamp
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  cat > "$A2H_DIR/$contact_id.json" <<EOF
{
  "id": "$contact_id",
  "type": "human_contact",
  "status": "pending",
  "created": "$timestamp",
  "spec": {
    "msg": $(echo "$message" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read().strip()))"),
    "subject": $(echo "$subject" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read().strip()))"),
    "urgency": "$urgency"
  }
}
EOF

  echo "Contact created: $contact_id"
  echo "Message: $message"

  notify "[A2H] Human contact requested: ${subject:-$message}" "$urgency" "$channel"

  # If channel is cli, prompt for response interactively
  if [ "$channel" = "cli" ] || [ "$channel" = "all" ]; then
    echo ""
    echo "=== Waiting for human response ==="
    echo "Message: $message"
    echo "Enter response (or 'skip' to defer):"
    read -r human_response
    if [ -n "$human_response" ] && [ "$human_response" != "skip" ]; then
      do_respond "$contact_id" "$human_response"
    fi
  fi

  echo "$contact_id"
}

# --- Handle approval request ---
do_approve() {
  local operation="$1"
  local details="$2"
  shift 2
  local urgency="high"
  local channel="all"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --urgency) urgency="$2"; shift 2 ;;
      --channel) channel="$2"; shift 2 ;;
      *) break ;;
    esac
  done

  local approval_id
  approval_id=$(generate_id)
  local timestamp
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  cat > "$A2H_DIR/$approval_id.json" <<EOF
{
  "id": "$approval_id",
  "type": "function_call",
  "status": "pending",
  "created": "$timestamp",
  "spec": {
    "fn": $(echo "$operation" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read().strip()))"),
    "kwargs": $(echo "$details" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read().strip()))"),
    "urgency": "$urgency"
  }
}
EOF

  echo "Approval requested: $approval_id"
  echo "Operation: $operation"
  echo "Details: $details"

  notify "[A2H] Approval needed: $operation --- $details" "$urgency" "$channel"

  # If channel is cli, prompt for approval interactively
  if [ "$channel" = "cli" ] || [ "$channel" = "all" ]; then
    echo ""
    echo "=== Waiting for human approval ==="
    echo "Operation: $operation"
    echo "Details: $details"
    echo "Approve? (y/n):"
    read -r human_decision
    if [ "$human_decision" = "y" ] || [ "$human_decision" = "yes" ]; then
      do_respond "$approval_id" '{"approved": true, "comment": "Approved via CLI"}'
      return 0
    elif [ "$human_decision" = "n" ] || [ "$human_decision" = "no" ]; then
      echo "Enter reason for rejection (optional):"
      read -r reject_reason
      do_respond "$approval_id" "{\"approved\": false, \"comment\": \"${reject_reason:-No reason given}\"}"
      return 1
    else
      echo "Deferred. Approval pending: $approval_id"
    fi
  fi

  echo "$approval_id"
}

# --- Handle response recording ---
do_respond() {
  local contact_id="$1"
  local response="$2"

  local file="$A2H_DIR/$contact_id.json"
  if [ ! -f "$file" ]; then
    echo "ERROR: Contact not found: $contact_id" >&2
    return 1
  fi

  local timestamp
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  python3 - "$file" "$response" "$timestamp" <<'PY'
import json, sys

file = sys.argv[1]
response = sys.argv[2]
timestamp = sys.argv[3]

with open(file) as f:
    data = json.load(f)

data["status"] = "responded"
data["response"] = {"responded_at": timestamp, "data": json.loads(response)}

with open(file, "w") as f:
    json.dump(data, f, indent=2)

print(f"Response recorded for {data['id']}")
if data["type"] == "function_call":
    approved = json.loads(response).get("approved", False)
    print(f"  Approved: {approved}")
PY
}

# --- List contacts ---
do_list() {
  local filter="${1:-all}"

  echo "=== A2H Contacts ==="
  for f in "$A2H_DIR"/*.json; do
    [ -f "$f" ] || continue
    python3 - "$f" "$filter" <<'PY'
import json, sys

file = sys.argv[1]
filter_val = sys.argv[2]

with open(file) as f:
    data = json.load(f)

status = data.get("status", "?")
if filter_val == "--pending" and status != "pending":
    sys.exit(0)

ctype = data.get("type", "?")
created = data.get("created", "?")
spec = data.get("spec", {})
msg = spec.get("msg", spec.get("fn", "?"))
rid = data.get("id", "?")

print(f"  [{status}] {rid}")
print(f"    type: {ctype}  created: {created}")
print(f"    detail: {msg[:80]}")
if "response" in data:
    resp = data["response"].get("data", {})
    print(f"    response: {resp.get('response', resp.get('comment', '?'))[:80]}")
print()
PY
  done
}

# --- Main dispatch ---
case "$CMD" in
  contact)
    if [ $# -eq 0 ]; then
      echo "ERROR: message required for contact" >&2
      usage >&2
      exit 2
    fi
    do_contact "$@"
    ;;
  approve)
    if [ $# -lt 2 ]; then
      echo "ERROR: operation and details required for approval" >&2
      usage >&2
      exit 2
    fi
    do_approve "$@"
    ;;
  respond)
    if [ $# -lt 2 ]; then
      echo "ERROR: contact-id and response required" >&2
      usage >&2
      exit 2
    fi
    do_respond "$1" "$2"
    ;;
  list)
    do_list "${1:-all}"
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
