# MCP vs CoT Experiment

**Question**: Does selective MCP (single-purpose tools) outperform model-native chain-of-thought?

**Tool tested**: `sequential-thinking` MCP server (modelcontextprotocol/server-sequential-thinking)

**Model**: deepseek-v4-flash (same model for both arms)

## Protocol

3 tasks × 2 arms = 6 runs:

| Task | Domain | Arm 1 (CoT) | Arm 2 (MCP) |
|------|--------|-------------|-------------|
| T1: Plugin System Design | Creative/architectural | Native reasoning | sequential-thinking |
| T2: Error Handling Audit | Analytical/systematic | Native reasoning | sequential-thinking |
| T3: Benchmark Synthesis | Analysis/synthesis | Native reasoning | sequential-thinking |

## Results

| Task | Winner | Why |
|------|--------|-----|
| T1 | **MCP** (moderate) | Branching forced alternative evaluation; revision caught missing feature |
| T2 | **Tie** | Same issues found both ways; MCP had better severity categorization |
| T3 | **MCP** (significant) | Systematic matrix + meta + gap analysis; 4x more meta-patterns found |

## Verdict

**YES for complex/synthesis tasks. NO for straightforward enumeration tasks.**

MCP benefit is task-dependent:

| Task type | MCP benefit | Why |
|-----------|-------------|-----|
| Creative design | Medium | Forces alternative evaluation and self-correction |
| Systematic audit | Low | Linear enumeration is sufficient |
| Synthesis/analysis | High | Forces systematic comparison and meta-analysis |

## Recommendation for Pi-Star

1. **Add MCP support** for structured reasoning tools (sequential-thinking)
2. **Use selectively** — route based on task type, not always-on
3. **Potential cost play**: Flash model + sequential-thinking MCP may match Pro quality for analysis tasks (worth follow-up experiment)
4. **Don't auto-invoke** — let agent decide when structured reasoning is needed

## Files

- `results.json` — structured results
- `README.md` — this file

## Related

- `research/bench-lsp/` — LSP benchmark (baseline vs LSP-enhanced)
- `research/bench-architect/` — Routing strategy benchmark
