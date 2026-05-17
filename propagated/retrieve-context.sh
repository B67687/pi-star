#!/usr/bin/env bash
# Managed-By: AI-Prompting-Library
# =============================================================================
# retrieve-context.sh - Pull only the local context relevant to this step
# =============================================================================

set -euo pipefail

ROOT_DIR="$(pwd)"
QUERY=""
LIMIT="${LIMIT:-8}"
DEEP_HISTORY=false
POSITIONAL=()

usage() {
  cat <<'EOF'
Usage: ./retrieve-context.sh "query" [root-dir] [--deep-history]

Search only high-signal local files and return ranked snippets.
Default search scope:
  - session-state.json
  - AGENTS.md
  - docs/
  - meta/
  - topic-insights.md
  - archive/history-index.md

Use --deep-history to include archive/history-full-detailed.md.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deep-history)
      DEEP_HISTORY=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

QUERY="${POSITIONAL[0]:-}"
ROOT_DIR="${POSITIONAL[1]:-$(pwd)}"

if [[ -z "$QUERY" ]]; then
  echo "ERROR: query is required." >&2
  usage >&2
  exit 2
fi

python3 - "$ROOT_DIR" "$QUERY" "$LIMIT" "$DEEP_HISTORY" <<'PY'
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
query = sys.argv[2]
limit = int(sys.argv[3])
deep_history = sys.argv[4].lower() == "true"

if not root.exists():
    print(f"ERROR: root directory does not exist: {root}", file=sys.stderr)
    sys.exit(1)

candidates: list[Path] = []

def add(path: Path) -> None:
    if path.exists() and path.is_file():
        candidates.append(path)

add(root / "session-state.json")
add(root / "AGENTS.md")
add(root / "topic-insights.md")
add(root / "archive" / "history-index.md")
if deep_history:
    add(root / "archive" / "history-full-detailed.md")

for base in ("docs", "meta"):
    folder = root / base
    if folder.exists():
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                candidates.append(path)

if not candidates:
    print("No approved context files found.")
    sys.exit(0)

cmd = ["rg", "-n", "-i", "--no-heading", query, *[str(p) for p in candidates]]
proc = subprocess.run(cmd, capture_output=True, text=True)
lines = [line for line in proc.stdout.splitlines() if line.strip()]

if not lines:
    print(f'No approved matches found for: {query}')
    sys.exit(0)

def score(path: str) -> int:
    if path.endswith("session-state.json"):
        return 100
    if path.endswith("AGENTS.md"):
        return 95
    if path.endswith("docs/workspace-system-overview.md"):
        return 90
    if "/docs/" in path:
        return 75
    if "/meta/" in path:
        return 65
    if path.endswith("topic-insights.md"):
        return 55
    if path.endswith("archive/history-index.md"):
        return 40
    if path.endswith("archive/history-full-detailed.md"):
        return 20
    return 30

grouped: dict[str, list[tuple[int, str]]] = {}
for line in lines:
    parts = line.split(":", 2)
    if len(parts) != 3:
        continue
    path, lineno, snippet = parts
    grouped.setdefault(path, []).append((int(lineno), snippet.strip()))

ranked = sorted(grouped.items(), key=lambda item: (-score(item[0]), item[0]))
print(f"Top matches for: {query}")
print("")
for idx, (path, snippets) in enumerate(ranked[:limit], start=1):
    p = Path(path)
    rel = p.relative_to(root) if p.is_relative_to(root) else p
    reason = []
    if path.endswith("session-state.json"):
        reason.append("active state")
    elif path.endswith("AGENTS.md"):
        reason.append("operating contract")
    elif path.endswith("docs/workspace-system-overview.md"):
        reason.append("system map")
    elif "/docs/" in path:
        reason.append("doc match")
    elif "/meta/" in path:
        reason.append("local project context")
    elif path.endswith("topic-insights.md"):
        reason.append("repo lessons")
    else:
        reason.append("approved context")

    print(f"{idx}. {rel}")
    print(f"   reason: {', '.join(reason)}")
    for lineno, snippet in snippets[:3]:
        print(f"   {lineno}: {snippet}")
    print("")
PY
