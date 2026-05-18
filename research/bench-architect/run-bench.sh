#!/usr/bin/env bash
# =============================================================================
# run-bench.sh — Architect/Editor model routing benchmark (simplified)
#
# Tests three routing strategies:
#   cheap:        deepseek-v4-flash does everything
#   expensive:    deepseek-v4-pro does everything
#   arch-edit:    deepseek-v4-pro plans → deepseek-v4-flash implements
#
# Each task: model writes code to stdout → we write to file → run test
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASKS_DIR="$SCRIPT_DIR/tasks"
RESULTS_DIR="$SCRIPT_DIR/results"
RESULTS_FILE="$RESULTS_DIR/results.json"
PI_BIN="${PI_BIN:-pi-star}"
CHEAP="deepseek-v4-flash"
EXPENSIVE="deepseek-v4-pro"
PROVIDER="opencode-go"

MODE="${1:-all}"

# ── Helpers ──

get_task_ids() {
	python3 -c "import json; t=json.load(open('$TASKS_DIR/tasks.json')); [print(x['id']) for x in t['tasks']]"
}

get_task() {
	python3 -c "import json; t=json.load(open('$TASKS_DIR/tasks.json')); [print(json.dumps(x)) for x in t['tasks'] if x['id']=='$1']"
}

run_pistar() {
	local model="$1" prompt="$2" time="${3:-120}"
	# Append instruction that the output IS the file content
	local full_prompt="${prompt}

Your entire response below this line will be saved as the source file. Start with the first line of code. No markdown formatting, no backticks, no explanation. Just raw source code."
	printf '%s' "$full_prompt" | timeout "$time" "$PI_BIN" --provider "$PROVIDER" --model "$model" 2>/dev/null
}

extract_code() {
	python3 -c "
import sys, re
c = sys.stdin.read()
# Try markdown code block first
m = re.search(r'\`\`\`\w*\n(.*?)\n?\`\`\`', c, re.DOTALL)
if m:
    sys.stdout.write(m.group(1).strip())
else:
    # No markdown block — strip any leading prose before 'import' or 'from' or 'def' or 'class' or 'const' or 'type'
    lines = c.split('\n')
    code_start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith(('import ', 'from ', 'def ', 'class ', 'const ', 'type ', 'interface ', 'async ', 'export ', '#!', '//', '/*')):
            code_start = i
            break
    # Also find last non-empty line and cut prose after
    result = '\n'.join(lines[code_start:]).strip()
    sys.stdout.write(result)
"
}

save_result() {
	local task="$1" mode="$2" status="$3" time="$4" tokens="$5"
	mkdir -p "$RESULTS_DIR"
	if [[ ! -f "$RESULTS_FILE" ]]; then echo '{"results":[],"summary":{}}' >"$RESULTS_FILE"; fi
	python3 -c "
import json, os, time
r = json.load(open('$RESULTS_FILE'))
r['results'] = [x for x in r['results'] if not (x['task']=='$task' and x['mode']=='$mode')]
r['results'].append({'task':'$task','mode':'$mode','status':'$status','time_sec':$time,'tokens_est':'$tokens'})
sm = {}
for x in r['results']: sm[f\"{x['task']}/{x['mode']}\"] = x['status']
r['summary'] = sm
r['timestamp'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
json.dump(r, open('$RESULTS_FILE','w'), indent=2)
"
}

show_report() {
	if [[ ! -f "$RESULTS_FILE" ]]; then
		echo "No results."
		exit 1
	fi
	python3 -c "
import json
r = json.load(open('$RESULTS_FILE'))
modes = ['cheap','expensive','arch-edit']
tasks = sorted(set(x['task'] for x in r['results']))
print()
print('=== Architect/Editor Routing Benchmark ===')
h = f'{\"Task\":<12}'; [h := h + f' {m:<18}' for m in modes]; print(h); print('-'*66)
for t in tasks:
    row = f'{t:<12}'
    for m in modes:
        xs = [x for x in r['results'] if x['task']==t and x['mode']==m]
        if xs:
            x = xs[-1]
            icon = chr(10003) if x['status']=='pass' else (chr(10007) if x['status']=='fail' else '~')
            row += f' {icon} ({x.get(\"time_sec\",\"?\")}s)'
        else: row += f' {\"-\":<18}'
    print(row)
print()
for m in modes:
    xs = [x for x in r['results'] if x['mode']==m]
    p = len([x for x in xs if x['status']=='pass']); t = len(xs)
    print(f'  {m:<16} {p}/{t} ({round(p/t*100)}%)')
"
}

# ── Run one task in one mode ──

run_mode() {
	local task_id="$1" mode="$2"
	local info prompt lang file
	info=$(get_task "$task_id")
	prompt=$(echo "$info" | python3 -c "import json,sys; print(json.load(sys.stdin)['prompt'])")
	lang=$(echo "$info" | python3 -c "import json,sys; print(json.load(sys.stdin)['language'])")
	file=$(echo "$info" | python3 -c "import json,sys; print(json.load(sys.stdin)['file'])")

	local task_dir="$TASKS_DIR/$file"
	local ext="py"
	[[ "$lang" == "typescript" ]] && ext="ts"
	local sol_file="$task_dir/solution-${mode}.$ext"
	local test_cmd="python3 \"$task_dir/test.py\""
	[[ "$lang" == "typescript" ]] && test_cmd="cd \"$task_dir\" && npx tsx test.ts"

	echo "  Mode: $mode"

	local start elapsed result code status test_out token_est
	start=$(date +%s.%N)

	case "$mode" in
	cheap)
		code=$(run_pistar "$CHEAP" "$prompt" | extract_code)
		;;
	expensive)
		code=$(run_pistar "$EXPENSIVE" "$prompt" 300 | extract_code)
		;;
	arch-edit)
		local plan=$(run_pistar "$EXPENSIVE" \
			"Create a detailed implementation plan for this task. List file structure, function signatures, key algorithms. DO NOT write code.\n\n$prompt" 180)
		echo "    Plan: $(echo "$plan" | wc -w) words"
		code=$(run_pistar "$CHEAP" \
			"Implement this plan. Return ONLY the code in a markdown block.\n\n$plan" | extract_code)
		;;
	esac

	elapsed=$(echo "$(date +%s.%N) - $start" | bc 2>/dev/null || echo "0")
	token_est=$(echo "$code" | wc -c | tr -d ' ')
	token_est=$((token_est / 4))

	# Write solution to mode-specific file, symlink to solution.ext for test importing
	echo "$code" >"$sol_file"
	rm -f "$task_dir/solution.$ext"
	ln -s "$(basename "$sol_file")" "$task_dir/solution.$ext"
	echo "    Code: $(wc -c <"$sol_file") bytes"

	# Run test — capture stdout and exit code separately
	test_out=$(eval "$test_cmd" 2>&1) && test_rc=0 || test_rc=$?
	if [ "$test_rc" -eq 0 ]; then
		status="pass"
	elif echo "$test_out" | grep -qE "[0-9]+/[0-9]+ passed"; then
		status="partial"
	else
		status="fail"
	fi
	echo "    Status: $status ($elapsed s, ~${token_est}t)"

	save_result "$task_id" "$mode" "$status" "$elapsed" "$token_est"
}

# ── Main ──

case "$MODE" in
--report)
	show_report
	exit 0
	;;
--quick)
	for m in cheap expensive arch-edit; do
		echo "─── [t01] mode=$m ───"
		run_mode "t01" "$m"
	done
	show_report
	;;
--task)
	sid="${2:-}" || sid="t01"
	for m in cheap expensive arch-edit; do
		echo "─── [$sid] mode=$m ───"
		run_mode "$sid" "$m"
	done
	show_report
	;;
*)
	for t in $(get_task_ids); do
		for m in cheap expensive arch-edit; do
			echo "─── [$t] mode=$m ───"
			run_mode "$t" "$m"
		done
	done
	show_report
	;;
esac
