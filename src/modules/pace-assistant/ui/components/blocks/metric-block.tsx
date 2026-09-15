import { FiArrowDownRight, FiArrowUpRight, FiMinus } from "react-icons/fi";

import { formatAssistantMoney } from "../../../domain/formatters";
import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock } from "./block-primitives";

type MetricBlockData = Extract<PaceAssistantBlock, { type: "metric" }>;

export function MetricBlock({ block, locale }: { readonly block: MetricBlockData; readonly locale: string }) {
  const trend = block.trend;
  const Icon = trend?.direction === "up" ? FiArrowUpRight : trend?.direction === "down" ? FiArrowDownRight : FiMinus;
  const trendClass = trend?.sentiment === "positive" ? "text-[#168455]" : trend?.sentiment === "negative" ? "text-[#b54708]" : "text-[#71809a]";
  return (
    <AssistantBlock className="p-3.5">
      <p className="text-xs font-medium text-[#71809a]">{block.label}</p>
      <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-[#17223b] tabular-nums">{formatAssistantMoney(block.value, locale)}</p>
      {block.description || trend?.label ? <p className={`mt-1.5 flex items-center gap-1 text-xs ${trend ? trendClass : "text-[#7a849a]"}`}>{trend ? <Icon aria-hidden className="size-3.5" /> : null}{trend?.label ?? block.description}</p> : null}
    </AssistantBlock>
  );
}
