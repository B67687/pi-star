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

### Enforcement
- Edits in research or plan phases are **blocked**. Use \`set-phase\` to transition.
- Phase transitions are blocked if prerequisites are not met.
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

	pi.registerCommand("propagation", {
		description: "Check methodology file drift with agentic-workflows",
		handler: async (ctx: ExtensionCommandContext) => {
			checkPropagation(ctx);
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
