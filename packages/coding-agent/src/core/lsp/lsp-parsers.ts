/**
 * LSP output parsers — pure functions for parsing diagnostic tool output.
 *
 * Separated from the extension IO layer so parsers can be unit-tested.
 * Used by lean-lsp.ts extension and lsp-parsers.test.ts.
 */

// ── Types ──

export interface Diagnostic {
	file: string;
	line: number;
	column: number;
	message: string;
	severity: "error" | "warning";
}

// ── Pyright parser ──

export function parsePyrightOutput(stdout: string, defaultFile: string): Diagnostic[] {
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

// ── tsc parser ──

const TSC_ERROR_LINE = /^(.+)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s+(.+)$/;

export function parseTscOutput(stdout: string): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const lines = stdout.split("\n");

	for (const line of lines) {
		const match = line.match(TSC_ERROR_LINE);
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
}

// ── ShellCheck parser ──

export function parseShellcheckOutput(stdout: string): Diagnostic[] {
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

// ── Diagnostics formatting ──

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
	if (diagnostics.length === 0) return "";

	const lines: string[] = [];
	lines.push("── LSP diagnostics ──");

	for (const d of diagnostics) {
		const fileShort = d.file.split("/").pop() ?? d.file;
		lines.push(`  ${fileShort}:${d.line}:${d.column}  ${d.message}`);
	}

	if (lines.length > 35) {
		const remaining = diagnostics.length - (35 - 2);
		lines.length = 35;
		lines.push(`  ... and ${remaining} more diagnostic(s)`);
	}

	return lines.join("\n");
}

// ── File type detection ──

export function detectLspRunner(filePath: string): "pyright" | "tsc" | "shellcheck" | null {
	if (filePath.endsWith(".py")) return "pyright";
	if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "tsc";
	if (filePath.endsWith(".sh") || filePath.endsWith(".bash")) return "shellcheck";
	return null;
}
