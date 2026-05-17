#!/bin/bash
# =============================================================================
# log-error.sh --- Capture an error for agent triage.
#
# Feeds into the debugging-and-error-recovery skill's triage system.
# Appends structured error records to .runtime/triage/errors.log so that
# `bash skills/debugging-and-error-recovery/scripts/triage.sh` can
# include recent errors in its analysis.
#
# Usage:
#   bash $(basename "$0") "command that failed" < error_output.txt
#   bash $(basename "$0") "npm test" <<< "FAIL src/test.ts (1 error)"
#
# Or pipe error output:
#   npm test 2>&1 | bash $(basename "$0") "npm test"
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TRIAGE_DIR="$REPO_ROOT/.runtime/triage"
mkdir -p "$TRIAGE_DIR"

COMMAND="${1:-unknown}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Read error content from stdin
ERROR_CONTENT=$(cat)

# Escapes for JSON
ERROR_JSON=$(echo "$ERROR_CONTENT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"(failed to capture)\"")

# Append to errors.log
{
  echo "{\"timestamp\":\"$TIMESTAMP\",\"command\":$(echo "$COMMAND" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"$COMMAND\""),\"error\":$ERROR_JSON}"
} >> "$TRIAGE_DIR/errors.log"

echo "[log-error] Captured error for: $COMMAND" >&2
echo "[log-error] Log: $TRIAGE_DIR/errors.log ($(wc -l < "$TRIAGE_DIR/errors.log") entries)" >&2
