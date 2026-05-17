#!/usr/bin/env bash
# Managed-By: AI-Prompting-Library
#
# Hub resolver --- finds the hub directory using:
#   1. $AGENTIC_WORKFLOWS_HUB env var (runtime override)
#   2. Walk up from start_dir looking for a sibling named $HUB_FOLDER_NAME
#
# To rename the hub folder, change HUB_FOLDER_NAME below. No other edits needed.

# The name of the hub directory (change here if the folder is ever renamed again)
HUB_FOLDER_NAME="${HUB_FOLDER_NAME:-agentic-workflows}"

resolve_agentic_workflows_hub() {
  local required_path="${1:-scripts/propagation-contract.sh}"
  local start_dir="${2:-$(pwd)}"
  local dir candidate

  # 1. Runtime override via env var (most flexible)
  if [[ -n "${AGENTIC_WORKFLOWS_HUB:-}" ]] && [[ -f "$AGENTIC_WORKFLOWS_HUB/$required_path" ]]; then
    printf '%s\n' "$AGENTIC_WORKFLOWS_HUB"
    return 0
  fi

  # 2. Walk up the tree looking for a sibling named $HUB_FOLDER_NAME
  dir="$(cd "$start_dir" && pwd)"
  while [[ "$dir" != "/" ]]; do
    if [[ "$(basename "$dir")" == "$HUB_FOLDER_NAME" ]] && [[ -f "$dir/$required_path" ]]; then
      printf '%s\n' "$dir"
      return 0
    fi

    candidate="$dir/$HUB_FOLDER_NAME"
    if [[ -f "$candidate/$required_path" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi

    dir="$(dirname "$dir")"
  done

  echo "ERROR: Could not find $HUB_FOLDER_NAME hub (looked for $required_path)" >&2
  echo "Set AGENTIC_WORKFLOWS_HUB env var or ensure a sibling directory named '$HUB_FOLDER_NAME' exists." >&2
  return 1
}
