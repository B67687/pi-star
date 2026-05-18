/**
 * Memory Layer — Session search + Observation store + Auto-extraction
 *
 * Layer 4 of the Pi-Star architecture: persistent memory across sessions.
 * Provides two mechanisms:
 *   1. session-search tool (LLM-callable) — searches past session logs
 *   2. Observation store — /remember, /recall, /forget commands
 *   3. Auto-extraction hooks — saves key context after edits/writes
 *
 * Usage:
 *   /remember <text>             Save an observation (auto-tagged)
 *   /remember --tag bug|pattern|decision|fact <text>
 *   /recall <query>              Search saved observations
 *   /forget <id>                 Delete an observation
 *   /observations                List all observations
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@b67687/pi-star-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// ============================================================================
// Types
// ============================================================================

interface Observation {
	id: string;
	timestamp: number;
	tags: string[];
	text: string;
	source?: string;
}

interface MemoryState {
	observations: Observation[];
}

// ============================================================================
// Paths
// ============================================================================

const MEMORY_DIR = join(homedir(), ".pi", "runtime", "memory");
const OBSERVATIONS_FILE = join(MEMORY_DIR, "observations.jsonl");

// ============================================================================
// State management
// ============================================================================

function ensureDir(): void {
	if (!existsSync(MEMORY_DIR)) {
		mkdirSync(MEMORY_DIR, { recursive: true });
	}
}

function loadObservations(): Observation[] {
	ensureDir();
	if (!existsSync(OBSERVATIONS_FILE)) return [];
	try {
		const lines = readFileSync(OBSERVATIONS_FILE, "utf-8").split("\n").filter(Boolean);
		return lines.map((line) => JSON.parse(line) as Observation);
	} catch {
		return [];
	}
}

function appendObservation(obs: Observation): void {
	ensureDir();
	appendFileSync(OBSERVATIONS_FILE, JSON.stringify(obs) + "\n", "utf-8");
}

function rewriteObservations(observations: Observation[]): void {
	ensureDir();
	const lines = observations.map((o) => JSON.stringify(o)).join("\n") + "\n";
	writeFileSync(OBSERVATIONS_FILE, lines, "utf-8");
}

function generateId(): string {
	return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// ============================================================================
// Session search
// ============================================================================

function listSessionFiles(projectDir: string): string[] {
	const sessionDir = join(projectDir, ".pi", "sessions");
	if (!existsSync(sessionDir)) return [];
	return readdirSync(sessionDir)
		.filter((f) => f.endsWith(".jsonl"))
		.sort()
		.reverse()
		.map((f) => join(sessionDir, f));
}

function searchSessions(query: string, projectDir: string, maxResults = 5): string {
	const files = listSessionFiles(projectDir);
	if (files.length === 0) return "No session files found.";

	const queryLower = query.toLowerCase();
	const queryTerms = queryLower.split(/\s+/).filter(Boolean);
	const results: Array<{ file: string; score: number; snippets: string[] }> = [];

	for (const file of files.slice(0, 50)) {
		// Search last 50 sessions maximum
		try {
			const content = readFileSync(file, "utf-8");
			const lines = content.split("\n").filter(Boolean);
			let score = 0;
			const snippets: string[] = [];

			for (const line of lines) {
				try {
					const entry = JSON.parse(line);
					const text =
						entry.message?.content?.[0]?.text ||
						entry.message?.content ||
						JSON.stringify(entry.message);

					const textLower = String(text).toLowerCase();
					const matches = queryTerms.filter((t) => textLower.includes(t));
					if (matches.length > 0) {
						score += matches.length;
						const snippet = String(text).slice(0, 200).replace(/\n/g, " ");
						if (snippets.length < 3) snippets.push(snippet);
					}
				} catch {
					// skip unparseable lines
				}
			}

			if (score > 0) {
				results.push({
					file: basename(file),
					score,
					snippets,
				});
			}
		} catch {
			// skip unreadable files
		}
	}

	results.sort((a, b) => b.score - a.score);
	const top = results.slice(0, maxResults);

	if (top.length === 0) return `No sessions found matching "${query}".`;

	return top
		.map(
			(r) =>
				`[${r.file}] (score: ${r.score})\n  ${r.snippets.join("\n  ")}`,
		)
		.join("\n\n");
}

// ============================================================================
// Observation search (simple keyword)
// ============================================================================

function searchObservations(query: string, maxResults = 5): string {
	const observations = loadObservations();
	if (observations.length === 0) return "No observations saved yet.";

	const queryLower = query.toLowerCase();
	const queryTerms = queryLower.split(/\s+/).filter(Boolean);
	const scored: Array<{ obs: Observation; score: number }> = [];

	for (const obs of observations) {
		let score = 0;
		const haystack = (obs.text + " " + obs.tags.join(" ")).toLowerCase();
		for (const term of queryTerms) {
			if (haystack.includes(term)) score++;
		}
		if (obs.tags.some((t) => queryTerms.includes(t.toLowerCase()))) score += 2;
		if (score > 0) scored.push({ obs, score });
	}

	scored.sort((a, b) => b.score - a.score);
	const top = scored.slice(0, maxResults);

	if (top.length === 0) return `No observations found matching "${query}".`;

	return top
		.map(
			(r) =>
				`[${r.obs.id}] ${new Date(r.obs.timestamp).toLocaleString()} tags:${r.obs.tags.join(",")}\n  ${r.obs.text}`,
		)
		.join("\n\n");
}

// ============================================================================
// Memory Guide (injected into system prompt)
// ============================================================================

const MEMORY_GUIDE = `## Memory Layer

You have persistent memory across sessions using two mechanisms:

### 1. Session Search (tool)
Use the \`session-search\` tool to search your past session logs for relevant
context. This is useful when:
- Starting a task similar to previous work
- Remembering how you solved a problem before
- Finding past decisions or discussions

### 2. Observations (\`/remember\` and \`/recall\`)
Save key information as observations that persist across all sessions:
- \`/remember <text>\` — save without tags
- \`/remember --tag bug <text>\` — tag as bug fix
- \`/remember --tag pattern <text>\` — tag as reusable pattern
- \`/remember --tag decision <text>\` — tag as architectural decision
- \`/remember --tag fact <text>\` — tag as project fact
- \`/recall <query>\` — search saved observations
- \`/observations\` — list everything
- \`/forget <id>\` — delete an observation`;

// ============================================================================
// session-search tool definition
// ============================================================================

const SESSION_SEARCH_TOOL = {
	name: "session-search",
	label: "Session Search",
	description:
		"Searches past pi-star session logs for relevant context. " +
		"Use this when starting a task that might relate to previous work, " +
		"when you need to remember how a problem was solved before, " +
		"or when the user references something from an earlier session. " +
		"Searches the last 50 sessions by default.",
	promptSnippet: "Use session-search to find relevant context from past sessions before starting familiar tasks.",
	promptGuidelines: [
		"Before starting a task that might have precedent, search sessions first.",
		"Use specific search terms — function names, file paths, error messages.",
		"Combine with /recall to also check saved observations.",
	],
	parameters: Type.Object({
		query: Type.String({
			description: "Search terms to find in past session logs. Use specific keywords like file names, function names, error messages.",
		}),
		projectDir: Type.Optional(
			Type.String({
				description: "Project directory to search. Defaults to the current project.",
			}),
		),
		maxResults: Type.Optional(
			Type.Integer({
				description: "Maximum number of session results (default: 5, max: 10).",
			}),
		),
	}),
	execute: async (
		_toolCallId: string,
		params: { query: string; projectDir?: string; maxResults?: number },
	): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> => {
		try {
			const projectDir = params.projectDir || process.cwd();
			const maxResults = Math.min(params.maxResults || 5, 10);
			const result = searchSessions(params.query, projectDir, maxResults);
			return { content: [{ type: "text", text: result }], details: {} };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				content: [{ type: "text", text: `Session search error: ${message}` }],
				details: { error: message },
			};
		}
	},
};

// ============================================================================
// Auto-extraction: detect significant events after tool calls
// ============================================================================

function extractFromToolResult(event: any): Observation | null {
	if (event.toolName === "write") {
		const path = String(event.input?.path || "");
		const fileType = path.split(".").pop() || "unknown";
		return {
			id: generateId(),
			timestamp: Date.now(),
			tags: ["file-created"],
			text: `Created file: ${path}`,
			source: "auto",
		};
	}

	if (event.toolName === "edit") {
		const path = String(event.input?.path || "");
		return {
			id: generateId(),
			timestamp: Date.now(),
			tags: ["file-edited"],
			text: `Edited file: ${path}`,
			source: "auto",
		};
	}

	return null;
}

// ============================================================================
// Extension
// ============================================================================

export default function memoryLayerExtension(pi: ExtensionAPI) {
	// ── Helper: safe notify ──

	function notify(ctx: ExtensionCommandContext, msg: string, level: "info" | "warning" | "error" = "info"): void {
		if ((ctx as any).ui?.notify) {
			(ctx as any).ui.notify(msg, level);
		}
		if (level === "error") {
			console.error(`[memory] ${msg}`);
		} else {
			console.log(`[memory] ${msg}`);
		}
	}

	// ── Register LLM-callable tool ──

	pi.registerTool(SESSION_SEARCH_TOOL);

	// ── Commands ──

	pi.registerCommand("remember", {
		description: "Save an observation to memory. Usage: /remember [--tag bug|pattern|decision|fact] <text>",
		handler: async (ctx: ExtensionCommandContext) => {
			const ctxAny = ctx as any;
			const args: string[] = ctxAny.args || [];
			const fullText = args.join(" ").trim();

			if (!fullText) {
				notify(ctx, "Usage: /remember [--tag bug|pattern|decision|fact] <text>", "warning");
				return;
			}

			let tags: string[] = ["fact"];
			let text = fullText;

			const tagMatch = text.match(/^--tag\s+(\S+)\s*/);
			if (tagMatch) {
				const tag = tagMatch[1].toLowerCase();
				if (["bug", "pattern", "decision", "fact"].includes(tag)) {
					tags = [tag];
				}
				text = text.slice(tagMatch[0].length);
			}

			const obs: Observation = {
				id: generateId(),
				timestamp: Date.now(),
				tags,
				text,
			};

			appendObservation(obs);
			notify(ctx, `Saved [${obs.id}] (${tags.join(", ")}): ${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`, "info");
		},
	});

	pi.registerCommand("recall", {
		description: "Search saved observations. Usage: /recall <query>",
		handler: async (ctx: ExtensionCommandContext) => {
			const ctxAny = ctx as any;
			const args: string[] = ctxAny.args || [];
			const query = args.join(" ").trim();

			if (!query) {
				notify(ctx, "Usage: /recall <search query>", "warning");
				return;
			}

			const result = searchObservations(query);
			notify(ctx, result, "info");
		},
	});

	pi.registerCommand("forget", {
		description: "Delete an observation by ID. Usage: /forget <id>",
		handler: async (ctx: ExtensionCommandContext) => {
			const ctxAny = ctx as any;
			const args: string[] = ctxAny.args || [];
			const id = args[0];

			if (!id) {
				notify(ctx, "Usage: /forget <observation-id>", "warning");
				return;
			}

			const observations = loadObservations();
			const idx = observations.findIndex((o) => o.id === id);

			if (idx === -1) {
				notify(ctx, `No observation found with id "${id}"`, "warning");
				return;
			}

			const removed = observations.splice(idx, 1);
			rewriteObservations(observations);
			notify(ctx, `Forgot [${id}]: ${removed[0].text.slice(0, 80)}`, "info");
		},
	});

	pi.registerCommand("observations", {
		description: "List all saved observations",
		handler: async (ctx: ExtensionCommandContext) => {
			const observations = loadObservations();
			if (observations.length === 0) {
				notify(ctx, "No observations saved yet. Use /remember <text> to save one.", "info");
				return;
			}

			const lines = observations
				.map(
					(o) =>
						`[${o.id}] ${new Date(o.timestamp).toLocaleString()} (${o.tags.join(",")})\n  ${o.text.slice(0, 120)}`,
				)
				.join("\n\n");
			notify(ctx, lines, "info");
		},
	});

	// ── Lifecycle hooks ──

	pi.on("before_agent_start", async (event: any) => {
		return {
			systemPrompt: event.systemPrompt + "\n\n" + MEMORY_GUIDE,
		};
	});

	// Auto-extraction: after tool calls, save observations for writes/edits
	pi.on("after_tool_call", async (event: any, _ctx: any) => {
		const obs = extractFromToolResult(event);
		if (obs) {
			appendObservation(obs);
		}
	});

	pi.on("session_start", async (_event: any, ctx: any) => {
		const obsCount = loadObservations().length;
		const sessionCount = listSessionFiles(process.cwd()).length;
		if (ctx.hasUI) {
			const msg = `Memory active — ${obsCount} observations, ${sessionCount} session logs searchable`;
			if ((ctx as any).ui?.notify) {
				(ctx as any).ui.notify(msg, "info");
			}
			console.log(`[memory] ${msg}`);
		}
	});
}
