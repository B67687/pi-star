/**
 * Question Tool — LLM-callable tool for asking the user questions inline
 *
 * The agent can register this tool to ask the user for confirmation,
 * choices, or text input. In TUI mode, it presents interactive dialogs.
 * In --print mode, it logs the question and returns an "unanswered" response
 * so the agent knows it needs to proceed without user input.
 *
 * Usage (LLM tool — called by the agent, not the user):
 *   ask-user({ question: "Are you sure?", type: "confirm" })
 *   ask-user({ question: "Which approach?", type: "select", options: ["A", "B"] })
 *   ask-user({ question: "Enter a name:", type: "text" })
 *
 * Commands:
 *   /question <text>    — Log a one-off question for testing
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@b67687/pi-star-coding-agent";
import { Type } from "@sinclair/typebox";

// ============================================================================
// ask-user tool definition
// ============================================================================

const ASK_USER_TOOL = {
	name: "ask-user",
	label: "Ask User",
	description:
		"Ask the user a question inline. Use when you need confirmation before proceeding, " +
		"a choice between alternatives, or free-form input to continue a task. " +
		"In non-interactive mode, you will need to proceed without user input.",
	promptSnippet: "Use ask-user when you need the user's input — confirmation, a choice, or text input.",
	promptGuidelines: [
		"Use ask-user to ask for confirmation before destructive or irreversible operations.",
		"Use ask-user when you need the user to pick between alternative approaches.",
		"Use ask-user when the task is ambiguous or requires user judgement.",
		"In --print mode, ask-user cannot get a response — proceed with the most reasonable default.",
	],
	parameters: Type.Object({
		question: Type.String({
			description: "The question to ask the user. Be clear and specific about what you need.",
		}),
		type: Type.Optional(
			Type.Union(
				[
					Type.Literal("confirm", {
						description: "Yes/No confirmation. Use for destructive/irreversible actions.",
					}),
					Type.Literal("select", {
						description: "Choose from a list of options. Provide 2-5 clear options.",
					}),
					Type.Literal("input", {
						description: "Free-form text input. Use when you need arbitrary user input.",
					}),
				],
				{ description: "Type of answer expected. Default: confirm. Options: confirm, select, input." },
			),
		),
		options: Type.Optional(
			Type.Array(Type.String(), {
				description: "Options for 'select' type. Provide 2-5 clear, distinct options.",
			}),
		),
	}),
	execute: async (
		_toolCallId: string,
		params: { question: string; type?: string; options?: string[] },
		_signal: AbortSignal | undefined,
		_onUpdate: unknown,
		ctx: any,
	): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> => {
		const question = params.question;
		const answerType = params.type || "confirm";
		const options = params.options || [];

		// Log the question regardless of mode
		console.log(`[question-tool] Ask: ${question}`);

		if ((ctx as any).hasUI) {
			try {
				if (answerType === "confirm") {
					const answer = await ctx.ui.confirm(question, "");
					return {
						content: [{ type: "text", text: answer ? "✅ Confirmed: Yes" : "❌ Declined: No" }],
						details: { answer, type: "confirm" },
					};
				}

				if (answerType === "select" && options.length > 0) {
					const answer = await ctx.ui.select(question, options);
					if (!answer) {
						return {
							content: [{ type: "text", text: "⚠️ Selection cancelled or dismissed." }],
							details: { answer: null, type: "select" },
						};
					}
					return {
						content: [{ type: "text", text: `✅ Selected: "${answer}"` }],
						details: { answer, type: "select" },
					};
				}

				if (answerType === "input") {
					const answer = await ctx.ui.input(question);
					if (!answer) {
						return {
							content: [{ type: "text", text: "⚠️ Input cancelled or dismissed." }],
							details: { answer: null, type: "input" },
						};
					}
					return {
						content: [{ type: "text", text: `✅ Input: "${answer}"` }],
						details: { answer, type: "input" },
					};
				}

				// Fallback: just notify
				ctx.ui.notify(`Question: ${question}`, "info");
				return {
					content: [{ type: "text", text: "⚠️ Question shown to user via notification." }],
					details: { type: "notify" },
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.error(`[question-tool] UI interaction failed: ${message}`);
				return {
					content: [
						{
							type: "text",
							text: `⚠️ Could not ask the user (UI error: ${message}). Please proceed without input.`,
						},
					],
					details: { error: message },
				};
			}
		}

		// --print mode: log to stderr and return unanswered
		console.error(`[question-tool] ⚠️ Agent needs user input in --print mode:
  Question: ${question}
  Type: ${answerType}${options.length > 0 ? "\n  Options: " + options.join(", ") : ""}
  → User must use interactive TUI mode to answer. Proceeding without input.`);

		return {
			content: [
				{
					type: "text",
					text: `⚠️ Cannot ask the user in --print mode.\n\nQuestion was: "${question}"\n\nProceed without user input. Make the best choice based on context and explain your reasoning.`,
				},
			],
			details: { question, type: answerType, options, unanswered: true },
		};
	},
};

// ============================================================================
// Extension
// ============================================================================

export default function questionToolExtension(pi: ExtensionAPI) {
	// Register the ask-user tool for LLM use
	pi.registerTool(ASK_USER_TOOL);

	// Register a convenience command for manual testing
	pi.registerCommand("question", {
		description: "Ask the user a one-off question. Usage: /question <text>",
		handler: async (ctx: ExtensionCommandContext) => {
			const ctxAny = ctx as any;
			const args: string[] = ctxAny.args || [];
			const text = args.join(" ").trim();
			if (!text) {
				console.log("[question-tool] Usage: /question <text>");
				return;
			}
			console.log(`[question-tool] Question: ${text}`);
			if ((ctxAny as any).ui?.notify) {
				(ctxAny as any).ui.notify(`Question logged: ${text}`, "info");
			}
		},
	});
}
