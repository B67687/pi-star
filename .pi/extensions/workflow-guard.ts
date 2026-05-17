import type {
	ExtensionAPI,
	SessionBeforeSwitchEvent,
	SessionMessageEntry,
} from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const dangerousCommandPatterns = [
		/\brm\s+(-rf?|--recursive)\b/i,
		/\bsudo\b/i,
		/\bgit\s+reset\s+--hard\b/i,
		/\bgit\s+clean\b.*\b-f\b/i,
		/\bgit\s+checkout\s+--\b/i,
		/\b(chmod|chown)\b.*777\b/i,
		/\bmkfs\b/i,
		/\bdd\b/i,
	];

	const protectedPathPatterns = [
		/\/\.git(\/|$)/,
		/\/node_modules(\/|$)/,
		/\/\.env(\.|$|\/)?/,
		/\/auth\.json$/,
		/\/id_[^/]+$/,
		/\/.*\.pem$/,
		/\/.*\.key$/,
	];

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "bash") {
			const command = String(event.input.command ?? "");
			const dangerous = dangerousCommandPatterns.some((pattern) => pattern.test(command));
			if (!dangerous) return undefined;

			if (!ctx.hasUI) {
				return { block: true, reason: "Dangerous command blocked without interactive confirmation" };
			}

			const choice = await ctx.ui.select(
				`Dangerous bash command detected:\n\n${command}\n\nAllow?`,
				["No", "Yes"],
			);

			if (choice !== "Yes") {
				return { block: true, reason: "Blocked by workflow guard" };
			}

			return undefined;
		}

		if (event.toolName === "write" || event.toolName === "edit") {
			const path = String(event.input.path ?? "");
			const blocked = protectedPathPatterns.some((pattern) => pattern.test(path));
			if (!blocked) return undefined;

			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked write to protected path: ${path}`, "warning");
			}

			return { block: true, reason: `Protected path: ${path}` };
		}

		return undefined;
	});

	pi.on("session_before_switch", async (event: SessionBeforeSwitchEvent, ctx) => {
		if (!ctx.hasUI) return;

		if (event.reason === "new") {
			const confirmed = await ctx.ui.confirm(
				"Clear session?",
				"This will clear the current session history.",
			);
			if (!confirmed) return { cancel: true };
			return;
		}

		const entries = ctx.sessionManager.getEntries();
		const hasUnansweredUserMessage = entries.some(
			(entry): entry is SessionMessageEntry =>
				entry.type === "message" && entry.message.role === "user",
		);

		if (!hasUnansweredUserMessage) return;

		const confirmed = await ctx.ui.confirm(
			"Switch session?",
			"You have recent user-side work in this session. Switch anyway?",
		);
		if (!confirmed) return { cancel: true };
	});

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.notify("Workflow guard loaded", "info");
	});
}
