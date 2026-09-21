"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ChevronDown, MoreHorizontal, RefreshCw, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import type { TransactionReversalLabels } from "../transaction-reversal-labels";
import {
  createTransactionReversalCommand,
  mapTransactionReversalFailure,
  reversalErrorCode,
  reversalResponseId,
  type TransactionReversalDraft,
  type TransactionReversalFormError,
} from "./transaction-reversal-flow";

type ReversalDialogView = "form" | "review";

/**
 * A responsive product dialog for the destructive manual-reversal action.
 * Its request is only a UI adapter for the canonical F.1 HTTP boundary.
 */
export function TransactionReversalDialog({
  labels,
  locale,
  transaction,
  workspaceId,
}: {
  readonly labels: TransactionReversalLabels;
  readonly locale: string;
  readonly transaction: TransactionDetailData;
  readonly workspaceId: string;
}) {
  const router = useReversalRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const reviewBackRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ReversalDialogView>("form");
  const [draft, setDraft] = useState<TransactionReversalDraft>({ reason: "" });
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<TransactionReversalFormError>(null);

  useEffect(() => {
    if (!open) return;
    const target = view === "review" ? reviewBackRef.current : reasonRef.current;
    const frame = window.requestAnimationFrame(() => target?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, view]);

  if (!transaction.capabilities.canReverse || transaction.kind === "REFUND") return null;

  function reset() {
    setView("form");
    setDraft({ reason: "" });
    setIdempotencyKey(null);
    setFormError(null);
  }

  function openDialog() {
    if (!transaction.capabilities.canReverse) return;
    reset();
    setOpen(true);
  }

  function closeDialog() {
    if (isSubmitting) return;
    setOpen(false);
    reset();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function updateReason(reason: string) {
    if (isSubmitting) return;
    setDraft({ reason });
    setFormError(null);
    // A changed reversal intent must never reuse a key from a previous intent.
    setIdempotencyKey(null);
  }

  function reviewReversal() {
    if (isSubmitting) return;
    setFormError(null);
    setView("review");
  }

  async function confirmReversal() {
    if (isSubmitting) return;
    const key = idempotencyKey ?? window.crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(key);
    const command = createTransactionReversalCommand(workspaceId, transaction, draft, key);
    if (!command) {
      setFormError("notAllowed");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/ledger/transactions/${encodeURIComponent(transaction.id)}/reverse`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !reversalResponseId(payload)) {
        setFormError(mapTransactionReversalFailure(reversalErrorCode(payload)));
        return;
      }

      setOpen(false);
      reset();
      // The current detail, its activity, capabilities, account context, and
      // server-derived reports are all read again from authoritative state.
      router.refresh();
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    } catch {
      // Retain the idempotency key after an uncertain response. A retry can
      // safely reconcile a reversal that committed after the connection broke.
      setFormError("failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  function reloadLatest() {
    if (isSubmitting) return;
    setOpen(false);
    reset();
    router.refresh();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  const amount = formatOverviewMoney(transaction.amount.minor, transaction.amount.currency, locale);
  const title = transaction.kind === "TRANSFER"
    ? labels.kind.TRANSFER
    : transaction.merchant?.name ?? reversalKind(transaction.kind, labels);
  const statusMessage = reversalFormError(formError, labels);
  const isConflict = formError === "conflict" || formError === "notAllowed" || formError === "hasActiveRefunds";

  return (
    <ResponsiveDialog onOpenChange={(nextOpen) => nextOpen ? openDialog() : closeDialog()} open={open}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[#dfe5ee] bg-white text-[13px] font-medium text-[#43516a] hover:bg-[#f7f9fc] focus-visible:ring-[#5e8fe8]/35"
            ref={triggerRef}
            type="button"
            variant="ghost"
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
            {labels.moreActions}
            <ChevronDown aria-hidden="true" className="ml-auto size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 rounded-[10px] border border-[#e7ebf1] bg-white p-1 shadow-[0_10px_25px_rgb(16_24_40/10%)]">
          <DropdownMenuItem
            className="gap-2 rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]"
            onSelect={openDialog}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            {labels.title}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResponsiveDialogContent
        className="flex! max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] max-w-162.5 flex-col gap-0 overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-162.5"
        drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0 border-[#e1e7f0] shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)] data-[vaul-drawer-direction=bottom]:rounded-t-[14px]"
      >
        <Button
          aria-label={labels.cancel}
          className="absolute top-3 right-3 z-10 size-8 rounded-[7px] text-[#61708a] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30 sm:top-4 sm:right-4"
          disabled={isSubmitting}
          onClick={closeDialog}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
        <ResponsiveDialogHeader className="gap-1 border-b border-[#e8edf4] px-5 pt-5 pb-4 pr-12 sm:px-7 sm:pt-6 sm:pr-14">
          {view === "review" ? (
            <button
              className="-ml-1.5 mb-1 flex w-fit items-center gap-1 rounded-[6px] px-1.5 py-1 text-[12px] font-semibold text-[#2f67e9] outline-none hover:bg-[#edf3ff] focus-visible:bg-[#edf3ff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/30"
              disabled={isSubmitting}
              onClick={() => setView("form")}
              ref={reviewBackRef}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              {labels.back}
            </button>
          ) : null}
          <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]">
            {view === "review" ? labels.reviewTitle : labels.title}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">
            {labels.description}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {view === "form" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
              <div className="grid gap-5">
                <ReversalContext amount={amount} labels={labels} title={title} transaction={transaction} />
                <ReasonField disabled={isSubmitting} labels={labels} onValueChange={updateReason} reasonRef={reasonRef} value={draft.reason} />
                {statusMessage ? <ReversalStatusMessage labels={labels} message={statusMessage} onReload={reloadLatest} reloadable={isConflict} /> : null}
              </div>
            </div>
            <ReversalFooter
              cancelLabel={labels.cancel}
              disabled={isSubmitting || isConflict}
              onCancel={closeDialog}
              onPrimaryAction={reviewReversal}
              primaryActionLabel={labels.review}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
              <div className="grid gap-5">
                {transaction.kind === "TRANSFER" ? (
                  <TransferReview amount={amount} labels={labels} transaction={transaction} />
                ) : (
                  <FinancialReview amount={amount} labels={labels} title={title} transaction={transaction} />
                )}
                {draft.reason ? <ReviewRow label={labels.reason} value={draft.reason} /> : null}
                <p className="rounded-[8px] bg-[#f7f9fc] px-3.5 py-3 text-[12px] leading-5 text-[#53627b]">{labels.originalPreserved}</p>
                {statusMessage ? <ReversalStatusMessage labels={labels} message={statusMessage} onReload={reloadLatest} reloadable={isConflict} /> : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e8edf4] bg-[#fcfdff] px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-7">
              <Button className="h-10 rounded-[8px] px-4 text-[13px] font-medium text-[#43516a]" disabled={isSubmitting} onClick={() => setView("form")} type="button" variant="ghost">{labels.back}</Button>
              {isConflict ? <Button className="h-10 rounded-[8px] border border-[#dfe5ee] bg-white px-4 text-[13px] font-medium text-[#43516a]" disabled={isSubmitting} onClick={reloadLatest} type="button" variant="ghost"><RefreshCw aria-hidden="true" className="size-3.5" />{labels.reloadLatest}</Button> : null}
              <Button aria-describedby="transaction-reversal-status" className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={isSubmitting || isConflict} onClick={confirmReversal} type="button">{isSubmitting ? labels.reversing : labels.confirm}</Button>
            </div>
          </div>
        )}
        <p aria-live="polite" className="sr-only" id="transaction-reversal-status">{isSubmitting ? labels.reversing : statusMessage ?? ""}</p>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function ReversalContext({
  amount,
  labels,
  title,
  transaction,
}: {
  readonly amount: string;
  readonly labels: TransactionReversalLabels;
  readonly title: string;
  readonly transaction: TransactionDetailData;
}) {
  if (transaction.kind === "TRANSFER") {
    return (
      <section aria-label={title} className="rounded-[10px] bg-[#f7f9fc] px-3.5 py-3">
        <p className="font-semibold text-[#172d56]">{title}</p>
        <p className="mt-1 text-[13px] text-[#53627b]">{transaction.account?.name ?? labels.from} <span aria-hidden="true">→</span> {amount} <span aria-hidden="true">→</span> {transaction.transferAccount?.name ?? labels.to}</p>
      </section>
    );
  }
  return (
    <section aria-label={title} className="rounded-[10px] bg-[#f7f9fc] px-3.5 py-3">
      <p className="font-semibold text-[#172d56]">{title}</p>
      <p className="mt-1 text-[13px] text-[#53627b]">{formatReversalTemplate(labels.typeAndAmount, { type: reversalKind(transaction.kind, labels), amount })}</p>
      {transaction.account ? <p className="mt-1 text-[13px] text-[#53627b]">{transaction.account.name}</p> : null}
    </section>
  );
}

function ReasonField({
  disabled,
  labels,
  onValueChange,
  reasonRef,
  value,
}: {
  readonly disabled: boolean;
  readonly labels: TransactionReversalLabels;
  readonly onValueChange: (value: string) => void;
  readonly reasonRef: RefObject<HTMLSelectElement | null>;
  readonly value: string;
}) {
  return (
    <div className="grid gap-2">
      <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#384862]" htmlFor="transaction-reversal-reason"><span>{labels.reason}</span><span className="text-[12px] font-normal text-[#71809a]">{labels.optional}</span></label>
      <select className="h-11 rounded-[8px] border border-[#d9e1ec] bg-white px-3 text-[13px] text-[#13213f] outline-none transition-[border-color,box-shadow] hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15" disabled={disabled} id="transaction-reversal-reason" onChange={(event) => onValueChange(event.target.value)} ref={reasonRef} value={value}>
        <option value="">{labels.optional}</option>
        <option value={labels.duplicateTransaction}>{labels.duplicateTransaction}</option>
        <option value={labels.enteredByMistake}>{labels.enteredByMistake}</option>
        <option value={labels.transactionCancelled}>{labels.transactionCancelled}</option>
        <option value={labels.wrongTransaction}>{labels.wrongTransaction}</option>
        <option value={labels.other}>{labels.other}</option>
      </select>
    </div>
  );
}

function FinancialReview({
  amount,
  labels,
  title,
  transaction,
}: {
  readonly amount: string;
  readonly labels: TransactionReversalLabels;
  readonly title: string;
  readonly transaction: TransactionDetailData;
}) {
  const currentEffect = transaction.kind === "EXPENSE" ? `−${amount}` : `+${amount}`;
  return (
    <section aria-label={labels.reviewComparison} className="overflow-hidden rounded-[10px] border border-[#e1e7f0] bg-white">
      <div className="border-b border-[#e8edf4] px-3.5 py-3"><p className="font-semibold text-[#172d56]">{title}</p><p className="mt-0.5 text-[13px] text-[#53627b]">{amount}</p></div>
      <ReviewRow label={labels.currentEffect} value={currentEffect} />
      <ReviewRow label={labels.afterReversal} value="0" />
    </section>
  );
}

function TransferReview({
  amount,
  labels,
  transaction,
}: {
  readonly amount: string;
  readonly labels: TransactionReversalLabels;
  readonly transaction: TransactionDetailData;
}) {
  const from = transaction.account?.name ?? labels.from;
  const to = transaction.transferAccount?.name ?? labels.to;
  return (
    <section aria-label={labels.reviewComparison} className="overflow-hidden rounded-[10px] border border-[#e1e7f0] bg-white">
      <div className="border-b border-[#e8edf4] px-3.5 py-3"><p className="font-semibold text-[#172d56]">{labels.currentTransfer}</p><p className="mt-1 text-[13px] text-[#53627b]">{from} <span aria-hidden="true">→</span> {amount} <span aria-hidden="true">→</span> {to}</p></div>
      <ReviewRow label={labels.afterReversal} value={`${formatReversalTemplate(labels.restored, { account: from })} · ${formatReversalTemplate(labels.restored, { account: to })}`} />
      <ReviewRow label={labels.financialEffect} value="0" />
    </section>
  );
}

function ReviewRow({ label, value }: { readonly label: string; readonly value: string }) {
  return <dl className="grid gap-1 border-t border-[#e8edf4] px-3.5 py-3 first:border-t-0 sm:grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] sm:gap-4"><dt className="text-[12px] text-[#71809a]">{label}</dt><dd className="min-w-0 wrap-break-word text-[13px] font-medium text-[#34405d]">{value}</dd></dl>;
}

function ReversalFooter({
  cancelLabel,
  disabled,
  onCancel,
  onPrimaryAction,
  primaryActionLabel,
}: {
  readonly cancelLabel: string;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onPrimaryAction: () => void;
  readonly primaryActionLabel: string;
}) {
  return (
    <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e8edf4] bg-[#fcfdff] px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-7">
      <Button className="h-10 rounded-[8px] px-4 text-[13px] font-medium text-[#43516a]" disabled={disabled} onClick={onCancel} type="button" variant="ghost">{cancelLabel}</Button>
      <Button className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} onClick={onPrimaryAction} type="button">{primaryActionLabel}</Button>
    </div>
  );
}

function reversalFormError(error: TransactionReversalFormError, labels: TransactionReversalLabels): string | null {
  switch (error) {
    case "conflict": return labels.conflict;
    case "notAllowed": return labels.notAllowed;
    case "hasActiveRefunds": return labels.hasActiveRefunds;
    case "failed": return labels.failed;
    default: return null;
  }
}

function ReversalStatusMessage({
  labels,
  message,
  onReload,
  reloadable,
}: {
  readonly labels: TransactionReversalLabels;
  readonly message: string;
  readonly onReload: () => void;
  readonly reloadable: boolean;
}) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-[#fff6ed] px-3.5 py-3 text-[12px] leading-5 text-[#8a4d18]" role="alert"><span>{message}</span>{reloadable ? <button className="font-semibold text-[#8a4d18] underline underline-offset-3 outline-none focus-visible:ring-2 focus-visible:ring-[#d98c3c]/40" onClick={onReload} type="button">{labels.reloadLatest}</button> : null}</div>;
}

function useReversalRouter() {
  try {
    return useRouter();
  } catch {
    // Static component tests do not mount Next's App Router. Production
    // always has it, while this fallback preserves a safe explicit refresh.
    return { refresh: () => window.location.reload() };
  }
}

function reversalKind(
  kind: TransactionDetailData["kind"],
  labels: TransactionReversalLabels,
): string {
  return kind === "REFUND" || kind === "OPENING_BALANCE" ? labels.kind.EXPENSE : labels.kind[kind];
}

function formatReversalTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template,
  );
}
