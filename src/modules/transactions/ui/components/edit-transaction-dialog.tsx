"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import type { TransactionCategoryOption } from "@/modules/transactions/domain/transaction-category-options";

import type { TransactionEditLabels } from "../transaction-edit-labels";
import { EditTransactionForm } from "./edit-transaction-form";
import {
  createTransactionEditCommand,
  createTransactionEditDraft,
  isTransactionEditDirty,
  mapTransactionEditFailure,
  transactionEditErrorCode,
  validateTransactionEditDraft,
  type TransactionEditDraft,
  type TransactionEditFieldErrors,
  type TransactionEditFormError,
} from "./transaction-edit-flow";

export function EditTransactionDialog({
  categories,
  labels,
  locale,
  timeZone,
  transaction,
  workspaceId,
}: {
  readonly categories: readonly TransactionCategoryOption[];
  readonly labels: TransactionEditLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly transaction: TransactionDetailData;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const merchantInputRef = useRef<HTMLInputElement>(null);
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState(() => createTransactionEditDraft(transaction, timeZone));
  const [errors, setErrors] = useState<TransactionEditFieldErrors>({});
  const [formError, setFormError] = useState<TransactionEditFormError>(null);
  const isDirty = isTransactionEditDirty(transaction, timeZone, draft);

  useEffect(() => {
    if (!open) return;
    const firstField = transaction.kind === "EXPENSE" || transaction.kind === "INCOME"
      ? merchantInputRef
      : dateTriggerRef;
    const frame = window.requestAnimationFrame(() => firstField.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, transaction.kind]);

  if (!transaction.capabilities.canEdit) return null;

  function resetDraft() {
    setDraft(createTransactionEditDraft(transaction, timeZone));
    setErrors({});
    setFormError(null);
  }

  function closeDialog() {
    if (isSaving) return;
    setOpen(false);
    resetDraft();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function openDialog() {
    if (!transaction.capabilities.canEdit) return;
    resetDraft();
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
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !isDirty) return;

    const validationErrors = validateTransactionEditDraft(transaction, draft, categories, labels);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

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
      resetDraft();
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

  function reloadTransaction() {
    if (isSaving) return;
    closeDialog();
    router.refresh();
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
          <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]">
            {labels.title}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">
            {labels.subtitle}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <EditTransactionForm
          categories={categories}
          dateTriggerRef={dateTriggerRef}
          draft={draft}
          errors={errors}
          formError={formError}
          isDirty={isDirty}
          isSaving={isSaving}
          labels={labels}
          locale={locale}
          merchantInputRef={merchantInputRef}
          onCancel={closeDialog}
          onDraftChange={updateDraft}
          onReload={reloadTransaction}
          onSubmit={submit}
          timeZone={timeZone}
          transaction={transaction}
        />
        <p aria-live="polite" className="sr-only">{isSaving ? labels.saving : ""}</p>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function isUpdatedTransactionDetail(payload: unknown, transactionId: string): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const transaction = (payload as { readonly transaction?: unknown }).transaction;
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) return false;
  const value = transaction as { readonly id?: unknown; readonly updatedAt?: unknown };
  return value.id === transactionId && typeof value.updatedAt === "string";
}
