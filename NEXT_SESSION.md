Read `/home/namikaz/projects/dev/pi-star/HANDOVER.md` for COMPLETE context before responding. It contains the full goal breakdown, architecture design, research findings, known issues, tools ecosystem, methodology reference, and commands. Do not proceed without reading it.

## Current State

Pi-Star v0.74.0 fork with:
- **Lean LSP extension**: Live ✅ (91.7% fix rate, 25/25 tests)
- **Cost-aware router extension**: Live ✅ (`/route code` / `/route research`)
- **Architect/editor benchmark**: Complete ✅ (verdict: NO to arch/edit split — use cost-aware routing instead)
- **Research finding**: Selective MCP vs native CoT — preliminary finding written, full experiment not yet run
- **Daily-use guide**: Documented in docs/daily-use-guide.md
- **G1.2**: Transition documented, ready for daily use

## Session Entry Point

1. Read HANDOVER.md entirely before doing anything else
2. Check current branch and git status
3. Pick the next milestone:
   - **A**: Start using pi-star daily (G1.2) — validate the foundation
   - **B**: Investigate the next research question (selective MCP full experiment, OS sandboxing, tiered memory, or RLM fan-out)
   - **C**: Add parallelisation to the workflow methodology (discussed in previous session — add RLM-style parallel exploration or parallel verification)
   - **D**: Reach feature parity with current dev workflow (G3.1)

## Immediate Context

- The benchmark is complete — both high-priority experiments (LSP ✅, routing ✅)
- Cost-aware router extension is shipped and installed globally
- Research on MCP vs CoT has a preliminary finding; full experiment is the highest-priority open item
- Previous session discussed adding parallelisation to the workflow for faster iteration without quality loss
- All 3 new commits are pushed to remote

## Key Config

- Provider: `opencode-go` (API key in `~/.pi/agent/auth.json`)
- Model flags: `--provider opencode-go --model "deepseek-v4-pro|flash"`
- `/route code` → pro model for code gen
- `/route research` → flash model for research
