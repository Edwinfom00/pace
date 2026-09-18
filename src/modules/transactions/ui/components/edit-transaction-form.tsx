"use client";

import type { FormEvent, RefObject } from "react";

import { Button } from "@/components/ui/button";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import type { TransactionCategoryOption } from "@/modules/transactions/domain/transaction-category-options";

import type { TransactionEditLabels } from "../transaction-edit-labels";
import { formatTransactionDetailAmount } from "./transaction-detail-formatters";
import { TransactionCategoryField } from "./transaction-category-field";
import type { TransactionEditDraft, TransactionEditFieldErrors, TransactionEditFormError } from "./transaction-edit-flow";
import { TransactionDateField } from "./transaction-date-field";
import { TransactionMerchantField } from "./transaction-merchant-field";
import { TransactionNoteField } from "./transaction-note-field";
import { TransactionTimeField } from "./transaction-time-field";

export function EditTransactionForm({
  categories,
  dateTriggerRef,
  draft,
  errors,
  formError,
  isDirty,
  isSaving,
  labels,
  locale,
  merchantInputRef,
  onCancel,
  onDraftChange,
  onReload,
  onSubmit,
  timeZone,
  transaction,
}: {
  readonly categories: readonly TransactionCategoryOption[];
  readonly dateTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly draft: TransactionEditDraft;
  readonly errors: TransactionEditFieldErrors;
  readonly formError: TransactionEditFormError;
  readonly isDirty: boolean;
  readonly isSaving: boolean;
  readonly labels: TransactionEditLabels;
  readonly locale: string;
  readonly merchantInputRef?: RefObject<HTMLInputElement | null>;
  readonly onCancel: () => void;
  readonly onDraftChange: (change: Partial<TransactionEditDraft>) => void;
  readonly onReload: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly timeZone: string;
  readonly transaction: TransactionDetailData;
}) {
  const isCounterpartyTransaction = transaction.kind === "EXPENSE" || transaction.kind === "INCOME";
  const isTransfer = transaction.kind === "TRANSFER";
  const formMessage = formError === "concurrent"
    ? labels.concurrentModification
    : formError === "notAllowed"
      ? labels.notAllowed
      : formError === "failed"
        ? labels.failed
        : null;

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-7 sm:pb-7">
        <ReadOnlyTransactionSummary labels={labels} locale={locale} transaction={transaction} />

        {formMessage ? (
          <div aria-live="assertive" className="mt-5 rounded-[8px] border border-[#f1c7cd] bg-[#fff8f8] px-3 py-2.5 text-[12px] leading-5 text-[#a84653]" role="alert">
            <p>{formMessage}</p>
            {formError === "concurrent" ? (
              <button
                className="mt-1.5 rounded-[6px] px-1.5 py-1 text-[12px] font-semibold text-[#2f67e9] outline-none hover:bg-[#edf3ff] focus-visible:bg-[#edf3ff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/30"
                disabled={isSaving}
                onClick={onReload}
                type="button"
              >
                {labels.reload}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4">
          {isCounterpartyTransaction ? (
            <TransactionMerchantField
              error={errors.counterparty}
              helperText={transaction.kind === "EXPENSE" ? labels.merchantHelper : labels.sourceHelper}
              inputRef={merchantInputRef}
              label={transaction.kind === "EXPENSE" ? labels.merchant : labels.source}
              onValueChange={(counterparty) => onDraftChange({ counterparty })}
              placeholder={transaction.kind === "EXPENSE" ? labels.merchantPlaceholder : labels.sourcePlaceholder}
              value={draft.counterparty}
            />
          ) : null}

          {isCounterpartyTransaction ? (
            <TransactionCategoryField
              availability="ready"
              categories={categories}
              categoryEmptyLabel={labels.categoryEmpty}
              categoryLoadError={labels.invalidCategory}
              categoryLoadingLabel={labels.categoryEmpty}
              categoryRetryLabel={labels.reload}
              clearLabel={labels.clearCategory}
              error={errors.category}
              helperText={labels.categoryHelper}
              kind={transaction.kind}
              label={labels.category}
              onValueChange={(categoryId) => onDraftChange({ categoryId })}
              placeholder={labels.categoryPlaceholder}
              searchPlaceholder={labels.categorySearch}
              value={draft.categoryId}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <TransactionDateField
              error={errors.date}
              label={labels.date}
              locale={locale}
              onValueChange={(date) => onDraftChange({ date })}
              timeZone={timeZone}
              triggerRef={isTransfer ? dateTriggerRef : undefined}
              value={draft.date}
            />
            <TransactionTimeField
              clearLabel={labels.clearTime}
              error={errors.time}
              label={labels.time}
              locale={locale}
              onValueChange={(time) => onDraftChange({ time })}
              optionalLabel={labels.optional}
              placeholder={labels.timePlaceholder}
              value={draft.time}
            />
          </div>

          <TransactionNoteField
            error={errors.note}
            label={labels.note}
            onValueChange={(note) => onDraftChange({ note })}
            optionalLabel={labels.optional}
            placeholder={labels.notePlaceholder}
            value={draft.note}
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-[#e6eaf0] bg-[#fcfdff] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-7">
        {!isDirty ? <p className="mr-auto text-[12px] text-[#71809a]">{labels.noChanges}</p> : null}
        <Button
          className="h-10 rounded-[8px] border border-[#dfe5ee] bg-white px-4 text-[13px] font-medium text-[#43516a] hover:bg-[#f3f6fa] hover:text-[#263550]"
          disabled={isSaving}
          onClick={onCancel}
          type="button"
          variant="ghost"
        >
          {labels.cancel}
        </Button>
        <Button
          aria-describedby={!isDirty ? "transaction-edit-no-changes" : undefined}
          className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1e55d1] focus-visible:ring-[#5e8fe8]/35"
          disabled={!isDirty || isSaving}
          type="submit"
        >
          {isSaving ? labels.saving : labels.save}
        </Button>
        {!isDirty ? <span className="sr-only" id="transaction-edit-no-changes">{labels.noChanges}</span> : null}
      </div>
    </form>
  );
}

function ReadOnlyTransactionSummary({
  labels,
  locale,
  transaction,
}: {
  readonly labels: TransactionEditLabels;
  readonly locale: string;
  readonly transaction: TransactionDetailData;
}) {
  const amount = formatTransactionDetailAmount(transaction.amount, transaction.kind, locale);
  const primaryAccount = transaction.account?.name ?? labels.accountUnavailable;
  const transferAccount = transaction.transferAccount?.name ?? labels.accountUnavailable;

  return (
    <section aria-label={labels.readOnly} className="rounded-[9px] border border-[#e6eaf0] bg-[#f8faff] px-3.5 py-3">
      <p className="text-[11px] font-medium tracking-[0.04em] text-[#71809a] uppercase">{labels.readOnly}</p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <SummaryItem label={labels.amount} value={amount} />
        {transaction.kind === "TRANSFER" ? (
          <div className="grid grid-cols-2 gap-3">
            <SummaryItem label={labels.fromAccount} value={primaryAccount} />
            <SummaryItem label={labels.toAccount} value={transferAccount} />
          </div>
        ) : (
          <SummaryItem label={labels.account} value={primaryAccount} />
        )}
      </dl>
    </section>
  );
}

function SummaryItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[#71809a]">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium tabular-nums text-[#263550]">{value}</dd>
    </div>
  );
}
