#!/usr/bin/env bash
# Managed-By: AI-Prompting-Library
# =============================================================================
# check-sync-status.sh - Check propagation status against the hub
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$SCRIPT_DIR"
HUB_FOLDER_NAME="${HUB_FOLDER_NAME:-agentic-workflows}"

HUB_DIR=""
for d in "$TARGET_DIR"/.. "$TARGET_DIR"/../.. "$TARGET_DIR"/../../..; do
  if [[ -d "$d/$HUB_FOLDER_NAME" ]] && [[ -f "$d/$HUB_FOLDER_NAME/scripts/check-sync-status.sh" ]]; then
    HUB_DIR="$d/$HUB_FOLDER_NAME"
    break
  fi
done

if [[ -z "$HUB_DIR" ]]; then
  echo "ERROR: Could not find $HUB_FOLDER_NAME hub"
  exit 1
fi

exec bash "$HUB_DIR/scripts/check-sync-status.sh" "$TARGET_DIR"
