import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";

import { formatAssistantDate, formatAssistantMoney } from "../../../domain/formatters";
import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, BlockTitle } from "./block-primitives";

type ExpenseListData = Extract<PaceAssistantBlock, { type: "expense-list" | "income-list" }>;

export function ExpenseListBlock({ block, locale, timeZone }: { readonly block: ExpenseListData; readonly locale: string; readonly timeZone: string }) {
  const income = block.type === "income-list";
  return (
    <AssistantBlock>
      {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
      <ul className="mt-2 divide-y divide-[#edf0f4]">{block.items.map((item, index) => <li className="flex items-center gap-2.5 px-3.5 py-2.5" key={item.transactionId ?? `${item.label}-${index}`}>
        <TransactionIcon categoryKey={item.categoryKey} iconKey={item.iconKey} merchantName={item.label} size="sm" transactionKind={income ? "INCOME" : "EXPENSE"} />
        <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[#263149]">{item.label}</p><p className="truncate text-[11px] text-[#7b859a]">{[item.categoryName, item.occurredAt ? formatAssistantDate(item.occurredAt, locale, timeZone) : null].filter(Boolean).join(" · ")}</p></div>
        <span className={`shrink-0 text-[12px] font-semibold tabular-nums ${income ? "text-[#168455]" : "text-[#17223b]"}`}>{income ? "+" : "-"}{formatAssistantMoney(item.amount, locale)}</span>
      </li>)}</ul>
    </AssistantBlock>
  );
}
