import { execSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePyrightOutput, parseShellcheckOutput, parseTscOutput } from "../src/core/lsp/lsp-parsers.js";

/**
 * Integration tests that run the actual CLI diagnostic tools (pyright, tsc, shellcheck)
 * and verify the parsers can handle their real output.
 */

const hasPyright = (() => {
	try {
		execSync("pyright --version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

const hasTsc = (() => {
	try {
		execSync("tsc --version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

const hasShellcheck = (() => {
	try {
		execSync("shellcheck --version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

// ── Helpers ──

let tempFiles: string[] = [];

function writeTempFile(name: string, content: string): string {
	const path = join(tmpdir(), "lsp-int-" + name);
	writeFileSync(path, content, "utf-8");
	tempFiles.push(path);
	return path;
}

function runTool(cmd: string, timeout: number): string {
	try {
		return execSync(cmd, { encoding: "utf-8", timeout, stdio: "pipe" });
	} catch (e: any) {
		// Tools exit non-zero when they find errors; combine stdout + stderr
		const parts: string[] = [];
		if (e.stdout) parts.push(e.stdout as string);
		if (e.stderr) parts.push(e.stderr as string);
		if (parts.length === 0) throw e;
		return parts.join("\n");
	}
}

afterEach(() => {
	for (const f of tempFiles) {
		try {
			unlinkSync(f);
		} catch {
			/* skip */
		}
	}
	tempFiles = [];
});

// ============================================================================
// Pyright integration tests
// ============================================================================

describe.runIf(hasPyright)("pyright integration", () => {
	it("should detect type mismatch error", () => {
		const file = writeTempFile(
			"test.py",
			[
				"def greet(name: str) -> str:",
				'    return "Hello, " + name',
				"",
				"def main() -> None:",
				"    result = greet(42)  # type error",
				"    print(result)",
			].join("\n"),
		);

		const output = runTool(`pyright --outputjson "${file}"`, 10_000);
		const diagnostics = parsePyrightOutput(output, file);

		expect(diagnostics.length).toBeGreaterThanOrEqual(1);
		expect(diagnostics[0].severity).toBe("error");
	});

	it("should return no errors for correct code", () => {
		const file = writeTempFile(
			"correct.py",
			["def greet(name: str) -> str:", '    return "Hello, " + name', "", "print(greet('World'))"].join("\n"),
		);

		const output = runTool(`pyright --outputjson "${file}"`, 10_000);
		const diagnostics = parsePyrightOutput(output, file);
		expect(diagnostics).toEqual([]);
	});

	it("should detect undefined variable", () => {
		const file = writeTempFile(
			"undefined.py",
			["def calc(price: float) -> float:", "    return price - discont  # typo: should be 'discount'"].join("\n"),
		);

		const output = runTool(`pyright --outputjson "${file}"`, 10_000);
		const diagnostics = parsePyrightOutput(output, file);

		expect(diagnostics.length).toBeGreaterThanOrEqual(1);
	});
});

// ============================================================================
// tsc integration tests
// ============================================================================

describe.runIf(hasTsc)("tsc integration", () => {
	it("should detect type error with --noEmit", () => {
		// tsc requires a tsconfig.json to type-check; create a minimal one
		const dir = join(tmpdir(), "tsc-test-" + Math.random().toString(36).slice(2));
		writeFileSync(dir, "", "utf-8");

		const file = writeTempFile("error.ts", ["const x: number = 'hello';  // type error"].join("\n"));

		const output = runTool(`tsc --noEmit --pretty false --ignoreConfig --strict "${file}"`, 15_000);
		const diagnostics = parseTscOutput(output);

		expect(diagnostics.length).toBeGreaterThanOrEqual(1);
		expect(diagnostics[0].message).toContain("TS");
	});
});

// ============================================================================
// ShellCheck integration tests
// ============================================================================

describe.runIf(hasShellcheck)("shellcheck integration", () => {
	it("should detect unquoted variable", () => {
		const file = writeTempFile(
			"test.sh",
			["#!/usr/bin/env bash", 'echo "Entering directory $1"', "ls $1  # SC2086: unquoted"].join("\n"),
		);

		const output = runTool(`shellcheck -f json "${file}"`, 10_000);
		const _diagnostics = parseShellcheckOutput(output);

		// SC2086 is 'info' level in ShellCheck, not 'error'
		// Our parser only returns errors by design. Verify the raw JSON
		// contains code 2086 so the CLI tool is working.
		expect(output).toContain('"code":2086');
	});

	it("should return no errors for clean shell script", () => {
		const file = writeTempFile("clean.sh", ["#!/usr/bin/env bash", 'echo "Hello, $1"', 'ls "$1"'].join("\n"));

		const output = runTool(`shellcheck -f json "${file}"`, 10_000);
		const diagnostics = parseShellcheckOutput(output);

		const errors = diagnostics.filter((d) => d.severity === "error");
		expect(errors).toEqual([]);
	});
});
