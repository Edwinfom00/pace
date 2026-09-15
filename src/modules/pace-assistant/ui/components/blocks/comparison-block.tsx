import { FiArrowDownRight, FiArrowUpRight, FiMinus } from "react-icons/fi";

import { formatAssistantMoney } from "../../../domain/formatters";
import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, BlockTitle } from "./block-primitives";

type ComparisonData = Extract<PaceAssistantBlock, { type: "comparison" }>;

export function ComparisonBlock({ block, locale, previousLabel }: { readonly block: ComparisonData; readonly locale: string; readonly previousLabel: string }) {
  return <AssistantBlock><BlockTitle>{block.title}</BlockTitle><div className="mt-2 divide-y divide-[#edf0f4]">{block.metrics.map((metric) => {
    const Icon = metric.percentageChange === null || metric.percentageChange === undefined || metric.percentageChange === 0 ? FiMinus : metric.percentageChange > 0 ? FiArrowUpRight : FiArrowDownRight;
    const style = metric.sentiment === "positive" ? "text-[#168455]" : metric.sentiment === "negative" ? "text-[#b54708]" : "text-[#71809a]";
    return <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3.5 py-2.5" key={metric.label}><div className="min-w-0"><p className="truncate text-[12px] font-medium text-[#34405a]">{metric.label}</p><p className="mt-0.5 text-[11px] text-[#7b859a]">{previousLabel}: {formatAssistantMoney(metric.previous, locale)}</p></div><div className="text-right"><p className="text-[12px] font-semibold tabular-nums text-[#263149]">{formatAssistantMoney(metric.current, locale)}</p>{metric.percentageChange !== null && metric.percentageChange !== undefined ? <p className={`mt-0.5 flex items-center justify-end gap-0.5 text-[11px] font-medium ${style}`}><Icon aria-hidden className="size-3" />{Math.abs(metric.percentageChange)}%</p> : null}</div></div>;
  })}</div></AssistantBlock>;
}
