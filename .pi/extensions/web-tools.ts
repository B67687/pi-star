/**
 * Web Tools Extension — fetch-url + search-web for agent research
 *
 * Provides LLM-callable web access tools so pi-star can research,
 * fetch documentation, and search the web — just like OpenCode.
 *
 * Configuration (in .pi/settings.json):
 *   {
 *     "webTools": {
 *       "searchEndpoint": "https://api.duckduckgo.com/",
 *       "searchApiKey": null
 *     }
 *   }
 *
 * Default search uses DuckDuckGo Instant Answer API (free, no key).
 * For full web search, configure a SearXNG, UnSearch, or Tavily endpoint.
 *
 * Usage:
 *   /web-search <query>       — search the web
 *   /web-fetch <url>          — fetch and display page content
 *   /web-config               — show current configuration
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@b67687/pi-star-coding-agent";
import { Type } from "@sinclair/typebox";
import * as https from "node:https";
import * as http from "node:http";
import { URL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

interface WebToolsConfig {
	searchEndpoint?: string;
	searchApiKey?: string | null;
}

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

// ============================================================================
// Configuration
// ============================================================================

function loadConfig(cwd: string): WebToolsConfig {
	try {
		const settingsPath = join(cwd, ".pi", "settings.json");
		if (existsSync(settingsPath)) {
			const raw = JSON.parse(readFileSync(settingsPath, "utf-8"));
			return raw.webTools || {};
		}
	} catch {
		// ignore
	}
	return {};
}

const DEFAULT_SEARCH_ENDPOINT = "https://api.duckduckgo.com/";

// ============================================================================
// HTTP helpers
// ============================================================================

function httpRequest(
	urlStr: string,
	method: string = "GET",
	headers: Record<string, string> = {},
	body?: string,
	timeoutMs: number = 15000,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const url = new URL(urlStr);
		const mod = url.protocol === "https:" ? https : http;

		const options: https.RequestOptions = {
			method,
			hostname: url.hostname,
			port: url.port || (url.protocol === "https:" ? 443 : 80),
			path: url.pathname + url.search,
			headers: {
				"User-Agent": "Pi-Star/0.74 WebTools Extension",
				...headers,
			},
			timeout: timeoutMs,
		};

		const req = mod.request(options, (res) => {
			const chunks: Buffer[] = [];
			res.on("data", (chunk: Buffer) => chunks.push(chunk));
			res.on("end", () => {
				const data = Buffer.concat(chunks).toString("utf-8");
				resolve(data);
			});
		});

		req.on("error", (err) => reject(new Error(`Request failed: ${err.message}`)));
		req.on("timeout", () => {
			req.destroy();
			reject(new Error(`Request timed out after ${timeoutMs}ms`));
		});

		if (body) req.write(body);
		req.end();
	});
}

// ============================================================================
// URL fetching
// ============================================================================

async function fetchUrl(urlStr: string): Promise<{ content: string; contentType: string }> {
	const url = new URL(urlStr);
	const mod = url.protocol === "https:" ? https : http;

	return new Promise((resolve, reject) => {
		const options: https.RequestOptions = {
			method: "GET",
			hostname: url.hostname,
			port: url.port || (url.protocol === "https:" ? 443 : 80),
			path: url.pathname + url.search,
			headers: {
				"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
			timeout: 30000,
		};

		const req = mod.request(options, (res) => {
			const chunks: Buffer[] = [];
			const contentType = res.headers["content-type"] || "text/plain";

			res.on("data", (chunk: Buffer) => chunks.push(chunk));
			res.on("end", () => {
				const data = Buffer.concat(chunks).toString("utf-8");
				// Strip HTML tags for readability if it's HTML
				let content = data;
				if (contentType.includes("text/html")) {
					content = data
						.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
						.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
						.replace(/<[^>]+>/g, " ")
						.replace(/&[^;]+;/g, " ")
						.replace(/\s+/g, " ")
						.trim();
					if (content.length > 15000) content = content.slice(0, 15000) + "\n... [truncated]";
				}
				resolve({ content, contentType });
			});
		});

		req.on("error", (err) => reject(new Error(`Fetch failed: ${err.message}`)));
		req.on("timeout", () => {
			req.destroy();
			reject(new Error("Fetch timed out after 30s"));
		});

		req.end();
	});
}

// ============================================================================
// Web search
// ============================================================================

async function searchWeb(query: string, config: WebToolsConfig): Promise<string> {
	const endpoint = config.searchEndpoint || DEFAULT_SEARCH_ENDPOINT;

	// DuckDuckGo Instant Answer API (free, no key)
	if (endpoint.includes("duckduckgo.com")) {
		const url = `${endpoint}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
		try {
			const response = await httpRequest(url, "GET", {
				Accept: "application/json",
			});
			const data = JSON.parse(response);

			const results: SearchResult[] = [];
			const answer = data.AbstractText || data.Answer || "";
			const source = data.AbstractSource || "";
			const sourceUrl = data.AbstractURL || "";

			// Related topics
			if (data.RelatedTopics) {
				for (const topic of data.RelatedTopics) {
					if (topic.Text && topic.FirstURL) {
						results.push({
							title: topic.Text.split(" - ")[0] || topic.Text.slice(0, 60),
							url: topic.FirstURL,
							snippet: topic.Text,
						});
					}
					// Handle sub-categories
					if (topic.Topics) {
						for (const sub of topic.Topics) {
							if (sub.Text && sub.FirstURL) {
								results.push({
									title: sub.Text.split(" - ")[0] || sub.Text.slice(0, 60),
									url: sub.FirstURL,
									snippet: sub.Text,
								});
							}
						}
					}
				}
			}

			let output = "";
			if (answer) output += `Answer: ${answer}\n`;
			if (source) output += `Source: ${source} (${sourceUrl})\n`;
			if (results.length > 0) {
				output += "\nResults:\n";
				for (const r of results.slice(0, 8)) {
					output += `  • ${r.title}\n    ${r.url}\n    ${r.snippet.slice(0, 200)}\n\n`;
				}
			}
			if (!output) output = "No results found.";
			return output;
		} catch (err) {
			return `Search failed: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	// Generic OpenSearch-compatible endpoint (SearXNG, UnSearch, Tavily, etc.)
	try {
		const body = JSON.stringify({ q: query });
		const response = await httpRequest(
			endpoint,
			"POST",
			{
				"Content-Type": "application/json",
				...(config.searchApiKey ? { Authorization: `Bearer ${config.searchApiKey}` } : {}),
			},
			body,
			20000,
		);
		return response.slice(0, 8000);
	} catch (err) {
		return `Search via ${endpoint} failed: ${err instanceof Error ? err.message : String(err)}`;
	}
}

// ============================================================================
// Tool definitions
// ============================================================================

const FETCH_URL_TOOL = {
	name: "fetch-url",
	label: "Fetch URL",
	description: "Fetch the content of a URL and return it as text. Strips HTML tags for readability. Use for reading documentation, blogs, and web pages.",
	promptSnippet: "Use fetch-url to read web pages, documentation, and online resources.",
	promptGuidelines: [
		"Use fetch-url to read web documentation, blog posts, and technical articles.",
		"Results are stripped of HTML — you get the text content.",
		"Long pages are truncated at 15000 characters.",
	],
	parameters: Type.Object({
		url: Type.String({
			description: "The URL to fetch. Must include protocol (https:// or http://).",
		}),
	}),
	execute: async (
		_toolCallId: string,
		params: { url: string },
	): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> => {
		try {
			const result = await fetchUrl(params.url);
			return {
				content: [{ type: "text", text: result.content }],
				details: { contentType: result.contentType },
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				content: [{ type: "text", text: `Error fetching ${params.url}: ${message}` }],
				details: { error: message },
				isError: true,
			};
		}
	},
};

const SEARCH_WEB_TOOL = {
	name: "search-web",
	label: "Search Web",
	description: "Search the web for information. Uses the configured search endpoint (default: DuckDuckGo Instant Answer API). Configure via .pi/settings.json webTools.searchEndpoint.",
	promptSnippet: "Use search-web to research technical questions, find documentation, and look up information.",
	promptGuidelines: [
		"Use search-web for research, looking up documentation, finding solutions to problems.",
		"Default is DuckDuckGo Instant Answer — good for factual queries but limited results.",
		"For comprehensive search, configure a full search API endpoint in settings.",
	],
	parameters: Type.Object({
		query: Type.String({
			description: "The search query string.",
		}),
	}),
	execute: async (
		_toolCallId: string,
		params: { query: string },
	): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> => {
		try {
			const config = loadConfig(process.cwd());
			const result = await searchWeb(params.query, config);
			return { content: [{ type: "text", text: result }], details: {} };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				content: [{ type: "text", text: `Search failed: ${message}` }],
				details: { error: message },
				isError: true,
			};
		}
	},
};

// ============================================================================
// System prompt guide
// ============================================================================

const WEB_TOOLS_GUIDE = `## Web Tools

You have two web research tools available:

### fetch-url
Fetches a URL and returns the text content. HTML tags are stripped for readability.
Use for: reading documentation, blogs, articles, API references.
Example: \`fetch-url("https://example.com/docs")\`

### search-web
Searches the web using the configured search endpoint.
Default: DuckDuckGo Instant Answer API (free, limited results).
Use for: researching problems, finding docs, looking up syntax.
Example: \`search-web("how to use Node.js streams")\`

### Tips
1. Search first, then fetch the specific pages that look relevant.
2. For complex research, do multiple searches with different queries.
3. If DuckDuckGo returns limited results, try more specific queries.`;

// ============================================================================
// Extension
// ============================================================================

export default function webToolsExtension(pi: ExtensionAPI) {
	pi.registerTool(FETCH_URL_TOOL);
	pi.registerTool(SEARCH_WEB_TOOL);

	// ── Helper ──

	function notify(ctx: ExtensionCommandContext, msg: string, level: "info" | "warning" | "error" = "info"): void {
		if ((ctx as any).ui?.notify) {
			(ctx as any).ui.notify(msg, level);
		}
		console.log(`[web-tools] ${msg}`);
	}

	// ── Commands ──

	pi.registerCommand("web-search", {
		description: "Search the web. Usage: /web-search <query>",
		handler: async (ctx: ExtensionCommandContext) => {
			const ctxAny = ctx as any;
			const args: string[] = ctxAny.args || [];
			const query = args.join(" ").trim();
			if (!query) {
				notify(ctx, "Usage: /web-search <search query>", "warning");
				return;
			}
			notify(ctx, `Searching: ${query}...`, "info");
			const config = loadConfig(process.cwd());
			const result = await searchWeb(query, config);
			notify(ctx, result, "info");
		},
	});

	pi.registerCommand("web-fetch", {
		description: "Fetch a URL. Usage: /web-fetch <url>",
		handler: async (ctx: ExtensionCommandContext) => {
			const ctxAny = ctx as any;
			const args: string[] = ctxAny.args || [];
			const url = args[0];
			if (!url) {
				notify(ctx, "Usage: /web-fetch <url>", "warning");
				return;
			}
			notify(ctx, `Fetching ${url}...`, "info");
			try {
				const result = await fetchUrl(url);
				notify(ctx, result.content.slice(0, 3000), "info");
			} catch (err) {
				notify(ctx, `Error: ${err instanceof Error ? err.message : String(err)}`, "error");
			}
		},
	});

	pi.registerCommand("web-config", {
		description: "Show current web tools configuration",
		handler: async (ctx: ExtensionCommandContext) => {
			const config = loadConfig(process.cwd());
			const endpoint = config.searchEndpoint || DEFAULT_SEARCH_ENDPOINT;
			notify(ctx, `Search endpoint: ${endpoint}\nAPI key configured: ${config.searchApiKey ? "yes" : "no"}\n\nConfigure in .pi/settings.json:\n{ "webTools": { "searchEndpoint": "...", "searchApiKey": "..." } }`, "info");
		},
	});

	// ── Lifecycle hooks ──

	pi.on("before_agent_start", async (event: any) => {
		return {
			systemPrompt: event.systemPrompt + "\n\n" + WEB_TOOLS_GUIDE,
		};
	});
}
