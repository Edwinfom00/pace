import Link from "next/link";
import { ArrowLeft, ArrowRight, History } from "lucide-react";

import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import type { TransactionDetailLabels } from "../transaction-detail-labels";

export function TransactionCorrectionTechnicalEntry({
  labels,
  transaction,
  workspaceSlug,
}: {
  readonly labels: TransactionDetailLabels;
  readonly transaction: TransactionDetailData;
  readonly workspaceSlug: string;
}) {
  const correction = transaction.correction;
  if (!correction || correction.state !== "TECHNICAL") return null;
  const transactionsHref = `/w/${workspaceSlug}/transactions`;
  const currentHref = `/w/${workspaceSlug}/transactions/${correction.currentTransactionId}`;

  return (
    <main className="mx-auto w-full max-w-180 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#637491] transition-colors hover:text-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563eb]" href={transactionsHref}><ArrowLeft aria-hidden className="size-4" />{labels.back}</Link>
      <section aria-labelledby="technical-correction-heading" className="mt-6 rounded-[13px] border border-[#dfe7f2] bg-white p-5 sm:p-6">
        <span className="flex size-9 items-center justify-center rounded-[10px] bg-[#f1f4f8] text-[#53627b]"><History aria-hidden className="size-4" /></span>
        <h1 className="mt-4 text-[23px] font-semibold tracking-[-0.03em] text-[#101a35]" id="technical-correction-heading">{labels.correction.technicalTitle}</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#53627b]">{labels.correction.technicalDescription}</p>
        <Link className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#245ec4] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]" href={currentHref}>{labels.correction.technicalCurrent}<ArrowRight aria-hidden className="size-4" /></Link>
      </section>
    </main>
  );
}
