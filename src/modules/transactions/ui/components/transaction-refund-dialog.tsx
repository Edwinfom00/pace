"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, RefreshCw, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { toCurrencyCode } from "@/money/currency";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { TransactionAccountOption, TransactionAccountOptionsState } from "@/modules/transactions/domain/transaction-account-options";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import type { TransactionRefundLabels } from "../transaction-refund-labels";
import { TransactionAccountField } from "./transaction-account-field";
import { TransactionAmountField } from "./transaction-amount-field";
import { TransactionNoteField } from "./transaction-note-field";
import {
  createTransactionRefundCommand,
  createTransactionRefundDraft,
  mapTransactionRefundFailure,
  refundErrorCode,
  refundPreview,
  refundResponseId,
  validateTransactionRefundDraft,
  type TransactionRefundDraft,
  type TransactionRefundFieldErrors,
  type TransactionRefundFormError,
} from "./transaction-refund-flow";

type RefundDialogView = "form" | "review";

export function TransactionRefundDialog({
  accountOptions,
  language,
  labels,
  locale,
  transaction,
  workspaceId,
}: {
  readonly accountOptions: TransactionAccountOptionsState;
  readonly language: OnboardingLanguage;
  readonly labels: TransactionRefundLabels;
  readonly locale: string;
  readonly transaction: TransactionDetailData;
  readonly workspaceId: string;
}) {
  const router = useRefundRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const reviewBackRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<RefundDialogView>("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState<TransactionRefundDraft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TransactionRefundFieldErrors>({});
  const [formError, setFormError] = useState<TransactionRefundFormError>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const summary = transaction.refund;
  const accounts = useRefundAccounts(accountOptions, transaction);
  const preview = draft ? refundPreview(transaction, draft.amount) : null;

  useEffect(() => {
    if (!open) return;
    const target = view === "review" ? reviewBackRef.current : amountInputRef.current;
    const frame = window.requestAnimationFrame(() => target?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, view]);

  if (!summary || !transaction.capabilities.canRefund) return null;

  function resetDraft() {
    setDraft(createTransactionRefundDraft(transaction, new Date().toISOString()));
    setView("form");
    setFieldErrors({});
    setFormError(null);
    setIdempotencyKey(null);
  }

  function openDialog() {
    if (!transaction.capabilities.canRefund) return;
    resetDraft();
    setOpen(true);
  }

  function closeDialog() {
    if (isSubmitting) return;
    setOpen(false);
    setView("form");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function updateDraft(change: Partial<TransactionRefundDraft>) {
    setDraft((current) => current ? { ...current, ...change } : current);
    setFieldErrors({});
    setFormError(null);
    // A changed command is a new financial intent. Keep the key only for an
    // unchanged retry, including an uncertain network response.
    setIdempotencyKey(null);
  }

  function reviewRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || isSubmitting) return;
    const errors = validateTransactionRefundDraft(transaction, draft, accounts);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setView("review");
  }

  async function confirmRefund() {
    if (!draft || isSubmitting) return;
    const errors = validateTransactionRefundDraft(transaction, draft, accounts);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setView("form");
      return;
    }

    const key = idempotencyKey ?? window.crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(key);
    const command = createTransactionRefundCommand(workspaceId, transaction, draft, key);
    if (!command) {
      setFieldErrors({ amount: "invalid" });
      setView("form");
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/ledger/transactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !refundResponseId(payload)) {
        const failure = mapTransactionRefundFailure(refundErrorCode(payload));
        setFieldErrors(failure.fieldErrors);
        setFormError(failure.formError);
        return;
      }

      setOpen(false);
      setView("form");
      setIdempotencyKey(null);
      router.refresh();
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    } catch {
      // The key intentionally remains stable. The server may have committed
      // the refund even though the browser never received the response.
      setFormError("failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  function reloadLatest() {
    if (isSubmitting) return;
    setFieldErrors({});
    setFormError(null);
    router.refresh();
  }

  const merchant = transaction.merchant?.name ?? labels.title;
  const formatted = (money: { readonly currency: string; readonly minor: string }) =>
    formatOverviewMoney(money.minor, money.currency, locale);
  const statusMessage = refundFormError(formError, labels);

  return (
    <ResponsiveDialog onOpenChange={(nextOpen) => nextOpen ? openDialog() : closeDialog()} open={open}>
      <Button
        className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[#2563eb] bg-[#2563eb] text-[13px] font-medium text-white hover:bg-[#1e55d1] focus-visible:ring-[#5e8fe8]/35"
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        {labels.title}
      </Button>
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
              <ArrowLeft aria-hidden="true" className="size-3.5" />{labels.back}
            </button>
          ) : null}
          <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]">
            {view === "review" ? labels.reviewTitle : labels.title}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]" id="transaction-refund-description">
            {view === "review" ? labels.reviewDescription : labels.sourceExpense.replace("{merchant}", merchant)}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {draft && view === "form" ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={reviewRefund}>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
              <div className="grid gap-5">
                <RefundContext formatted={formatted} labels={labels} summary={summary} />
            <TransactionAmountField
              currency={toCurrencyCode(summary.remainingRefundableAmount.currency)}
              currencyDisabled
              currencyEmptyLabel={labels.currency}
              currencyLabel={labels.currencyLocked}
              currencySearchPlaceholder={labels.currency}
              error={refundFieldError(fieldErrors.amount, labels)}
              inputDisabled={isSubmitting}
              inputRef={amountInputRef}
              label={labels.amount}
              language={language}
              onCurrencyChange={() => undefined}
              onValueChange={(amount) => updateDraft({ amount })}
              value={draft.amount}
            />
            {preview ? (
              <p className="rounded-[8px] bg-[#f4f8ff] px-3.5 py-2.5 text-[12px] leading-5 text-[#36506f]" role="status">
                <span className="font-semibold text-[#244d91]">{preview.status === "FULL" ? labels.full : labels.partial}</span>
                {" · "}{labels.afterRefund} <span className="font-semibold tabular-nums">{formatted(preview.remaining)}</span> {labels.refundableRemaining}
              </p>
            ) : null}
            <TransactionAccountField
              accountLoadError={labels.accountLoadError}
              accountLoadingLabel={labels.accountLoading}
              accounts={accounts}
              availability={accountOptions.status}
              createAccountLabel={labels.cancel}
              createFirstAccountLabel={labels.cancel}
              disabled={isSubmitting}
              disabledAccountIds={accounts.filter((account) => account.currency !== toCurrencyCode(summary.remainingRefundableAmount.currency)).map((account) => account.id)}
              disabledAccountLabel={labels.accountCurrencyMismatch}
              emptyDescription={labels.accountEmptyDescription}
              emptyTitle={labels.accountEmptyTitle}
              error={refundFieldError(fieldErrors.account, labels)}
              helperText={labels.accountHelper}
              label={labels.refundTo}
              noResultsLabel={labels.accountNoResults}
              onValueChange={(accountId) => updateDraft({ accountId })}
              placeholder={labels.accountPlaceholder}
              searchPlaceholder={labels.accountSearch}
              value={draft.accountId}
            />
            <ReasonField disabled={isSubmitting} labels={labels} onValueChange={(reason) => updateDraft({ reason })} value={draft.reason} />
            <TransactionNoteField
              disabled={isSubmitting}
              label={labels.note}
              onValueChange={(note) => updateDraft({ note })}
              optionalLabel={labels.optional}
              placeholder={labels.notePlaceholder}
              value={draft.note}
            />
                {statusMessage ? <RefundStatusMessage formError={formError} labels={labels} message={statusMessage} onReload={reloadLatest} /> : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e8edf4] bg-[#fcfdff] px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-7">
              <Button className="h-10 rounded-[8px] px-4 text-[13px] font-medium text-[#43516a]" disabled={isSubmitting} onClick={closeDialog} type="button" variant="ghost">{labels.cancel}</Button>
              <Button className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={isSubmitting || formError === "changed" || formError === "fullyRefunded" || formError === "notAllowed"} type="submit">{labels.review}</Button>
            </div>
          </form>
        ) : draft ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
              <div className="grid gap-5">
                <section aria-label={labels.reviewTitle} className="divide-y divide-[#e8edf4] overflow-hidden rounded-[10px] border border-[#e1e7f0] bg-white">
              <ReviewRow label={labels.amount} value={preview ? formatted(preview.amount) : draft.amount} />
              <ReviewRow label={labels.refundTo} value={accounts.find((account) => account.id === draft.accountId)?.name ?? labels.accountUnavailable} />
              <ReviewRow label={labels.afterRefund} value={preview ? `${formatted(preview.remaining)} ${labels.refundableRemaining}` : "—"} />
              {draft.reason ? <ReviewRow label={labels.reason} value={reasonLabel(draft.reason, labels)} /> : null}
              {draft.note ? <ReviewRow label={labels.note} value={draft.note} /> : null}
                </section>
                <p className="rounded-[8px] bg-[#f7f9fc] px-3.5 py-3 text-[12px] leading-5 text-[#53627b]">{labels.refundRecorded}</p>
                {statusMessage ? <RefundStatusMessage formError={formError} labels={labels} message={statusMessage} onReload={reloadLatest} /> : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e8edf4] bg-[#fcfdff] px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-7">
              <Button className="h-10 rounded-[8px] px-4 text-[13px] font-medium text-[#43516a]" disabled={isSubmitting} onClick={() => setView("form")} type="button" variant="ghost">{labels.back}</Button>
              {formError === "changed" || formError === "fullyRefunded" || formError === "notAllowed" ? <Button className="h-10 rounded-[8px] border border-[#dfe5ee] bg-white px-4 text-[13px] font-medium text-[#43516a]" disabled={isSubmitting} onClick={reloadLatest} type="button" variant="ghost"><RefreshCw aria-hidden="true" className="size-3.5" />{labels.reloadLatest}</Button> : null}
              <Button aria-describedby="transaction-refund-status" className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={isSubmitting || formError === "changed" || formError === "fullyRefunded" || formError === "notAllowed"} onClick={confirmRefund} type="button">{isSubmitting ? labels.refunding : labels.confirm}</Button>
            </div>
          </div>
        ) : null}
        <p aria-live="polite" className="sr-only" id="transaction-refund-status">{isSubmitting ? labels.refunding : statusMessage ?? ""}</p>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function useRefundRouter() {
  try {
    return useRouter();
  } catch {
    // This component is also rendered by the repository's static component
    // tests, which intentionally do not mount Next's App Router. Production
    // usage is always mounted by the workspace route; this fallback keeps the
    // test render inert and still gives an embedded browser a safe refresh.
    return { refresh: () => window.location.reload() };
  }
}

function useRefundAccounts(accountOptions: TransactionAccountOptionsState, transaction: TransactionDetailData): readonly TransactionAccountOption[] {
  return useMemo(() => {
    const accounts = accountOptions.accounts;
    const source = transaction.refund?.sourceAccount;
    if (!source || accounts.some((account) => account.id === source.id)) return accounts;
    return [...accounts, { ...source, currency: toCurrencyCode(source.currency) }];
  }, [accountOptions.accounts, transaction.refund?.sourceAccount]);
}

function RefundContext({
  formatted,
  labels,
  summary,
}: {
  readonly formatted: (money: { readonly currency: string; readonly minor: string }) => string;
  readonly labels: TransactionRefundLabels;
  readonly summary: NonNullable<TransactionDetailData["refund"]>;
}) {
  return (
    <dl className="grid gap-2.5 rounded-[10px] bg-[#f7f9fc] px-3.5 py-3 text-[13px] sm:grid-cols-3 sm:gap-x-5">
      <ContextValue label={labels.originalAmount} value={formatted(summary.effectiveExpenseAmount)} />
      <ContextValue label={labels.alreadyRefunded} value={formatted(summary.refundedAmount)} />
      <ContextValue emphasized label={labels.remaining} value={formatted(summary.remainingRefundableAmount)} />
    </dl>
  );
}

function ContextValue({ label, value, emphasized = false }: { readonly label: string; readonly value: string; readonly emphasized?: boolean }) {
  return <div><dt className="text-[11px] text-[#71809a]">{label}</dt><dd className={`mt-0.5 tabular-nums ${emphasized ? "font-semibold text-[#172d56]" : "font-medium text-[#34405d]"}`}>{value}</dd></div>;
}

function ReasonField({ disabled, labels, onValueChange, value }: { readonly disabled: boolean; readonly labels: TransactionRefundLabels; readonly onValueChange: (value: string) => void; readonly value: string }) {
  return (
    <div className="grid gap-2">
      <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#384862]" htmlFor="transaction-refund-reason"><span>{labels.reason}</span><span className="text-[12px] font-normal text-[#71809a]">{labels.optional}</span></label>
      <select className="h-11 rounded-[8px] border border-[#d9e1ec] bg-white px-3 text-[13px] text-[#13213f] outline-none transition-[border-color,box-shadow] hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15" disabled={disabled} id="transaction-refund-reason" onChange={(event) => onValueChange(event.target.value)} value={value}>
        <option value="">{labels.optional}</option>
        <option value="RETURNED_ITEM">{labels.returnedItem}</option>
        <option value="CANCELLED_SERVICE">{labels.cancelledService}</option>
        <option value="PRICE_ADJUSTMENT">{labels.priceAdjustment}</option>
        <option value="DUPLICATE_CHARGE">{labels.duplicateCharge}</option>
        <option value="OTHER">{labels.other}</option>
      </select>
    </div>
  );
}

function ReviewRow({ label, value }: { readonly label: string; readonly value: string }) {
  return <dl className="grid gap-1 px-3.5 py-3 sm:grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] sm:gap-4"><dt className="text-[12px] text-[#71809a]">{label}</dt><dd className="min-w-0 wrap-break-word text-[13px] font-medium text-[#34405d]">{value}</dd></dl>;
}

function refundFieldError(error: TransactionRefundFieldErrors["amount"] | TransactionRefundFieldErrors["account"], labels: TransactionRefundLabels): string | undefined {
  switch (error) {
    case "required": return labels.amountRequired;
    case "positive": return labels.amountPositive;
    case "invalid": return labels.amountInvalid;
    case "exceeds": return labels.amountExceeds;
    case "unavailable": return labels.accountUnavailable;
    default: return undefined;
  }
}

function refundFormError(error: TransactionRefundFormError, labels: TransactionRefundLabels): string | null {
  switch (error) {
    case "changed": return labels.sourceChanged;
    case "fullyRefunded": return labels.fullyRefunded;
    case "notAllowed": return labels.notAllowed;
    case "failed": return labels.failed;
    default: return null;
  }
}

function RefundStatusMessage({ formError, labels, message, onReload }: { readonly formError: TransactionRefundFormError; readonly labels: TransactionRefundLabels; readonly message: string; readonly onReload: () => void }) {
  const reloadable = formError === "changed" || formError === "fullyRefunded" || formError === "notAllowed";
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-[#fff6ed] px-3.5 py-3 text-[12px] leading-5 text-[#8a4d18]" role="alert"><span>{message}</span>{reloadable ? <button className="font-semibold text-[#8a4d18] underline underline-offset-3 outline-none focus-visible:ring-2 focus-visible:ring-[#d98c3c]/40" onClick={onReload} type="button">{labels.reloadLatest}</button> : null}</div>;
}

function reasonLabel(reason: string, labels: TransactionRefundLabels): string {
  return ({ RETURNED_ITEM: labels.returnedItem, CANCELLED_SERVICE: labels.cancelledService, PRICE_ADJUSTMENT: labels.priceAdjustment, DUPLICATE_CHARGE: labels.duplicateCharge, OTHER: labels.other } as Record<string, string>)[reason] ?? reason;
}
