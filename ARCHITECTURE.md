# Pi-Star Architecture

> **Synthesis of the agent harness landscape.** Pi-Star forks [Pi](https://github.com/badlogic/pi-mono) (the minimal transparent harness) and adds a layer of patterns extracted from OpenCode, Aider, Claude Code, Codex CLI, Gemini CLI, DeepSeek-TUI, Hermes Agent, Ruflo, SwarmVault, and the agentic-workflows methodology repo.

---

## 1. Philosophy

### First Principles

Pi-Star is built on four non-negotiable principles:

**1. Token efficiency is the primary design constraint.**
Every feature must justify its token cost. The system prompt starts at <500 tokens (Pi's core is ~1,000). Features are loaded lazily — you pay for what you use, not for what the harness includes. OpenCode costs ~10,000 tokens per turn in system prompt overhead. Pi-Star targets <2,000 tokens fully loaded.

**2. The user controls the context, not the tool.**
Pi's transparency principle carries forward. You see exactly what the model sees. No stealth injection, no hidden system prompts, no undisclosed tool descriptions. The session model is a tree (fork/branch/resume) inherited from Pi.

**3. Every decision is evidence-backed or explicitly flagged as speculative.**
Research is the default. Before embedding a feature as a core primitive (LSP, MCP, sub-agents, permissions), Pi-Star requires authoritative evidence that the benefit justifies the token cost. Features without evidence ship as optional extensions.

**4. Methodology is infrastructure, not convention.**
Phase gates, verification requirements, cost routing, and feedback loops are built into the harness — they're not scripts you run when you remember. The methodology enforces itself.

### Design Tradeoff: Minimal Core + Optional Layers

```
  Pi core (<500 tokens system prompt)
  ├── Layer 1: Multi-model routing (architect/editor, cost-aware)
  ├── Layer 2: Quality (lean LSP, verification hooks)
  ├── Layer 3: Governance (phase gates, constitution, propagation)
  ├── Layer 4: Memory (session search, knowledge graph)
  └── Layer 5: Sub-agents (parallel exploration, sandboxed execution)
```

Each layer is opt-in. The core works without any layer loaded.

---

## 2. Research Corpus — What Every Tool Does Best

### 2.1 Pi (the foundation)

| Pattern | Token cost | Extract |
|---------|-----------|---------|
| Minimal system prompt (~1,000 tokens) | ~1,000 | Adopt as baseline. Target <500 for core. |
| 4 core tools (read/write/edit/bash) | ~200 | Adopt. Additional tools are extensions. |
| Tree-structured sessions (fork/branch/resume) | ~0 | Adopt. Non-negotiable. |
| Mid-session model switching (`/model`) | ~0 | Adopt. |
| TypeScript extension system | ~0 | Adopt. Extensions register tools, commands, event hooks. |
| AGENTS.md support | ~0 | Adopt. Governance docs are first-class config. |
| No MCP (deliberate) | N/A | **Question:** Does the token cost of MCP tool descriptions justify the benefit? Needs research. |
| No permission prompts (YOLO default) | N/A | **Question:** Is OS-level sandboxing (Codex CLI approach) better than in-tool permission prompts? Needs research. |
| No sub-agents (deliberate) | N/A | **Question:** For which tasks do sub-agents meaningfully improve outcomes? DeepSeek-TUI's RLM suggests parallel exploration. Needs research. |

**Known issues:**
- 13 open issues (excellent for 45K stars)
- Extension ecosystem is small (50+ community extensions)
- No LSP diagnostics (must be added as extension)
- No MCP support (must be added selectively)

### 2.2 OpenCode

| Pattern | Token cost | Extract candidate | Research needed? |
|---------|-----------|-----------------|------------------|
| LSP diagnostics after edits | ~7,000-9,000 | Lean LSP: run on changed files only, report errors concisely. Target: ~800 tokens. | Yes — measure actual bug-catch rate vs token cost |
| MCP integration (full protocol) | ~10,000-20,000 | Selective MCP: single-purpose tools only (sequential-thinking, agentmemory). No general MCP protocol. | Yes — does selective MCP outperform native CoT for reasoning tasks? |
| Multi-session persistence | ~500 | Adopt concept. Pi's tree-branching is better than linear sessions. | Low — pattern is established |
| Permission system (ask/allow/deny) | ~1,000-3,000 | Optional extension. Default to YOLO (Pi approach), but allow permission gates for risky operations. | Yes — does permission system prevent real mistakes, or is it security theater? |
| Client-server architecture (TUI + CLI + headless) | ~0 (infrastructure) | Adopt. The client-server split enables headless CI, web UI, remote sessions. | Low — architectural choice |

**Known issues:**
- 4,700 open issues — significant maintenance burden
- Auto-compaction is destructive (removes context permanently)
- System prompt is ~10,000+ tokens
- Feature surface is large and growing

### 2.3 Aider

| Pattern | Token cost | Extract candidate | Research needed? |
|---------|-----------|-----------------|------------------|
| Architect/editor mode (smart plans, cheap writes) | ~500 | **High priority.** Use 9Router routing: pro model plans, flash model writes. | Low — Aider's data claims 60-80% cost reduction. 9Router confirms 35x price difference between flash and pro. |
| Git-native auto-commit | ~100 | Adopt. Every verified edit becomes a git commit with descriptive message. | Low — git commits are near-zero cost and provide audit trail. |
| Repo-map (tree-sitter based, compact) | ~1,000 | Adopt concept but make it lazy-load (only build when needed, not on every turn). | Low — established pattern |
| Lint-after-edit (run linter, feed results back) | ~500 | Merge with OpenCode's LSP approach. Run LSP + linter on changed files only. | Low — matches our lean LSP target |

**Known issues:**
- No TUI (text in, text out)
- No MCP support
- Multi-agent capabilities are basic

### 2.4 Claude Code

| Pattern | Token cost | Extract candidate | Research needed? |
|---------|-----------|-----------------|------------------|
| Agent Teams (parallel sub-agents + worktree isolation) | ~1,000 | **High priority** for complex multi-file tasks. Each sub-agent gets its own worktree, eliminating race conditions. | Yes — does worktree isolation improve outcomes vs in-process sub-agents? |
| Plan mode (read-only exploration before execution) | ~500 | Adopt as optional phase gate. Read-only mode that blocks writes. | Low — established pattern |
| Checkpointing before risky operations | ~100 | Adopt as part of decision pipeline. | Low — low cost, high safety value |
| 1M token context window | N/A | Model-dependent. Not a harness feature. | N/A |

**Known issues:**
- Anthropic-only model lock-in (dealbreaker for multi-model setups)
- No LSP integration
- No open source core
- $20-200/mo for heavy use

### 2.5 Codex CLI

| Pattern | Token cost | Extract candidate | Research needed? |
|---------|-----------|-----------------|------------------|
| OS-level sandboxing (Seatbelt/Landlock) | ~0 | **High priority** for risky operations. OS-level sandbox is more reliable than in-tool permission prompts. | Yes — does OS sandboxing prevent real mistakes that permission prompts miss? |
| Sub-agent dispatch with approval modes | ~500 | Adopt pattern for sandboxed execution sub-agents. | Medium — how often do sub-agent approvals add value vs friction? |
| `/review` command for code review | ~200 | Adopt as optional tool. | Low — established pattern |

**Known issues:**
- OpenAI-focused (can't route through 9Router)
- Blind code quality tests: Claude Code wins 67% vs Codex 25%
- No LSP integration

### 2.6 Gemini CLI

| Pattern | Token cost | Extract candidate | Research needed? |
|---------|-----------|-----------------|------------------|
| Free 1M tokens/day (with Google account) | $0 | **High priority** as cost optimization. Route volume exploration tasks through Gemini when available. | Low — free inference is trivially valuable. |
| Web search grounding (agents search the web, cite sources inline) | ~500 | **High priority** for research tasks. Built-in web search with inline citations. | Low — how to implement search-as-tool vs search-as-built-in? |
| Multimodal input (screenshots, PDFs, diagrams) | ~1,000 | Adopt as optional capability. | Medium — how often do coding agents benefit from visual input? |

**Known issues:**
- Gemini-only models (can't use through 9Router for this feature)
- Requires internet connection

### 2.7 DeepSeek-TUI

| Pattern | Token cost | Extract candidate | Research needed? |
|---------|-----------|-----------------|------------------|
| RLM parallel sub-agents (fan out 1-16 on cheap Flash) | ~0 (orchestration) | **High priority** for research/exploration phases. Fan out 16 cheap models to explore codebase in parallel. | Low — 35x cost difference between Flash and Pro. Parallel exploration is established as valuable. |
| Rollback snapshots (side-git before every turn) | ~0 | Adopt as optional safety layer. Side-git allows reverting any turn. | Low — git is free. |
| Thinking-mode streaming (live chain-of-thought) | ~0 | Adopt as optional display mode. Show model's reasoning as it thinks. | Medium — does seeing CoT improve user trust/outcomes, or is it noise? |
| Cost tracking (per-turn, per-session, per-model) | ~0 | **High priority.** Track token cost per turn, session, and model. Use for routing decisions. | Low — cost data is free to collect. |

**Known issues:**
- DeepSeek-optimized (though supports other providers)
- Newer project (10K stars, 270 versions — but Pi has same version count)

### 2.8 Hermes Agent

| Pattern | Token cost | Extract candidate | Research needed? |
|---------|-----------|-----------------|------------------|
| Persistent learning loop (3-tier memory) | ~500 | **Medium priority.** Tiered memory (ephemeral → working → persistent) with automatic promotion. | Yes — does memory promotion actually improve outcomes vs storing everything? |
| Self-creating skills (agent auto-generates skills from completed tasks) | ~1,000 | **Experimental.** Interesting pattern but high complexity cost. Ship as optional extension only. | Yes — does self-created skill quality match hand-crafted skills? |
| Cross-platform gateway (Telegram, Discord, WhatsApp) | N/A | Out of scope for Pi-Star. Pi-Star is a terminal coding harness. | N/A |

**Known issues:**
- 7,300 open issues (high maintenance burden)
- General-purpose agent, not coding-specific
- Skill quality is inconsistent

### 2.9 Ruflo

| Pattern | Token cost | Extract candidate | Research needed? |
|---------|-----------|-----------------|------------------|
| Queen-led hierarchy for multi-agent coordination | ~2,000 | Out of scope for Pi-Star core. Keep as external orchestration layer. | N/A |
| SONA neural learning (<0.05ms adaptation) | N/A | Proprietary. Not applicable. | N/A |
| AgentDB (HNSW-indexed agent memory) | ~500 | Reference pattern for memory layer. | Low — but out of scope for initial release. |

### 2.10 SwarmVault (context packs + knowledge graph)

| Pattern | Token cost | Extract candidate | Research needed? |
|---------|-----------|-----------------|------------------|
| MCP server exposing knowledge graph to agents | ~500 | Adopt as optional extension. Agents query the graph as a tool when needed. | Low — established pattern in the user's workflow. |
| Compile/wikify worklflow (raw → extracts → analyses → wiki) | ~0 | Adopt methodology. Documents → structured extraction → wiki. | Low — the user already has this working. |

### 2.11 agentic-workflows (the user's methodology repo)

| Pattern | Token cost | Extract candidate | Research needed? |
|---------|-----------|-----------------|------------------|
| Phase gates (research→plan→implement→verify) | ~0 (in AGENTS.md) | **Built into Pi-Star core.** Phase transitions are first-class harness events with gate hooks. | Low — the user's own data confirms phase discipline prevents shallow fixes. |
| Constitution enforcement (9 articles, BLOCKING/ADVISORY gates) | ~200 | **Built into Pi-Star core.** The constitution is loaded at session start. Gates are enforced by the harness. | Low — proven in agentic-workflows across 503 commits. |
| Feedback loop (verify results → methodology update) | ~200 | **Built into Pi-Star core.** After every verify phase, the harness checks if failures indicate a methodology gap. | Low — scripted and working in agentic-workflows. |
| Session state auto-population | ~0 | **Built into Pi-Star core.** Post-phase hooks populate state from runtime data. | Low — scripted and working. |
| Propagation templates (17 repos sync from hub) | ~0 | **Built into Pi-Star core.** Workspace-level config that agents read to understand multi-repo structure. | Low — proven across 17 repos. |
| Multi-model routing via 9Router | ~200 | **Built into Pi-Star core.** Model selection is a first-class routing decision, not a config file. | Low — 9Router is working infrastructure. |

---

## 3. Architecture Layers

### Layer 0: Pi Core (inherited from fork)

```
- System prompt: <500 tokens (target)
- Tools: read, write, edit, bash (4 core tools)
- Session model: tree-structured (fork/branch/resume)
- Model switching: /model mid-session
- Extension system: TypeScript, event-driven
- TUI: differential rendering, flicker-free
```

**From Pi, nothing changes at this layer.** The fork only adds to the extension system and event hooks.

### Layer 1: Intelligence (Multi-Model Routing)

```
Purpose: Route tasks to the right model based on complexity, cost, and availability.
```

Components:
| Component | Research question | Decision |
|-----------|------------------|----------|
| Architect/editor routing | Does Aider's 60-80% cost claim hold outside Aider? | **Accept.** 9Router's 35x pricing gap between flash and pro confirms the value. |
| Cost tracking | What's the best format for per-turn cost data? | **Design decision:** JSONL cost log + dashboard query. |
| Auto fallback | When models are down, what's the fallback order? | **Design decision:** flash → pro → gemini → human, configurable. |
| Task complexity classification | Can we reliably classify task complexity without a model call? | **Needs research.** Heuristic (file count, edit count, keywords) vs model-based classification. |

### Layer 2: Quality (Lean LSP + Verification)

```
Purpose: Maintain code quality without wasting tokens.
```

Components:
| Component | Research question | Decision |
|-----------|------------------|----------|
| Lean LSP | How many bugs does LSP catch that the model would miss? At what token cost? | **Needs research.** Design a benchmark: 100 edits, compare LSP-on vs LSP-off outcomes. |
| Verification hooks | What's the right event model for post-edit verification? | **Design decision:** `afterEdit` event → LSP + linters + tests. |
| Rollback | Should rollback be automatic (every turn) or manual (checkpoint)? | **Design decision:** Side-git snapshots (DeepSeek-TUI approach), queryable but not automatic. |

### Layer 3: Governance (Phase Gates + Constitution)

```
Purpose: Enforce methodology at the harness level, not the convention level.
```

Components:
| Component | Research question | Decision |
|-----------|------------------|----------|
| Phase gates | Should phase transitions be BLOCKING or ADVISORY by default? | **Design decision:** BLOCKING for research→implement (non-negotiable), ADVISORY for other transitions. |
| Constitution enforcement | What happens when a gate fails? | **Design decision:** Gate failure pauses execution, logs to state, asks user: "Bypass or fix?" |
| Feedback loop | How often should the methodology update from verification results? | **Design decision:** After every verify phase. If 3 consecutive methodology gaps, suggest a methodology review. |

### Layer 4: Memory (Session Search + Knowledge Graph)

```
Purpose: Cross-session persistence without context bloat.
```

Components:
| Component | Research question | Decision |
|-----------|------------------|----------|
| Tiered memory | Does automatic memory promotion improve outcomes? | **Needs research.** Hermes claims yes. Design an A/B test. |
| SwarmVault integration | What's the right interface? MCP server or direct CLI? | **Design decision:** SwarmVault continues as external tool. Pi-Star queries it via CLI when needed. |
| Session search | FTS5 over past sessions — useful or noise? | **Needs research.** When would a user search past sessions instead of re-reading context? |

### Layer 5: Sub-Agents (Parallel + Sandboxed)

```
Purpose: Purpose-built sub-agent dispatch for specific patterns only.
```

Components:
| Component | Research question | Decision |
|-----------|------------------|----------|
| RLM parallel exploration | What's the optimal fan-out count? 4, 8, 16? | **Needs research.** Depends on task complexity and model speed. |
| Sandboxed execution | OS-level (Codex CLI) or container-level (bubblewrap)? | **Design decision:** bubblewrap (already in agentic-workflows tool stack). |
| Sub-agent communication | How do sub-agents return results to the main agent? | **Design decision:** Compact summary (200-500 tokens). Raw output stays in sub-agent context and is discarded. |

---

## 4. Research Agenda

### High Priority (blocks architecture decisions)

| Question | Method | Source tools |
|----------|--------|-------------|
| Does lean LSP catch real bugs at a rate that justifies 800 tokens/turn? | Benchmark: 100 edits, compare LSP-on vs LSP-off outcomes | OpenCode, Aider |
| Does selective MCP (single-purpose tools) outperform model-native chain-of-thought for reasoning tasks? | Controlled experiment: same task with and without MCP CoT | OpenCode, Hermes |
| Does OS-level sandboxing prevent real mistakes that permission prompts miss? | Root-cause analysis of 50 past mistakes in user's 503 commits | Codex CLI, Pi |

### Medium Priority (design can proceed with assumptions)

| Question | Method | Source tools |
|----------|--------|-------------|
| What's the optimal RLM fan-out for exploration tasks? | Parameter sweep: 2/4/8/16 agents on same exploration task | DeepSeek-TUI |
| How often do visual inputs (screenshots, diagrams) benefit coding agents? | Usage log analysis from tools that support it | Gemini CLI |
| Does session memory search improve outcomes for recurring tasks? | A/B test: with and without search on same task type | Hermes |

### Low Priority (design decisions can be made now)

| Question | Decision | Source tools |
|----------|----------|-------------|
| Permission prompts vs sandboxing? | Default: YOLO (Pi). Optional: sandbox (Codex CLI). No in-tool permission prompts. | Pi, Codex CLI |
| Auto-commit or explicit commits? | Auto-commit after every verified edit (Aider). With `--no-commit` flag to suppress. | Aider |
| Phase gates at harness level or script level? | Harness level. Phase transitions are first-class events with blocking gate hooks. | agentic-workflows |

---

## 5. Implementation Order

**Phase 0: Fork Pi (1 day)**
- Fork `github.com/badlogic/pi-mono` → `github.com/B67687/pi-star`
- Rename project, update metadata
- Set up CI

**Phase 1: Core + Routing (1 week)**
- Add 9Router model routing as built-in provider (not extension)
- Add architect/editor mode (`/route architect`, `/route editor`)
- Add cost tracking (per-turn JSONL log)
- Everything else stays at Pi baseline

**Phase 2: Lean LSP + Verification (1 week)**
- Write the LSP extension (run on changed files only, compact output)
- Wire `afterEdit` event → LSP → report
- Add verification hooks (run tests, check results)
- Add side-git rollback snapshots (optional)

**Phase 3: Governance (1 week)**
- Phase gates as harness primitives (not scripts)
- Constitution loader (reads `CONSTITUTION.md` at session start)
- Feedback loop (post-verify → methodology gap check)
- Session state auto-population (post-phase hook)

**Phase 4: Memory + Sub-agents (ongoing)**
- Session search via FTS5
- SwarmVault integration
- RLM parallel exploration
- Sandboxed execution

---

## 6. Open Questions

These need to be answered before or during Phase 1:

1. **What language/stack?** Pi is TypeScript/Node. The fork inherits this. But should the user consider Go (like OpenCode) for performance, or Rust (like Codex CLI)? Decision: TypeScript/Node (inherited from Pi, matches user's Node v24.15.0 setup).

2. **Detach from upstream or sync?** Detach initially. Cherry-pick critical fixes from Pi. Assess after 6 months.

3. **What's the naming convention beyond "Pi-Star"?** Repo name is pi-star. Binary name? Extension prefix? Package name? Decision: keep these open until Phase 1.

4. **What's the license?** Pi is MIT. Fork inherits MIT. Decision: MIT.

5. **Single-repo or multi-repo architecture?** Pi is a monorepo (`pi-mono` includes TUI, API, CLI, and MCP plug-in support). Decision: keep as monorepo for now.
