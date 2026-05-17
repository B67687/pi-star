---
description: Start a multi-agent conversation between free AI agents
argument-hint: "<topic> [--panel <panel>] [--rounds <n>]"
---
## Usage

Starts a sequential conversation between multiple free AI agents (via OpenRouter). Each agent speaks in turn, sees the full history, and the entire session is recorded for analysis.

## Panels

| Panel | Agents | Description |
|-------|--------|-------------|
| `3-debate` | Facilitator, Analyst, Skeptic | Decision debate, default |
| `5-diverse` | Facilitator, Optimist, Skeptic, Analyst, Diplomat | Broad perspectives |
| `7-council` | Facilitator, Strategist, Skeptic, Analyst, Creative, Historian, Diplomat | Full council |

## Examples

Basic decision debate:
`/parley Should we pivot from B2B to B2C?`

Five-agent session:
`/parley What's the best architecture for our next product? --panel 5-diverse --rounds 4`

## Requirements

- `OPENROUTER_API_KEY` environment variable (for live calls)
- `jq` and `curl` installed
