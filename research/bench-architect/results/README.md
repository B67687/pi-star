# Architect/Editor Benchmark Results

## Status

| Task | Mode | Model | Tests | Time |
|------|------|-------|-------|------|
| t01 cache-decorator | cheap | deepseek-v4-flash | **6/6 passed** ✅ | ~90s |
| t01 cache-decorator | expensive | deepseek-v4-pro | *needs re-run* (240s timeout) | ~120s+ |
| t01 cache-decorator | arch-edit | pro→flash | *needs re-run* (plan timeout) | ~150s |
| t02 event-emitter | cheap | deepseek-v4-flash | not yet run | — |
| t03 config-parser | cheap | deepseek-v4-flash | not yet run | — |

## How to Run

```bash
# All 3 modes on a single task (t01):
bash run-bench.sh --task t01

# All 3 tasks × 3 modes (full):
bash run-bench.sh

# Show last results:
bash run-bench.sh --report
```

The pro model (`deepseek-v4-pro`) needs longer timeouts due to thinking mode. Edit `run-bench.sh` line 16 from 120 to 300 if needed.

## Key Finding

The cheap model (deepseek-v4-flash) successfully implemented a complex cache decorator (6 tests including type safety, TTL, thread safety, unhashable args) on first try. This suggests that for many implementation tasks, the cheap model alone may be sufficient — the architect/editor split may only add value for unusually complex or ambiguous tasks.
