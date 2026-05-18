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
 *   - Go      → go vet
 *   - Rust    → cargo check --message-format json
 *
 * Design:
 *   - Errors only (no warnings, no hints)
 *   - Compact format (<800 tokens per report)
 *   - Runs asynchronously — non-blocking
 *   - Auto-detects file type from extension
 *   - Self-contained (no internal dependencies) — works from any location
 *
 * Parsing functions in this file are mirrored in
 * packages/coding-agent/src/core/lsp/lsp-parsers.ts for unit testing.
 *
 * Benchmarked: 91.7% fix rate with LSP vs 58.3% baseline (12 samples).
 * See research/bench-lsp/ for the full benchmark.
 */

import type { ExtensionAPI, ToolResultEvent } from "@b67687/pi-star-coding-agent";

// ============================================================================
// Pure parsing functions (mirrored in lsp-parsers.ts for testing)
// ============================================================================

interface Diagnostic {
	file: string;
	line: number;
	column: number;
	message: string;
	severity: "error" | "warning";
}

function parsePyrightOutput(stdout: string, defaultFile: string): Diagnostic[] {
	try {
		const parsed = JSON.parse(stdout);
		const diagnostics: Diagnostic[] = [];
		for (const diag of parsed.generalDiagnostics ?? []) {
			if (diag.severity === "error") {
				diagnostics.push({
					file: diag.file ?? defaultFile,
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
}

function parseTscOutput(stdout: string): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const TSC_RE = /^(.+)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s+(.+)$/;
	for (const line of stdout.split("\n")) {
		const m = line.match(TSC_RE);
		if (m) {
			diagnostics.push({
				file: m[1].trim(),
				line: parseInt(m[2]),
				column: parseInt(m[3]),
				message: `${m[5]}: ${m[6]}`,
				severity: m[4] as "error" | "warning",
			});
		}
	}
	return diagnostics.filter((d) => d.severity === "error");
}

function parseShellcheckOutput(stdout: string): Diagnostic[] {
	try {
		const parsed = JSON.parse(stdout) as Array<{
			line: number;
			column: number;
			code: number;
			message: string;
			level: string;
		}>;
		const diagnostics: Diagnostic[] = [];
		for (const entry of parsed ?? []) {
			diagnostics.push({
				file: "",
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
}

function parseGoVetOutput(stdout: string): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	// Matches: [tool:] file:line:col: message
	// Examples:
	//   vet: ./foo.go:8:6: invalid operation
	//   ./foo.go:12:2: undefined: x
	const GO_VET_RE = /^(?:[\w-]+:\s*)?(?:\.\/)?([^:\s]+):(\d+):(\d+):\s*(.+)$/;
	for (const line of stdout.split("\n")) {
		if (line.startsWith("#") || line.startsWith("go: ")) continue; // skip package/comments
		const m = line.match(GO_VET_RE);
		if (m) {
			diagnostics.push({
				file: m[1].trim(),
				line: parseInt(m[2]),
				column: parseInt(m[3]),
				message: m[4],
				severity: "error",
			});
		}
	}
	return diagnostics;
}

function parseCargoCheckOutput(stdout: string, editedFile: string): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const editedName = editedFile.split("/").pop() ?? editedFile;
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const msg = JSON.parse(trimmed);
			if (msg.reason !== "compiler-message") continue;
			if (msg.message?.level !== "error") continue;
			const spans = msg.message?.spans;
			if (!spans?.length) continue;
			const span = spans[0];
			const file = span.file_name ?? "";
			// Only include errors for the edited file
			if (!file.endsWith(editedName) && !file.endsWith(editedFile)) continue;
			diagnostics.push({
				file,
				line: span.line_start ?? 0,
				column: span.column_start ?? 0,
				message: msg.message.message ?? "",
				severity: "error",
			});
		} catch {
			// skip non-JSON lines
		}
	}
	return diagnostics;
}

function formatDiagnostics(diagnostics: Diagnostic[]): string {
	if (diagnostics.length === 0) return "";
	const lines: string[] = ["── LSP diagnostics ──"];
	for (const d of diagnostics) {
		const f = d.file.split("/").pop() ?? d.file;
		lines.push(`  ${f}:${d.line}:${d.column}  ${d.message}`);
	}
	if (lines.length > 35) {
		const r = diagnostics.length - (35 - 2);
		lines.length = 35;
		lines.push(`  ... and ${r} more diagnostic(s)`);
	}
	return lines.join("\n");
}

function detectRunner(filePath: string): "pyright" | "tsc" | "shellcheck" | "govet" | "cargocheck" | null {
	if (filePath.endsWith(".py")) return "pyright";
	if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "tsc";
	if (filePath.endsWith(".sh") || filePath.endsWith(".bash")) return "shellcheck";
	if (filePath.endsWith(".go")) return "govet";
	if (filePath.endsWith(".rs")) return "cargocheck";
	return null;
}



// ============================================================================
// IO layer (pi.exec)
// ============================================================================

async function runPyright(filePath: string, pi: ExtensionAPI) {
	const r = await pi.exec("pyright", ["--outputjson", filePath], { timeout: 10_000 });
	if (r.code !== 0 && r.code !== 1) return [];
	return parsePyrightOutput(r.stdout, filePath);
}

async function runTsc(filePath: string, pi: ExtensionAPI) {
	const r = await pi.exec("tsc", ["--noEmit", "--pretty", "false", filePath], { timeout: 15_000 });
	if (r.code === 0) return [];
	return parseTscOutput(r.stdout);
}

async function runShellcheck(filePath: string, pi: ExtensionAPI) {
	const r = await pi.exec("shellcheck", ["-f", "json", filePath], { timeout: 10_000 });
	if (r.code === 0) return [];
	return parseShellcheckOutput(r.stdout);
}

async function runGoVet(filePath: string, pi: ExtensionAPI) {
	const r = await pi.exec("go", ["vet", filePath], { timeout: 15_000 });
	if (r.code === 0) return [];
	return parseGoVetOutput(r.stdout || r.stderr);
}

async function runCargoCheck(filePath: string, pi: ExtensionAPI) {
	// Walk up from file to find Cargo.toml by trying cargo check from each parent
	const parts = filePath.split("/");
	for (let i = parts.length - 1; i >= 1; i--) {
		const dir = parts.slice(0, i).join("/");
		if (!dir || dir === ".") continue;

		const r = await pi.exec("cargo", ["check", "--message-format", "json", "-q"], {
			cwd: dir,
			timeout: 60_000,
		});
		if (r.code === 0) return [];
		if (r.code === 101) return []; // 101 = cargo itself errored (no Cargo.toml) — try next parent
		if (r.stderr?.includes("could not find `Cargo.toml`")) continue; // not a cargo project

		// Cargo found a Cargo.toml and ran — return diagnostics
		return parseCargoCheckOutput(r.stdout, filePath);
	}
	return [];
}

// ============================================================================
// Extension entry point
// ============================================================================

export default function leanLspExtension(pi: ExtensionAPI) {
	pi.on("tool_result", async (event: ToolResultEvent) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;

		const filePath = (event.input?.filePath as string) ?? (event.input?.path as string) ?? "";
		if (!filePath) return;

		const runner = detectRunner(filePath);
		if (!runner) return;

		const diagnostics =
			runner === "pyright"
				? await runPyright(filePath, pi)
				: runner === "tsc"
					? await runTsc(filePath, pi)
					: runner === "shellcheck"
						? await runShellcheck(filePath, pi)
						: runner === "govet"
							? await runGoVet(filePath, pi)
							: await runCargoCheck(filePath, pi);

		if (!diagnostics?.length) return;

		const report = formatDiagnostics(diagnostics);
		if (!report) return;

		return { content: [{ type: "text", text: `\n${report}` }] };
	});
}
