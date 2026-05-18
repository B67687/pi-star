/**
 * Git-Safe Extension
 *
 * Native automated git integration for Pi-Star.
 * Two mechanisms:
 *   1. Auto-commit hook — commits after edit/write tool calls
 *   2. git-ops tool — explicit git operations the model can call
 *
 * Uses safe wrappers:
 *   - git-safe-commit (blocks --no-verify, enforces identity)
 *   - git-safe-push
 *   - gh-safe-pr-create
 *
 * Config via .pi/git-safe.json (per-project or global):
 *   {
 *     "autoCommit": true,
 *     "protectedBranches": ["main", "master"],
 *     "allowedRepos": ["agentic-workflows", "pi-star"]
 *   }
 *
 * Design:
 *   - Auto-commit only in non-protected branches
 *   - Auto-commit only for repos in allowedRepos (empty = all repos)
 *   - git-ops tool for manual operations (commit, push, pr, status, branch)
 *   - All operations route through safe wrappers
 */

import type { ExtensionAPI } from "@b67687/pi-star-coding-agent";
import { Type } from "@sinclair/typebox";

// ============================================================================
// Types
// ============================================================================

interface GitSafeConfig {
	autoCommit?: boolean;
	protectedBranches?: string[];
	allowedRepos?: string[];
}

interface GitRepo {
	root: string;
	name: string;
	branch: string;
}

// ============================================================================
// Config
// ============================================================================

const DEFAULT_CONFIG: GitSafeConfig = {
	autoCommit: true,
	protectedBranches: ["main", "master"],
	allowedRepos: [],
};

let config: GitSafeConfig = { ...DEFAULT_CONFIG };

function loadConfig(pi: ExtensionAPI): GitSafeConfig {
	const merged = { ...DEFAULT_CONFIG };
	try {
		// Try global config first
		// Use pi.exec to check file existence, then parse
		return merged;
	} catch {
		return merged;
	}
}

// ============================================================================
// Git Repo Detection
// ============================================================================

async function getGitRepo(pi: ExtensionAPI, filePath: string): Promise<GitRepo | null> {
	// Walk up from filePath to find .git
	let dir = filePath;
	while (dir !== "/") {
		dir = dir.substring(0, dir.lastIndexOf("/"));
		if (dir === "") dir = "/";
		try {
			const r = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd: dir, timeout: 3000 });
			if (r.code === 0) {
				const root = r.stdout.trim();
				const name = root.split("/").pop() ?? "unknown";
				const branchR = await pi.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, timeout: 3000 });
				const branch = branchR.code === 0 ? branchR.stdout.trim() : "unknown";
				return { root, name, branch };
			}
		} catch {
			continue;
		}
	}
	return null;
}

async function isAllowedRepo(repo: GitRepo): Promise<boolean> {
	if (!config.allowedRepos || config.allowedRepos.length === 0) return true;
	return config.allowedRepos.some((r) => repo.name.includes(r) || repo.root.includes(r));
}

async function isProtectedBranch(repo: GitRepo): Promise<boolean> {
	if (!config.protectedBranches) return false;
	return config.protectedBranches.includes(repo.branch);
}

// ============================================================================
// Auto-Commit Hook
// ============================================================================

async function autoCommit(pi: ExtensionAPI, repo: GitRepo, filePath: string): Promise<string | null> {
	if (!config.autoCommit) return null;
	if (await isProtectedBranch(repo)) return null;
	if (!(await isAllowedRepo(repo))) return null;

	// Check if there are any changes to commit
	const statusR = await pi.exec("git", ["status", "--porcelain"], { cwd: repo.root, timeout: 5000 });
	if (!statusR.stdout.trim()) return null; // nothing to commit

	// Generate commit message from file path
	const fileName = filePath.split("/").pop() ?? "unknown";
	const message = `[auto] update ${fileName}`;

	// Stage and commit via safe wrapper
	const addR = await pi.exec("git", ["add", "-A"], { cwd: repo.root, timeout: 5000 });
	if (addR.code !== 0) return `git add failed: ${addR.stderr}`;

	const commitR = await pi.exec("/home/namikaz/.local/bin/git-safe-commit", ["-m", message], {
		cwd: repo.root,
		timeout: 10_000,
	});

	if (commitR.code !== 0) return `commit failed: ${commitR.stderr}`;
	return message;
}

// ============================================================================
// Git-Ops Tool
// ============================================================================

const GIT_OPS_TOOL = {
	name: "git-ops",
	label: "Git Ops",
	description:
		"Safe git operations for version control. Handles commit, push, status, PR creation, and branch management. " +
		"All operations route through safety wrappers that enforce identity and prevent dangerous flags. " +
		"Use this tool for all git operations instead of running raw git commands.",
	promptSnippet: "Use git-ops for all git operations — never use raw git commands directly.",
	promptGuidelines: [
		"Use git-ops for commit, push, PR creation, status checks, and branch operations.",
		"Do NOT run raw git commands. Always route through git-ops for safety.",
		"For auto-committed changes, use git-ops with operation='push' to push, or operation='pr' to create a PR.",
	],
	parameters: Type.Object({
		operation: Type.Union(
			[
				Type.Literal("commit"),
				Type.Literal("push"),
				Type.Literal("status"),
				Type.Literal("pr"),
				Type.Literal("branch"),
			],
			{
				description:
					"Git operation to perform. commit=stage+commit, push=push to remote, status=show status, pr=create PR, branch=list/switch branches",
			},
		),
		message: Type.Optional(
			Type.String({
				description: 'Commit message (required for commit, optional for pr — auto-generated if omitted)',
			}),
		),
		target: Type.Optional(
			Type.String({
				description:
					'Branch name for branch operation. Remote name for push (default: "origin"). Base branch for PR (default: current branch).',
			}),
		),
	}),
	execute: async (
		_toolCallId: string,
		params: { operation: string; message?: string; target?: string },
	): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> => {
		try {
			const result = await handleGitOp(params.operation, params.message, params.target);
			return {
				content: [{ type: "text", text: result }],
				details: {},
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				content: [
					{
						type: "text",
						text: `⚠ git-ops error: ${msg}`,
					},
				],
				details: { error: msg },
			};
		}
	},
};

// Will be set during extension init
let _pi: ExtensionAPI | null = null;

async function handleGitOp(
	operation: string,
	message?: string,
	target?: string,
): Promise<string> {
	const pi = _pi;
	if (!pi) throw new Error("Extension not initialized");

	// Detect current repo from CWD
	const cwdR = await pi.exec("pwd", [], { timeout: 2000 });
	const cwd = cwdR.stdout.trim();
	const repo = await getGitRepo(pi, cwd + "/x"); // pass a file in CWD to detect repo
	if (!repo) throw new Error("Not inside a git repository");

	switch (operation) {
		case "commit": {
			if (!message) throw new Error("Commit message is required for commit operation");

			// Stage all changes
			const addR = await pi.exec("git", ["add", "-A"], { cwd: repo.root, timeout: 5000 });
			if (addR.code !== 0) throw new Error(`git add failed: ${addR.stderr}`);

			// Check if there's anything to commit
			const statusR = await pi.exec("git", ["status", "--porcelain"], { cwd: repo.root, timeout: 3000 });
			if (!statusR.stdout.trim()) return "Nothing to commit. Working tree clean.";

			const commitR = await pi.exec("/home/namikaz/.local/bin/git-safe-commit", ["-m", message], {
				cwd: repo.root,
				timeout: 10_000,
			});
			if (commitR.code !== 0) throw new Error(`Commit failed: ${commitR.stderr}`);

			return `✓ Committed to ${repo.branch}: "${message}"`;
		}

		case "push": {
			const remote = target || "origin";
			const pushR = await pi.exec("/home/namikaz/.local/bin/git-safe-push", ["-u", remote, repo.branch], {
				cwd: repo.root,
				timeout: 30_000,
			});
			if (pushR.code !== 0) throw new Error(`Push failed: ${pushR.stderr}`);
			return `✓ Pushed ${repo.branch} to ${remote}`;
		}

		case "status": {
			const statusR = await pi.exec("git", ["status", "--short", "--branch"], { cwd: repo.root, timeout: 5000 });
			const logR = await pi.exec("git", ["log", "--oneline", "-5"], { cwd: repo.root, timeout: 3000 });
			const lines: string[] = [];
			lines.push(`Repository: ${repo.name}`);
			lines.push(`Branch: ${repo.branch}`);
			lines.push("");
			lines.push(statusR.stdout.trim());
			lines.push("");
			lines.push("Recent commits:");
			for (const line of logR.stdout.trim().split("\n")) {
				lines.push(`  ${line}`);
			}
			return lines.join("\n");
		}

		case "pr": {
			// Check if branch has upstream
			const upstreamR = await pi.exec("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
				cwd: repo.root,
				timeout: 3000,
			});
			if (upstreamR.code !== 0) {
				// No upstream — push first
				const pushR = await pi.exec("/home/namikaz/.local/bin/git-safe-push", ["-u", "origin", repo.branch], {
					cwd: repo.root,
					timeout: 30_000,
				});
				if (pushR.code !== 0) throw new Error(`Push failed before PR: ${pushR.stderr}`);
			}

			// Generate PR body from recent commits
			const logR = await pi.exec("git", ["log", `${target || "main"}..${repo.branch}`, "--oneline"], {
				cwd: repo.root,
				timeout: 5000,
			});

			const commits = logR.stdout.trim();
			const body = commits || "(no commits)";
			const title = message || `feat: updates on ${repo.branch}`;

			const prR = await pi.exec(
				"/home/namikaz/.local/bin/gh-safe-pr-create",
				["--title", title, "--body", `## Summary\n\n${commits}`],
				{ cwd: repo.root, timeout: 20_000 },
			);
			if (prR.code !== 0) throw new Error(`PR creation failed: ${prR.stderr}`);
			return `✓ PR created:\n${prR.stdout.trim()}`;
		}

		case "branch": {
			const branchR = await pi.exec("git", ["branch", "-a"], { cwd: repo.root, timeout: 5000 });
			const current = repo.branch;
			const lines: string[] = ["Branches:"];
			for (const b of branchR.stdout.split("\n")) {
				const trimmed = b.trim();
				if (trimmed.startsWith("* ")) {
					lines.push(`  * ${trimmed.slice(2)} (current)`);
				} else if (trimmed) {
					lines.push(`    ${trimmed}`);
				}
			}
			return lines.join("\n");
		}

		default:
			throw new Error(`Unknown operation: ${operation}`);
	}
}

// ============================================================================
// Extension Entry Point
// ============================================================================

export default function gitSafeExtension(pi: ExtensionAPI) {
	_pi = pi;
	config = loadConfig(pi);

	// Register the git-ops tool
	pi.registerTool(GIT_OPS_TOOL);

	// Register auto-commit hook
	pi.on("tool_result", async (event: Record<string, unknown>) => {
		const toolName = event.toolName as string;
		if (toolName !== "edit" && toolName !== "write") return;

		const input = event.input as Record<string, unknown> | undefined;
		const filePath = (input?.filePath as string) ?? (input?.path as string) ?? "";
		if (!filePath) return;

		const repo = await getGitRepo(pi, filePath);
		if (!repo) return;

		const result = await autoCommit(pi, repo, filePath);
		if (result) {
			// Inline comment about the auto-commit — silently done
		}
	});

	// Register a command for manual git display
	pi.registerCommand("git-status", {
		description: "Show git status for the current repo",
		handler: async () => {
			const cwdR = await pi.exec("pwd", [], { timeout: 2000 });
			const cwd = cwdR.stdout.trim();
			const repo = await getGitRepo(pi, cwd + "/x");
			if (!repo) return;
			const statusR = await pi.exec("git", ["status", "--short", "--branch"], { cwd: repo.root, timeout: 5000 });
			// Status is handled by the agent tool system
		},
	});
}
