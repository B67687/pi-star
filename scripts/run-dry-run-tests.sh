#!/usr/bin/env bash
# =============================================================================
# run-dry-run-tests.sh — Run the Pi-Star dry-run test suite
#
# Loads all extensions with a mock API to verify they initialize without errors.
# No side effects — pure dry run.
#
# Usage:
#   bash scripts/run-dry-run-tests.sh [--verbose]
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "═══ Pi-Star Dry-Run Test Runner ═══"
echo "  Working dir: $REPO_ROOT"
echo ""

# Check for tsx
if ! command -v npx &>/dev/null; then
	echo "ERROR: npx not found (Node.js required)"
	exit 1
fi

# Check that tsx is available
if ! npx tsx --version &>/dev/null; then
	echo "ERROR: tsx not found. Install: npm install --save-dev tsx"
	exit 1
fi

echo "  Starting dry-run tests..."
echo ""

# Run the test suite
npx tsx "$SCRIPT_DIR/pi-star-dry-run-test.ts" "$@"
exit_code=$?

echo ""
if [ $exit_code -eq 0 ]; then
	echo "  ✅ All dry-run tests passed"
elif [ $exit_code -eq 2 ]; then
	echo "  ⚠️  Dry-run tests passed with warnings"
else
	echo "  ❌ Dry-run tests FAILED"
fi

exit $exit_code
