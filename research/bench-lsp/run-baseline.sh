#!/usr/bin/env bash
# =============================================================================
# run-baseline.sh — Run pi-star on each sample WITHOUT LSP, measure results
#
# For each sample:
#   1. Reads the buggy file
#   2. Asks pi-star to fix it (non-interactive)
#   3. Records: fixed? turns? tokens? time?
#   4. Compares with the known fix
#   5. Appends to results JSON
#
# Usage:
#   bash run-baseline.sh                    # run all samples
#   bash run-baseline.sh --quick            # run only first 3 samples
#   bash run-baseline.sh --sample s01       # run a single sample
#   bash run-baseline.sh --report           # show last results (no re-run)
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLES_DIR="$SCRIPT_DIR/samples"
RESULTS_DIR="$SCRIPT_DIR/baseline"
RESULTS_FILE="$RESULTS_DIR/results.json"
PI_BIN="${PI_BIN:-pi-star}"

MODE="${1:-all}"

usage() {
	cat <<EOF
Usage: bash $(basename "$0") [--quick|--sample s01|--report]

  (no args)    Run all samples
  --quick      Run first 3 samples (faster smoke test)
  --sample N   Run a single sample (s01, s02, etc.)
  --report     Show last results without re-running
EOF
}

# ── Helpers ──

ensure_results_dir() {
	mkdir -p "$RESULTS_DIR"
}

get_all_sample_ids() {
	python3 -c "
import json
s = json.load(open('$SAMPLES_DIR/samples.json'))
for s2 in s['samples']:
    print(s2['id'])
"
}

get_sample_info() {
	local sid="$1"
	python3 -c "
import json
s = json.load(open('$SAMPLES_DIR/samples.json'))
for s2 in s['samples']:
    if s2['id'] == '$sid':
        print(json.dumps(s2))
        break
"
}

get_or_create_results() {
	if [[ ! -f "$RESULTS_FILE" ]]; then
		echo '{"samples":[],"timestamp":null,"summary":{}}' >"$RESULTS_FILE"
	fi
}

save_result() {
	local sid="$1" fixed="$2" turns="$3" tokens="$4" elapsed="$5" note="$6"
	python3 -c "
import json, os, time

with open('$RESULTS_FILE') as f:
    r = json.load(f)

# Remove old result for this sample if exists
r['samples'] = [s for s in r['samples'] if s['id'] != '$sid']

r['samples'].append({
    'id': '$sid',
    'fixed': $fixed,
    'turns': $turns,
    'tokens': '$tokens',
    'elapsed_sec': $elapsed,
    'note': '''$note''',
})

r['timestamp'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

# Update summary
total = len(r['samples'])
fixed_count = len([s for s in r['samples'] if s['fixed']])
r['summary'] = {
    'total': total,
    'fixed': fixed_count,
    'failed': total - fixed_count,
    'pct': round(fixed_count / total * 100, 1) if total > 0 else 0,
}

with open('$RESULTS_FILE', 'w') as f:
    json.dump(r, f, indent=2)
"
}

show_report() {
	if [[ ! -f "$RESULTS_FILE" ]]; then
		echo "No results yet. Run the benchmark first."
		exit 1
	fi
	python3 -c "
import json
with open('$RESULTS_FILE') as f:
    r = json.load(f)
s = r['summary']
print('=== LSP Baseline Results ===')
print(f'  Total:    {s[\"total\"]}')
print(f'  Fixed:    {s[\"fixed\"]}  ({s[\"pct\"]}%)')
print(f'  Failed:   {s[\"failed\"]}')
print(f'  Timestamp: {r[\"timestamp\"]}')
print()
print('  Per-sample:')
for s2 in sorted(r['samples'], key=lambda x: x['id']):
    icon = '✓' if s2['fixed'] else '✗'
    print(f'    {icon} {s2[\"id\"]}  ({s2[\"turns\"]} turns, {s2[\"elapsed_sec\"]}s, {s2[\"tokens\"]} tokens)')
    if s2.get('note'):
        print(f'       {s2[\"note\"][:100]}')
"
}

run_sample() {
	local sid="$1"
	local info turns tokens elapsed fixed note

	info=$(get_sample_info "$sid")
	local file
	file=$(echo "$info" | python3 -c "import json,sys; print(json.load(sys.stdin)['file'])")
	local lang
	lang=$(echo "$info" | python3 -c "import json,sys; print(json.load(sys.stdin)['language'])")
	local desc
	desc=$(echo "$info" | python3 -c "import json,sys; print(json.load(sys.stdin)['description'])")

	local buggy_file="$SAMPLES_DIR/$file"
	local fix_file="${buggy_file/-bug/-fix}"

	# Read the buggy file
	local code
	code=$(cat "$buggy_file")

	echo ""
	echo "─── [$sid] $desc ───"

	local prompt
	prompt=$(
		cat <<PROMPT
I have a ${lang} file with a bug. Fix it.

\`\`\`${lang}
${code}
\`\`\`

Return ONLY the fixed code. No explanation. No markdown wrapper.
PROMPT
	)

	# Run pi-star non-interactively with a timeout
	local start elapsed_raw
	start=$(date +%s.%N)

	set +e
	result=$(echo "$prompt" | timeout 60 "$PI_BIN" 2>/dev/null)
	local pi_exit=$?
	set -e

	elapsed_raw=$(echo "$(date +%s.%N) - $start" | bc 2>/dev/null || echo "0")

	# Count lines in result as proxy for "turns" (non-interactive = 1 turn)
	turns=1

	# Count words as proxy for tokens (rough: 1 token ≈ 0.75 words)
	tokens=$(echo "$result" | wc -w | tr -d ' ')
	tokens=$((tokens * 4 / 3))

	# Check if the fix file exists and compare
	if [[ -f "$fix_file" ]]; then
		local expected_fix expected_lines result_lines
		expected_fix=$(cat "$fix_file" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr -d '\n')
		result_lines=$(echo "$result" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr -d '\n')

		# Fuzzy comparison: check if 60%+ similar
		local similarity
		similarity=$(python3 -c "
import difflib
# If result wraps in backticks, strip them
import re
r = '''$result'''
r = re.sub(r'^\`\`\`\w*\n?', '', r)
r = re.sub(r'\n?\`\`\`\s*$', '', r)
e = '''$expected_fix'''

# Normalize: remove comments, whitespace
r_clean = re.sub(r'#.*', '', r)
e_clean = re.sub(r'#.*', '', e)
r_clean = re.sub(r'\s+', '', r_clean)
e_clean = re.sub(r'\s+', '', e_clean)

ratio = difflib.SequenceMatcher(None, r_clean, e_clean).ratio()
print(round(ratio, 3))
" 2>/dev/null || echo "0")
		fixed=$(echo "$similarity > 0.6" | bc 2>/dev/null || echo "0")
		note="similarity=$similarity"
	else
		fixed=0
		note="no fix file to compare"
	fi

	# Save result
	save_result "$sid" "$fixed" "$turns" "$tokens" "$elapsed_raw" "$note"

	local icon
	icon="✓"
	[[ "$fixed" == "0" ]] && icon="✗"
	echo "  $icon Result: fixed=$fixed (${elapsed_raw}s, ~${tokens} tokens, similarity check)"
	echo "  $icon $note"
}

# ── Main ──

case "$MODE" in
--help | -h)
	usage
	exit 0
	;;
--report)
	show_report
	exit 0
	;;
--quick)
	ensure_results_dir
	get_or_create_results
	run_sample "s01"
	run_sample "s03"
	run_sample "s06"
	show_report
	;;
--sample)
	sid="${2:-}"
	[[ -z "$sid" ]] && {
		echo "Usage: --sample s01"
		exit 1
	}
	ensure_results_dir
	get_or_create_results
	run_sample "$sid"
	show_report
	;;
*)
	ensure_results_dir
	get_or_create_results
	for sid in $(get_all_sample_ids); do
		run_sample "$sid"
	done
	show_report
	;;
esac
