#!/usr/bin/env tsx
/**
 * Pi-Star Dry-Run Test Suite
 *
 * Loads all extensions with a mock ExtensionAPI to verify they initialize
 * without errors and register the expected commands/tools/hooks.
 *
 * This is a DRY-RUN — no real operations are performed, no side effects.
 *
 * Usage:
 *   npx tsx scripts/pi-star-dry-run-test.ts [--verbose]
 *
 * Options:
 *   --verbose    Show full registration details per extension
 *
 * Exit codes:
 *   0 = All extensions passed
 *   1 = One or more extensions failed to load
 */

import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// Types
// ============================================================================

interface DryRunResult {
	extension: string;
	status: "pass" | "fail" | "warn";
	error?: string;
	registrations: {
		commands: string[];
		tools: string[];
		hooks: string[];
		shortcuts: string[];
	};
}

interface MockToolDef {
	name: string;
	label?: string;
	description?: string;
}

interface MockCommandReg {
	description?: string;
}

// ============================================================================
// Mock ExtensionAPI
// ============================================================================

function createMockAPI(extensionName: string) {
	const registrations: DryRunResult["registrations"] = {
		commands: [],
		tools: [],
		hooks: [],
		shortcuts: [],
	};

	const api = {
		on(event: string, _handler: unknown) {
			registrations.hooks.push(event);
		},

		registerTool(tool: MockToolDef) {
			const name = tool.name || tool.label || "unnamed";
			registrations.tools.push(name);
		},

		registerCommand(name: string, _options: MockCommandReg) {
			registrations.commands.push(name);
		},

		registerShortcut(shortcut: string, _options: { description?: string; handler: unknown }) {
			registrations.shortcuts.push(shortcut);
		},

		registerFlag(_name: string, _options: { description?: string; type: "boolean" | "string"; default?: boolean | string }) {
			// Flag registration — no capture needed for dry run
		},

		registerMessageRenderer(_customType: string, _renderer: unknown) {
			// Message renderer registration — no capture needed
		},

		sendMessage(_message: unknown, _options?: unknown) {
			// Blocked in dry run
		},

		sendUserMessage(_content: unknown, _options?: unknown) {
			// Blocked in dry run
		},

		appendEntry(_customType: string, _data?: unknown) {
			// Blocked in dry run
		},

		getFlag(_name: string): boolean | string | undefined {
			return undefined;
		},

		setSessionName(_name: string) {
			// No-op
		},

		getSessionName(): string | undefined {
			return extensionName;
		},

		exec(_command: string, _args: string[], _options?: unknown) {
			return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
		},

		setActiveTools(_toolNames: string[]) {
			// No-op
		},

		getActiveTools(): string[] {
			return [];
		},

		getAllTools() {
			return [];
		},

		getCommands() {
			return [];
		},

		events: {
			on(_event: string, _handler: unknown) {
				// No-op event bus
			},
			emit(_event: string, _data: unknown) {
				// No-op
			},
		},
	};

	return { api, registrations };
}

// ============================================================================
// Test runner
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSIONS_DIR = join(__dirname, "..", ".pi", "extensions");
const VERBOSE = process.argv.includes("--verbose");

async function loadExtension(path: string): Promise<unknown> {
	try {
		const mod = await import(path);
		if (typeof mod.default === "function") {
			return mod.default;
		}
		// Some extensions might export as named export
		if (typeof mod.factory === "function") return mod.factory;
		if (typeof mod.activate === "function") return mod.activate;
		return null;
	} catch (err) {
		return { _error: String(err) };
	}
}

async function run() {
	console.log("");
	console.log("═══ Pi-Star Dry-Run Test Suite ═══");
	console.log(`  Extensions dir: ${EXTENSIONS_DIR}`);
	console.log(`  Mode: dry-run (no side effects)`);
	console.log("");

	// Discover extension files
	if (!existsSync(EXTENSIONS_DIR)) {
		console.error(`❌ Extensions directory not found: ${EXTENSIONS_DIR}`);
		process.exit(1);
	}

	const files = readdirSync(EXTENSIONS_DIR)
		.filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
		.sort();

	console.log(`  Found ${files.length} extension files`);
	console.log("");

	const results: DryRunResult[] = [];
	let passed = 0;
	let failed = 0;
	let warned = 0;

	for (const file of files) {
		const extName = file.replace(/\.ts$/, "");
		const extPath = join(EXTENSIONS_DIR, file);

		const { api, registrations } = createMockAPI(extName);
		const result: DryRunResult = {
			extension: extName,
			status: "pass",
			registrations,
		};

		try {
			const factory = await loadExtension(extPath);

			if (!factory) {
				result.status = "warn";
				result.error = "No default export function found";
				warned++;
			} else if (factory._error) {
				result.status = "fail";
				result.error = factory._error;
				failed++;
			} else {
				// Call the factory with mock API
				await Promise.resolve(factory(api));
				result.status = "pass";
				passed++;
			}
		} catch (err) {
			result.status = "fail";
			result.error = String(err);
			failed++;
		}

		results.push(result);
	}

	// ── Results ──

	for (const r of results) {
		const icon = r.status === "pass" ? "✅" : r.status === "warn" ? "⚠️" : "❌";
		console.log(`  ${icon} ${r.extension}`);

		if (r.error) {
			console.log(`     Error: ${r.error}`);
		}

		if (VERBOSE || r.status !== "pass") {
			if (r.registrations.commands.length > 0) {
				console.log(`     Commands: ${r.registrations.commands.join(", ")}`);
			}
			if (r.registrations.tools.length > 0) {
				console.log(`     Tools:     ${r.registrations.tools.join(", ")}`);
			}
			if (r.registrations.hooks.length > 0) {
				console.log(`     Hooks:     ${r.registrations.hooks.join(", ")}`);
			}
			if (r.registrations.shortcuts.length > 0) {
				console.log(`     Shortcuts: ${r.registrations.shortcuts.join(", ")}`);
			}
		}
	}

	// ── Summary ──

	console.log("");
	console.log("═══ Results ═══");
	console.log(`  ✅ Pass: ${passed}`);
	console.log(`  ⚠️  Warn: ${warned}`);
	console.log(`  ❌ Fail: ${failed}`);
	console.log(`  Total: ${results.length}`);

	// Check for coverage: every extension should register at least one thing
	const idleExtensions = results.filter(
		(r) =>
			r.status === "pass" &&
			r.registrations.commands.length === 0 &&
			r.registrations.tools.length === 0 &&
			r.registrations.hooks.length === 0 &&
			r.registrations.shortcuts.length === 0,
	);
	if (idleExtensions.length > 0) {
		console.log("");
		console.log(`⚠️  ${idleExtensions.length} extension(s) registered nothing:`);
		for (const r of idleExtensions) {
			console.log(`    - ${r.extension}`);
		}
	}

	// Aggregate registrations
	const allCommands = results.flatMap((r) => r.registrations.commands);
	const allTools = results.flatMap((r) => r.registrations.tools);
	const allHooks = results.flatMap((r) => r.registrations.hooks);
	console.log("");
	console.log(`  Total commands: ${allCommands.length}`);
	console.log(`  Total tools:    ${allTools.length}`);
	console.log(`  Total hooks:    ${allHooks.length}`);

	if (VERBOSE && allCommands.length > 0) {
		console.log("");
		console.log("  All commands:");
		for (const cmd of [...new Set(allCommands)].sort()) {
			console.log(`    /${cmd}`);
		}
	}
	if (VERBOSE && allTools.length > 0) {
		console.log("");
		console.log("  All tools:");
		for (const tool of [...new Set(allTools)].sort()) {
			console.log(`    ${tool}`);
		}
	}

	console.log("");

	process.exit(failed > 0 ? 1 : warned > 0 ? 2 : 0);
}

run().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
