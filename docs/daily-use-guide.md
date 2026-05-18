# Pi-Star Daily Use Guide — G1.2 Transition

## Switching from OpenCode to Pi-Star

Pi-Star replaced OpenCode as the primary daily driver. Here's how to use it.

### Quick Start

```bash
# Default (cheap model for quick tasks)
pi-star

# Pro model for code generation
pi-star --provider opencode-go --model "deepseek-v4-pro"

# Flash model for research
pi-star --provider opencode-go --model "deepseek-v4-flash"

# Within a session, use /route to switch modes
#   /route code     → pro model (code gen)
#   /route research → flash model (research/analysis)
```

### Model Selection Guide

| Task | Command |
|------|---------|
| Code generation, edits, writes | `pi-star --provider opencode-go --model "deepseek-v4-pro"` |
| Research, analysis, search | `pi-star --provider opencode-go --model "deepseek-v4-flash"` |
| Quick questions | `pi-star -p "question"` (default model) |

### Working in a Repo

1. Every repo already has `.pi/settings.json` + `AGENTS.md` configured
2. Just `cd <repo> && pi-star`
3. Pi-Star reads `.pi/settings.json` and `AGENTS.md` automatically

### Key Differences from OpenCode

| Aspect | OpenCode | Pi-Star |
|--------|----------|---------|
| System prompt overhead | ~10K tokens | <500 tokens core |
| Sessions | Linear chat history | Tree-structured (fork/branch/resume) |
| Model switching | TUI menu | `/model` or `/route` command |
| LSP | Built-in (heavy) | Lean LSP extension (lightweight) |
| Routing | Single model per session | `/route code\|research` on the fly |
| Cost | Fixed provider cost | Cost-aware: use flash for research |

### Daily Workflow

```bash
# 1. Start a session
cd ~/projects/dev/<repo>
pi-star --provider opencode-go --model "deepseek-v4-pro"

# 2. Use /route to optimize cost
#    Agent auto-switches between pro and flash as needed

# 3. Use /model to manually switch if /route isn't enough
#    /model deepseek-v4-flash

# 4. Check TPS (tokens per second) with built-in TPS display
```

### What's Available

| Extension | Status | File |
|-----------|--------|------|
| Lean LSP | ✅ Live | `~/.pi/agent/extensions/lean-lsp.ts` |
| Cost Router | ✅ Live | `~/.pi/agent/extensions/cost-router.ts` |
| Workflow Guard | ✅ Loaded | `.pi/extensions/workflow-guard.ts` |
| TPS Display | ✅ Loaded | `.pi/extensions/tps.ts` |

### Pain Points to Track (G1.3)

As you use pi-star daily, note:
- What works better than OpenCode?
- What's missing or harder?
- Any crashes or unexpected behavior?
- Token cost vs OpenCode baseline?
