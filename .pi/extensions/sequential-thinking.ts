/**
 * Sequential-Thinking MCP Extension
 *
 * Registers the sequential-thinking tool as an LLM-callable tool in Pi-Star.
 * The tool delegates to the @modelcontextprotocol/server-sequential-thinking MCP
 * server over stdio, providing structured reasoning capabilities to the agent.
 *
 * Based on experimental evidence (research/mcp-vs-cot/):
 *   - MCP (sequential-thinking) significantly improves analysis/synthesis tasks
 *   - Modestly improves creative design tasks
 *   - No benefit for straightforward enumeration tasks
 *
 * The server is started lazily on first tool call and kept alive for the session.
 *
 * Benchmark evidence:
 *   - 4x more meta-patterns found vs native CoT for synthesis tasks
 *   - Forces explicit alternative evaluation via branching
 *   - Enables self-correction via revision tracking
 *   - ~2x time cost is justified for complex tasks
 *
 * See research/mcp-vs-cot/ for the full experiment.
 */

import type { ExtensionAPI } from "@b67687/pi-star-coding-agent";
import { Type } from "@sinclair/typebox";

// ============================================================================
// MCP Protocol Types
// ============================================================================

interface MCPRequest {
	jsonrpc: "2.0";
	id: number;
	method: string;
	params?: unknown;
}

interface MCPResponse {
	jsonrpc: "2.0";
	id: number;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

// ============================================================================
// MCP Client — manages a stdio-based MCP server subprocess
// ============================================================================

let serverProcess: import("node:child_process").ChildProcess | null = null;
let requestId = 1;
let pendingResolve: ((value: MCPResponse) => void) | null = null;
let responseBuffer = "";
let isInitialized = false;

/**
 * Start the sequential-thinking MCP server.
 * Uses npx to fetch and run @modelcontextprotocol/server-sequential-thinking.
 */
async function startServer(): Promise<void> {
	if (serverProcess) return;

	const { spawn } = await import("node:child_process");

	serverProcess = spawn("npx", ["-y", "@modelcontextprotocol/server-sequential-thinking"], {
		stdio: ["pipe", "pipe", "pipe"],
		shell: false,
	});

	let startupResolve: (() => void) | null = null;
	let startupReject: ((err: Error) => void) | null = null;
	const startupPromise = new Promise<void>((resolve, reject) => {
		startupResolve = resolve;
		startupReject = reject;
	});

	// Collect stdout data and extract JSON-RPC responses
	serverProcess.stdout?.on("data", (chunk: Buffer) => {
		responseBuffer += chunk.toString();

		// Process complete lines (JSON-RPC messages are newline-delimited)
		let newlineIdx: number;
		while ((newlineIdx = responseBuffer.indexOf("\n")) !== -1) {
			const line = responseBuffer.slice(0, newlineIdx).trim();
			responseBuffer = responseBuffer.slice(newlineIdx + 1);

			if (!line) continue;

			try {
				const response = JSON.parse(line) as MCPResponse;

				// If we haven't initialized yet, the first response is the initialize result
				if (!isInitialized && response.id === 0) {
					isInitialized = true;
					startupResolve?.();
					continue;
				}

				// Resolve pending tool call
				if (pendingResolve) {
					pendingResolve(response);
					pendingResolve = null;
				}
			} catch {
				// Non-JSON output (npx download progress, etc.) — ignore
			}
		}
	});

	serverProcess.stderr?.on("data", (chunk: Buffer) => {
		// MCP servers may log to stderr — ignore during normal operation
		const text = chunk.toString();
		if (text.includes("Error") || text.includes("error") || text.includes("FAIL")) {
			// Only surface actual errors
		}
	});

	serverProcess.on("error", (err: Error) => {
		startupReject?.(err);
		cleanup();
	});

	serverProcess.on("close", () => {
		if (!isInitialized) {
			startupReject?.(new Error("Server process exited during startup"));
		}
		cleanup();
	});

	// Wait for server to start and respond to initialize
	// Use a timeout for npx download + server startup
	const timeout = 30_000;
	const timeoutId = setTimeout(() => {
		if (!isInitialized) {
			startupReject?.(new Error(`Server startup timed out after ${timeout}ms`));
			cleanup();
		}
	}, timeout);

	try {
		await startupPromise;
	} finally {
		clearTimeout(timeoutId);
	}

	// Send initialize request
	await sendRawMessage("initialize", {
		protocolVersion: "2025-11-25",
		capabilities: {},
		clientInfo: { name: "pi-star-mcp", version: "0.1.0" },
	});
}

/**
 * Send a JSON-RPC message to the MCP server and wait for the response.
 */
function sendRawMessage(method: string, params?: unknown): Promise<MCPResponse> {
	return new Promise((resolve, reject) => {
		if (!serverProcess?.stdin || !serverProcess?.stdout) {
			reject(new Error("MCP server not connected"));
			return;
		}

		const id = requestId++;
		const request: MCPRequest = { jsonrpc: "2.0", id, method, params };

		pendingResolve = resolve;
		serverProcess.stdin.write(JSON.stringify(request) + "\n");
	});
}

/**
 * Call a tool on the MCP server.
 */
async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
	// Ensure server is running
	if (!serverProcess || !isInitialized) {
		await startServer();
	}

	const response = await sendRawMessage("tools/call", { name, arguments: args });

	if (response.error) {
		throw new Error(`MCP error: ${response.error.message} (code ${response.error.code})`);
	}

	const result = response.result as Record<string, unknown> | undefined;
	if (!result) {
		return "No result from MCP server";
	}

	const content = (result as any)?.content as Array<{ type: string; text?: string }> | undefined;
	if (content && Array.isArray(content)) {
		return content.map((c) => c.text ?? "").join("\n");
	}

	return JSON.stringify(result, null, 2);
}

/**
 * Clean up the MCP server process.
 */
function cleanup(): void {
	if (serverProcess) {
		try {
			serverProcess.kill("SIGTERM");
		} catch {
			// Process may already be dead
		}
		serverProcess = null;
	}
	isInitialized = false;
	pendingResolve = null;
	responseBuffer = "";
}

// ============================================================================
// Tool Definition — registered as an LLM-callable tool
// ============================================================================

const sequentialThinkingTool = {
	name: "sequential-thinking",
	label: "Sequential Thinking",
	description:
		"A detailed tool for dynamic and reflective problem-solving through thoughts. " +
		"This tool helps analyze problems through a flexible thinking process that can adapt and evolve. " +
		"Each thought can build on, question, or revise previous insights as understanding deepens. " +
		"Use this tool for complex multi-step problems, architectural decisions, and any task requiring " +
		"systematic analysis with branching alternatives and self-correction.",
	promptSnippet: "Prefer sequential-thinking for hard multi-step planning and analysis.",
	promptGuidelines: [
		"Use sequential-thinking for complex, multi-step, or open-ended tasks before writing code.",
		"Each call represents one atomic thought. Build on, branch from, or revise previous thoughts.",
		"Set nextThoughtNeeded=true to continue the chain across multiple turns.",
		"Use branchFromThought + branchId to explore alternatives explicitly.",
		"Use isRevision=true when self-correcting a previous thought.",
	],
	parameters: Type.Object({
		thought: Type.String({
			description: "Your current thinking step",
		}),
		nextThoughtNeeded: Type.Boolean({
			description: "Whether another thought step is needed",
		}),
		thoughtNumber: Type.Integer({
			description: "Current thought number (1-based). Increment each sequential call.",
		}),
		totalThoughts: Type.Integer({
			description: "Estimated total thoughts needed. Can be adjusted as you progress.",
		}),
		isRevision: Type.Optional(
			Type.Boolean({
				description: "Whether this revises previous thinking",
			}),
		),
		revisesThought: Type.Optional(
			Type.Integer({
				description: "Which thought number is being reconsidered",
			}),
		),
		branchFromThought: Type.Optional(
			Type.Integer({
				description: "Branching point thought number",
			}),
		),
		branchId: Type.Optional(
			Type.String({
				description: "Branch identifier for exploring alternative paths",
			}),
		),
		needsMoreThoughts: Type.Optional(
			Type.Boolean({
				description: "Set to true if even more thoughts are needed beyond totalThoughts",
			}),
		),
	}),
	execute: async (
		_toolCallId: string,
		params: Record<string, unknown>,
		_signal: AbortSignal | undefined,
		_onUpdate: ((result: { content: Array<{ type: string; text: string }>; details: unknown }) => void) | undefined,
		_ctx: Record<string, unknown>,
	): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> => {
		try {
			const resultText = await callTool("sequential-thinking", params);
			return { content: [{ type: "text", text: resultText }], details: {} };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				content: [
					{
						type: "text",
						text: `⚠ MCP error: ${message}\n\nFalling back to native reasoning. Proceed without structured thinking.`,
					},
				],
				details: { error: message },
			};
		}
	},
};

// ============================================================================
// Extension Entry Point
// ============================================================================

export default function sequentialThinkingExtension(pi: ExtensionAPI) {
	// Register the sequential-thinking as an LLM-callable tool
	pi.registerTool(sequentialThinkingTool);

	// Register a convenience command for direct use
	pi.registerCommand("mcp-think", {
		description: "Use sequential-thinking MCP for structured reasoning. Invokes the tool directly.",
		handler: async () => {
			// The command just alerts the user — actual work is done via the tool
		},
	});

	// Clean up the MCP server on session shutdown
	pi.on("session_shutdown", async () => {
		cleanup();
	});
}
