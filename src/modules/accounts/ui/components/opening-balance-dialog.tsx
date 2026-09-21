"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import { TransactionDateField } from "@/modules/transactions/ui/components/transaction-date-field";

import type { AccountDetail } from "../../domain/account-detail";
import type { AccountDetailUiLabels } from "../account-detail-ui-labels";
import {
  createCorrectOpeningBalanceCommand,
  createOpeningBalanceDraft,
  createSetOpeningBalanceCommand,
  mapOpeningBalanceFailure,
  openingBalanceErrorCode,
  parseOpeningBalanceAmount,
  validateOpeningBalanceDraft,
  type OpeningBalanceFieldError,
  type OpeningBalanceFormError,
  type OpeningBalanceMode,
} from "./opening-balance-flow";

type DialogStep = "form" | "review";

export function OpeningBalanceDialog({
  account,
  mode,
  now,
  onClose,
  openingBalance,
  labels,
  locale,
  timeZone,
  workspaceId,
}: {
  readonly account: AccountDetail["account"];
  readonly mode: OpeningBalanceMode;
  readonly now: string;
  readonly onClose: () => void;
  readonly openingBalance: AccountDetail["openingBalance"];
  readonly labels: AccountDetailUiLabels["management"]["openingBalance"];
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const amountInputRef = useRef<HTMLInputElement>(null);
  const idempotencyKeys = useRef<Partial<Record<OpeningBalanceMode, string>>>({});
  const isSubmittingRef = useRef(false);
  const [draft, setDraft] = useState(() => createOpeningBalanceDraft(openingBalance, account.currency, timeZone, new Date(now)));
  const [step, setStep] = useState<DialogStep>("form");
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<OpeningBalanceFieldError, true>>>({});
  const [formError, setFormError] = useState<OpeningBalanceFormError>(null);
  const amountId = useId();
  const amountErrorId = useId();
  const amountHelpId = useId();

  const isCorrection = mode === "correct";
  const currentAmount = openingBalance ? BigInt(openingBalance.amountMinor) : null;
  const candidateAmount = parseOpeningBalanceAmount(draft.amount, account.currency);
  const difference = currentAmount !== null && candidateAmount ? candidateAmount.minor - currentAmount : null;
  const needsReload = formError === "conflict" || formError === "notAllowed";
  const amountError = fieldErrors.amount
    ? isCorrection && candidateAmount && currentAmount === candidateAmount.minor
      ? labels.amountUnchanged
      : labels.invalidAmount
    : null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => amountInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (mode === "correct" && !openingBalance) return null;
  const activeMode: OpeningBalanceMode = mode;

  function closeDialog() {
    if (isSaving) return;
    onClose();
  }

  function updateDraft(change: Partial<typeof draft>) {
    if (isSaving) return;
    setDraft((current) => ({ ...current, ...change }));
    setFieldErrors({});
    setFormError(null);
    // A materially changed command starts a new intent; retries retain the
    // original UUID so the canonical idempotency contract can reconcile them.
    idempotencyKeys.current = {};
  }

  function operationKey(): string {
    const current = idempotencyKeys.current[activeMode];
    if (current) return current;
    const key = window.crypto.randomUUID();
    idempotencyKeys.current[activeMode] = key;
    return key;
  }

  function review() {
    const errors = validateOpeningBalanceDraft(activeMode, draft, account, openingBalance, timeZone);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setStep("review");
  }

  async function submit() {
    if (isSaving || isSubmittingRef.current) return;
    const command = activeMode === "set"
      ? createSetOpeningBalanceCommand(workspaceId, account, draft, timeZone, operationKey())
      : createCorrectOpeningBalanceCommand(workspaceId, account, openingBalance!, draft, operationKey());
    if (!command) {
      setFieldErrors(activeMode === "set" ? { amount: true, date: true } : { amount: true });
      setStep("form");
      return;
    }

    isSubmittingRef.current = true;
    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/ledger/accounts/${encodeURIComponent(account.id)}/opening-balance`,
        {
          method: activeMode === "set" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (response.ok) {
        onClose();
        // Account Detail, its balance chart, and every server-derived balance
        // read reconcile from the authoritative command result. No client-side
        // balance adjustment occurs here.
        router.refresh();
        return;
      }
      const failure = mapOpeningBalanceFailure(openingBalanceErrorCode(payload));
      setFieldErrors(failure.fieldErrors);
      setFormError(failure.formError);
    } catch {
      setFormError("failed");
    } finally {
      isSubmittingRef.current = false;
      setIsSaving(false);
    }
  }

  function reloadLatest() {
    if (isSaving) return;
    onClose();
    router.refresh();
  }

  const title = step === "review"
    ? isCorrection ? labels.reviewCorrection : labels.review
    : isCorrection ? labels.correctTitle : labels.setTitle;
  const actionLabel = isCorrection ? labels.applyCorrection : labels.set;
  const pendingLabel = isCorrection ? labels.correcting : labels.setting;
  const formattedCurrent = currentAmount === null ? null : formatOverviewMoney(currentAmount, account.currency, locale);
  const formattedCandidate = candidateAmount ? formatOverviewMoney(candidateAmount.minor, account.currency, locale) : draft.amount;

  return (
    <ResponsiveDialog onOpenChange={(open) => open || closeDialog()} open>
      <ResponsiveDialogContent
        className="flex! max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] max-w-162.5 flex-col gap-0 overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-162.5"
        drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0 border-[#e1e7f0] shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)] data-[vaul-drawer-direction=bottom]:rounded-t-[14px]"
        showCloseButton={false}
      >
        <Button
          aria-label={labels.close}
          className="absolute top-3 right-3 z-10 size-8 rounded-[7px] text-[#61708a] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30"
          disabled={isSaving}
          onClick={closeDialog}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>

        <ResponsiveDialogHeader className="gap-1 border-b border-[#e8edf4] px-5 pt-5 pb-4 pr-12 sm:px-6 sm:pt-6 sm:pr-14">
          <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]">{title}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">
            {isCorrection ? labels.correctionDescription : labels.description}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {step === "form" ? (
          <form className="grid gap-4 px-5 py-5 sm:px-6 sm:py-6" noValidate onSubmit={(event) => { event.preventDefault(); review(); }}>
            <AccountContext account={account} labels={labels} />

            {isCorrection ? (
              <dl className="rounded-[10px] border border-[#e5eaf1] bg-[#f8fafc] px-4 py-3">
                <dt className="text-[12px] text-[#71809a]">{labels.currentAmount}</dt>
                <dd className="mt-1 text-[16px] font-semibold tabular-nums text-[#1b2b48]">{formattedCurrent}</dd>
              </dl>
            ) : null}

            <div className="grid gap-2">
              <label className="text-[13px] font-medium text-[#384862]" htmlFor={amountId}>
                {isCorrection ? labels.correctedAmount : labels.amount}
              </label>
              <div className={`flex h-12 min-w-0 overflow-hidden rounded-[8px] border bg-white transition-[border-color,box-shadow] focus-within:ring-3 ${amountError ? "border-[#d88690] focus-within:border-[#c55b68] focus-within:ring-[#d88690]/15" : "border-[#d9e1ec] focus-within:border-[#4e7fe3] focus-within:ring-[#5e8fe8]/15"}`}>
                <Input
                  aria-describedby={amountError ? `${amountHelpId} ${amountErrorId}` : amountHelpId}
                  aria-invalid={amountError ? true : undefined}
                  autoComplete="off"
                  className="h-full min-w-0 flex-1 rounded-none border-0 px-3 text-[18px] font-semibold tabular-nums text-[#13213f] shadow-none focus-visible:border-0 focus-visible:ring-0"
                  disabled={isSaving || needsReload}
                  id={amountId}
                  inputMode="decimal"
                  onChange={(event) => updateDraft({ amount: event.target.value })}
                  pattern="[0-9]*"
                  placeholder="0"
                  ref={amountInputRef}
                  type="text"
                  value={draft.amount}
                />
                <span aria-label={account.currency} className="flex items-center border-l border-[#e5eaf1] px-3 text-[12px] font-semibold text-[#526987]">{account.currency}</span>
              </div>
              <p className="text-[12px] leading-5 text-[#71809a]" id={amountHelpId}>{isCorrection ? labels.correctionDescription : labels.description}</p>
              {amountError ? <p className="text-[12px] leading-5 text-[#c23445]" id={amountErrorId} role="alert">{amountError}</p> : null}
            </div>

            {isCorrection ? (
              <div className="grid gap-2">
                <span className="text-[13px] font-medium text-[#384862]">{labels.balanceAsOf}</span>
                <div className="flex min-h-11 items-center justify-between gap-3 rounded-[8px] border border-[#e5eaf1] bg-[#f8fafc] px-3 text-[13px] text-[#34405d]">
                  <span className="font-medium tabular-nums">{formatDate(openingBalance!.effectiveAt, locale, timeZone)}</span>
                  <span className="text-[12px] text-[#71809a]">{labels.locked}</span>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <TransactionDateField
                  error={fieldErrors.date ? labels.invalidDate : undefined}
                  label={labels.balanceAsOf}
                  locale={locale}
                  onValueChange={(effectiveDate) => updateDraft({ effectiveDate })}
                  timeZone={timeZone}
                  value={draft.effectiveDate}
                />
                <p className="text-[12px] leading-5 text-[#71809a]">{labels.dateDescription}</p>
              </div>
            )}

            {isCorrection ? (
              <div className="grid gap-2">
                <label className="text-[13px] font-medium text-[#384862]" htmlFor="opening-balance-reason">{labels.reasonOptional}</label>
                <Input
                  className="h-11 rounded-[8px] border-[#d9e1ec] bg-white px-3 text-[13px] text-[#13213f] hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15"
                  disabled={isSaving || needsReload}
                  id="opening-balance-reason"
                  maxLength={500}
                  onChange={(event) => updateDraft({ reason: event.target.value })}
                  value={draft.reason}
                />
              </div>
            ) : null}

            <FormStatus error={formError} labels={labels} onReload={reloadLatest} />
            <p aria-live="polite" className="sr-only">{isSaving ? pendingLabel : ""}</p>
            <footer className="-mx-5 -mb-5 mt-1 flex flex-col-reverse gap-2 border-t border-[#e8edf4] bg-[#fcfdff] px-5 py-3 sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-end sm:px-6">
              <Button className="h-10 rounded-[8px] px-4 text-[13px] font-medium text-[#43516a]" disabled={isSaving} onClick={closeDialog} type="button" variant="ghost">{labels.cancel}</Button>
              <Button className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1e55d1] disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving || needsReload} type="submit">{isCorrection ? labels.reviewCorrection : labels.review}</Button>
            </footer>
          </form>
        ) : (
          <div className="grid gap-4 px-5 py-5 sm:px-6 sm:py-6">
            <AccountContext account={account} labels={labels} />
            {isCorrection ? (
              <dl className="divide-y divide-[#e7ecf3] rounded-[10px] border border-[#e5eaf1] bg-[#fcfdff] px-4 py-1">
                <ReviewRow label={labels.before} value={formattedCurrent ?? ""} />
                <ReviewRow label={labels.after} value={formattedCandidate} />
                <ReviewRow label={labels.difference} value={difference === null ? "" : formatDifference(difference, account.currency, locale)} />
              </dl>
            ) : (
              <dl className="divide-y divide-[#e7ecf3] rounded-[10px] border border-[#e5eaf1] bg-[#fcfdff] px-4 py-1">
                <ReviewRow label={labels.amount} value={formattedCandidate} />
                <ReviewRow label={labels.balanceAsOf} value={formatDateForDraft(draft.effectiveDate, locale)} />
              </dl>
            )}
            <p className="text-[13px] leading-5 text-[#53627b]">{isCorrection ? labels.historyPreserved : labels.notIncome}</p>
            {isCorrection && draft.reason.normalize("NFKC").trim() ? (
              <dl className="grid gap-1 text-[13px]">
                <dt className="font-medium text-[#384862]">{labels.reason}</dt>
                <dd className="wrap-break-word text-[#53627b]">{draft.reason.normalize("NFKC").trim()}</dd>
              </dl>
            ) : null}
            <FormStatus error={formError} labels={labels} onReload={reloadLatest} />
            <p aria-live="polite" className="sr-only">{isSaving ? pendingLabel : ""}</p>
            <footer className="-mx-5 -mb-5 mt-1 flex flex-col-reverse gap-2 border-t border-[#e8edf4] bg-[#fcfdff] px-5 py-3 sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-end sm:px-6">
              <Button className="h-10 rounded-[8px] px-4 text-[13px] font-medium text-[#43516a]" disabled={isSaving} onClick={() => { setFormError(null); setStep("form"); }} type="button" variant="ghost">
                <ArrowLeft aria-hidden="true" className="mr-1 size-3.5" />
                {labels.back}
              </Button>
              <Button aria-busy={isSaving || undefined} className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1e55d1] disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving || needsReload} onClick={submit} type="button">{isSaving ? pendingLabel : actionLabel}</Button>
            </footer>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function AccountContext({ account, labels }: {
  readonly account: AccountDetail["account"];
  readonly labels: AccountDetailUiLabels["management"]["openingBalance"];
}) {
  return (
    <section aria-label={labels.accountContext} className="rounded-[10px] border border-[#e5eaf1] bg-[#f8fafc] px-4 py-3">
      <p className="min-w-0 wrap-break-word text-[14px] font-semibold text-[#1b2b48]">{account.name}</p>
      <p className="mt-1 text-[12px] text-[#71809a]">{labels.typeValues[account.type]} <span aria-hidden="true">·</span> {account.currency}</p>
    </section>
  );
}

function ReviewRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-[12px] text-[#71809a]">{label}</dt>
      <dd className="text-right text-[14px] font-semibold tabular-nums text-[#1b2b48]">{value}</dd>
    </div>
  );
}

function FormStatus({ error, labels, onReload }: {
  readonly error: OpeningBalanceFormError;
  readonly labels: AccountDetailUiLabels["management"]["openingBalance"];
  readonly onReload: () => void;
}) {
  if (!error) return null;
  const message = error === "conflict" ? labels.conflict : error === "notAllowed" ? labels.notAllowed : labels.failed;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-[#fff6ed] px-3.5 py-3 text-[12px] leading-5 text-[#8a4d18]" role="alert">
      <span>{message}</span>
      {error !== "failed" ? <button className="inline-flex items-center gap-1 font-semibold underline underline-offset-3 outline-none focus-visible:ring-2 focus-visible:ring-[#d98c3c]/40" onClick={onReload} type="button"><RefreshCw aria-hidden="true" className="size-3" />{labels.reloadLatest}</button> : null}
    </div>
  );
}

function formatDate(value: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(value));
}

function formatDateForDraft(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" }).format(value);
}

function formatDifference(value: bigint, currency: string, locale: string): string {
  if (value === 0n) return formatOverviewMoney("0", currency, locale);
  return `${value > 0n ? "+" : "−"}${formatOverviewMoney(value < 0n ? -value : value, currency, locale)}`;
}
