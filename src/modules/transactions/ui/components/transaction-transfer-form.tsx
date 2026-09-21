"use client";

import type { ReactNode, RefObject } from "react";
import { FiArrowDown } from "react-icons/fi";

import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import {
  getTransferDisabledAccountIds,
  type TransactionFormErrors,
  type TransferTransactionFormDraft,
} from "@/modules/transactions/schemas/transaction-form.schema";

import type { TransactionUiLabels } from "../transaction-ui-labels";
import type { TransactionAccountOption } from "./transaction-account.types";
import { TransactionAccountField } from "./transaction-account-field";
import { TransactionAmountField } from "./transaction-amount-field";
import { TransactionDateField } from "./transaction-date-field";
import { TransactionFormTip } from "./transaction-form-tip";
import { TransactionNoteField } from "./transaction-note-field";
import { TransactionTimeField } from "./transaction-time-field";
import type { TransactionBalanceLabels } from "./transaction-balance";

export type { TransferTransactionFormDraft } from "@/modules/transactions/schemas/transaction-form.schema";

export function TransactionTransferForm({
  accountAvailability,
  accountLoadError,
  accountLoadingLabel,
  accountRetryLabel,
  accountBalanceLabels,
  accounts,
  amountInputRef,
  amountError,
  amountErrorDetail,
  currencyTriggerRef,
  dateTriggerRef,
  draft,
  errors = {},
  fromAccountHelper,
  fromAccountTriggerRef,
  labels,
  language,
  locale,
  onCreateAccount,
  onDraftChange,
  onRetryAccounts,
  noteTextAreaRef,
  timeZone,
  timeTriggerRef,
  toAccountTriggerRef,
  toAccountHelper,
}: {
  readonly accountAvailability: "loading" | "ready" | "error";
  readonly accountLoadError: string;
  readonly accountLoadingLabel: string;
  readonly accountRetryLabel: string;
  readonly accountBalanceLabels?: TransactionBalanceLabels;
  readonly accounts: readonly TransactionAccountOption[];
  readonly amountInputRef?: RefObject<HTMLInputElement | null>;
  readonly amountError?: string;
  readonly amountErrorDetail?: string;
  readonly currencyTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly dateTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly draft: TransferTransactionFormDraft;
  readonly errors?: Readonly<Partial<Record<keyof TransactionFormErrors, string>>>;
  readonly fromAccountHelper?: ReactNode;
  readonly fromAccountTriggerRef: RefObject<HTMLButtonElement | null>;
  readonly labels: TransactionUiLabels;
  readonly language: OnboardingLanguage;
  readonly locale: string;
  readonly onCreateAccount: (target: "FROM" | "TO") => void;
  readonly onDraftChange: (update: Partial<TransferTransactionFormDraft>) => void;
  readonly onRetryAccounts: () => void;
  readonly noteTextAreaRef?: RefObject<HTMLTextAreaElement | null>;
  readonly timeZone: string;
  readonly timeTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly toAccountTriggerRef: RefObject<HTMLButtonElement | null>;
  readonly toAccountHelper?: ReactNode;
}) {
  const fromAccount = accounts.find((account) => account.id === draft.fromAccount);
  const toAccount = accounts.find((account) => account.id === draft.toAccount);

  function updateAccount(
    field: "fromAccount" | "toAccount",
    accountId: string,
  ) {
    const selected = accounts.find((account) => account.id === accountId);
    const nextFrom = field === "fromAccount" ? selected : fromAccount;
    const nextTo = field === "toAccount" ? selected : toAccount;
    onDraftChange({
      [field]: accountId,
      currency: nextFrom?.currency ?? nextTo?.currency ?? draft.currency,
    });
  }

  return (
    <div className="grid gap-4">
      <TransactionAmountField
        currency={draft.currency}
        currencyDisabled={Boolean(fromAccount || toAccount)}
        currencyError={errors.currency}
        currencyEmptyLabel={labels.formCurrencyEmpty}
        currencyLabel={labels.formCurrency}
        currencySearchPlaceholder={labels.formCurrencySearch}
        currencyTriggerRef={currencyTriggerRef}
        error={amountError ?? errors.amount}
        errorDetail={amountErrorDetail}
        helperText={labels.formAmountTransferHelper}
        label={labels.formAmount}
        language={language}
        inputRef={amountInputRef}
        onCurrencyChange={(currency) => onDraftChange({ currency })}
        onValueChange={(amount) => onDraftChange({ amount })}
        value={draft.amount}
      />

      <div className="grid gap-2">
        <TransactionAccountField
          availability={accountAvailability}
          accountLoadError={accountLoadError}
          accountLoadingLabel={accountLoadingLabel}
          accountRetryLabel={accountRetryLabel}
          accounts={accounts}
          balanceKind="available"
          balanceLabels={accountBalanceLabels}
          createAccountLabel={labels.accountsCreate}
          createFirstAccountLabel={labels.accountsCreateFirst}
          disabledAccountIds={getTransferDisabledAccountIds(draft.toAccount)}
          disabledAccountLabel={labels.formAccountUnavailable}
          emptyDescription={labels.accountsEmptyDescription}
          emptyTitle={labels.accountsEmptyTitle}
          error={errors.fromAccount}
          helperText={fromAccountHelper}
          label={labels.formFromAccount}
          locale={locale}
          noResultsLabel={labels.accountsSearchNoResults}
          onCreateAccount={() => onCreateAccount("FROM")}
          onRetryAccounts={onRetryAccounts}
          onValueChange={(fromAccount) => updateAccount("fromAccount", fromAccount)}
          placeholder={labels.formFromAccountPlaceholder}
          searchPlaceholder={labels.formAccountSearch}
          triggerRef={fromAccountTriggerRef}
          value={draft.fromAccount}
        />

        <div aria-hidden="true" className="flex h-5 items-center justify-center text-[#71809a]">
          <FiArrowDown className="size-4" />
        </div>

        <TransactionAccountField
          availability={accountAvailability}
          accountLoadError={accountLoadError}
          accountLoadingLabel={accountLoadingLabel}
          accountRetryLabel={accountRetryLabel}
          accounts={accounts}
          balanceKind="current"
          balanceLabels={accountBalanceLabels}
          createAccountLabel={labels.accountsCreate}
          createFirstAccountLabel={labels.accountsCreateFirst}
          disabledAccountIds={getTransferDisabledAccountIds(draft.fromAccount)}
          disabledAccountLabel={labels.formAccountUnavailable}
          emptyDescription={labels.accountsEmptyDescription}
          emptyTitle={labels.accountsEmptyTitle}
          error={errors.toAccount}
          helperText={toAccountHelper}
          label={labels.formToAccount}
          locale={locale}
          noResultsLabel={labels.accountsSearchNoResults}
          onCreateAccount={() => onCreateAccount("TO")}
          onRetryAccounts={onRetryAccounts}
          onValueChange={(toAccount) => updateAccount("toAccount", toAccount)}
          placeholder={labels.formToAccountPlaceholder}
          searchPlaceholder={labels.formAccountSearch}
          triggerRef={toAccountTriggerRef}
          value={draft.toAccount}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TransactionDateField
          error={errors.date}
          label={labels.formDate}
          locale={locale}
          onValueChange={(date) => onDraftChange({ date })}
          timeZone={timeZone}
          triggerRef={dateTriggerRef}
          value={draft.date}
        />
        <TransactionTimeField
          clearLabel={labels.actionRemove}
          error={errors.time}
          label={labels.formTime}
          locale={locale}
          onValueChange={(time) => onDraftChange({ time })}
          optionalLabel={labels.formOptional}
          placeholder={labels.formTimePlaceholder}
          triggerRef={timeTriggerRef}
          value={draft.time}
        />
      </div>

      <TransactionNoteField
        error={errors.note}
        label={labels.formNote}
        onValueChange={(note) => onDraftChange({ note })}
        optionalLabel={labels.formOptional}
        placeholder={labels.formNotePlaceholder}
        textAreaRef={noteTextAreaRef}
        value={draft.note}
      />

      <TransactionFormTip description={labels.formTipTransfer} title={labels.formTipTitle} />
    </div>
  );
}
