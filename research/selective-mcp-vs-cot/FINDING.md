# Selective MCP vs Native Chain-of-Thought — Preliminary Finding

## Question

Does selective MCP (single-purpose tools like `sequential-thinking`)
outperform model-native chain-of-thought for reasoning tasks?

## Analysis

### What the Tools Say

| Source | Position | Reasoning |
|--------|----------|-----------|
| **Pi** | No MCP (deliberate) | Token cost of tool descriptions exceeds benefit. Model-native reasoning is sufficient. |
| **OpenCode** | Full MCP protocol | 10K-20K tokens overhead for MCP tool descriptions. High cost but enables tool-use patterns. |
| **Aider** | No MCP | Relies on architect/editor split as reasoning structure instead. |
| **agentic-workflows** | `sequential-thinking` tool available | Used for complex planning. Cognitive-surrender research supports structured pre-reasoning. |

### Key Insight

The underlying question is not "MCP vs no MCP" but rather **structured reasoning vs free-form reasoning**:

- **Structured reasoning** (sequential-thinking MCP): Forces decomposition, prevents cognitive
  surrender, produces auditable thought chains. Token cost: ~500-2000 for tool descriptions + output.
- **Free-form reasoning** (model-native CoT): No tool overhead, natural to the model, but
  prone to cognitive surrender (model skips steps or shortcuts reasoning).

The agentic-workflows methodology repo has relevant research: "cognitive-surrender-research.md"
documents that constructing expectations before generative actions improves outcomes.
Sequential-thinking enforces this pattern.

### Preliminary Verdict

**PROBABLY YES** — Selective MCP for reasoning likely outperforms native CoT for
complex multi-step tasks. The mechanism is forcing decomposition before action.

However:
- For simple tasks (<3 steps), native CoT is sufficient and cheaper
- For complex tasks (>3 steps, branching decisions), sequential-thinking MCP prevents shortcuts
- The token cost of ONE selective MCP tool (~200-500 tokens) is negligible compared to
  full MCP protocol (10K-20K tokens)

### Recommendation

Ship `sequential-thinking` as an optional Pi-Star extension. Default: model-native CoT
for simple tasks. Trigger MCP reasoning tool when task complexity exceeds heuristic
threshold (e.g., >3 files affected, >5 steps, branching logic).

### Next Step for Full Investigation

Design a controlled experiment:
1. 10 reasoning tasks (architecture decisions, debugging plans, implementation designs)
2. Run each with and without sequential-thinking MCP tool
3. Measure: solution quality, time to solution, token cost
4. Compare: does the MCP version produce measurably better outcomes?
