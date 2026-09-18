import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import type { TransactionDetailData } from "../../domain/transaction-detail";
import { TransactionDetailActions } from "../components/transaction-detail-actions";
import { TransactionDetailActivity } from "../components/transaction-detail-activity";
import { TransactionDetailAskPace } from "../components/transaction-detail-ask-pace";
import { TransactionDetailCard } from "../components/transaction-detail-card";
import { TransactionFinancialContext } from "../components/transaction-financial-context";
import { TransactionDetailHero } from "../components/transaction-detail-hero";
import { TransactionSourceInformation } from "../components/transaction-source-information";
import { TransactionTechnicalDetails } from "../components/transaction-technical-details";

export function TransactionDetailView({
  transaction,
  workspaceSlug,
  workspaceId,
  language,
  locale,
  timeZone,
}: {
  readonly transaction: TransactionDetailData;
  readonly workspaceSlug: string;
  readonly workspaceId: string;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
}) {
  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#637491] transition-colors hover:text-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563eb]" href={`/w/${workspaceSlug}/transactions`}><ArrowLeft aria-hidden className="size-4" />Transactions</Link>
      <div className="mt-6"><TransactionDetailHero locale={locale} timeZone={timeZone} transaction={transaction} /></div>
      <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(290px,320px)] xl:gap-7">
        <div className="min-w-0 space-y-4">
          <TransactionDetailCard locale={locale} timeZone={timeZone} transaction={transaction} />
          <TransactionFinancialContext locale={locale} transaction={transaction} />
          <TransactionSourceInformation transaction={transaction} />
          <TransactionTechnicalDetails locale={locale} timeZone={timeZone} transaction={transaction} />
        </div>
        <aside aria-label="Transaction side rail" className="space-y-4 xl:sticky xl:top-6">
          <TransactionDetailActions />
          <TransactionDetailActivity locale={locale} timeZone={timeZone} transaction={transaction} />
          <TransactionDetailAskPace language={language} locale={locale} timeZone={timeZone} transaction={transaction} workspaceId={workspaceId} />
        </aside>
      </div>
    </main>
  );
}
