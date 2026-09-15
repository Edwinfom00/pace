import { FiRefreshCw } from "react-icons/fi";

import { formatAssistantDate, formatAssistantMoney } from "../../../domain/formatters";
import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, BlockTitle } from "./block-primitives";

type RecurringListData = Extract<PaceAssistantBlock, { type: "recurring-list" }>;

export function RecurringListBlock({ block, locale, timeZone }: { readonly block: RecurringListData; readonly locale: string; readonly timeZone: string }) {
  return (
    <AssistantBlock>
      {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
      <ul className="mt-2 divide-y divide-[#edf0f4]">{block.items.map((item) => <li className="flex items-center gap-2.5 px-3.5 py-2.5" key={item.id}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#f1f5ff] text-[#376fe6]"><FiRefreshCw aria-hidden className="size-3.5" /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[#263149]">{item.label}</p><p className="truncate text-[11px] text-[#7b859a]">{item.nextExpectedAt ? `${item.cadence} · ${formatAssistantDate(item.nextExpectedAt, locale, timeZone)}` : item.cadence}</p></div>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#17223b]">{formatAssistantMoney(item.amount, locale)}</span>
      </li>)}</ul>
    </AssistantBlock>
  );
}
