/**
 * Subagent Layer — Parallel exploration + Isolated agent dispatch
 *
 * Layer 5 of the Pi-Star architecture: delegate tasks to specialized
 * subagents with isolated context windows.
 *
 * Modes:
 *   - Single:  { agent: "name", task: "..." }
 *   - Parallel: { tasks: [{ agent, task }, ...] } — concurrent execution
 *   - Chain:    { chain: [{ agent, task }, ...] } — sequential with {previous}
 *   - Sandbox:  any mode + sandbox: true — runs in bwrap/Docker isolation
 *
 * Agent definitions live in .pi/agents/*.md (project) or ~/.pi/agent/agents/*.md (user).
 *
 * Usage:
 *   /agents         — list available agents
 *   /subagent <name> <task> — quick single-agent dispatch
 *   /subagent-chain <task1> | <agent> | <task2>  — chain dispatch
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@b67687/pi-star-coding-agent";
import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir, tmpdir } from "node:os";

// ============================================================================
// Types
// ============================================================================

interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "user" | "project";
}

interface SubagentResult {
	agent: string;
	task: string;
	exitCode: number;
	output: string;
	usage: string;
	error?: string;
}

// ============================================================================
// Agent discovery
// ============================================================================

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	const agents: AgentConfig[] = [];
	if (!existsSync(dir)) return agents;

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.name.endsWith(".md") || !entry.isFile()) continue;
		const content = readFileSync(join(dir, entry.name), "utf-8");
		const frontmatter = parseFrontmatter(content);
		if (!frontmatter.name || !frontmatter.description) continue;

		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools?.length ? tools : undefined,
			model: frontmatter.model,
			systemPrompt: extractBody(content),
			source,
		});
	}
	return agents;
}

function parseFrontmatter(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	const match = content.match(/^---\n([\s\S]*?)\n---\n/);
	if (!match) return result;

	for (const line of match[1].split("\n")) {
		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;
		const key = line.slice(0, colonIdx).trim();
		const value = line.slice(colonIdx + 1).trim();
		result[key] = value;
	}
	return result;
}

function extractBody(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---\n(.*)$/s);
	return match ? match[1].trim() : content;
}

function discoverAgents(cwd: string): AgentConfig[] {
	const userDir = join(homedir(), ".pi", "agent", "agents");
	const projectDir = findProjectAgentsDir(cwd);
	const userAgents = loadAgentsFromDir(userDir, "user");
	const projectAgents = projectDir ? loadAgentsFromDir(projectDir, "project") : [];
	return [...userAgents, ...projectAgents];
}

function findProjectAgentsDir(cwd: string): string | null {
	let current = cwd;
	while (true) {
		const candidate = join(current, ".pi", "agents");
		if (existsSync(candidate)) return candidate;
		const parent = join(current, "..");
		if (parent === current) return null;
		current = parent;
	}
}

// ============================================================================
// Sub-agent execution
// ============================================================================

async function runSubagent(
	agent: AgentConfig,
	task: string,
	cwd: string,
	sandbox: boolean,
	timeout: number,
): Promise<SubagentResult> {
	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools?.length) args.push("--tools", agent.tools.join(","));

	// Write system prompt to temp file and append
	let tmpDir: string | null = null;
	try {
		if (agent.systemPrompt) {
			tmpDir = mkdtempSync("pi-subagent-");
			const promptFile = join(tmpDir, "prompt.md");
			writeFileSync(promptFile, agent.systemPrompt, "utf-8");
			args.push("--append-system-prompt", promptFile);
		}

		args.push(sandbox ? `Sandboxed task: ${task}` : `Task: ${task}`);

		const result = await spawnWithTimeout(args, cwd, timeout);
		return {
			agent: agent.name,
			task,
			exitCode: result.exitCode,
			output: result.output,
			usage: result.usage,
			error: result.error,
		};
	} finally {
		if (tmpDir) {
			try {
				rmdirSync(tmpDir, { recursive: true });
			} catch {
				/* ignore */
			}
		}
	}
}

function mkdtempSync(prefix: string): string {
	const dir = join(tmpdir(), prefix + Math.random().toString(36).slice(2, 10));
	mkdirSync(dir, { recursive: true });
	return dir;
}

interface SpawnResult {
	exitCode: number;
	output: string;
	usage: string;
	error?: string;
}

function spawnWithTimeout(
	args: string[],
	cwd: string,
	timeoutMs: number,
): Promise<SpawnResult> {
	return new Promise((resolve) => {
		const invocation = findPiInvocation();
		const proc = spawn(invocation.command, [...invocation.args, ...args], {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			timeout: timeoutMs,
		});

		let stdout = "";
		let stderr = "";
		let usageStats = "";

		proc.stdout.on("data", (data: Buffer) => {
			const text = data.toString();
			stdout += text;
			// Extract usage from JSON events
			for (const line of text.split("\n")) {
				try {
					const event = JSON.parse(line);
					if (event.type === "message_end" && event.message?.usage) {
						const u = event.message.usage;
						usageStats = `in:${u.input || 0} out:${u.output || 0} cache:${u.cacheRead || 0} cost:$${((u.cost?.total || 0)).toFixed(4)}`;
					}
				} catch {
					// skip non-JSON lines
				}
			}
		});

		proc.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			// Extract the final text output from JSON events
			let finalOutput = stdout;
			const lines = stdout.split("\n").filter(Boolean);
			for (const line of lines.slice(-10)) {
				try {
					const event = JSON.parse(line);
					if (event.type === "message_end" && event.message) {
						const msg = event.message;
						for (const part of msg.content || []) {
							if (part.type === "text" && part.text) {
								finalOutput = part.text;
							}
						}
					}
				} catch {
					// skip
				}
			}

			resolve({
				exitCode: code ?? 1,
				output: finalOutput || "(no output)",
				usage: usageStats,
				error: stderr || undefined,
			});
		});

		proc.on("error", (err) => {
			resolve({
				exitCode: 1,
				output: "(no output)",
				usage: "",
				error: err.message,
			});
		});
	});
}

function findPiInvocation(): { command: string; args: string[] } {
	// Try to re-use the current pi-star process path
	const currentScript = process.argv[1];
	if (currentScript && existsSync(currentScript) && !currentScript.startsWith("/$bunfs/")) {
		return { command: process.execPath, args: [currentScript] };
	}
	return { command: "pi-star", args: [] };
}

// ============================================================================
// Concurrency limit
// ============================================================================

async function mapWithConcurrency<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;
	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current], current);
		}
	});
	await Promise.all(workers);
	return results;
}

// ============================================================================
// Tool definition
// ============================================================================

const SUBAGENT_TOOL = {
	name: "subagent",
	label: "Subagent",
	description: [
		"Delegate tasks to specialized subagents with isolated context.",
		"Modes: single (agent + task), parallel (tasks array), chain (sequential with {previous} placeholder).",
		"Set sandbox=true to run in bwrap/Docker isolation.",
		"Agents are discovered from .pi/agents/*.md (project) and ~/.pi/agent/agents/*.md (user).",
	].join(" "),
	promptSnippet: "Use subagent to delegate tasks to specialized agents (scout, planner, worker, reviewer).",
	promptGuidelines: [
		"Use subagent for complex multi-step work that benefits from isolated context.",
		"Parallel mode is best for exploration — fan out to multiple agents simultaneously.",
		"Chain mode is best for sequential workflows (scout → plan → implement → review).",
	],
	parameters: Type.Object({
		agent: Type.Optional(Type.String({ description: "Agent name (for single mode)" })),
		task: Type.Optional(Type.String({ description: "Task description (for single mode)" })),
		tasks: Type.Optional(
			Type.Array(
				Type.Object({
					agent: Type.String(),
					task: Type.String(),
				}),
				{ description: "Array of {agent, task} for parallel execution" },
			),
		),
		chain: Type.Optional(
			Type.Array(
				Type.Object({
					agent: Type.String(),
					task: Type.String({ description: "Task with optional {previous} placeholder" }),
				}),
				{ description: "Array of {agent, task} for sequential execution" },
			),
		),
		sandbox: Type.Optional(Type.Boolean({ description: "Run in sandboxed environment. Default: false." })),
		timeout: Type.Optional(
			Type.Integer({ description: "Timeout per agent in seconds. Default: 120.", minimum: 10, maximum: 600 }),
		),
	}),
	execute: async (
		_toolCallId: string,
		params: {
			agent?: string;
			task?: string;
			tasks?: Array<{ agent: string; task: string }>;
			chain?: Array<{ agent: string; task: string }>;
			sandbox?: boolean;
			timeout?: number;
		},
		_signal: AbortSignal | undefined,
	): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> => {
		try {
			const cwd = process.cwd();
			const agents = discoverAgents(cwd);
			const timeoutMs = (params.timeout || 120) * 1000;
			const sandbox = params.sandbox || false;

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

			if (modeCount !== 1) {
				const agentList = agents.map((a) => `${a.name}: ${a.description}`).join("\n") || "none";
				return {
					content: [{ type: "text", text: `Provide exactly one mode (single/parallel/chain).\nAvailable agents:\n${agentList}` }],
					details: {},
				};
			}

			// Chain mode
			if (params.chain && params.chain.length > 0) {
				const results: SubagentResult[] = [];
				let previousOutput = "";

				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i];
					const agent = agents.find((a) => a.name === step.agent);
					if (!agent) {
						results.push({
							agent: step.agent,
							task: step.task,
							exitCode: 1,
							output: "",
							usage: "",
							error: `Unknown agent: ${step.agent}`,
						});
						break;
					}

					const resolvedTask = step.task.replace(/\{previous\}/g, previousOutput);
					const result = await runSubagent(agent, resolvedTask, cwd, sandbox, timeoutMs);
					results.push(result);

					if (result.exitCode !== 0) {
						return {
							content: [{ type: "text", text: `Chain stopped at step ${i + 1} (${step.agent}): ${result.error || result.output}` }],
							details: { mode: "chain", results },
							isError: true,
						};
					}
					previousOutput = result.output;
				}

				const summary = results.map((r) => `[${r.agent}] exit:${r.exitCode} ${r.usage}\n${r.output.slice(0, 300)}`).join("\n\n---\n\n");
				return {
					content: [{ type: "text", text: summary }],
					details: { mode: "chain", results },
				};
			}

			// Parallel mode
			if (params.tasks && params.tasks.length > 0) {
				if (params.tasks.length > 8) {
					return {
						content: [{ type: "text", text: `Too many parallel tasks (${params.tasks.length}). Max is 8.` }],
						details: {},
					};
				}

				const results = await mapWithConcurrency(params.tasks, 4, async (t) => {
					const agent = agents.find((a) => a.name === t.agent);
					if (!agent) {
						return {
							agent: t.agent,
							task: t.task,
							exitCode: 1,
							output: "",
							usage: "",
							error: `Unknown agent: ${t.agent}`,
						} as SubagentResult;
					}
					return runSubagent(agent, t.task, cwd, sandbox, timeoutMs);
				});

				const successCount = results.filter((r) => r.exitCode === 0).length;
				const summaries = results
					.map(
						(r) =>
							`[${r.agent}] ${r.exitCode === 0 ? "✓" : "✗"} ${r.usage}\n  ${r.output.slice(0, 200)}`,
					)
					.join("\n\n");

				return {
					content: [{ type: "text", text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries}` }],
					details: { mode: "parallel", results },
				};
			}

			// Single mode
			if (params.agent && params.task) {
				const agent = agents.find((a) => a.name === params.agent);
				if (!agent) {
					const agentList = agents.map((a) => a.name).join(", ") || "none";
					return {
						content: [{ type: "text", text: `Unknown agent: "${params.agent}". Available: ${agentList}` }],
						details: {},
					};
				}

				const result = await runSubagent(agent, params.task, cwd, sandbox, timeoutMs);

				if (result.exitCode !== 0) {
					return {
						content: [{ type: "text", text: `Agent ${params.agent} failed: ${result.error || result.output}` }],
						details: { mode: "single", results: [result] },
						isError: true,
					};
				}

				return {
					content: [{ type: "text", text: result.output }],
					details: { mode: "single", results: [result] },
				};
			}

			const agentList = agents.map((a) => `${a.name}: ${a.description}`).join("\n") || "none";
			return {
				content: [{ type: "text", text: `Available agents:\n${agentList}\n\nUsage: provide agent+task (single), tasks[] (parallel), or chain[] (sequential).` }],
				details: {},
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				content: [{ type: "text", text: `Subagent error: ${message}` }],
				details: { error: message },
				isError: true,
			};
		}
	},
};

// ============================================================================
// System prompt guide
// ============================================================================

const SUBAGENT_GUIDE = `## Subagent Layer

You can delegate tasks to specialized subagents with isolated context windows
using the \`subagent\` tool.

### Modes
- **Single**: \`{ agent: "worker", task: "..." }\` — one agent, one task
- **Parallel**: \`{ tasks: [{ agent: "scout", task: "..." }, { agent: "scout", task: "..." }] }\` — concurrent
- **Chain**: \`{ chain: [{ agent: "scout", task: "..." }, { agent: "planner", task: "... {previous} ..." }] }\` — sequential

### Available agents
List them with \`/agents\`.

### When to use
- **Scout** — exploring unfamiliar code, finding relevant files
- **Planner** — designing architecture, writing specs
- **Worker** — implementing code changes
- **Reviewer** — reviewing diffs, catching bugs

### Sandbox
Set \`sandbox: true\` for risky operations — runs in bwrap/Docker isolation.`;

// ============================================================================
// Extension
// ============================================================================

export default function subagentLayerExtension(pi: ExtensionAPI) {
	pi.registerTool(SUBAGENT_TOOL);

	// ── Helper ──

	function notify(ctx: ExtensionCommandContext, msg: string, level: "info" | "warning" | "error" = "info"): void {
		if ((ctx as any).ui?.notify) {
			(ctx as any).ui.notify(msg, level);
		}
		console.log(`[subagent] ${msg}`);
	}

	// ── Commands ──

	pi.registerCommand("agents", {
		description: "List available subagents",
		handler: async (ctx: ExtensionCommandContext) => {
			const agents = discoverAgents(process.cwd());
			if (agents.length === 0) {
				notify(ctx, "No agents found. Create .md files in ~/.pi/agent/agents/ or .pi/agents/", "info");
				return;
			}
			const lines = agents.map(
				(a) => `  ${a.name} (${a.source})${a.model ? ` [model: ${a.model}]` : ""}: ${a.description}`,
			);
			notify(ctx, `Available agents:\n${lines.join("\n")}\n\nUse subagent tool to invoke.`, "info");
		},
	});

	pi.registerCommand("subagent", {
		description: "Quick single-agent dispatch. Usage: /subagent <name> <task>",
		handler: async (ctx: ExtensionCommandContext) => {
			const ctxAny = ctx as any;
			const args: string[] = ctxAny.args || [];
			if (args.length < 2) {
				notify(ctx, "Usage: /subagent <agent-name> <task description>", "warning");
				return;
			}
			const agentName = args[0];
			const task = args.slice(1).join(" ");

			const agents = discoverAgents(process.cwd());
			const agent = agents.find((a) => a.name === agentName);
			if (!agent) {
				const names = agents.map((a) => a.name).join(", ") || "none";
				notify(ctx, `Unknown agent: "${agentName}". Available: ${names}`, "warning");
				return;
			}

			notify(ctx, `Dispatching ${agentName}...`, "info");
			const result = await runSubagent(agent, task, process.cwd(), false, 120000);
			notify(ctx, `[${agentName}] exit:${result.exitCode} ${result.usage}\n${result.output.slice(0, 500)}`, "info");
		},
	});

	// ── Lifecycle hooks ──

	pi.on("before_agent_start", async (event: any) => {
		return {
			systemPrompt: event.systemPrompt + "\n\n" + SUBAGENT_GUIDE,
		};
	});
}
