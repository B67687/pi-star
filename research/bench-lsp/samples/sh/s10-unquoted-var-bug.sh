#!/usr/bin/env bash
# Sample 10: Unquoted variable expansion (LSP should NOT catch — shellcheck catches it)
# ShellCheck SC2086: Double quote to prevent globbing and word splitting.

set -euo pipefail

PROCESS_DIR="${1:-}"

# BUG: PROCESS_DIR is unquoted — if it contains spaces, this breaks
if [ -d "$PROCESS_DIR" ]; then
	# BUG: $PROCESS_DIR is quoted correctly here, but 'find' output is not
	while IFS= read -r file; do
		# BUG: unquoted $file — will break on filenames with spaces
		wc -l $file
	done < <(find "$PROCESS_DIR" -name "*.log" 2>/dev/null)
else
	echo "Directory not found: $PROCESS_DIR"
	exit 1
fi
