#!/usr/bin/env bash
# Managed-By: AI-Prompting-Library
# =============================================================================
# sync-from-hub.sh - Refresh hub-owned managed-core files from the hub
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$SCRIPT_DIR"
HUB_FOLDER_NAME="${HUB_FOLDER_NAME:-agentic-workflows}"
MODE="apply"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preview|-p)
      MODE="preview"
      ;;
    --apply|-a)
      MODE="apply"
      ;;
    --help|-h)
      cat <<'EOF'
Usage: ./sync-from-hub.sh [--preview|--apply]

Refreshes only hub-owned managed-core files.
Repo-owned files like session-state, topic-insights, and archive history are left untouched.
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
  shift
done

HUB_DIR=""
for d in "$TARGET_DIR"/.. "$TARGET_DIR"/../.. "$TARGET_DIR"/../../..; do
  if [[ -d "$d/$HUB_FOLDER_NAME" ]] && [[ -f "$d/$HUB_FOLDER_NAME/scripts/propagation-contract.sh" ]]; then
    HUB_DIR="$d/$HUB_FOLDER_NAME"
    break
  fi
done

if [[ -z "$HUB_DIR" ]]; then
  echo "ERROR: Could not find $HUB_FOLDER_NAME hub"
  exit 1
fi

if [[ "$MODE" == "apply" ]]; then
  exec bash "$HUB_DIR/scripts/propagate-to-all.sh" --folder "$TARGET_DIR" --managed-only --apply
else
  exec bash "$HUB_DIR/scripts/propagate-to-all.sh" --folder "$TARGET_DIR" --managed-only --preview
fi
