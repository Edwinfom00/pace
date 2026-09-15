import { formatAssistantMoney, formatBps } from "../../../domain/formatters";
import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, BlockTitle, ProgressLine } from "./block-primitives";

type BudgetSummaryData = Extract<PaceAssistantBlock, { type: "budget-summary" }>;

export function BudgetSummaryBlock({ block, locale, usedLabel }: { readonly block: BudgetSummaryData; readonly locale: string; readonly usedLabel: string }) {
  return (
    <AssistantBlock className="p-3.5">
      {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
      <ul className={block.title ? "mt-3 space-y-3" : "space-y-3"}>{block.items.map((item) => {
        const percentage = Number(BigInt(item.percentageUsedBps) / 100n);
        return <li key={item.id}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-[13px] font-medium text-[#263149]">{item.label}</span><span className={item.overBudget ? "shrink-0 text-[11px] font-semibold text-[#b54708]" : "shrink-0 text-[11px] font-medium text-[#66738b]"}>{formatBps(item.percentageUsedBps)} {usedLabel}</span></div><p className="mb-2 text-[11px] text-[#7b859a] tabular-nums">{formatAssistantMoney(item.spent, locale)} / {formatAssistantMoney(item.limit, locale)}</p><ProgressLine tone={item.overBudget ? "amber" : "blue"} value={percentage} /></li>;
      })}</ul>
    </AssistantBlock>
  );
}
