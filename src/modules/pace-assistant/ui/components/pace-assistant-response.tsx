"use client";

import type { PaceAssistantLabels } from "../assistant-labels";
import type { PaceAssistantBlock } from "../../types/pace-assistant";
import { ActionProposalBlock } from "./blocks/action-proposal-block";
import { ActionResultBlock } from "./blocks/action-result-block";
import { ApprovalBlock } from "./blocks/approval-block";
import { BillsListBlock } from "./blocks/bills-list-block";
import { BudgetSummaryBlock } from "./blocks/budget-summary-block";
import { ComparisonBlock } from "./blocks/comparison-block";
import { ExpenseListBlock } from "./blocks/expense-list-block";
import { GoalSummaryBlock } from "./blocks/goal-summary-block";
import { InsightBlock } from "./blocks/insight-block";
import { ListBlock } from "./blocks/list-block";
import { MetricBlock } from "./blocks/metric-block";
import { MetricGridBlock } from "./blocks/metric-grid-block";
import { NoticeBlock } from "./blocks/notice-block";
import { RecurringListBlock } from "./blocks/recurring-list-block";
import { TableBlock } from "./blocks/table-block";
import { TextBlock } from "./blocks/text-block";
import { TransactionListBlock } from "./blocks/transaction-list-block";

type RendererProps = {
  readonly blocks: readonly PaceAssistantBlock[];
  readonly locale: string;
  readonly timeZone: string;
  readonly labels: PaceAssistantLabels;
};

export function PaceAssistantResponse({ blocks, locale, timeZone, labels }: RendererProps) {
  return <div className="space-y-3">{blocks.map((block, index) => <PaceAssistantBlockRenderer block={block} index={index} key={`${block.type}-${index}`} labels={labels} locale={locale} timeZone={timeZone} />)}</div>;
}

export function PaceAssistantBlockRenderer({ block, index, locale, timeZone, labels }: Omit<RendererProps, "blocks"> & { readonly block: PaceAssistantBlock; readonly index: number }) {
  switch (block.type) {
    case "text": return <TextBlock text={block.text} />;
    case "heading": {
      const Heading = block.level === 2 ? "h2" : block.level === 3 ? "h3" : "h4";
      return <Heading className="pt-1 text-[14px] font-semibold tracking-[-0.015em] text-[#263149]">{block.text}</Heading>;
    }
    case "list": return <ListBlock items={block.items} style={block.style} />;
    case "table": return <TableBlock block={block} locale={locale} />;
    case "metric": return <MetricBlock block={block} locale={locale} />;
    case "metric-grid": return <MetricGridBlock block={block} locale={locale} />;
    case "transaction-list": return <TransactionListBlock block={block} locale={locale} timeZone={timeZone} transferLabel={labels.transfer} />;
    case "expense-list":
    case "income-list": return <ExpenseListBlock block={block} locale={locale} timeZone={timeZone} />;
    case "recurring-list": return <RecurringListBlock block={block} locale={locale} timeZone={timeZone} />;
    case "bills-list": return <BillsListBlock block={block} locale={locale} timeZone={timeZone} />;
    case "budget-summary": return <BudgetSummaryBlock block={block} locale={locale} usedLabel={labels.used} />;
    case "goal-summary": return <GoalSummaryBlock block={block} locale={locale} targetLabel={labels.target} timeZone={timeZone} />;
    case "insight": return <InsightBlock block={block} />;
    case "comparison": return <ComparisonBlock block={block} locale={locale} previousLabel={labels.previous} />;
    case "notice": return <NoticeBlock block={block} />;
    case "action-proposal": return <ActionProposalBlock block={block} />;
    case "approval": return <ApprovalBlock block={block} labels={labels} />;
    case "action-result": return <ActionResultBlock block={block} />;
    default: {
      console.warn("Pace Assistant received an unsupported block.", block, index);
      return <NoticeBlock block={{ type: "notice", tone: "warning", message: labels.unknownResponse }} />;
    }
  }
}
