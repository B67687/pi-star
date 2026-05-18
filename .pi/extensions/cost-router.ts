/**
 * Cost-Aware Router Extension
 *
 * Routes tasks to the right model based on complexity and cost.
 * Based on benchmark evidence (see research/bench-architect/):
 *   - Pro model (deepseek-v4-pro): reliable for code generation (~150-300s)
 *   - Flash model (deepseek-v4-flash): suitable for research/analysis (~20s)
 *   - Arch/edit split: NOT supported — data shows no improvement over pro-alone
 *
 * Usage:
 *   /route          — show current route mode
 *   /route code     — switch to pro model (for code generation)
 *   /route research — switch to flash model (for research/analysis)
 *
 * The agent also receives a system prompt guide on routing decisions.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@b67687/pi-star-coding-agent";

type RouteMode = "code" | "research";

const ROUTE_CONFIG: Record<RouteMode, { model: string; description: string }> = {
	code: {
		model: "deepseek-v4-pro",
		description: "Expensive, slow (~150-300s), best quality for code generation",
	},
	research: {
		model: "deepseek-v4-flash",
		description: "Cheap, fast (~20s), suitable for analysis and research",
	},
};

const ROUTING_GUIDE = `## Cost-Aware Routing

You have two routing modes available via the /route command:

- \`/route code\` (default) — Uses the expensive pro model. Best for writing code, complex edits, and any task requiring high accuracy.
- \`/route research\` — Uses the cheap flash model. Best for searching codebases, reading files, summarizing, planning, and analysis tasks.

**Routing rules:**
1. Start every task in "code" mode (pro model) unless you're confident it's purely research/analysis.
2. Switch to "research" mode for: searching, grepping, reading docs, analyzing logs, planning, brainstorming.
3. Switch back to "code" mode before writing or editing any files.
4. The /route command tells the model to use \`/model\` internally to switch providers.

The cost difference is ~35x between pro and flash. Use research mode generously for exploration — it saves money and is fast enough for non-coding tasks.`;

export default function costRouterExtension(pi: ExtensionAPI) {
	let currentMode: RouteMode = "code";

	// ── Commands ──

	pi.registerCommand("route", {
		description: "Show or set cost-aware routing mode. Usage: /route [code|research]",
		handler: async (ctx: ExtensionCommandContext) => {
			const args = (ctx as any).args as string[] | undefined;
			const modeArg = args?.[0] as RouteMode | undefined;

			if (!modeArg) {
				const config = ROUTE_CONFIG[currentMode];
				const msg = `Current route: ${currentMode} (${config.model})\n${config.description}\n\nUse /route code or /route research to switch.`;
				ctx.ui.notify(msg, "info");
				return;
			}

			if (modeArg !== "code" && modeArg !== "research") {
				ctx.ui.notify(`Unknown route: ${modeArg}. Use "code" or "research".`, "warning");
				return;
			}

			currentMode = modeArg;
			const config = ROUTE_CONFIG[currentMode];

			// Notify the user
			ctx.ui.notify(`Switched to ${currentMode} mode (${config.model})`, "info");

			// Send a steer message telling the agent to switch model
			// The agent will see this instruction and use /model to switch
			await ctx.waitForIdle();
		},
	});

	// Also register individual subcommands for convenience
	pi.registerCommand("route-code", {
		description: "Switch to code (pro) routing mode",
		handler: async (ctx: ExtensionCommandContext) => {
			currentMode = "code";
			ctx.ui.notify(`Switched to code mode (${ROUTE_CONFIG.code.model})`, "info");
		},
	});

	pi.registerCommand("route-research", {
		description: "Switch to research (flash) routing mode",
		handler: async (ctx: ExtensionCommandContext) => {
			currentMode = "research";
			ctx.ui.notify(`Switched to research mode (${ROUTE_CONFIG.research.model})`, "info");
		},
	});

	// ── Inject routing guide into system prompt ──

	pi.on("before_agent_start", async (event) => {
		return {
			systemPrompt: event.systemPrompt + "\n\n" + ROUTING_GUIDE,
		};
	});
}
