import Link from "next/link";
import { ArrowRight, History } from "lucide-react";

import type {
  TransactionCorrectionChange,
  TransactionDetailData,
} from "@/modules/transactions/domain/transaction-detail";

import type { TransactionDetailLabels } from "../transaction-detail-labels";
import {
  formatDetailDate,
  formatTransactionDetailAmount,
} from "./transaction-detail-formatters";

export function TransactionCorrectionSummary({
  labels,
  locale,
  timeZone,
  transaction,
  workspaceSlug,
}: {
  readonly labels: TransactionDetailLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly transaction: TransactionDetailData;
  readonly workspaceSlug: string;
}) {
  const correction = transaction.correction;
  if (!correction || correction.state === "TECHNICAL") return null;

  const amountChanged = correction.originalAmount.currency !== correction.currentAmount.currency
    || correction.originalAmount.minor !== correction.currentAmount.minor;
  const href = (transactionId: string) => `/w/${workspaceSlug}/transactions/${transactionId}`;
  const isCurrent = correction.state === "CURRENT";
  const historyDescription = correction.previousTransactionId
    ? labels.correction.correctedAgain
    : labels.correction.wasCorrected;

  return (
    <section aria-labelledby="transaction-correction-heading" className="rounded-[13px] border border-[#dfe7f2] bg-[#fcfdff] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8edf4] pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[#edf3ff] text-[#365fba]"><History aria-hidden className="size-4" /></span>
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-[#101a35]" id="transaction-correction-heading">{labels.correction.title}</h2>
            {isCurrent ? <p className="mt-0.5 text-[12px] text-[#53627b]">{labels.correction.currentVersion}</p> : null}
          </div>
        </div>
        {isCurrent ? <span className="inline-flex items-center rounded-full bg-[#edf3ff] px-2.5 py-1 text-[11px] font-medium text-[#365fba]">{labels.correction.badge}</span> : null}
      </div>

      {!isCurrent ? <p className="mt-3 text-[13px] leading-5 text-[#53627b]">{historyDescription}</p> : null}

      {amountChanged ? (
        <dl className="mt-3 grid gap-2.5 rounded-[10px] bg-[#f7f9fc] px-3.5 py-3 text-[13px] sm:grid-cols-2 sm:gap-x-6">
          <div>
            <dt className="text-[12px] text-[#71809a]">{labels.correction.originallyRecorded}</dt>
            <dd className="mt-1 font-medium tabular-nums text-[#34405d]">{formatTransactionDetailAmount(correction.originalAmount, transaction.kind, locale)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-[#71809a]">{labels.correction.correctedTo}</dt>
            <dd className="mt-1 font-semibold tabular-nums text-[#101a35]">{formatTransactionDetailAmount(correction.currentAmount, transaction.kind, locale)}</dd>
          </div>
        </dl>
      ) : null}

      {correction.changes.length ? <dl className="mt-3 divide-y divide-[#edf0f4]">{correction.changes.map((change) => (
        <CorrectionChangeRow change={change} key={change.field} labels={labels} locale={locale} timeZone={timeZone} transaction={transaction} />
      ))}</dl> : null}

      {correction.reason || correction.correctedAt ? (
        <dl className="mt-3 grid gap-2.5 text-[13px] sm:grid-cols-2 sm:gap-x-6">
          {correction.reason ? <div><dt className="text-[12px] text-[#71809a]">{labels.correction.reason}</dt><dd className="mt-1 font-medium text-[#34405d]">{correction.reason}</dd></div> : null}
          {correction.correctedAt ? <div><dt className="sr-only">{labels.correction.correctedAt(formatDetailDate(correction.correctedAt, locale, timeZone))}</dt><dd className="mt-1 text-[12px] text-[#71809a]"><time dateTime={correction.correctedAt}>{labels.correction.correctedAt(formatDetailDate(correction.correctedAt, locale, timeZone))}</time></dd></div> : null}
        </dl>
      ) : null}

      <nav aria-label={labels.correction.title} className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#e8edf4] pt-3">
        {isCurrent && transaction.id !== correction.originalTransactionId ? <CorrectionLink href={href(correction.originalTransactionId)} label={labels.correction.viewOriginal} /> : null}
        {!isCurrent && correction.previousTransactionId ? <CorrectionLink href={href(correction.previousTransactionId)} label={labels.correction.viewPrevious} /> : null}
        {!isCurrent && transaction.id !== correction.currentTransactionId ? <CorrectionLink href={href(correction.currentTransactionId)} label={labels.correction.viewCurrent} /> : null}
      </nav>
    </section>
  );
}

function CorrectionChangeRow({
  change,
  labels,
  locale,
  timeZone,
  transaction,
}: {
  readonly change: TransactionCorrectionChange;
  readonly labels: TransactionDetailLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly transaction: TransactionDetailData;
}) {
  const before = correctionValue(change, "before", locale, timeZone, transaction);
  const after = correctionValue(change, "after", locale, timeZone, transaction);
  const label = labels.correction.changes[change.field];

  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[minmax(8.5rem,13rem)_minmax(0,1fr)] sm:gap-3">
      <dt className="text-[12px] text-[#71809a]">{label}</dt>
      <dd aria-label={labels.correction.changeDescription(label, before, after)} className="flex min-w-0 items-center gap-2 font-medium text-[#34405d]">
        <span className="min-w-0 truncate text-[#637491]">{before}</span><ArrowRight aria-hidden className="size-3.5 shrink-0 text-[#8795aa]" /><span className="min-w-0 truncate font-semibold text-[#101a35]">{after}</span>
      </dd>
    </div>
  );
}

function correctionValue(
  change: TransactionCorrectionChange,
  side: "before" | "after",
  locale: string,
  timeZone: string,
  transaction: TransactionDetailData,
): string {
  if (change.field === "AMOUNT") return formatTransactionDetailAmount(change[side], transaction.kind, locale);
  const value = change[side];
  if (change.field === "DATE") return value ? formatDetailDate(value, locale, timeZone) : "—";
  return value || "—";
}

function CorrectionLink({ href, label }: { readonly href: string; readonly label: string }) {
  return <Link className="inline-flex items-center gap-1 text-[13px] font-medium text-[#245ec4] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]" href={href}>{label}<ArrowRight aria-hidden className="size-3.5" /></Link>;
}
