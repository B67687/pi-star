#!/usr/bin/env bash
# =============================================================================
# run-lsp.sh — Simulate LSP feedback in two turns
#
# Turn 1: model fixes the bug (one shot)
# Turn 2: we run the actual diagnostic tool (pyright/tsc/shellcheck) on the fix,
#          present errors to the model, let it iterate
#
# This simulates what the LSP extension does in interactive mode:
#   model edits → LSP detects error → model sees error → model fixes
#
# Usage:
#   bash run-lsp.sh                  # run all samples
#   bash run-lsp.sh --quick           # first 3
#   bash run-lsp.sh --compare         # compare with baseline
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLES_DIR="$SCRIPT_DIR/samples"
RESULTS_DIR="$SCRIPT_DIR/lsp"
RESULTS_FILE="$RESULTS_DIR/results.json"
BASELINE_FILE="$SCRIPT_DIR/baseline/results.json"
PI_BIN="${PI_BIN:-pi-star}"

MODE="${1:-all}"

ensure_results_dir() { mkdir -p "$RESULTS_DIR"; }

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
r['samples'] = [s for s in r['samples'] if s['id'] != '$sid']
r['samples'].append({
    'id': '$sid', 'fixed': $fixed, 'turns': $turns,
    'tokens': '$tokens', 'elapsed_sec': $elapsed, 'note': '''$note''',
})
r['timestamp'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
total = len(r['samples'])
fc = len([s for s in r['samples'] if s['fixed']])
r['summary'] = {'total': total, 'fixed': fc, 'failed': total - fc, 'pct': round(fc/total*100,1) if total>0 else 0}
with open('$RESULTS_FILE','w') as f:
    json.dump(r,f,indent=2)
"
}

show_report() {
	if [[ ! -f "$RESULTS_FILE" ]]; then
		echo "No results yet."
		exit 1
	fi
	python3 -c "
import json
with open('$RESULTS_FILE') as f: r = json.load(f)
s = r['summary']
print('=== LSP-Enhanced Results ===')
print(f'  Total:    {s[\"total\"]}')
print(f'  Fixed:    {s[\"fixed\"]}  ({s[\"pct\"]}%)')
print(f'  Failed:   {s[\"failed\"]}')
print(f'  Timestamp: {r[\"timestamp\"]}')
print()
for s2 in sorted(r['samples'], key=lambda x: x['id']):
    icon = chr(10003) if s2['fixed'] else chr(10007)
    print(f'    {icon} {s2[\"id\"]} ({s2[\"turns\"]} turns, {s2[\"elapsed_sec\"]}s, {s2[\"tokens\"]} tokens) {s2.get(\"note\",\"\")[:80]}')
"
}

do_compare() {
	if [[ ! -f "$BASELINE_FILE" ]]; then
		echo "No baseline. Run run-baseline.sh first."
		exit 1
	fi
	if [[ ! -f "$RESULTS_FILE" ]]; then
		echo "No LSP results. Run run-lsp.sh first."
		exit 1
	fi
	python3 -c "
import json
with open('$BASELINE_FILE') as f: b = json.load(f)
with open('$RESULTS_FILE') as f: l = json.load(f)
bs = {s['id']: s for s in b['samples']}
ls = {s['id']: s for s in l['samples']}
si = json.load(open('$SAMPLES_DIR/samples.json'))
print(f'{'Sample':<10} {'Type':<12} {'Baseline':<14} {'+LSP':<14} {'Change':<10}')
print('-' * 62)
for sid in sorted(set(list(bs.keys())+list(ls.keys()))):
    bf = bs.get(sid,{}); lf = ls.get(sid,{})
    lsp_tag = ''
    for s2 in si['samples']:
        if s2['id'] == sid: lsp_tag = 'LSP+' if s2['lsp_should_catch'] else 'logic'; break
    b_icon = chr(10003) if bf.get('fixed') else chr(10007)
    l_icon = chr(10003) if lf.get('fixed') else chr(10007)
    bt = bf.get('tokens',0); lt = lf.get('tokens',0)
    change = 'IMPROVED' if not bf.get('fixed') and lf.get('fixed') else 'REGRESSED' if bf.get('fixed') and not lf.get('fixed') else 'SAME'
    print(f'{sid:<10} {lsp_tag:<12} {b_icon} ({str(bt):>5}t)  {l_icon} ({str(lt):>5}t)  {change:<10}')
print()
print(f'Baseline: {b[\"summary\"][\"fixed\"]}/{b[\"summary\"][\"total\"]} ({b[\"summary\"][\"pct\"]}%)')
print(f'+LSP:     {l[\"summary\"][\"fixed\"]}/{l[\"summary\"][\"total\"]} ({l[\"summary\"][\"pct\"]}%)')
"
}

# ── LSP tools ──

run_lsp_on_file() {
	local file_path="$1"
	local diagnostics=""
	if [[ "$file_path" == *.py ]]; then
		diagnostics=$(pyright --outputjson "$file_path" 2>/dev/null | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    errs=[f for f in d.get('generalDiagnostics',[]) if f.get('severity')=='error']
    for e in errs: print(f\"  {e.get('file','')}:{e.get('range',{}).get('start',{}).get('line',0)} -- {e.get('message','')}\")
except: pass
" 2>/dev/null || true)
	elif [[ "$file_path" == *.ts ]] || [[ "$file_path" == *.tsx ]]; then
		diagnostics=$(tsc --noEmit --pretty false "$file_path" 2>&1 | grep -i 'error TS' | head -10 || true)
	elif [[ "$file_path" == *.sh ]]; then
		diagnostics=$(shellcheck -f json "$file_path" 2>/dev/null | python3 -c "
import json,sys
try:
    for e in json.load(sys.stdin):
        if e.get('level')=='error': print(f\"  {e.get('file','')}:{e.get('line',0)} -- SC{e.get('code','')}: {e.get('message','')}\")
except: pass
" 2>/dev/null || true)
	fi
	echo "$diagnostics"
}

# ── Run sample ──

run_sample() {
	local sid="$1"
	local info file lang desc
	info=$(get_sample_info "$sid")
	file=$(echo "$info" | python3 -c "import json,sys; print(json.load(sys.stdin)['file'])")
	lang=$(echo "$info" | python3 -c "import json,sys; print(json.load(sys.stdin)['language'])")
	desc=$(echo "$info" | python3 -c "import json,sys; print(json.load(sys.stdin)['description'])")

	local buggy_file="$SAMPLES_DIR/$file"
	local fix_file="${buggy_file/-bug/-fix}"
	local code
	code=$(cat "$buggy_file")

	echo ""
	echo "─── [$sid] $desc ───"

	# Turn 1: model fixes the bug
	local t1_start t1_elapsed t1_result
	t1_start=$(date +%s.%N)
	set +e
	t1_result=$(echo "I have a ${lang} file with a bug. Fix it.

\`\`\`${lang}
${code}
\`\`\`

Return ONLY the fixed code between '''''' markers. No explanation." | timeout 60 "$PI_BIN" 2>/dev/null)
	local t1_exit=$?
	set -e
	t1_elapsed=$(echo "$(date +%s.%N) - $t1_start" | bc 2>/dev/null || echo "0")

	# Extract code from model response (strip markdown)
	local t1_code
	t1_code=$(echo "$t1_result" | python3 -c "
import sys, re
content = sys.stdin.read()
# Strip markdown code blocks
content = re.sub(r'\`\`\`\w*\n?', '', content)
content = re.sub(r'\n?\`\`\`\s*$', '', content)
print(content.strip())
" 2>/dev/null || echo "")

	# Write Turn 1 result to temp file for LSP checking
	local tmp_file
	tmp_file=$(mktemp /tmp/lsp-bench-XXXXXX."${file##*.}")
	echo "$t1_code" >"$tmp_file"

	# Run LSP on Turn 1 result
	local lsp_errors
	lsp_errors=$(run_lsp_on_file "$tmp_file")

	local total_tokens
	total_tokens=$(echo "$t1_result" | wc -w | tr -d ' ')
	total_tokens=$((total_tokens * 4 / 3))

	local final_code="$t1_code"
	local final_result="$t1_result"
	local turn_count=1
	local lsp_note=""

	if [[ -n "$lsp_errors" ]]; then
		lsp_note="LSP caught errors on Turn 1"
		echo "  LSP errors on Turn 1, sending feedback..."

		# Turn 2: show diagnostics, ask for another fix
		local t2_result
		set +e
		t2_result=$(echo "The type checker found errors in your fix:

$lsp_errors

Fix the code above. Return ONLY the fixed code between '''''' markers." | timeout 60 "$PI_BIN" 2>/dev/null)
		set -e

		local t2_code
		t2_code=$(echo "$t2_result" | python3 -c "
import sys, re
content = sys.stdin.read()
content = re.sub(r'\`\`\`\w*\n?', '', content)
content = re.sub(r'\n?\`\`\`\s*$', '', content)
print(content.strip())
" 2>/dev/null || echo "")

		if [[ -n "$t2_code" ]]; then
			final_code="$t2_code"
			final_result="$t2_result"
			turn_count=2
			echo "$t2_code" >"$tmp_file"

			# Check LSP again
			local lsp_errors_2
			lsp_errors_2=$(run_lsp_on_file "$tmp_file")
			if [[ -z "$lsp_errors_2" ]]; then
				lsp_note="Fixed after LSP feedback (Turn 2)"
			else
				lsp_note="LSP still has errors after 2 turns"
			fi

			local t2_tokens
			t2_tokens=$(echo "$t2_result" | wc -w | tr -d ' ')
			total_tokens=$((total_tokens + t2_tokens * 4 / 3))
		fi
	else
		lsp_note="Passed LSP on first turn"
	fi

	# Compare with known fix
	local fixed=0 similarity=0
	if [[ -f "$fix_file" ]]; then
		similarity=$(python3 -c "
import difflib, re
r = '''$final_code'''
e = open('$fix_file').read()
r_clean = re.sub(r'#.*', '', r)
e_clean = re.sub(r'#.*', '', e)
r_clean = re.sub(r'\s+', '', r_clean)
e_clean = re.sub(r'\s+', '', e_clean)
print(round(difflib.SequenceMatcher(None, r_clean, e_clean).ratio(), 3))
" 2>/dev/null || echo "0")
		fixed=$(echo "$similarity > 0.55" | bc 2>/dev/null || echo "0")
	fi

	rm -f "$tmp_file"
	save_result "$sid" "$fixed" "$turn_count" "$total_tokens" "$t1_elapsed" "$lsp_note"

	local icon
	icon="✓"
	[[ "$fixed" == "0" ]] && icon="✗"
	echo "  $icon fixed=$fixed (${t1_elapsed}s, ~${total_tokens} total tokens, ${turn_count} turns, similarity=$similarity)"
	echo "  $icon $lsp_note"
}

# ── Main ──

case "$MODE" in
--help | -h)
	usage 2>/dev/null || true
	exit 0
	;;
--report | status)
	show_report
	exit 0
	;;
--compare)
	do_compare
	exit 0
	;;
--quick)
	ensure_results_dir
	get_or_create_results
	for sid in s01 s03 s06; do run_sample "$sid"; done
	show_report
	;;
*)
	ensure_results_dir
	get_or_create_results
	for sid in $(get_all_sample_ids); do run_sample "$sid"; done
	show_report
	;;
esac
