#!/usr/bin/env bash
# Sample 10 FIX: Properly quote all variable expansions.

set -euo pipefail

PROCESS_DIR="${1:-}"

# FIXED: PROCESS_DIR is quoted
if [ -d "$PROCESS_DIR" ]; then
	while IFS= read -r file; do
		# FIXED: $file is now quoted
		wc -l "$file"
	done < <(find "$PROCESS_DIR" -name "*.log" 2>/dev/null)
else
	echo "Directory not found: $PROCESS_DIR"
	exit 1
fi
