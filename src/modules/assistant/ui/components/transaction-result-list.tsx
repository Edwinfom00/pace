import Link from "next/link";
import { HiOutlineArrowRight } from "react-icons/hi2";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import { cn } from "@/lib/utils";
import { formatAssistantDate, formatAssistantMoney } from "@/modules/pace-assistant/domain/formatters";
import type { PaceAssistantBlock } from "@/modules/pace-assistant/types/pace-assistant";

import type { AssistantMessages } from "../assistant-messages";

type TransactionListBlock = Extract<PaceAssistantBlock, { type: "transaction-list" }>;
type Transaction = TransactionListBlock["transactions"][number];

export function TransactionResultList({
  block,
  locale,
  timeZone,
  workspaceSlug,
  messages,
}: {
  readonly block: TransactionListBlock;
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceSlug: string;
  readonly messages: AssistantMessages;
}) {
  const base = `/w/${workspaceSlug}/transactions`;

  return (
    <section className="overflow-hidden rounded-[12px] border border-[#e5e9f0] bg-white">
      {block.title ? (
        <h3 className="border-b border-[#edf0f4] px-4 py-3 text-[13px] font-semibold text-[#18233d]">{block.title}</h3>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_auto]" role="table">
        <div className="col-span-full hidden grid-cols-subgrid border-b border-[#edf0f4] bg-[#fbfcfe] px-4 py-2 text-[11px] font-medium text-[#7b859a] sm:grid" role="row">
          <span role="columnheader">{messages["transactions.column.transaction"]}</span>
          <span role="columnheader">{messages["transactions.column.category"]}</span>
          <span role="columnheader">{messages["transactions.column.date"]}</span>
          <span className="text-right" role="columnheader">{messages["transactions.column.amount"]}</span>
        </div>
        {block.transactions.map((transaction) => {
          const category = categoryLabel(transaction, messages);
          const date = formatAssistantDate(transaction.occurredAt, locale, timeZone);
          return (
            <div
              className="col-span-full grid grid-cols-subgrid items-center border-b border-[#edf0f4] px-4 py-2.5 last:border-b-0"
              key={transaction.id}
              role="row"
            >
              <div className="flex min-w-0 items-center gap-2.5" role="cell">
                <TransactionIcon
                  categoryKey={transaction.categoryKey}
                  iconKey={transaction.iconKey}
                  merchantLogoKey={transaction.merchantLogoKey}
                  merchantName={transaction.merchantName}
                  size="sm"
                  transactionKind={transaction.kind}
                />
                <div className="min-w-0">
                  <Link
                    className="block truncate rounded-[4px] text-[13px] font-medium text-[#1c2740] hover:text-[#2457c5] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed]"
                    href={`${base}/${encodeURIComponent(transaction.id)}`}
                  >
                    {transaction.merchantName}
                  </Link>
                  <p className="truncate text-[11px] text-[#7b859a] sm:hidden">
                    {category} · {date}
                  </p>
                  {transaction.status === "PENDING" ? (
                    <p className="text-[11px] font-medium text-[#9a640d]">{messages["transactions.pending"]}</p>
                  ) : null}
                </div>
              </div>
              <span className="hidden truncate text-[12px] text-[#536079] sm:block" role="cell">{category}</span>
              <span className="hidden text-[12px] whitespace-nowrap text-[#536079] sm:block" role="cell">{date}</span>
              <span
                className={cn("text-right text-[13px] font-semibold whitespace-nowrap tabular-nums", amountTone(transaction.kind))}
                role="cell"
              >
                {amountSign(transaction.kind)}
                {formatAssistantMoney(transaction.amount, locale)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="border-t border-[#edf0f4] px-4 py-2.5">
        <Link
          className="inline-flex items-center gap-1 rounded-[4px] text-[12px] font-semibold text-[#2457c5] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed]"
          href={base}
        >
          {messages["transactions.viewAll"]}
          <HiOutlineArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}

function categoryLabel(transaction: Transaction, messages: AssistantMessages): string {
  if (transaction.kind === "TRANSFER") return messages["transactions.transfer"];
  return transaction.categoryName ?? messages["transactions.uncategorized"];
}

function amountSign(kind: Transaction["kind"]): string {
  if (kind === "INCOME" || kind === "REFUND") return "+";
  return kind === "EXPENSE" ? "−" : "";
}

function amountTone(kind: Transaction["kind"]): string {
  if (kind === "INCOME" || kind === "REFUND") return "text-[#157a50]";
  return kind === "TRANSFER" ? "text-[#536079]" : "text-[#17223b]";
}
