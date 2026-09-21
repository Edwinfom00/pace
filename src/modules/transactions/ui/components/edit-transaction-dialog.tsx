"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { TransactionAccountOptionsState } from "@/modules/transactions/domain/transaction-account-options";
import type { TransactionCategoryOption } from "@/modules/transactions/domain/transaction-category-options";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";

import type { TransactionEditLabels } from "../transaction-edit-labels";
import { EditTransactionForm } from "./edit-transaction-form";
import { formatTransactionBalance, parseInsufficientFundsDetails } from "./transaction-balance";
import { TransactionCorrectionReview, type TransactionCorrectionReason } from "./transaction-correction-review";
import {
  classifyTransactionChanges,
  correctionReplacementTransactionId,
  createTransactionCorrectionCommand,
  createTransactionEditCommand,
  createTransactionEditDraft,
  getTransactionEditSubmissionIntent,
  mapTransactionEditFailure,
  mapTransactionCorrectionFailureForKind,
  transactionEditErrorCode,
  validateTransactionEditDraft,
  type TransactionEditDraft,
  type TransactionCorrectionFormError,
  type TransactionEditFieldErrors,
  type TransactionEditFormError,
} from "./transaction-edit-flow";

type EditDialogView = "edit" | "review";

export function EditTransactionDialog({
  accountOptions,
  categories,
  labels,
  language,
  locale,
  timeZone,
  transaction,
  workspaceId,
  workspaceSlug,
}: {
  readonly accountOptions: TransactionAccountOptionsState;
  readonly categories: readonly TransactionCategoryOption[];
  readonly labels: TransactionEditLabels;
  readonly language: OnboardingLanguage;
  readonly locale: string;
  readonly timeZone: string;
  readonly transaction: TransactionDetailData;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const reviewBackRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<EditDialogView>("edit");
  const [isSaving, setIsSaving] = useState(false);
  const [baseline, setBaseline] = useState(() => createTransactionEditDraft(transaction, timeZone));
  const [draft, setDraft] = useState(() => createTransactionEditDraft(transaction, timeZone));
  const [errors, setErrors] = useState<TransactionEditFieldErrors>({});
  const [formError, setFormError] = useState<TransactionEditFormError>(null);
  const [correctionError, setCorrectionError] = useState<TransactionCorrectionFormError>(null);
  const [correctionBalanceMessage, setCorrectionBalanceMessage] = useState<string | null>(null);
  const [correctionIdempotencyKey, setCorrectionIdempotencyKey] = useState<string | null>(null);
  const [reason, setReason] = useState<TransactionCorrectionReason>("");
  const [reasonDetails, setReasonDetails] = useState("");
  const classification = classifyTransactionChanges(baseline, draft, transaction);

  useEffect(() => {
    if (!open) return;
    const focusTarget = view === "review" ? reviewBackRef : amountInputRef;
    const frame = window.requestAnimationFrame(() => focusTarget.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, view]);

  if (!transaction.capabilities.canEdit) return null;

  function resetForEdit() {
    const snapshot = createTransactionEditDraft(transaction, timeZone);
    setBaseline(snapshot);
    setDraft(snapshot);
    setErrors({});
    setFormError(null);
    setCorrectionError(null);
    setCorrectionBalanceMessage(null);
    setCorrectionIdempotencyKey(null);
    setReason("");
    setReasonDetails("");
    setView("edit");
  }

  function closeDialog() {
    if (isSaving) return;
    setOpen(false);
    resetForEdit();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function openDialog() {
    if (!transaction.capabilities.canEdit) return;
    resetForEdit();
    setOpen(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSaving && !nextOpen) return;
    if (nextOpen) openDialog();
    else closeDialog();
  }

  function updateDraft(change: Partial<TransactionEditDraft>) {
    setDraft((current) => ({ ...current, ...change }));
    setErrors({});
    setFormError(null);
    setCorrectionError(null);
    setCorrectionBalanceMessage(null);
    setCorrectionIdempotencyKey(null);
  }

  function updateCorrectionReason(nextReason: TransactionCorrectionReason) {
    if (isSaving) return;
    setReason(nextReason);
    setCorrectionError(null);
    setCorrectionBalanceMessage(null);
    setCorrectionIdempotencyKey(null);
  }

  function updateCorrectionReasonDetails(nextReasonDetails: string) {
    if (isSaving) return;
    setReasonDetails(nextReasonDetails);
    setCorrectionError(null);
    setCorrectionBalanceMessage(null);
    setCorrectionIdempotencyKey(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !classification.hasChanges) return;

    const submissionIntent = getTransactionEditSubmissionIntent(
      classification,
      transaction.capabilities.canCorrectFinancials,
    );

    const validationErrors = validateTransactionEditDraft(
      transaction,
      draft,
      categories,
      labels,
      submissionIntent === "review-correction" ? accountOptions.accounts : undefined,
    );
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (submissionIntent === "financial-not-allowed") {
      setFormError("financialNotAllowed");
      return;
    }

    if (submissionIntent === "review-correction") {
      setView("review");
      return;
    }

    if (submissionIntent !== "safe-edit") return;

    const command = createTransactionEditCommand(workspaceId, transaction, timeZone, draft);
    if (Object.keys(command.patch).length === 0) return;

    setIsSaving(true);
    setErrors({});
    setFormError(null);

    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/ledger/transactions/${encodeURIComponent(transaction.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        },
      );
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok || !isUpdatedTransactionDetail(payload, transaction.id)) {
        applyServerFailure(transactionEditErrorCode(payload));
        return;
      }

      setOpen(false);
      resetForEdit();
      router.refresh();
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    } catch {
      setFormError("failed");
    } finally {
      setIsSaving(false);
    }
  }

  function applyServerFailure(code: string | undefined) {
    const failure = mapTransactionEditFailure(code);
    setErrors({
      ...(failure.fieldErrors.counterparty ? { counterparty: labels.counterpartyTooLong } : {}),
      ...(failure.fieldErrors.category ? { category: labels.invalidCategory } : {}),
      ...(failure.fieldErrors.date ? { date: labels.invalidDate } : {}),
      ...(failure.fieldErrors.time ? { time: labels.invalidTime } : {}),
      ...(failure.fieldErrors.note ? { note: labels.noteTooLong } : {}),
    });
    setFormError(failure.formError);
  }

  function applyCorrectionServerFailure(code: string | undefined, payload?: unknown) {
    const failure = mapTransactionCorrectionFailureForKind(code, transaction.kind);
    setErrors({
      ...(failure.fieldErrors.amount ? { amount: failure.formError === "insufficientFunds" ? labels.balance.insufficientFunds : labels.amountInvalid } : {}),
      ...(failure.fieldErrors.account ? { account: labels.accountUnavailable } : {}),
      ...(failure.fieldErrors.fromAccount ? { fromAccount: labels.accountUnavailable } : {}),
      ...(failure.fieldErrors.counterparty ? { counterparty: labels.counterpartyTooLong } : {}),
      ...(failure.fieldErrors.category ? { category: labels.invalidCategory } : {}),
      ...(failure.fieldErrors.date ? { date: labels.invalidDate } : {}),
      ...(failure.fieldErrors.time ? { time: labels.invalidTime } : {}),
      ...(failure.fieldErrors.toAccount ? { toAccount: labels.sameTransferAccount } : {}),
    });
    setCorrectionError(failure.formError);
    const insufficientFunds = parseInsufficientFundsDetails(payload);
    if (insufficientFunds) {
      const formatted = formatTransactionBalance(
        insufficientFunds.availableBalanceMinor,
        insufficientFunds.currency,
        locale,
      );
      setCorrectionBalanceMessage(formatTemplate(labels.balance.balanceChanged, { amount: formatted ?? insufficientFunds.currency }));
      // Do not reimplement correction spendability in the browser: the server
      // evaluates the atomic reversal and replacement together.
      router.refresh();
    } else {
      setCorrectionBalanceMessage(null);
    }
  }

  async function applyCorrection() {
    if (isSaving) return;
    if (!classification.hasFinancialChanges) {
      // Defensive guard: metadata-only changes remain on the safe-edit path.
      setView("edit");
      return;
    }
    if (!transaction.capabilities.canCorrectFinancials) {
      setCorrectionError("notAllowed");
      return;
    }

    const idempotencyKey = correctionIdempotencyKey ?? window.crypto.randomUUID();
    if (!correctionIdempotencyKey) setCorrectionIdempotencyKey(idempotencyKey);
    const command = createTransactionCorrectionCommand(
      workspaceId,
      transaction,
      baseline,
      draft,
      idempotencyKey,
      reason === "OTHER" ? reasonDetails : reason,
    );
    if (!command) {
      setView("edit");
      return;
    }

    setIsSaving(true);
    setErrors({});
    setCorrectionError(null);

    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/ledger/transactions/${encodeURIComponent(transaction.id)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      const replacementTransactionId = correctionReplacementTransactionId(payload);

      if (!response.ok || !replacementTransactionId || replacementTransactionId === transaction.id) {
        applyCorrectionServerFailure(transactionEditErrorCode(payload), payload);
        return;
      }

      setOpen(false);
      resetForEdit();
      router.refresh();
      router.replace(
        `/w/${encodeURIComponent(workspaceSlug)}/transactions/${encodeURIComponent(replacementTransactionId)}`,
      );
    } catch {
      // Keep the same key: the request may have committed after the network
      // became uncertain, and a retry must reconcile its canonical result.
      setCorrectionError("failed");
    } finally {
      setIsSaving(false);
    }
  }

  function reloadTransaction() {
    if (isSaving) return;
    closeDialog();
    router.refresh();
  }

  function reloadLatestTransaction() {
    if (isSaving) return;
    closeDialog();
    router.refresh();
  }

  function backToEdit() {
    setView("edit");
  }

  return (
    <ResponsiveDialog onOpenChange={handleOpenChange} open={open}>
      <Button
        className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[#2563eb] bg-[#2563eb] text-[13px] font-medium text-white hover:bg-[#1e55d1] focus-visible:ring-[#5e8fe8]/35"
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        <Pencil aria-hidden="true" className="size-4" />
        {labels.title}
      </Button>
      <ResponsiveDialogContent
        className="flex! max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] max-w-162.5 flex-col gap-0 overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-162.5"
        drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0 border-[#e1e7f0] shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)] data-[vaul-drawer-direction=bottom]:rounded-t-[14px]"
      >
        <Button
          aria-label={labels.cancel}
          className="absolute top-3 right-3 z-10 size-8 rounded-[7px] text-[#61708a] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30 sm:top-4 sm:right-4"
          disabled={isSaving}
          onClick={closeDialog}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
        <ResponsiveDialogHeader className="gap-1 px-4 pt-5 pb-4 pr-12 sm:px-7 sm:pt-6 sm:pb-5 sm:pr-14">
          {view === "review" ? (
            <button
              className="-ml-1.5 mb-1 flex w-fit items-center gap-1 rounded-[6px] px-1.5 py-1 text-[12px] font-semibold text-[#2f67e9] outline-none hover:bg-[#edf3ff] focus-visible:bg-[#edf3ff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/30"
              onClick={backToEdit}
              ref={reviewBackRef}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              {labels.correction.backToEdit}
            </button>
          ) : null}
          <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]">
            {view === "review" ? labels.correction.reviewTitle : labels.title}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">
            {view === "review" ? labels.correction.reviewDescription : labels.subtitle}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {view === "review" ? (
          <TransactionCorrectionReview
            accounts={accountOptions.accounts}
            baseline={baseline}
            categories={categories}
            classification={classification}
            draft={draft}
            labels={labels}
            locale={locale}
            correctionError={correctionError}
            correctionBalanceMessage={correctionBalanceMessage}
            isApplying={isSaving}
            onApply={applyCorrection}
            onBack={backToEdit}
            onReloadLatest={reloadLatestTransaction}
            onReasonChange={updateCorrectionReason}
            onReasonDetailsChange={updateCorrectionReasonDetails}
            reason={reason}
            reasonDetails={reasonDetails}
            transaction={transaction}
          />
        ) : (
          <EditTransactionForm
            accountOptions={accountOptions}
            amountInputRef={amountInputRef}
            categories={categories}
            classification={classification}
            dateTriggerRef={dateTriggerRef}
            draft={draft}
            errors={errors}
            formError={formError}
            isSaving={isSaving}
            labels={labels}
            language={language}
            locale={locale}
            onCancel={closeDialog}
            onDraftChange={updateDraft}
            onReload={reloadTransaction}
            onSubmit={submit}
            timeZone={timeZone}
            transaction={transaction}
          />
        )}
        <p aria-live="polite" className="sr-only">{isSaving ? view === "review" ? labels.correction.applying : labels.saving : ""}</p>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function formatTemplate(template: string, variables: Record<string, string>): string {
  return Object.entries(variables).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, value),
    template,
  );
}

function isUpdatedTransactionDetail(payload: unknown, transactionId: string): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const transaction = (payload as { readonly transaction?: unknown }).transaction;
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) return false;
  const value = transaction as { readonly id?: unknown; readonly updatedAt?: unknown };
  return value.id === transactionId && typeof value.updatedAt === "string";
}
