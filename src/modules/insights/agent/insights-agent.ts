import { generateText, stepCountIs, tool, type LanguageModel } from "ai";

import type { PaceToolResult } from "@/modules/pace-agents/domain";
import type { PaceSubAgentExecutor, PaceSubAgentTask } from "@/modules/pace-agents/orchestrator";
import { localDateForInstant, localDateKey } from "@/money/period";

import { insightsSubAgent } from "./insights-sub-agent";

const MAX_STEPS = 8;

export interface InsightsAgentDependencies {
  readonly model: LanguageModel;
  readonly now?: () => Date;
}

/**
 * The Insights sub-agent's reasoning step. The model only chooses which owned
 * read to call and words the answer; every amount, percentage, period, chart,
 * and report comes back from the gateway-backed toolbox.
 */
export function createInsightsAgent(dependencies: InsightsAgentDependencies): PaceSubAgentExecutor {
  return async (task, toolbox) => {
    const offered = new Set(toolbox.capabilities.map((capability) => capability.tool));
    let awaitingDetails = false;

    const tools = Object.fromEntries(
      insightsSubAgent.capabilities
        .filter((capability) => offered.has(capability.tool))
        .map((capability) => [
          capability.tool,
          tool({
            description: capability.description,
            inputSchema: capability.inputSchema,
            execute: async (input: unknown) => {
              const result = await toolbox.call(capability.tool, input);
              if (result.status === "ok") awaitingDetails = isUnresolved(result.data);
              return modelView(result);
            },
          }),
        ]),
    );

    const { text } = await generateText({
      model: dependencies.model,
      instructions: [task.instructions, workspaceFacts(task, (dependencies.now ?? (() => new Date()))())].join("\n\n"),
      prompt: task.request,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
    });

    return { summary: text.trim() || null, needsInput: awaitingDetails };
  };
}

function workspaceFacts(task: PaceSubAgentTask, now: Date): string {
  const { currency, locale, timeZone, language } = task.envelope;
  return [
    `Workspace currency: ${currency}. Locale: ${locale}. Time zone: ${timeZone}.`,
    `Today is ${localDateKey(localDateForInstant(now, timeZone))} in the workspace time zone.`,
    language ? `Reply in the member's language: ${language}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function modelView(result: PaceToolResult) {
  return { status: result.status, data: result.data, error: result.error };
}

function isUnresolved(data: unknown): boolean {
  return typeof data === "object" && data !== null && (data as { resolved?: unknown }).resolved === false;
}
