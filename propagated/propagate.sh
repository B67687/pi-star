#!/usr/bin/env bash
# =============================================================================
# propagate.sh --- Unified propagation entry point
#
# Orchestrates all sync and propagation operations from a single entry point:
#
#   bash $(basename "$0")               # Show sync status (default)
#   bash $(basename "$0") status         # Check propagation status
#   bash $(basename "$0") sync           # Sync commands/ -> .opencode/ + .pi/
#   bash $(basename "$0") propagate      # Preview propagation to topic folders
#   bash $(basename "$0") propagate --apply  # Apply propagation
#   bash $(basename "$0") all            # Sync + propagate (preview)
#   bash $(basename "$0") all --apply    # Full sync + propagate
#
# Replaces manual invocation of:
#   sync-commands.sh, propagate-to-all.sh, check-sync-status.sh
#
# These individual scripts are preserved for direct use. propagate.sh is the
# recommended entry point for all sync and propagation operations.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CMD="${1:-status}"
shift || true

usage() {
  cat <<USAGE
Usage: $(basename "$0") <command> [options]

Commands:
  status                   Check propagation status (default)
  sync                     Sync commands/ to .opencode/commands/ and .pi/prompts/
  propagate [--apply]      Propagate templates to topic folders (preview unless --apply)
  all [--apply]            Run sync + propagate (--apply applies propagation)

Options:
  --apply                  Actually apply propagation changes (preview without)
  -h, --help               Show this help

Examples:
  bash $(basename "$0")            # check status
  bash $(basename "$0") sync       # sync commands to local harnesses
  bash $(basename "$0") propagate  # preview propagation
  bash $(basename "$0") all --apply  # full pipeline
USAGE
}

case "$CMD" in
  status)
    exec bash "$SCRIPT_DIR/check-sync-status.sh" "$@"
    ;;

  sync)
    echo "=== Sync: commands/ -> harness mirrors ==="
    bash "$SCRIPT_DIR/sync-commands.sh" "$@"
    ;;

  propagate)
    echo "=== Propagate: templates -> topic folders ==="
    bash "$SCRIPT_DIR/propagate-to-all.sh" "$@"
    ;;

  all)
    echo "=== Full Propagation Pipeline ==="
    echo ""
    bash "$SCRIPT_DIR/sync-commands.sh" "$@"
    echo ""
    bash "$SCRIPT_DIR/propagate-to-all.sh" "$@"
    ;;

  help|--help|-h)
    usage
    ;;

  *)
    echo "Unknown command: $CMD"
    usage
    exit 2
    ;;
esac
