"use client";

import type { PaceAssistantBlock } from "@/modules/pace-assistant/types/pace-assistant";
import { getPaceAssistantLabels } from "@/modules/pace-assistant/ui/assistant-labels";
import { PaceAssistantBlockRenderer } from "@/modules/pace-assistant/ui/components/pace-assistant-response";

import type { AssistantActionView } from "../../domain/assistant-action";
import type { AssistantMessages } from "../assistant-messages";
import { FinancialMetricResult } from "./financial-metric-result";
import { InsightResult } from "./insight-result";
import { PreparedActionCard } from "./prepared-action-card";
import { ReportResultCard } from "./report-result-card";
import { TransactionResultList } from "./transaction-result-list";

export type AssistantRenderContext = {
  readonly messages: AssistantMessages;
  readonly language: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceSlug: string;
};

export function AssistantToolResult({
  block,
  index,
  context,
}: {
  readonly block: PaceAssistantBlock;
  readonly index: number;
  readonly context: AssistantRenderContext;
}) {
  const { messages, locale, timeZone } = context;

  switch (block.type) {
    case "metric":
    case "metric-grid":
      return <FinancialMetricResult block={block} locale={locale} messages={messages} />;
    case "transaction-list":
      return (
        <TransactionResultList
          block={block}
          locale={locale}
          messages={messages}
          timeZone={timeZone}
          workspaceSlug={context.workspaceSlug}
        />
      );
    case "insight":
      return <InsightResult block={block} messages={messages} />;
    case "report-export":
      return <ReportResultCard block={block} locale={locale} />;
    case "action-proposal":
    case "approval":
      return <PreparedActionCard messages={messages} note={block.summary} view={displayOnlyAction(block)} />;
    default:
      return (
        <div data-assistant-text={block.type === "text" ? "" : undefined}>
          <PaceAssistantBlockRenderer
            block={block}
            index={index}
            labels={getPaceAssistantLabels(context.language)}
            locale={locale}
            timeZone={timeZone}
          />
        </div>
      );
  }
}

function displayOnlyAction(block: Extract<PaceAssistantBlock, { type: "action-proposal" | "approval" }>): AssistantActionView {
  return {
    title: block.title,
    completedTitle: block.title,
    approveLabel: "",
    amount: null,
    route: null,
    fields: block.fields.map((field) => ({ label: field.label, value: field.sensitive ? "••••" : field.value })),
    effects: [],
    incomplete: false,
    verifiedAt: null,
    failureMessage: null,
    link: null,
  };
}
