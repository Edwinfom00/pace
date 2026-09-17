"use client";

import { BarChart3, Sparkles, Target } from "lucide-react";

import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import { PaceAssistantLauncher } from "@/modules/pace-assistant/ui/views/pace-assistant-launcher";

export function TransactionDetailAskPace({
  transaction,
  workspaceId,
  language,
  locale,
  timeZone,
}: {
  readonly transaction: TransactionDetailData;
  readonly workspaceId: string;
  readonly language: string;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const subject = transaction.merchant?.name ?? transaction.category?.name ?? "this transaction";
  const spendingPrompt = transaction.merchant
    ? `Show spending at ${transaction.merchant.name}`
    : `Help me understand ${subject}`;
  const categoryPrompt = transaction.category
    ? `Help me review ${transaction.category.name} spending this month`
    : "Help me understand this transfer";

  return (
    <PaceAssistantLauncher
      language={language}
      locale={locale}
      pageContext={{ page: "transactions", selectedTransactionId: transaction.id }}
      timeZone={timeZone}
      workspaceId={workspaceId}
    >
      {({ openPaceAssistant }) => (
        <section aria-labelledby="transaction-ask-pace-heading" className="rounded-[13px] border border-[#d9e7ff] bg-[#f7faff] p-4 sm:p-4.5">
          <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-[#17336c]" id="transaction-ask-pace-heading"><Sparkles aria-hidden className="size-4 text-[#2563eb]" />Ask Pace</h2><span className="rounded-full bg-[#e2edff] px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-[#2563eb]">BETA</span></div>
          <p className="mt-3 rounded-[9px] bg-white/75 px-3 py-2.5 text-[12px] leading-5 text-[#53627b]">Ask Pace for context on {subject} without leaving this transaction.</p>
          <div className="mt-3 space-y-2">
            <button className="flex w-full items-center gap-2 rounded-[8px] border border-[#dfe8f6] bg-white px-3 py-2.5 text-left text-[12px] font-medium text-[#40516d] transition-colors hover:border-[#b8d1ff] hover:bg-[#fbfdff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]" onClick={() => openPaceAssistant(spendingPrompt)} type="button"><BarChart3 aria-hidden className="size-4 shrink-0 text-[#2563eb]" />{spendingPrompt}</button>
            <button className="flex w-full items-center gap-2 rounded-[8px] border border-[#dfe8f6] bg-white px-3 py-2.5 text-left text-[12px] font-medium text-[#40516d] transition-colors hover:border-[#b8d1ff] hover:bg-[#fbfdff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]" onClick={() => openPaceAssistant(categoryPrompt)} type="button"><Target aria-hidden className="size-4 shrink-0 text-[#2563eb]" />{categoryPrompt}</button>
          </div>
        </section>
      )}
    </PaceAssistantLauncher>
  );
}
