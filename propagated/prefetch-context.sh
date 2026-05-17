#!/usr/bin/env bash
# =============================================================================
# prefetch-context.sh - Deterministic pre-fetch of context data (12-factor F13)
#
# Pre-fetches data the agent will almost certainly need, so it doesn't have
# to call tools to discover them. Outputs in XML-style tagged format.
#
# Usage:
#   bash $(basename "$0")           # XML output (default)
#   bash $(basename "$0") --json    # JSON output
#   bash $(basename "$0") --compact # short one-liner
#
# Principle: "If you know what tools the model will need, call them
# deterministically before the LLM invocation and include their results."
#   --- 12-Factor Agents, Appendix 13
# =============================================================================

set -euo pipefail
trap 'echo "[ERROR] $BASH_SOURCE:$LINENO"' ERR

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

MODE="${1:-xml}"

# --- Gather all pre-fetch data ---

# Git state
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
COMMITS=$(git log --oneline -5 2>/dev/null || echo "")
DIRTY_COUNT=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
DIRTY_FILES=$(git status --short 2>/dev/null | head -15 || echo "")
AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
BEHIND=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo "0")

# Session state (summary from session-state.json)
SESSION_TASK=""
SESSION_STATUS=""
if [ -f "session-state.json" ]; then
  SESSION_TASK=$(python3 -c "
import json; d=json.load(open('session-state.json'))
print(d.get('currentTask', {}).get('name', 'none'))
" 2>/dev/null || echo "?")
  SESSION_STATUS=$(python3 -c "
import json; d=json.load(open('session-state.json'))
print(d.get('status', '?'))
" 2>/dev/null || echo "?")
fi

# Context health
HEALTH_JSON=$(bash "$SCRIPT_DIR/context-pressure.sh" --json 2>/dev/null || echo "{}")
HEALTH_STATUS=$(echo "$HEALTH_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "?")

# Tools
TOOL_COUNT=$(bash "$SCRIPT_DIR/tools.sh" 2>/dev/null | grep -cE "^(  script/|  command/)" || echo "?")

# Skills available (from manifest bundles)
SKILL_BUNDLES=$(python3 -c "
import json
try:
    m = json.load(open('skills/manifest.json'))
    bundles = m.get('bundles', m.get('_bundles', {}))
    print(', '.join(b for b in bundles.keys() if b != '_meta'))
except: print('?')
" 2>/dev/null || echo "?")

# Recent learnings
LEARNINGS=$(tail -5 .learnings.jsonl 2>/dev/null | python3 -c "
import json, sys
for line in sys.stdin:
    try: d=json.loads(line.strip().rstrip(',')); print(d.get('content','')[:120])
    except: pass
" 2>/dev/null || echo "")

# --- Output ---

if [ "$MODE" = "--compact" ]; then
  echo "[${BRANCH}] @${HASH} | ${DIRTY_COUNT}dirty | status:${SESSION_STATUS} | task:${SESSION_TASK} | ${TOOL_COUNT}tools | health:${HEALTH_STATUS}"
  exit 0

elif [ "$MODE" = "--json" ]; then
  python3 - "$BRANCH" "$HASH" "$COMMITS" "$DIRTY_COUNT" "$DIRTY_FILES" \
    "$AHEAD" "$BEHIND" "$SESSION_TASK" "$SESSION_STATUS" \
    "$HEALTH_STATUS" "$TOOL_COUNT" "$SKILL_BUNDLES" "$LEARNINGS" <<'PY'
from __future__ import annotations
import json, sys

data = {
    "prefetched": {
        "git": {
            "branch": sys.argv[1],
            "hash": sys.argv[2],
            "commits": sys.argv[3].split("\n") if sys.argv[3] else [],
            "dirty_count": int(sys.argv[4]),
            "dirty_files": [l for l in sys.argv[5].split("\n") if l.strip()] if sys.argv[5] else [],
            "ahead": sys.argv[6],
            "behind": sys.argv[7],
        },
        "session": {
            "task": sys.argv[8],
            "status": sys.argv[9],
        },
        "health": sys.argv[10],
        "tools_count": int(sys.argv[11]),
        "skill_bundles": sys.argv[12],
        "recent_learnings": [l for l in sys.argv[13].split("\n") if l.strip()] if sys.argv[13] else [],
    }
}
print(json.dumps(data, indent=2))
PY
  exit 0

else
  # XML-style output (default) --- token-efficient, attention-friendly
  cat <<XMLHEADER
<prefetched_context>
  <git_state>
    <branch>$(echo "$BRANCH" | python3 -c "import sys; print(sys.stdin.read().strip().replace('<','&lt;').replace('>','&gt;').replace('&','&amp;'))")</branch>
    <hash>$HASH</hash>
    <dirty_files>$DIRTY_COUNT</dirty_files>
    <ahead>$AHEAD</ahead>
    <behind>$BEHIND</behind>
  </git_state>
XMLHEADER

  if [ -n "$COMMITS" ]; then
    echo "  <recent_commits>"
    while IFS= read -r line; do
      [ -n "$line" ] && echo "    <commit>$(echo "$line" | python3 -c "import sys; print(sys.stdin.read().strip().replace('<','&lt;').replace('>','&gt;').replace('&','&amp;'))")</commit>"
    done <<< "$COMMITS"
    echo "  </recent_commits>"
  fi

  if [ -n "$DIRTY_FILES" ]; then
    echo "  <changes>"
    while IFS= read -r line; do
      [ -n "$line" ] && echo "    <change>$(echo "$line" | python3 -c "import sys; print(sys.stdin.read().strip().replace('<','&lt;').replace('>','&gt;').replace('&','&amp;'))")</change>"
    done <<< "$DIRTY_FILES"
    echo "  </changes>"
  fi

  cat <<XMLBODY
  <session>
    <task>$(echo "$SESSION_TASK" | python3 -c "import sys; print(sys.stdin.read().strip().replace('<','&lt;').replace('>','&gt;').replace('&','&amp;'))")</task>
    <status>$SESSION_STATUS</status>
  </session>
  <health>$HEALTH_STATUS</health>
  <tools_available>$TOOL_COUNT</tools_available>
  <skill_bundles>$(echo "$SKILL_BUNDLES" | python3 -c "import sys; print(sys.stdin.read().strip().replace('<','&lt;').replace('>','&gt;').replace('&','&amp;'))")</skill_bundles>
XMLBODY

  if [ -n "$LEARNINGS" ]; then
    echo "  <recent_learnings>"
    while IFS= read -r line; do
      [ -n "$line" ] && echo "    <learning>$(echo "$line" | python3 -c "import sys; print(sys.stdin.read().strip().replace('<','&lt;').replace('>','&gt;').replace('&','&amp;'))")</learning>"
    done <<< "$LEARNINGS"
    echo "  </recent_learnings>"
  fi

  echo "</prefetched_context>"
fi
