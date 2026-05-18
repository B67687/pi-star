import type {
	ExtensionAPI,
	SessionBeforeSwitchEvent,
	SessionMessageEntry,
} from "@b67687/pi-star-coding-agent";

export default function (pi: ExtensionAPI) {
	// Note: patterns are case-sensitive, tested against lowercased command.
	// This avoids false matches on flag case (e.g., -D vs -d).
	const dangerousCommandPatterns = [
		// Destructive file operations
		/\brm\s+(-rf?|--recursive)\b/,
		/\bfind\s+.*-delete\b/,
		/\bsudo\b/,
		// Git history destruction
		/\bgit\s+reset\s+--hard\b/,
		/\bgit\s+clean\b.*-f\b/,
		/\bgit\s+checkout\s+--\b/,
		/\bgit\s+push\s+.*(--force|--force-with-lease)\b/,
		// Note: git branch -D is checked separately (case-sensitive vs -d)
		// System destructive
		/\b(chmod|chown)\b.*777\b/,
		/\bmkfs\b/,
		/\bdd\b/,
		// Docker destructive
		/\bdocker\s+system\s+prune\b/,
		/\bdocker\s+volume\s+rm\b/,
		/\bdocker\s+rm\s+.*(-f|--force)\b/,
	];

	const protectedPathPatterns = [
		// Git internals
		/\/\.git(\/|$)/,
		/\/\.gitconfig$/,
		/\/\.git-credentials$/,
		// Dependencies (auto-managed)
		/\/node_modules(\/|$)/,
		/\/package-lock\.json$/,
		/\/Cargo\.lock$/,
		// Secrets and credentials
		/\/\.env(?:$|[\/.]\w+)/,
		/\/auth\.json$/,
		/\/\.ssh(\/|$)/,
		/\/id_[^/]+$/,
		/\/.*\.pem$/,
		/\/.*\.key$/,
	];

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "bash") {
			const command = String(event.input.command ?? "");
			const lowerCommand = command.toLowerCase();
			const matchesLower = dangerousCommandPatterns.some((pattern) => pattern.test(lowerCommand));
			// git branch -D (uppercase = force delete) must be checked case-sensitively
			// to avoid blocking safe git branch -d
			const matchesForceDelete =
				/\bgit\s+branch\s+--delete\b/i.test(command) || // --delete is always force
				/\bgit\s+branch\s+-D\b/.test(command); // -D must be uppercase
			if (!matchesLower && !matchesForceDelete) return undefined;

			if (!ctx.hasUI) {
				console.error(`[workflow-guard] Blocked dangerous command: ${command}`);
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
			} else {
				console.error(`[workflow-guard] Blocked write to protected path: ${path}`);
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
