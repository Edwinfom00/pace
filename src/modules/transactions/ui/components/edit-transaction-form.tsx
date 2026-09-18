"use client";

import type { FormEvent, RefObject } from "react";

import { Button } from "@/components/ui/button";
import { toCurrencyCode } from "@/money/currency";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { TransactionAccountOptionsState, TransactionAccountOption } from "@/modules/transactions/domain/transaction-account-options";
import type { TransactionCategoryOption } from "@/modules/transactions/domain/transaction-category-options";
import type { TransactionDetailAccount, TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import type { TransactionEditLabels } from "../transaction-edit-labels";
import { TransactionAccountField } from "./transaction-account-field";
import { TransactionAmountField } from "./transaction-amount-field";
import { TransactionCategoryField } from "./transaction-category-field";
import { TransactionDateField } from "./transaction-date-field";
import { TransactionMerchantField } from "./transaction-merchant-field";
import { TransactionNoteField } from "./transaction-note-field";
import {
  type TransactionEditChangeClassification,
  type TransactionEditDraft,
  type TransactionEditFieldErrors,
  type TransactionEditFormError,
} from "./transaction-edit-flow";
import { TransactionTimeField } from "./transaction-time-field";

export function EditTransactionForm({
  accountOptions,
  amountInputRef,
  categories,
  classification: suppliedClassification,
  dateTriggerRef,
  draft,
  errors,
  formError,
  isDirty,
  isSaving,
  labels,
  language = "en",
  locale,
  merchantInputRef,
  onCancel,
  onDraftChange,
  onReload,
  onSubmit,
  timeZone,
  transaction,
}: {
  readonly accountOptions?: TransactionAccountOptionsState;
  readonly amountInputRef?: RefObject<HTMLInputElement | null>;
  readonly categories: readonly TransactionCategoryOption[];
  readonly classification?: TransactionEditChangeClassification;
  readonly dateTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly draft: TransactionEditDraft;
  readonly errors: TransactionEditFieldErrors;
  readonly formError: TransactionEditFormError;
  readonly isDirty?: boolean;
  readonly isSaving: boolean;
  readonly labels: TransactionEditLabels;
  readonly language?: OnboardingLanguage;
  readonly locale: string;
  readonly merchantInputRef?: RefObject<HTMLInputElement | null>;
  readonly onCancel: () => void;
  readonly onDraftChange: (change: Partial<TransactionEditDraft>) => void;
  readonly onReload: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly timeZone: string;
  readonly transaction: TransactionDetailData;
}) {
  const resolvedAccountOptions = accountOptions ?? { status: "ready", accounts: [] } as const;
  const classification = suppliedClassification ?? {
    hasChanges: isDirty ?? false,
    hasMetadataChanges: isDirty ?? false,
    hasFinancialChanges: false,
    metadataFields: [],
    financialFields: [],
  } as const;
  const isCounterpartyTransaction = transaction.kind === "EXPENSE" || transaction.kind === "INCOME";
  const isTransfer = transaction.kind === "TRANSFER";
  const financialFieldsAvailable = transaction.capabilities.canCorrectFinancials;
  const accountChoices = getEditAccountChoices(resolvedAccountOptions, transaction);
  const disabledAccountIds = getDisabledAccountIds(accountChoices, resolvedAccountOptions.accounts, transaction.amount.currency);
  const formMessage = formError === "concurrent"
    ? labels.concurrentModification
    : formError === "notAllowed"
      ? labels.notAllowed
      : formError === "financialNotAllowed"
        ? labels.financialCorrectionUnavailable
        : formError === "failed"
          ? labels.failed
          : null;

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-7 sm:pb-7">
        <TransactionLocks labels={labels} />

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
          <TransactionAmountField
            currency={toCurrencyCode(transaction.amount.currency)}
            currencyDisabled
            currencyEmptyLabel={labels.currencyEmpty}
            currencyLabel={labels.currency}
            currencySearchPlaceholder={labels.currencySearch}
            error={errors.amount}
            helperText={financialFieldsAvailable ? undefined : labels.financialCorrectionUnavailable}
            inputDisabled={!financialFieldsAvailable}
            inputRef={amountInputRef}
            label={labels.amount}
            language={language}
            onCurrencyChange={() => undefined}
            onValueChange={(amount) => onDraftChange({ amount })}
            value={draft.amount}
          />

          {isCounterpartyTransaction ? (
            <TransactionAccountField
              accountLoadError={labels.accountValidationUnavailable}
              accounts={accountChoices}
              availability={resolvedAccountOptions.status}
              createAccountLabel={labels.accountsCreate}
              createFirstAccountLabel={labels.accountsCreateFirst}
              disabled={!financialFieldsAvailable}
              disabledAccountIds={disabledAccountIds}
              disabledAccountLabel={labels.financialAccountUnavailable}
              emptyDescription={labels.accountsEmptyDescription}
              emptyTitle={labels.accountsEmptyTitle}
              error={errors.account}
              helperText={financialFieldsAvailable
                ? transaction.kind === "EXPENSE" ? labels.accountHelper : labels.accountIncomeHelper
                : labels.financialCorrectionUnavailable}
              label={labels.account}
              noResultsLabel={labels.accountsNoResults}
              onValueChange={(account) => onDraftChange({ account })}
              placeholder={labels.accountPlaceholder}
              preferredCurrency={transaction.amount.currency}
              searchPlaceholder={labels.accountSearch}
              value={draft.account}
            />
          ) : null}

          {isTransfer ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TransactionAccountField
                accountLoadError={labels.accountValidationUnavailable}
                accounts={accountChoices}
                availability={resolvedAccountOptions.status}
                createAccountLabel={labels.accountsCreate}
                createFirstAccountLabel={labels.accountsCreateFirst}
                disabled={!financialFieldsAvailable}
                disabledAccountIds={[...disabledAccountIds, ...(draft.toAccount ? [draft.toAccount] : [])]}
                disabledAccountLabel={labels.financialAccountUnavailable}
                emptyDescription={labels.accountsEmptyDescription}
                emptyTitle={labels.accountsEmptyTitle}
                error={errors.fromAccount}
                helperText={financialFieldsAvailable ? undefined : labels.financialCorrectionUnavailable}
                label={labels.fromAccount}
                noResultsLabel={labels.accountsNoResults}
                onValueChange={(fromAccount) => onDraftChange({ fromAccount })}
                placeholder={labels.accountPlaceholder}
                preferredCurrency={transaction.amount.currency}
                searchPlaceholder={labels.accountSearch}
                value={draft.fromAccount}
              />
              <TransactionAccountField
                accountLoadError={labels.accountValidationUnavailable}
                accounts={accountChoices}
                availability={resolvedAccountOptions.status}
                createAccountLabel={labels.accountsCreate}
                createFirstAccountLabel={labels.accountsCreateFirst}
                disabled={!financialFieldsAvailable}
                disabledAccountIds={[...disabledAccountIds, ...(draft.fromAccount ? [draft.fromAccount] : [])]}
                disabledAccountLabel={labels.financialAccountUnavailable}
                emptyDescription={labels.accountsEmptyDescription}
                emptyTitle={labels.accountsEmptyTitle}
                error={errors.toAccount}
                helperText={financialFieldsAvailable ? undefined : labels.financialCorrectionUnavailable}
                label={labels.toAccount}
                noResultsLabel={labels.accountsNoResults}
                onValueChange={(toAccount) => onDraftChange({ toAccount})}
                placeholder={labels.accountPlaceholder}
                preferredCurrency={transaction.amount.currency}
                searchPlaceholder={labels.accountSearch}
                value={draft.toAccount}
              />
            </div>
          ) : null}

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
        {!classification.hasChanges ? <p className="mr-auto text-[12px] text-[#71809a]">{labels.noChanges}</p> : null}
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
          aria-describedby={!classification.hasChanges ? "transaction-edit-no-changes" : undefined}
          className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1e55d1] focus-visible:ring-[#5e8fe8]/35"
          disabled={!classification.hasChanges || isSaving}
          type="submit"
        >
          {isSaving ? labels.saving : classification.hasFinancialChanges ? labels.reviewCorrection : labels.save}
        </Button>
        {!classification.hasChanges ? <span className="sr-only" id="transaction-edit-no-changes">{labels.noChanges}</span> : null}
      </div>
    </form>
  );
}

function TransactionLocks({ labels }: { readonly labels: TransactionEditLabels }) {
  return (
    <section aria-label={labels.readOnly} className="rounded-[9px] border border-[#e6eaf0] bg-[#f8faff] px-3.5 py-3">
      <p className="text-[11px] font-medium tracking-[0.04em] text-[#71809a] uppercase">{labels.readOnly}</p>
      <p className="mt-1 text-[12px] leading-5 text-[#53627b]">{labels.currencyLocked} {labels.typeLocked}</p>
    </section>
  );
}

function getEditAccountChoices(
  accountOptions: TransactionAccountOptionsState,
  transaction: TransactionDetailData,
): readonly TransactionAccountOption[] {
  const choices = [...accountOptions.accounts];
  const historicAccounts = transaction.kind === "TRANSFER"
    ? [transaction.account, transaction.transferAccount]
    : [transaction.account];

  for (const account of historicAccounts) {
    if (account && !choices.some((choice) => choice.id === account.id)) {
      choices.push(detailAccountAsOption(account));
    }
  }

  return choices;
}

function detailAccountAsOption(account: TransactionDetailAccount): TransactionAccountOption {
  return { id: account.id, name: account.name, currency: toCurrencyCode(account.currency), type: account.type };
}

function getDisabledAccountIds(
  choices: readonly TransactionAccountOption[],
  activeAccounts: readonly TransactionAccountOption[],
  currency: string,
): readonly string[] {
  const activeIds = new Set(activeAccounts.map((account) => account.id));
  return choices
    .filter((account) => !activeIds.has(account.id) || account.currency !== currency)
    .map((account) => account.id);
}
