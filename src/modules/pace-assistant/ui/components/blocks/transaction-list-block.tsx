import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";

import { formatAssistantDate, formatAssistantMoney } from "../../../domain/formatters";
import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, BlockTitle, semanticAmountClass } from "./block-primitives";

type TransactionListData = Extract<PaceAssistantBlock, { type: "transaction-list" }>;

export function TransactionListBlock({ block, locale, timeZone, transferLabel }: { readonly block: TransactionListData; readonly locale: string; readonly timeZone: string; readonly transferLabel: string }) {
  return (
    <AssistantBlock>
      {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
      <ul className="mt-2 divide-y divide-[#edf0f4]">{block.transactions.map((transaction) => {
        const sign = transaction.kind === "EXPENSE" || transaction.kind === "TRANSFER" ? "-" : transaction.kind === "INCOME" || transaction.kind === "REFUND" ? "+" : "";
        const meta = [transaction.kind === "TRANSFER" ? transferLabel : transaction.categoryName, formatAssistantDate(transaction.occurredAt, locale, timeZone)].filter(Boolean).join(" · ");
        return <li className="flex items-center gap-2.5 px-3.5 py-2.5" key={transaction.id}>
          <TransactionIcon categoryKey={transaction.categoryKey} iconKey={transaction.iconKey} merchantLogoKey={transaction.merchantLogoKey} merchantName={transaction.merchantName} size="sm" transactionKind={transaction.kind} />
          <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[#263149]">{transaction.merchantName}</p><p className="truncate text-[11px] text-[#7b859a]">{meta}</p></div>
          <span className={`shrink-0 text-[12px] font-semibold tabular-nums ${semanticAmountClass(transaction.kind)}`}>{sign}{formatAssistantMoney(transaction.amount, locale)}</span>
        </li>;
      })}</ul>
    </AssistantBlock>
  );
}
