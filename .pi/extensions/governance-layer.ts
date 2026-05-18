/**
 * Governance Layer — Phase gates + Constitution checks + Propagation sync
 *
 * Layer 3 of the Pi-Star architecture: methodology enforcement built into
 * the harness. Tracks research → plan → implement → verify phase ordering,
 * runs constitutional article gates at transitions, and detects methodology
 * drift between pi-star and agentic-workflows.
 *
 * Usage:
 *   /phase              — show current phase and allowed transitions
 *   /phase research     — enter research phase
 *   /phase plan         — enter plan phase (requires research done)
 *   /phase implement    — enter implement phase (requires plan done)
 *   /phase verify       — enter verify phase (requires implement done)
 *   /constitution       — list all 9 articles with pass/fail status
 *   /constitution check — run constitutional article gates
 *   /propagation        — check for methodology drift with agentic-workflows
 *   /methodology        — inject the full methodology guide
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@b67687/pi-star-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ============================================================================
// Types
// ============================================================================

type Phase = "none" | "research" | "plan" | "implement" | "verify";

interface PhaseEntry {
	phase: Phase;
	timestamp: number;
	summary: string;
}

interface GovernanceState {
	currentPhase: Phase;
	history: PhaseEntry[];
	constitutionResults: Record<string, boolean>;
	lastPropagationCheck: number;
}

type GateResult = { pass: boolean; reason: string };

// ============================================================================
// Phase state machine
// ============================================================================

const PHASE_TRANSITIONS: Record<Phase, Phase[]> = {
	none: ["research"],
	research: ["plan"],
	plan: ["implement"],
	implement: ["verify"],
	verify: ["research", "none"],
};

const PHASE_LABELS: Record<Phase, string> = {
	none: "No active phase",
	research: "🔬 Research — understand the system before changing it",
	plan: "📋 Plan — define scope, steps, and verification targets",
	implement: "⚙️  Implement — execute the plan in small verified slices",
	verify: "✅ Verify — prove the change works, document residual risk",
};

const PHASE_PROMPTS: Record<Phase, string> = {
	none: "",
	research: `## Current Phase: Research
Read relevant source files. Understand the system architecture, affected domains, and exact code paths.
Do NOT edit any files yet. Output: exact files involved, relevant flow, main risks.`,
	plan: `## Current Phase: Plan
Define scope, steps, and verification targets before writing code.
Output: milestone ladder, first slice detail, what should NOT change.`,
	implement: `## Current Phase: Implement
Execute the plan in small verified slices. Keep context narrow. Do not expand scope silently.
Run verification after each slice. Commit after each verified change.`,
	verify: `## Current Phase: Verify
Prove the change works. Run tests, scripted scenarios, review diffs. Document residual risk.
Do NOT start new work until verification is complete and documented.`,
};

// ============================================================================
// Constitution — 9 articles from agentic-workflows
// ============================================================================

const CONSTITUTION_ARTICLES: Array<{
	id: string;
	title: string;
	gate: (state: GovernanceState) => GateResult;
}> = [
	{
		id: "I",
		title: "Macro-to-Micro — Understand the system before changing it",
		gate: () => ({ pass: true, reason: "Manual check: have you read the relevant source files?" }),
	},
	{
		id: "II",
		title: "Verify Aggressively — Verification is the quality engine",
		gate: (state) => {
			const hasImplement = state.history.some((e) => e.phase === "implement");
			const hasVerify = state.history.some((e) => e.phase === "verify");
			if (hasImplement && !hasVerify) {
				return { pass: false, reason: "Implementation exists without verification" };
			}
			return { pass: true, reason: "Verification culture maintained" };
		},
	},
	{
		id: "III",
		title: "Checkpoint Discipline — Commit after every verified phase",
		gate: () => ({ pass: true, reason: "Manual check: have you committed since the last verified phase?" }),
	},
	{
		id: "IV",
		title: "CATFISH First — Challenge the plan with structured dissent",
		gate: (state) => {
			if (state.currentPhase === "implement" || state.currentPhase === "verify") {
				const hasPlan = state.history.some((e) => e.phase === "plan");
				if (!hasPlan) {
					return { pass: false, reason: "Implementation without a prior plan phase" };
				}
			}
			return { pass: true, reason: "Plan phase was completed" };
		},
	},
	{
		id: "V",
		title: "Comprehension Gate — Evidence required before action",
		gate: (state) => {
			if (state.currentPhase === "implement") {
				const hasResearch = state.history.some((e) => e.phase === "research");
				if (!hasResearch) {
					return { pass: false, reason: "No research phase before implementation" };
				}
			}
			return { pass: true, reason: "Prior phases completed" };
		},
	},
	{
		id: "VI",
		title: "Simplicity Criterion — All else equal, simpler is better",
		gate: () => ({ pass: true, reason: "Manual check: does this change make the system simpler or more complex?" }),
	},
	{
		id: "VII",
		title: "Error Escalate — After 3 consecutive failures, escalate",
		gate: () => ({ pass: true, reason: "Manual check: any operation failed 3+ times without escalation?" }),
	},
	{
		id: "VIII",
		title: "Phase Gate — Do not skip phases",
		gate: (state) => {
			const expectedOrder: Phase[] = ["research", "plan", "implement", "verify"];
			const visited = expectedOrder.filter((p) => state.history.some((e) => e.phase === p));
			for (let i = 1; i < visited.length; i++) {
				const expectedIdx = expectedOrder.indexOf(visited[i]);
				const previousIdx = expectedOrder.indexOf(visited[i - 1]);
				if (expectedIdx < previousIdx) {
					return { pass: false, reason: `Phase order violated: ${visited[i - 1]} → ${visited[i]}` };
				}
			}
			return { pass: true, reason: "Phase order maintained" };
		},
	},
	{
		id: "IX",
		title: "Recognition — Construct expectation before every generative action",
		gate: () => ({ pass: true, reason: "Manual check: did you state what you expected before generating output?" }),
	},
];

// ============================================================================
// Propagation checks
// ============================================================================

const METHODOLOGY_FILES: Array<{ local: string; upstream: string; label: string }> = [
	{
		local: join(homedir(), "projects/dev/pi-star/docs/methodology-guide.md"),
		upstream: join(homedir(), "projects/dev/agentic-workflows/docs/workflow.md"),
		label: "Workflow methodology",
	},
];

// ============================================================================
// State management
// ============================================================================

const STATE_DIR = join(homedir(), ".pi", "runtime");
const STATE_FILE = join(STATE_DIR, "governance-state.json");

// ── Milestone ladder types + path (defined after STATE_DIR to avoid TDZ) ──

interface MilestoneItem {
	id: number;
	name: string;
	deliverable: string;
	acceptance_criteria: string;
}

interface MilestoneLadder {
	task: string;
	generated_at: number;
	milestones: MilestoneItem[];
	first_slice: {
		target: string;
		scope: string;
		files: string[];
		verification: string;
	};
	out_of_scope: string[];
	verification_target: string;
}

// ── Goal tree types ──

interface GoalNode {
	id: string;
	parent: string | null;
	title: string;
	status: "active" | "done" | "cancelled" | "blocked";
	phase: string;
	depth: number;
	children: string[];
	created_at: number;
	closed_at: number | null;
}

interface GoalTree {
	nodes: Record<string, GoalNode>;
	root: string | null;
	active: string | null;
}

const MILESTONE_LADDER_FILE = join(STATE_DIR, "milestone-ladder.json");
const GOAL_TREE_FILE = join(STATE_DIR, "goal-tree.json");

function ensureStateDir(): void {
	if (!existsSync(STATE_DIR)) {
		mkdirSync(STATE_DIR, { recursive: true });
	}
}

function loadState(): GovernanceState {
	try {
		ensureStateDir();
		if (existsSync(STATE_FILE)) {
			return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as GovernanceState;
		}
	} catch {
		// Corrupted state — reset
	}
	return { currentPhase: "none", history: [], constitutionResults: {}, lastPropagationCheck: 0 };
}

function saveState(state: GovernanceState): void {
	ensureStateDir();
	writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// ============================================================================
// Milestone ladder management
// ============================================================================

function loadMilestoneLadder(): MilestoneLadder | null {
	try {
		if (existsSync(MILESTONE_LADDER_FILE)) {
			return JSON.parse(readFileSync(MILESTONE_LADDER_FILE, "utf-8")) as MilestoneLadder;
		}
	} catch {
		// Corrupted — treat as missing
	}
	return null;
}

function saveMilestoneLadder(ladder: MilestoneLadder): void {
	ensureStateDir();
	writeFileSync(MILESTONE_LADDER_FILE, JSON.stringify(ladder, null, 2), "utf-8");
}

function validateMilestoneLadder(ladder: MilestoneLadder): { valid: boolean; errors: string[]; warnings: string[] } {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!ladder.milestones || ladder.milestones.length < 2) {
		errors.push(`Too few milestones: ${ladder.milestones?.length ?? 0} (min 2)`);
	}
	if (ladder.milestones && ladder.milestones.length > 5) {
		warnings.push(`Too many milestones: ${ladder.milestones.length} (max 5)`);
	}
	for (const m of ladder.milestones || []) {
		if (!m.name || !m.deliverable || !m.acceptance_criteria) {
			errors.push(`Milestone ${m.id ?? "?"} missing required fields (name, deliverable, acceptance_criteria)`);
		}
	}
	const fs = ladder.first_slice;
	if (!fs?.target || !fs?.scope || !fs?.verification) {
		errors.push("first_slice missing required fields (target, scope, verification)");
	}
	if (!ladder.out_of_scope || ladder.out_of_scope.length === 0) {
		warnings.push("out_of_scope is empty — add items explicitly excluded");
	}
	if (!ladder.verification_target || ladder.verification_target.length < 10) {
		warnings.push("verification_target is missing or too short");
	}
	return { valid: errors.length === 0, errors, warnings };
}

function generateMilestoneLadderTemplate(task: string): MilestoneLadder {
	return {
		task,
		generated_at: Date.now(),
		milestones: [
			{
				id: 1,
				name: "Research and discovery",
				deliverable: "Understand the system, identify files, map dependencies",
				acceptance_criteria: "Relevant source files identified, dependency graph mapped, risks documented",
			},
			{
				id: 2,
				name: "Plan and design",
				deliverable: "Detailed implementation approach with scope boundaries",
				acceptance_criteria: "Design decisions made, interfaces defined, out-of-scope documented",
			},
			{
				id: 3,
				name: "Core implementation (first slice)",
				deliverable: "Working implementation of the core change",
				acceptance_criteria: "Implementation passes verification, tests pass",
			},
		],
		first_slice: {
			target: "First milestone deliverable",
			scope: "What this slice covers",
			files: [],
			verification: "How to verify this slice works",
		},
		out_of_scope: ["Items explicitly excluded from this task"],
		verification_target: "Overall acceptance criteria for the complete task",
	};
}

function milestoneLadderToDisplay(ladder: MilestoneLadder): string {
	const lines: string[] = [`Task: ${ladder.task}`, ""];
	for (const m of ladder.milestones) {
		lines.push(`  [${m.id}] ${m.name}`);
		lines.push(`       Deliverable: ${m.deliverable}`);
		lines.push(`       Accept: ${m.acceptance_criteria}`);
		lines.push("");
	}
	const fs = ladder.first_slice;
	lines.push(`  First slice: ${fs.target}`);
	lines.push(`    Scope:  ${fs.scope}`);
	lines.push(`    Verify: ${fs.verification}`);
	if (fs.files && fs.files.length > 0) {
		lines.push(`    Files: ${fs.files.join(", ")}`);
	}
	lines.push("");
	lines.push(`  Out of scope: ${ladder.out_of_scope.join(", ") || "(none)"}`);
	lines.push(`  Verification target: ${ladder.verification_target}`);
	return lines.join("\n");
}

// ── Goal tree helpers ──

function loadGoalTree(): GoalTree | null {
	try {
		if (existsSync(GOAL_TREE_FILE)) {
			return JSON.parse(readFileSync(GOAL_TREE_FILE, "utf-8")) as GoalTree;
		}
	} catch {
		// Corrupted — treat as empty
	}
	return null;
}

function saveGoalTree(tree: GoalTree): void {
	ensureStateDir();
	writeFileSync(GOAL_TREE_FILE, JSON.stringify(tree, null, 2), "utf-8");
}

function buildGoalTreePath(tree: GoalTree, nodeId: string): string[] {
	const path: string[] = [];
	let cur: string | null = nodeId;
	while (cur && tree.nodes[cur]) {
		path.unshift(tree.nodes[cur].title);
		cur = tree.nodes[cur].parent;
	}
	return path;
}

function goalTreeStatus(tree: GoalTree): string {
	const lines: string[] = [];
	const activeId = tree.active;
	const rootId = tree.root;

	if (!rootId || !tree.nodes[rootId]) {
		return "  (empty tree)";
	}

	function printNode(nid: string, indent: number): void {
		if (!tree.nodes[nid]) return;
		const n = tree.nodes[nid];
		const statusIcon: Record<string, string> = { active: "○", done: "✓", cancelled: "✗", blocked: "⊘" };
		const icon = statusIcon[n.status] || "?";
		const marker = nid === activeId ? "→" : " ";
		const suffix = n.status !== "active" ? ` (${n.status})` : "";
		const depthTag = n.depth > 0 ? ` [d:${n.depth}]` : "";
		lines.push(`${"  ".repeat(indent)}${marker} ${icon} ${n.title}${suffix}${depthTag}`);
		for (const child of n.children) {
			printNode(child, indent + 1);
		}
	}

	printNode(rootId, 0);
	lines.push("");

	if (activeId && tree.nodes[activeId]) {
		const path = buildGoalTreePath(tree, activeId);
		lines.push(`  Active: ${tree.nodes[activeId].title}`);
		lines.push(`  Path:   ${path.join(" → ")}`);
	}

	return lines.join("\n");
}

// ============================================================================
// Methodology system prompt
// ============================================================================

const METHODOLOGY_GUIDE = `## Methodology Governance

You are operating under Pi-Star's governance layer, which enforces a
research → plan → implement → verify phase discipline.

### Phase Rules
1. **Research phase** — read and understand before editing. No file modifications.
2. **Plan phase** — scope, steps, and verification targets. No code yet.
3. **Implement phase** — write code in verified slices. Commit after each slice.
4. **Verify phase** — prove the change works. No new work until verification is done.

### LLM Tools
- \`set-phase\` — transition between phases (research → plan → implement → verify).
  Call this tool to announce your current phase. Edits are BLOCKED in research and plan phases.

### Commands
- \`/phase\` — show current phase
- \`/phase <name>\` — transition to a new phase (gate-checked)
- \`/constitution check\` — run constitutional article gates
- \`/constitution\` — list constitutional articles with status
- \`/methodology\` — show this guide
- \`/milestone-ladder init <desc>\` — create a milestone ladder artifact
- \`/milestone-ladder validate\` — check milestone ladder completeness
- \`/milestone-ladder show\` — display the milestone ladder

### Enforcement
- Edits in research or plan phases are **blocked**. Use \`set-phase\` to transition.
- Phase transitions are blocked if prerequisites are not met.
- **Decomposition gate**: transitioning from plan→implement requires a valid milestone ladder.
  Document your decomposition with \`/milestone-ladder init\` before calling \`set-phase implement\`.
- After implementation, verification is required before new work.
- The initial phase is auto-detected from your task description.`;

// ============================================================================
// Initial phase auto-detection
// ============================================================================

const RESEARCH_KEYWORDS = /\b(research|investigate|explore|find out|learn about|understand|how does|study|analyze|what are|tell me about|show me|explain|documentation|read|look up)\b/i;
const PLAN_KEYWORDS = /\b(plan|design|architecture|scope|outline|propose|strategy|approach|spec|specification|milestone)\b/i;
const IMPLEMENT_KEYWORDS = /\b(implement|build|write|code|create|add|fix|change|modify|refactor|update|make|develop|implement|patch|resolve|correct|introduce)\b/i;
const VERIFY_KEYWORDS = /\b(verify|test|validate|audit|prove|regression|coverage|assert)\b/i;

function detectInitialPhase(message: string): Phase {
	// Priority: research first (least harmful default), then plan,
	// then implement for action requests, then verify for testing.
	// Greetings and empty queries default to research.
	const cleanMsg = message.trim().toLowerCase();
	if (!cleanMsg || cleanMsg.length < 5 || /^(hello|hi|hey|good morning|good afternoon|good evening)\b/i.test(cleanMsg)) {
		return "research";
	}
	// Check from most specific/constraining to least
	if (RESEARCH_KEYWORDS.test(message)) return "research";
	if (PLAN_KEYWORDS.test(message)) return "plan";
	if (IMPLEMENT_KEYWORDS.test(message)) return "implement";
	if (VERIFY_KEYWORDS.test(message)) return "verify";
	return "research"; // default to research for ambiguous queries
}

// ============================================================================
// `set-phase` tool — LLM-callable phase transitions
// ============================================================================

const SET_PHASE_TOOL = {
	name: "set-phase",
	label: "Set Governance Phase",
	description:
		"Transition to a new governance phase. The cycle is: research → plan → implement → verify. " +
		"Call this tool to announce which phase of work you are entering. " +
		"The phase determines what actions are allowed: research=reading only, " +
		"plan=design only, implement=code+fix, verify=test+review.",
	promptSnippet: "Use set-phase to transition between governance phases: research → plan → implement → verify.",
	promptGuidelines: [
		"ALWAYS start a task by calling set-phase to announce the phase you are entering.",
		"Research phase: read files, understand the system. NO edits allowed.",
		"Plan phase: design, scope, outline steps. NO edits allowed.",
		"Implement phase: write code, make changes. Edits are allowed.",
		"Verify phase: test, review, validate. NO new implementation work until verification is complete.",
		"Transitions are enforced: implement requires prior plan, plan requires prior research.",
	],
	parameters: Type.Object({
		phase: Type.Union(
			[
				Type.Literal("research", { description: "Read and understand the system. No file modifications." }),
				Type.Literal("plan", { description: "Define scope, steps, and verification targets. No code yet." }),
				Type.Literal("implement", { description: "Write code in verified slices. File modifications allowed." }),
				Type.Literal("verify", { description: "Test, review diffs, document residual risk. No new work." }),
			],
			{ description: "The phase to transition to" },
		),
	}),
	execute: async (
		_toolCallId: string,
		params: { phase: string },
	): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> => {
		const target = params.phase as Phase;
		const allowed = PHASE_TRANSITIONS[state.currentPhase];

		if (!allowed.includes(target)) {
			const msg = `Cannot transition: ${PHASE_LABELS[state.currentPhase]} → ${PHASE_LABELS[target]}. Allowed: ${allowed.join(", ") || "none"}`;
			return {
				content: [{ type: "text", text: `⚠️ ${msg}` }],
				details: { error: msg, currentPhase: state.currentPhase, allowedTransitions: allowed },
				isError: true,
			};
		}

		// Decomposition enforcement: plan → implement requires a milestone ladder
		if (state.currentPhase === "plan" && target === "implement") {
			const ladder = loadMilestoneLadder();
			if (!ladder) {
				const msg = `🧱 Decomposition gate BLOCKED: No milestone ladder found. Before implementing, document your decomposition:

  /milestone-ladder init "<task description>"
  # Then edit ~/.pi/runtime/milestone-ladder.json
  /milestone-ladder validate

The milestone ladder must define milestones (2-5), first_slice, out_of_scope, and a verification target.`;
				return {
					content: [{ type: "text", text: msg }],
					details: { error: "milestone ladder missing", currentPhase: state.currentPhase },
					isError: true,
				};
			}
			const validation = validateMilestoneLadder(ladder);
			if (!validation.valid) {
				const msg = `🧱 Decomposition gate BLOCKED: Milestone ladder is incomplete.

${validation.errors.map((e) => `  ✗ ${e}`).join("\n")}
${validation.warnings.map((w) => `  ⚠ ${w}`).join("\n")}

Fix the issues, then /milestone-ladder validate and retry set-phase implement.`;
				return {
					content: [{ type: "text", text: msg }],
					details: { error: "milestone ladder invalid", validation },
					isError: true,
				};
			}
		}

		state.history.push({ phase: target, timestamp: Date.now(), summary: "" });
		state.currentPhase = target;
		saveState(state);

		const guidance = PHASE_PROMPTS[target] || `You are now in the ${target} phase.`;
		return {
			content: [
				{
					type: "text",
					text: `✅ Phase changed to: ${PHASE_LABELS[target]}\n\n${guidance}\n\n${
						target === "research" || target === "plan"
							? "⚠️  WARNING: Direct file edits are blocked in this phase. Use read-only tools only."
							: target === "implement"
								? "✏️  You may now edit files. Commit after each verified slice."
								: "🔍  Verify the change. Run tests, review diffs. Do NOT start new implementation."
					}`,
				},
			],
			details: { phase: target, timestamp: Date.now() },
		};
	},
};

// ============================================================================
// Extension
// ============================================================================

export default function governanceLayerExtension(pi: ExtensionAPI) {
	const state = loadState();

	// ── Register the set-phase tool ──
	pi.registerTool(SET_PHASE_TOOL);

	// ── Helpers ──

	function notify(ctx: ExtensionCommandContext, msg: string, level: "info" | "warning" | "error" = "info"): void {
		if ((ctx as any).ui?.notify) {
			(ctx as any).ui.notify(msg, level);
		}
		// Always log to stdout/stderr so agent sees it in --print mode too
		if (level === "error") {
			console.error(`[governance] ${msg}`);
		} else {
			console.log(`[governance] ${msg}`);
		}
	}

	function transitionTo(target: Phase, ctx: ExtensionCommandContext): boolean {
		const allowed = PHASE_TRANSITIONS[state.currentPhase];
		if (!allowed.includes(target)) {
			notify(
				ctx,
				`Cannot transition: ${PHASE_LABELS[state.currentPhase]} → ${PHASE_LABELS[target]}. Allowed: ${allowed.join(", ")}`,
				"warning",
			);
			return false;
		}

		state.history.push({ phase: target, timestamp: Date.now(), summary: "" });
		state.currentPhase = target;
		saveState(state);
		notify(ctx, `Phase: ${PHASE_LABELS[target]}`, "info");
		return true;
	}

	function phaseAllowed(target: Phase): boolean {
		const allowed = PHASE_TRANSITIONS[state.currentPhase];
		return allowed.includes(target);
	}

	// ── Constitution checks ──

	function runConstitution(ctx: ExtensionCommandContext): void {
		let passed = 0;
		let failed = 0;
		const results: string[] = [];

		for (const article of CONSTITUTION_ARTICLES) {
			const result = article.gate(state);
			state.constitutionResults[article.id] = result.pass;
			if (result.pass) {
				passed++;
				results.push(`  ✅ Article ${article.id}: ${result.reason}`);
			} else {
				failed++;
				results.push(`  ❌ Article ${article.id}: ${result.reason}`);
			}
		}

		saveState(state);
		results.push(`\n  ${passed} passed, ${failed} failed`);
		notify(ctx, results.join("\n"), failed > 0 ? "warning" : "info");
	}

	// ── Propagation check ──

	function checkPropagation(ctx: ExtensionCommandContext): void {
		state.lastPropagationCheck = Date.now();
		const results: string[] = [];

		for (const entry of METHODOLOGY_FILES) {
			const localExists = existsSync(entry.local);
			const upstreamExists = existsSync(entry.upstream);

			if (localExists && upstreamExists) {
				const localContent = readFileSync(entry.local, "utf-8");
				const upstreamContent = readFileSync(entry.upstream, "utf-8");
				if (localContent === upstreamContent) {
					results.push(`  ✅ ${entry.label}: in sync`);
				} else {
					results.push(`  ⚠️  ${entry.label}: DRIFT DETECTED — local differs from upstream`);
				}
			} else if (!localExists) {
				results.push(`  ⚠️  ${entry.label}: MISSING — local file not found`);
			} else {
				results.push(`  ⚠️  ${entry.label}: MISSING — upstream file not found`);
			}
		}

		saveState(state);
		notify(ctx, results.join("\n"), "info");
	}

	// ── Commands ──

	pi.registerCommand("phase", {
		description: "Show or set governance phase. Usage: /phase [research|plan|implement|verify]",
		handler: async (ctx: ExtensionCommandContext) => {
			const args = (ctx as any).args as string[] | undefined;
			const phaseArg = args?.[0] as Phase | undefined;

			if (!phaseArg) {
				const allowed = PHASE_TRANSITIONS[state.currentPhase];
				const msg = [
					`Current phase: ${PHASE_LABELS[state.currentPhase]}`,
					`Allowed transitions: ${allowed.join(", ") || "none"}`,
					"",
					"Usage: /phase research | plan | implement | verify",
				].join("\n");
				notify(ctx, msg, "info");
				return;
			}

			if (!["research", "plan", "implement", "verify"].includes(phaseArg)) {
				notify(ctx, `Unknown phase: ${phaseArg}. Use: research, plan, implement, verify`, "warning");
				return;
			}

			transitionTo(phaseArg, ctx);
		},
	});

	pi.registerCommand("constitution", {
		description: "List or check constitutional articles. Usage: /constitution [check]",
		handler: async (ctx: ExtensionCommandContext) => {
			const args = (ctx as any).args as string[] | undefined;
			const subcommand = args?.[0];

			if (subcommand === "check") {
				runConstitution(ctx);
				return;
			}

			// List articles with status
			const results: string[] = [];
			for (const article of CONSTITUTION_ARTICLES) {
				const cached = state.constitutionResults[article.id];
				const status =
					cached === undefined ? "—" : cached ? "✅" : "❌";
				results.push(`  Article ${article.id} ${status}: ${article.title}`);
			}
			notify(ctx, results.join("\n"), "info");
		},
	});

	pi.registerCommand("methodology", {
		description: "Show the full methodology governance guide",
		handler: async (ctx: ExtensionCommandContext) => {
			notify(ctx, METHODOLOGY_GUIDE, "info");
		},
	});

	// ── Workflow state check ──

	function checkWorkflowState(ctx: ExtensionCommandContext): void {
		const results: string[] = [];
		let errors = 0;
		let warnings = 0;

		// Check state file exists
		if (!existsSync(STATE_FILE)) {
			notify(ctx, "❌ governance-state.json not found", "error");
			return;
		}
		results.push("  ✅ State file exists");

		// Check valid JSON
		try {
			const raw = readFileSync(STATE_FILE, "utf-8");
			JSON.parse(raw);
			results.push("  ✅ Valid JSON");
		} catch {
			notify(ctx, "❌ governance-state.json is not valid JSON", "error");
			return;
		}

		// Load and validate state
		const st = loadState();

		// Check current phase
		const validPhases: Phase[] = ["none", "research", "plan", "implement", "verify"];
		if (!validPhases.includes(st.currentPhase)) {
			results.push(`  ❌ Invalid phase: "${st.currentPhase}"`);
			errors++;
		} else {
			results.push(`  ✅ Current phase: ${st.currentPhase}`);
		}

		// Check history
		if (st.history.length === 0) {
			results.push("  ⚠ No phase history recorded");
			warnings++;
		} else {
			results.push(`  ✅ History: ${st.history.length} entries`);

			// Check phase ordering
			const expectedOrder: Phase[] = ["research", "plan", "implement", "verify"];
			let orderOk = true;
			const actualOrder = st.history
				.filter((e) => expectedOrder.includes(e.phase))
				.map((e) => e.phase);

			for (let i = 1; i < actualOrder.length; i++) {
				const prevIdx = expectedOrder.indexOf(actualOrder[i - 1]);
				const currIdx = expectedOrder.indexOf(actualOrder[i]);
				if (currIdx < prevIdx) {
					results.push(`  ⚠ Phase order anomaly: ${actualOrder[i - 1]} → ${actualOrder[i]}`);
					warnings++;
					orderOk = false;
					break;
				}
			}
			if (orderOk) {
				results.push("  ✅ Phase transitions follow research→plan→implement→verify order");
			}

			// Check for entries without timestamps
			const noTs = st.history.filter((e) => !e.timestamp).length;
			if (noTs > 0) {
				results.push(`  ⚠ ${noTs} history entr(ies) missing timestamps`);
				warnings++;
			}

			// Check for the most recent entry
			const lastEntry = st.history[st.history.length - 1];
			const age = Date.now() - lastEntry.timestamp;
			const ageHours = Math.floor(age / 3600000);
			if (ageHours > 24) {
				results.push(`  ⚠ Last phase change was ${ageHours}h ago — state may be stale`);
				warnings++;
			}
		}

		// Check constitution results
		const articleCount = Object.keys(st.constitutionResults).length;
		if (articleCount > 0) {
			const passed = Object.values(st.constitutionResults).filter(Boolean).length;
			results.push(`  ✅ Constitution: ${passed}/${articleCount} articles passed`);
		}

		// Summary
		results.push("");
		results.push(`  Summary: ${errors} error(s), ${warnings} warning(s)`);
		const level = errors > 0 ? "error" : warnings > 0 ? "warning" : "info";
		notify(ctx, results.join("\n"), level);
	}

	pi.registerCommand("workflow-check", {
		description:
			"Validate governance-state.json for structural integrity and consistency. Usage: /workflow-check",
		handler: async (ctx: ExtensionCommandContext) => {
			checkWorkflowState(ctx);
		},
	});

	pi.registerCommand("propagation", {
		description: "Check methodology file drift with agentic-workflows",
		handler: async (ctx: ExtensionCommandContext) => {
			checkPropagation(ctx);
		},
	});

	pi.registerCommand("milestone-ladder", {
		description:
			"Manage the milestone ladder for decomposition enforcement. " +
			"Usage: /milestone-ladder init <description> | show | validate",
		handler: async (ctx: ExtensionCommandContext) => {
			const args = (ctx as any).args as string[] | undefined;
			const subcommand = args?.[0];

			if (!subcommand || subcommand === "help") {
				notify(
					ctx,
					[
						"Milestone Ladder — document your decomposition before implementation",
						"",
						"  /milestone-ladder init <task description> — create a template",
						"  /milestone-ladder show                  — display current ladder",
						"  /milestone-ladder validate               — check ladder is valid",
						"",
						"The set-phase tool requires a valid milestone ladder before plan→implement.",
					].join("\n"),
					"info",
				);
				return;
			}

			if (subcommand === "init") {
				const taskDesc = args?.slice(1).join(" ").trim() || "Unnamed task";
				const ladder = generateMilestoneLadderTemplate(taskDesc);
				saveMilestoneLadder(ladder);
				const msg = [
					`✅ Created milestone ladder for: "${taskDesc.slice(0, 100)}"`,
					`  File: ${MILESTONE_LADDER_FILE}`,
					"",
					"  Edit the file to match your task:",
					"    1. Set milestones (2-5) with name, deliverable, acceptance_criteria",
					"    2. Fill in first_slice target, scope, files, verification",
					"    3. List out_of_scope items",
					"    4. Define verification_target",
					"",
					"  Then validate: /milestone-ladder validate",
				].join("\n");
				notify(ctx, msg, "info");
				return;
			}

			if (subcommand === "validate") {
				const ladder = loadMilestoneLadder();
				if (!ladder) {
					notify(
						ctx,
						"No milestone ladder found. Run: /milestone-ladder init \"<task description>\"",
						"warning",
					);
					return;
				}
				const result = validateMilestoneLadder(ladder);
				const lines: string[] = [`Milestone ladder: ${ladder.milestones.length} milestones`];
				for (const e of result.errors) {
					lines.push(`  ✗ ${e}`);
				}
				for (const w of result.warnings) {
					lines.push(`  ⚠ ${w}`);
				}
				if (result.valid) {
					lines.push("");
					lines.push("✅ Milestone ladder is valid.");
				} else {
					lines.push("");
					lines.push("❌ Fix errors above, then validate again.");
				}
				notify(ctx, lines.join("\n"), result.valid ? "info" : "warning");
				return;
			}

			if (subcommand === "show") {
				const ladder = loadMilestoneLadder();
				if (!ladder) {
					notify(
						ctx,
						"No milestone ladder found. Run: /milestone-ladder init \"<task description>\"",
						"warning",
					);
					return;
				}
				notify(ctx, milestoneLadderToDisplay(ladder), "info");
				return;
			}

			notify(ctx, `Unknown subcommand: ${subcommand}. Use: init, show, validate`, "warning");
		},
	});

	pi.registerCommand("goal-tree", {
		description:
			"Manage the persistent goal tree. Usage: /goal-tree init <title> | branch <parent> <title> | close [id] | cancel [id] | status | current",
		handler: async (ctx: ExtensionCommandContext) => {
			const args = (ctx as any).args as string[] | undefined;
			const subcommand = args?.[0];

			if (!subcommand || subcommand === "help") {
				notify(
					ctx,
					[
						"Goal Tree — persistent hierarchical goal tracking",
						"",
						"  /goal-tree init <title>               — create root goal",
						"  /goal-tree branch <parent-id> <title> — add child goal",
						"  /goal-tree close [node-id]            — mark done, return to parent",
						"  /goal-tree cancel [node-id]           — mark cancelled, return to parent",
						"  /goal-tree status                     — show full tree",
						"  /goal-tree current                    — show active path to root",
						"",
						"Depth limit: 8. Warnings at 4+.",
						`File: ${GOAL_TREE_FILE}`,
					].join("\n"),
					"info",
				);
				return;
			}

			if (subcommand === "init") {
				const title = args?.slice(1).join(" ").trim();
				if (!title) {
					notify(ctx, "Usage: /goal-tree init \"<title>\"", "warning");
					return;
				}
				const existing = loadGoalTree();
				if (existing?.root) {
					notify(ctx, `Tree already exists with root: ${existing.nodes[existing.root]?.title}. Use branch to add children.`, "warning");
					return;
				}
				const nodeId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
				const tree: GoalTree = {
					nodes: {
						[nodeId]: {
							id: nodeId,
							parent: null,
							title,
							status: "active",
							phase: "none",
							depth: 0,
							children: [],
							created_at: Date.now(),
							closed_at: null,
						},
					},
					root: nodeId,
					active: nodeId,
				};
				saveGoalTree(tree);
				notify(ctx, `✅ Root goal created: ${title}`, "info");
				return;
			}

			if (subcommand === "branch") {
				const parentId = args?.[1];
				const title = args?.slice(2).join(" ").trim();
				if (!parentId || !title) {
					notify(ctx, "Usage: /goal-tree branch <parent-id> \"<title>\"", "warning");
					return;
				}
				const tree = loadGoalTree();
				if (!tree || !tree.nodes[parentId]) {
					notify(ctx, `Parent '${parentId}' not found. Use status to see available nodes.`, "warning");
					return;
				}
				const parent = tree.nodes[parentId];
				if (parent.status === "done" || parent.status === "cancelled") {
					notify(ctx, `Parent '${parentId}' is already ${parent.status}`, "warning");
					return;
				}
				const childDepth = parent.depth + 1;
				if (childDepth > 8) {
					notify(ctx, "Max depth (8) exceeded", "error");
					return;
				}
				let childId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
				if (tree.nodes[childId]) childId = `${childId}-${Date.now()}`;

				tree.nodes[childId] = {
					id: childId,
					parent: parentId,
					title,
					status: "active",
					phase: "none",
					depth: childDepth,
					children: [],
					created_at: Date.now(),
					closed_at: null,
				};
				parent.children.push(childId);
				tree.active = childId;
				saveGoalTree(tree);

				const warnMsg = childDepth >= 4 ? ` ⚠️ Depth ${childDepth}/8 — consider closing ancestors first.` : "";
				notify(ctx, `✅ Branch: ${title} [depth: ${childDepth}/8]${warnMsg}`, "info");
				return;
			}

			if (subcommand === "close" || subcommand === "cancel") {
				let nodeId = args?.[1];
				const tree = loadGoalTree();
				if (!tree) {
					notify(ctx, "No goal tree found. Use /goal-tree init.", "warning");
					return;
				}
				if (!nodeId) nodeId = tree.active ?? undefined;
				if (!nodeId || !tree.nodes[nodeId]) {
					notify(ctx, "Node not found. Specify a valid node-id.", "warning");
					return;
				}
				const node = tree.nodes[nodeId];
				node.status = subcommand === "cancel" ? "cancelled" : "done";
				node.closed_at = Date.now();
				if (node.parent) {
					tree.active = node.parent;
				} else {
					tree.active = null;
				}
				saveGoalTree(tree);
				const parentTitle = node.parent && tree.nodes[node.parent] ? tree.nodes[node.parent].title : "(no parent)";
				notify(ctx, `${subcommand === "cancel" ? "⚠️ Cancelled" : "✅ Closed"}: ${node.title}\n  Returned to: ${parentTitle}`, "info");
				return;
			}

			if (subcommand === "status") {
				const tree = loadGoalTree();
				if (!tree) {
					notify(ctx, "No goal tree. Use /goal-tree init \"<title>\"", "info");
					return;
				}
				notify(ctx, `═══ Goal Tree ═══\n\n${goalTreeStatus(tree)}`, "info");
				return;
			}

			if (subcommand === "current") {
				const tree = loadGoalTree();
				if (!tree || !tree.active || !tree.nodes[tree.active]) {
					notify(ctx, "No active node. Use /goal-tree init or check with /goal-tree status.", "warning");
					return;
				}
				const n = tree.nodes[tree.active];
				const path = buildGoalTreePath(tree, tree.active);
				const statusIcons: Record<string, string> = { active: "○", done: "✓", cancelled: "✗", blocked: "⊘" };
				const icon = statusIcons[n.status] || "?";
				notify(
					ctx,
					[
						`═══ Current Node ═══`,
						`  ${icon} ${n.title}`,
						`  Depth: ${n.depth}  Status: ${n.status}  Phase: ${n.phase}`,
						`  Children: ${n.children.length}`,
						`  Path: ${path.join(" → ")}`,
					].join("\n"),
					"info",
				);
				return;
			}

			notify(ctx, `Unknown: ${subcommand}. Use: init, branch, close, cancel, status, current`, "warning");
		},
	});

	// ── Lifecycle hooks ──

	pi.on("before_agent_start", async (event: any) => {
		// Auto-detect initial phase if none is set and we have a user prompt
		if (state.currentPhase === "none" && event.prompt) {
			const userMsg = typeof event.prompt === "string" ? event.prompt : "";
			const detected = detectInitialPhase(userMsg);
			state.currentPhase = detected;
			state.history.push({ phase: detected, timestamp: Date.now(), summary: "auto-detected from user input" });
			saveState(state);
			console.log(`[governance] Auto-detected phase: ${detected} from: "${userMsg.slice(0, 80)}"`);
		}

		const phasePrompt = state.currentPhase !== "none" ? PHASE_PROMPTS[state.currentPhase] : "";
		const autoGuide =
			state.currentPhase !== "none"
				? `\n\n### Auto-Set Phase: ${state.currentPhase}\n` +
					`The system detected the current phase from your task. If you need to change phase, ` +
					`use the \`set-phase\` tool (not a command — the LLM-callable tool).\n` +
					`Transitions allowed from here: ${PHASE_TRANSITIONS[state.currentPhase].join(", ") || "none"}`
				: "";

		return {
			systemPrompt:
				event.systemPrompt + "\n\n" + METHODOLOGY_GUIDE + "\n\n" + phasePrompt + autoGuide,
		};
	});

	pi.on("tool_call", async (event: any, ctx: any) => {
		if (event.toolName === "write" || event.toolName === "edit") {
			if (state.currentPhase === "research" || state.currentPhase === "plan" || state.currentPhase === "none") {
				const msg = `⚠️  Blocked: edit in ${state.currentPhase} phase. Use set-phase tool to transition to "implement" phase before modifying files.`;

				// Notify in TUI mode
				if ((ctx as any).ui?.notify) {
					(ctx as any).ui.notify(msg, "warning");
				}

				// Log to stdout so agent sees it in --print mode
				console.log(`[governance] ${msg}`);

				return {
					block: true,
					reason: `Edits are blocked in the "${state.currentPhase}" phase. Call the set-phase tool to transition to "implement" first.`,
				};
			}
		}
		return undefined;
	});

	pi.on("session_start", async (_event: any, ctx: any) => {
		if (state.currentPhase !== "none") {
			const msg = `Governance active — current phase: ${PHASE_LABELS[state.currentPhase]}`;
			if ((ctx as any).ui?.notify) {
				(ctx as any).ui.notify(msg, "info");
			}
			console.log(`[governance] ${msg}`);
		}
	});
}
