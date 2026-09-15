import { FiCalendar } from "react-icons/fi";

import { formatAssistantDate, formatAssistantMoney } from "../../../domain/formatters";
import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, BlockTitle } from "./block-primitives";

type BillsListData = Extract<PaceAssistantBlock, { type: "bills-list" }>;

export function BillsListBlock({ block, locale, timeZone }: { readonly block: BillsListData; readonly locale: string; readonly timeZone: string }) {
  return (
    <AssistantBlock>
      {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
      <ul className="mt-2 divide-y divide-[#edf0f4]">{block.bills.map((bill) => <li className="flex items-center gap-2.5 px-3.5 py-2.5" key={bill.id}>
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-[9px] ${bill.status === "overdue" ? "bg-[#fff1ef] text-[#ba4a35]" : bill.status === "due" ? "bg-[#fff7e9] text-[#b56b12]" : "bg-[#f2f4f8] text-[#65718a]"}`}><FiCalendar aria-hidden className="size-3.5" /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[#263149]">{bill.label}</p><p className="truncate text-[11px] text-[#7b859a]">{formatAssistantDate(bill.dueAt, locale, timeZone)}</p></div>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#17223b]">{formatAssistantMoney(bill.amount, locale)}</span>
      </li>)}</ul>
    </AssistantBlock>
  );
}
