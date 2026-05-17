import { describe, expect, it } from "vitest";
import {
	formatDiagnostics,
	parsePyrightOutput,
	parseShellcheckOutput,
	parseTscOutput,
} from "../src/core/lsp/lsp-parsers.js";

// ============================================================================
// Pyright parser
// ============================================================================

describe("parsePyrightOutput", () => {
	it("should parse a single type error", () => {
		const output = JSON.stringify({
			generalDiagnostics: [
				{
					file: "/tmp/test.py",
					severity: "error",
					message: 'Argument of type "Literal[42]" cannot be assigned to parameter "name" of type "str"',
					range: { start: { line: 5, character: 12 } },
				},
			],
		});
		const result = parsePyrightOutput(output, "/tmp/test.py");
		expect(result).toHaveLength(1);
		expect(result[0].line).toBe(5);
		expect(result[0].column).toBe(12);
		expect(result[0].message).toContain("cannot be assigned");
		expect(result[0].severity).toBe("error");
	});

	it("should filter out warnings and information", () => {
		const output = JSON.stringify({
			generalDiagnostics: [
				{
					file: "/tmp/test.py",
					severity: "error",
					message: "Type error",
					range: { start: { line: 1, character: 0 } },
				},
				{
					file: "/tmp/test.py",
					severity: "warning",
					message: "Unused import",
					range: { start: { line: 2, character: 0 } },
				},
				{
					file: "/tmp/test.py",
					severity: "information",
					message: "Some info",
					range: { start: { line: 3, character: 0 } },
				},
			],
		});
		const result = parsePyrightOutput(output, "/tmp/test.py");
		expect(result).toHaveLength(1);
		expect(result[0].message).toBe("Type error");
	});

	it("should return empty array on invalid JSON", () => {
		const result = parsePyrightOutput("not json", "/tmp/test.py");
		expect(result).toEqual([]);
	});

	it("should return empty array on empty diagnostics", () => {
		const output = JSON.stringify({ generalDiagnostics: [] });
		const result = parsePyrightOutput(output, "/tmp/test.py");
		expect(result).toEqual([]);
	});

	it("should handle missing range gracefully", () => {
		const output = JSON.stringify({
			generalDiagnostics: [
				{
					file: "/tmp/test.py",
					severity: "error",
					message: "Some error",
				},
			],
		});
		const result = parsePyrightOutput(output, "/tmp/test.py");
		expect(result).toHaveLength(1);
		expect(result[0].line).toBe(0);
		expect(result[0].column).toBe(0);
	});

	it("should use defaultFile when file is missing", () => {
		const output = JSON.stringify({
			generalDiagnostics: [
				{
					severity: "error",
					message: "Some error",
					range: { start: { line: 1, character: 0 } },
				},
			],
		});
		const result = parsePyrightOutput(output, "/tmp/default.py");
		expect(result[0].file).toBe("/tmp/default.py");
	});
});

// ============================================================================
// tsc parser
// ============================================================================

describe("parseTscOutput", () => {
	it("should parse a standard tsc error", () => {
		const output = [
			"src/test.ts(5,12): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.",
		].join("\n");
		const result = parseTscOutput(output);
		expect(result).toHaveLength(1);
		expect(result[0].file).toContain("test.ts");
		expect(result[0].line).toBe(5);
		expect(result[0].column).toBe(12);
		expect(result[0].message).toContain("TS2345");
		expect(result[0].severity).toBe("error");
	});

	it("should filter out warnings", () => {
		const output = [
			"src/test.ts(1,1): error TS2322: Type error.",
			"src/test.ts(2,1): warning TS7006: Parameter implicitly has 'any' type.",
		].join("\n");
		const result = parseTscOutput(output);
		expect(result).toHaveLength(1);
		expect(result[0].message).toContain("TS2322");
	});

	it("should return empty on clean output", () => {
		const result = parseTscOutput("No errors found");
		expect(result).toEqual([]);
	});

	it("should handle multiple errors", () => {
		const output = [
			"src/a.ts(1,1): error TS1001: First error.",
			"src/b.ts(2,5): error TS1002: Second error.",
			"src/c.ts(3,10): error TS1003: Third error.",
		].join("\n");
		const result = parseTscOutput(output);
		expect(result).toHaveLength(3);
	});

	it("should parse file paths with spaces", () => {
		const output = ['src/my folder/test.ts(10,3): error TS2554: Wrong arg count.'].join("\n");
		const result = parseTscOutput(output);
		expect(result).toHaveLength(1);
		expect(result[0].file).toContain("my folder");
	});
});

// ============================================================================
// ShellCheck parser
// ============================================================================

describe("parseShellcheckOutput", () => {
	it("should parse a ShellCheck JSON error entry", () => {
		const output = JSON.stringify([
			{
				file: "script.sh",
				line: 5,
				column: 12,
				code: 2086,
				message: "Double quote to prevent globbing and word splitting.",
				level: "error",
			},
		]);
		const result = parseShellcheckOutput(output);
		expect(result).toHaveLength(1);
		expect(result[0].line).toBe(5);
		expect(result[0].message).toContain("SC2086");
		expect(result[0].severity).toBe("error");
	});

	it("should filter out warnings", () => {
		const output = JSON.stringify([
			{
				line: 1,
				column: 1,
				code: 2086,
				message: "Error level.",
				level: "error",
			},
			{
				line: 2,
				column: 1,
				code: 2181,
				message: "Warning level.",
				level: "warning",
			},
		]);
		const result = parseShellcheckOutput(output);
		expect(result).toHaveLength(1);
	});

	it("should return empty array on invalid JSON", () => {
		const result = parseShellcheckOutput("not json");
		expect(result).toEqual([]);
	});

	it("should return empty array on empty output", () => {
		const result = parseShellcheckOutput("[]");
		expect(result).toEqual([]);
	});
});

// ============================================================================
// formatDiagnostics
// ============================================================================

describe("formatDiagnostics", () => {
	it("should return empty string for no diagnostics", () => {
		expect(formatDiagnostics([])).toBe("");
	});

	it("should format a single diagnostic", () => {
		const result = formatDiagnostics([
			{ file: "/tmp/test.py", line: 5, column: 12, message: "Type error", severity: "error" },
		]);
		expect(result).toContain("test.py:5:12");
		expect(result).toContain("Type error");
		expect(result).toContain("LSP diagnostics");
	});

	it("should use short filename (last path segment)", () => {
		const result = formatDiagnostics([
			{ file: "/very/long/path/to/file.py", line: 1, column: 0, message: "err", severity: "error" },
		]);
		expect(result).toContain("file.py:1:0");
		expect(result).not.toContain("/very/long/path/to");
	});

	it("should cap at 35 lines", () => {
		const manyDiags = Array.from({ length: 50 }, (_, i) => ({
			file: "f.py",
			line: i,
			column: 0,
			message: `Error #${i}`,
			severity: "error" as const,
		}));
		const result = formatDiagnostics(manyDiags);
		const lines = result.split("\n");
		expect(lines.length).toBeLessThanOrEqual(36); // header + 34 errors + ...and X more
		expect(result).toContain("more diagnostic(s)");
	});
});
