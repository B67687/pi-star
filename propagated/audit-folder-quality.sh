#!/usr/bin/env bash
# =============================================================================
# audit-folder-quality.sh - Audit this folder for quality standards
# =============================================================================
# This is a template. Copy to your topic folder and customize if needed.

set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }

echo "============================================="
echo "Folder Quality Audit"
echo "============================================="
echo ""

# 1. Naming conventions
echo "--- Naming ---"
for f in *; do [[ -f "$f" ]] && [[ "$f" =~ [A-Z] ]] && ! [[ "$f" == *.md ]] && ! [[ "$f" == *.json ]] && log_warn "Use lowercase: $f"; done
log_pass "Naming check complete"

# 2. Required files
echo ""
echo "--- Required Files ---"
for req in AGENTS.md topic-insights.md; do [[ -f "$req" ]] && log_pass "$req exists" || log_warn "$req missing"; done

# 3. Script quality
echo ""
echo "--- Scripts ---"
for s in *.sh; do [[ -f "$s" ]] && head -n1 "$s" | grep -q "^#!" && log_pass "$s has shebang" || log_warn "$s missing shebang"; done

# 4. Content quality
echo ""
echo "--- Content ---"
for m in *.md; do [[ -f "$m" ]] && grep -qi "TODO\|FIXME\|add your" "$m" && log_warn "$m has placeholders" || log_pass "$m clean"; done

echo ""
log_pass "Audit complete"