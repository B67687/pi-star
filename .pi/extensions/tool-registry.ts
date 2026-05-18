/**
 * Tool Registry — /tools and /commands to list available capabilities
 *
 * Layer 0 utility: discover what tools and slash commands are registered.
 * Works in both TUI and --print modes.
 *
 * Usage:
 *   /tools       — list all active LLM tools with descriptions
 *   /commands    — list all slash commands with descriptions
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@b67687/pi-star-coding-agent";

function notify(ctx: ExtensionCommandContext, msg: string, level: "info" | "warning" | "error" = "info"): void {
	if ((ctx as any).ui?.notify) {
		(ctx as any).ui.notify(msg, level);
	}
	if (level === "error") {
		console.error(`[tool-registry] ${msg}`);
	} else {
		console.log(`[tool-registry] ${msg}`);
	}
}

export default function toolRegistryExtension(pi: ExtensionAPI) {
	console.log("[tool-registry] Loaded — /tools and /commands available");
	pi.registerCommand("tools", {
		description: "List all available LLM tools with descriptions. Usage: /tools",
		handler: async (ctx: ExtensionCommandContext) => {
			const allTools = pi.getAllTools();
			const activeNames = new Set(pi.getActiveTools());

			if (allTools.length === 0) {
				notify(ctx, "No tools registered.", "info");
				return;
			}

			const lines: string[] = ["── Available LLM Tools ──"];
			for (const tool of allTools) {
				const active = activeNames.has(tool.name) ? "✓" : " ";
				const src = (tool as any).sourceInfo?.extensionPath
					? ` [${(tool as any).sourceInfo.extensionPath.split("/").pop()}]`
					: "";
				lines.push(`  [${active}] ${tool.name}${src}`);
				if (tool.description) {
					// Truncate long descriptions for compactness
					const desc = tool.description.length > 120
						? tool.description.slice(0, 117) + "..."
						: tool.description;
					lines.push(`       ${desc}`);
				}
			}
			lines.push(`── ${allTools.length} tool(s), ${activeNames.size} active ──`);

			notify(ctx, lines.join("\n"), "info");
		},
	});

	pi.registerCommand("commands", {
		description: "List all slash commands with descriptions. Usage: /commands",
		handler: async (ctx: ExtensionCommandContext) => {
			const cmds = pi.getCommands();

			if (cmds.length === 0) {
				notify(ctx, "No slash commands registered.", "info");
				return;
			}

			// Group by source
			const bySource = new Map<string, typeof cmds>();
			for (const cmd of cmds) {
				const src = cmd.source || "extension";
				if (!bySource.has(src)) bySource.set(src, []);
				bySource.get(src)!.push(cmd);
			}

			const lines: string[] = ["── Available Commands ──"];

			for (const [source, group] of bySource) {
				lines.push(`  [${source}]`);
				for (const cmd of group) {
					const desc = cmd.description ? ` — ${cmd.description}` : "";
					lines.push(`    /${cmd.name}${desc}`);
				}
			}
			lines.push(`── ${cmds.length} command(s) ──`);

			notify(ctx, lines.join("\n"), "info");
		},
	});
}
