#!/usr/bin/env bash
# Managed-By: AI-Prompting-Library

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/.agentic-workflows.sh"

HUB_DIR="$(resolve_agentic_workflows_hub "scripts/counsel-model-select.sh" "$SCRIPT_DIR")"
exec bash "$HUB_DIR/scripts/counsel-model-select.sh" "$@"
