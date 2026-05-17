/**
 * Lean LSP Extension
 *
 * After every edit/write tool call, runs a language server on the changed file
 * and injects compact diagnostics into the tool result so the agent can
 * self-correct type errors before the next turn.
 *
 * Supported languages:
 *   - Python  → pyright --outputjson
 *   - TypeScript → tsc --noEmit
 *   - Shell   → shellcheck -f json
 *
 * Design:
 *   - Errors only (no warnings, no hints)
 *   - Compact format (<800 tokens per report)
 *   - Runs asynchronously — non-blocking
 *   - Auto-detects file type from extension
 *
 * Benchmarked: 91.7% fix rate vs 58.3% without LSP (12-sample corpus).
 * See research/bench-lsp/ for the full benchmark.
 */

import type { ExtensionAPI, ToolResultEvent } from "@b67687/pi-star-coding-agent";

// ── Types ──

interface Diagnostic {
	file: string;
	line: number;
	column: number;
	message: string;
	severity: "error" | "warning";
}

type DiagnosticRunner = (filePath: string, pi: ExtensionAPI) => Promise<Diagnostic[]>;

// ── Diagnostics runners ──

const runPyright: DiagnosticRunner = async (filePath, pi) => {
	const result = await pi.exec("pyright", ["--outputjson", filePath], {
		timeout: 10_000,
	});
	if (result.code !== 0 && result.code !== 1) return []; // pyright exits 0 = no issues, 1 = errors

	try {
		const parsed = JSON.parse(result.stdout);
		const diagnostics: Diagnostic[] = [];

		for (const diag of parsed.generalDiagnostics ?? []) {
			if (diag.severity === "error") {
				diagnostics.push({
					file: diag.file ?? filePath,
					line: diag.range?.start?.line ?? 0,
					column: diag.range?.start?.character ?? 0,
					message: diag.message,
					severity: "error",
				});
			}
		}
		return diagnostics;
	} catch {
		return [];
	}
};

const runTsc: DiagnosticRunner = async (filePath, pi) => {
	const result = await pi.exec("tsc", ["--noEmit", "--pretty", "false", filePath], {
		timeout: 15_000,
	});
	// tsc exits 0 = no errors, non-zero = errors
	if (result.code === 0) return [];

	const diagnostics: Diagnostic[] = [];
	const lines = result.stdout.split("\n");

	for (const line of lines) {
		// Format: file.ts(line,col): error TS1234: message
		const match = line.match(
			/^(.+)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s+(.+)$/,
		);
		if (match) {
			diagnostics.push({
				file: match[1].trim(),
				line: parseInt(match[2]),
				column: parseInt(match[3]),
				message: `${match[5]}: ${match[6]}`,
				severity: match[4] as "error" | "warning",
			});
		}
	}
	return diagnostics.filter((d) => d.severity === "error");
};

const runShellcheck: DiagnosticRunner = async (filePath, pi) => {
	const result = await pi.exec("shellcheck", ["-f", "json", filePath], {
		timeout: 10_000,
	});
	if (result.code === 0) return [];

	try {
		const parsed = JSON.parse(result.stdout) as Array<{
			line: number;
			column: number;
			code: number;
			message: string;
			level: string;
		}>;
		const diagnostics: Diagnostic[] = [];

		for (const entry of parsed ?? []) {
			diagnostics.push({
				file: filePath,
				line: entry.line ?? 0,
				column: entry.column ?? 0,
				message: `SC${entry.code}: ${entry.message}`,
				severity: entry.level === "error" ? "error" : "warning",
			});
		}
		return diagnostics.filter((d) => d.severity === "error");
	} catch {
		return [];
	}
};

// ── File type detection ──

function detectRunner(filePath: string): DiagnosticRunner | null {
	if (filePath.endsWith(".py")) return runPyright;
	if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return runTsc;
	if (filePath.endsWith(".sh") || filePath.endsWith(".bash")) return runShellcheck;
	return null;
}

// ── Formatting ──

function formatDiagnostics(diagnostics: Diagnostic[]): string {
	if (diagnostics.length === 0) return "";

	const lines: string[] = [];
	lines.push("── LSP diagnostics ──");

	for (const d of diagnostics) {
		const fileShort = d.file.split("/").pop() ?? d.file;
		lines.push(`  ${fileShort}:${d.line}:${d.column}  ${d.message}`);
	}

	// Cap at ~800 tokens = ~600 words ≈ 35 lines
	if (lines.length > 35) {
		const remaining = diagnostics.length - (35 - 2);
		lines.length = 35;
		lines.push(`  ... and ${remaining} more diagnostic(s)`);
	}

	return lines.join("\n");
}

// ── Extension entry point ──

export default function leanLspExtension(pi: ExtensionAPI) {
	pi.on("tool_result", async (event: ToolResultEvent) => {
		// Only run on edit and write tools (file-modifying operations)
		if (event.toolName !== "edit" && event.toolName !== "write") {
			return;
		}

		// Extract file path from tool input
		const input = event.input ?? {};
		const filePath = (input.filePath as string) ?? (input.path as string) ?? "";
		if (!filePath) return;

		// Detect which runner to use
		const runner = detectRunner(filePath);
		if (!runner) return;

		// Run diagnostics
		const diagnostics = await runner(filePath, pi);
		if (diagnostics.length === 0) return;

		// Format and inject into tool result
		const lspReport = formatDiagnostics(diagnostics);
		if (!lspReport) return;

		return {
			content: [
				{
					type: "text",
					text: `\n${lspReport}`,
				},
			],
		};
	});
}
