import { generateText, hasToolCall, stepCountIs, tool, type LanguageModel } from "ai";

import type { PaceToolResult } from "@/modules/pace-agents/domain";
import type { PaceSubAgentExecutor, PaceSubAgentTask } from "@/modules/pace-agents/orchestrator";

import { transactionsSubAgent } from "./transactions-sub-agent";

const MAX_STEPS = 8;

export interface TransactionsAgentDependencies {
  readonly model: LanguageModel;
  /** Reserved for the Projects and Debts sub-agents: extra facts the model may use when preparing a transaction. */
  readonly context?: (task: PaceSubAgentTask) => readonly string[] | Promise<readonly string[]>;
}

/**
 * The Transactions sub-agent's reasoning step. The model only chooses which
 * owned capability to call and with what words from the member; every read,
 * amount, id, and write decision comes back from the gateway-backed toolbox.
 */
export function createTransactionsAgent(dependencies: TransactionsAgentDependencies): PaceSubAgentExecutor {
  return async (task, toolbox) => {
    const offered = new Set(toolbox.capabilities.map((capability) => capability.tool));
    const commitTools = toolbox.capabilities
      .filter((capability) => capability.access === "commit")
      .map((capability) => capability.tool);
    let awaitingDetails = false;

    const tools = Object.fromEntries(
      transactionsSubAgent.capabilities
        .filter((capability) => offered.has(capability.tool))
        .map((capability) => [
          capability.tool,
          tool({
            description: capability.description,
            inputSchema: capability.inputSchema,
            execute: async (input: unknown) => {
              const result = await toolbox.call(capability.tool, input);
              if (result.access === "prepare" && result.status === "ok") {
                awaitingDetails = hasMissingFields(result.data);
              }
              return modelView(result);
            },
          }),
        ]),
    );

    const { text } = await generateText({
      model: dependencies.model,
      instructions: [
        task.instructions,
        workspaceFacts(task),
        ...((await dependencies.context?.(task)) ?? []),
      ].join("\n\n"),
      prompt: task.request,
      tools,
      // A commit parks for approval. The turn ends there so the model cannot
      // describe, retry, or build on a write the member has not approved.
      stopWhen: [stepCountIs(MAX_STEPS), hasToolCall(...commitTools)],
    });

    return { summary: text.trim() || null, needsInput: awaitingDetails };
  };
}

function workspaceFacts(task: PaceSubAgentTask): string {
  const { currency, locale, timeZone, language } = task.envelope;
  return [
    `Workspace currency: ${currency}. Locale: ${locale}. Time zone: ${timeZone}.`,
    language ? `Reply in the member's language: ${language}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function modelView(result: PaceToolResult) {
  return {
    status: result.status,
    data: result.data,
    actionId: result.actionId,
    error: result.error,
  };
}

function hasMissingFields(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const draft = (data as { draft?: { missingFields?: unknown } }).draft;
  return Array.isArray(draft?.missingFields) && draft.missingFields.length > 0;
}
