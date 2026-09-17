"use client";

import type { RefObject } from "react";
import { FiArrowDown } from "react-icons/fi";

import type { LedgerAccountType } from "@/modules/ledger/domain";
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

export type { TransferTransactionFormDraft } from "@/modules/transactions/schemas/transaction-form.schema";

export function TransactionTransferForm({
  accountTypeLabels,
  accounts,
  amountInputRef,
  currencyTriggerRef,
  dateTriggerRef,
  draft,
  errors = {},
  fromAccountTriggerRef,
  labels,
  language,
  locale,
  onCreateAccount,
  onDraftChange,
  noteTextAreaRef,
  timeZone,
  timeTriggerRef,
  toAccountTriggerRef,
}: {
  readonly accountTypeLabels: Readonly<Record<LedgerAccountType, string>>;
  readonly accounts: readonly TransactionAccountOption[];
  readonly amountInputRef?: RefObject<HTMLInputElement | null>;
  readonly currencyTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly dateTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly draft: TransferTransactionFormDraft;
  readonly errors?: Readonly<Partial<Record<keyof TransactionFormErrors, string>>>;
  readonly fromAccountTriggerRef: RefObject<HTMLButtonElement | null>;
  readonly labels: TransactionUiLabels;
  readonly language: OnboardingLanguage;
  readonly locale: string;
  readonly onCreateAccount: (target: "FROM" | "TO") => void;
  readonly onDraftChange: (update: Partial<TransferTransactionFormDraft>) => void;
  readonly noteTextAreaRef?: RefObject<HTMLTextAreaElement | null>;
  readonly timeZone: string;
  readonly timeTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly toAccountTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="grid gap-4">
      <TransactionAmountField
        currency={draft.currency}
        currencyError={errors.currency}
        currencyEmptyLabel={labels.formCurrencyEmpty}
        currencyLabel={labels.formCurrency}
        currencySearchPlaceholder={labels.formCurrencySearch}
        currencyTriggerRef={currencyTriggerRef}
        error={errors.amount}
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
          accountTypeLabels={accountTypeLabels}
          accounts={accounts}
          createAccountLabel={labels.accountsCreate}
          createFirstAccountLabel={labels.accountsCreateFirst}
          disabledAccountIds={getTransferDisabledAccountIds(draft.toAccount)}
          disabledAccountLabel={labels.formAccountUnavailable}
          emptyDescription={labels.accountsEmptyDescription}
          emptyTitle={labels.accountsEmptyTitle}
          error={errors.fromAccount}
          label={labels.formFromAccount}
          noResultsLabel={labels.accountsSearchNoResults}
          onCreateAccount={() => onCreateAccount("FROM")}
          onValueChange={(fromAccount) => onDraftChange({ fromAccount })}
          placeholder={labels.formFromAccountPlaceholder}
          searchPlaceholder={labels.formAccountSearch}
          triggerRef={fromAccountTriggerRef}
          value={draft.fromAccount}
        />

        <div aria-hidden="true" className="flex h-5 items-center justify-center text-[#71809a]">
          <FiArrowDown className="size-4" />
        </div>

        <TransactionAccountField
          accountTypeLabels={accountTypeLabels}
          accounts={accounts}
          createAccountLabel={labels.accountsCreate}
          createFirstAccountLabel={labels.accountsCreateFirst}
          disabledAccountIds={getTransferDisabledAccountIds(draft.fromAccount)}
          disabledAccountLabel={labels.formAccountUnavailable}
          emptyDescription={labels.accountsEmptyDescription}
          emptyTitle={labels.accountsEmptyTitle}
          error={errors.toAccount}
          label={labels.formToAccount}
          noResultsLabel={labels.accountsSearchNoResults}
          onCreateAccount={() => onCreateAccount("TO")}
          onValueChange={(toAccount) => onDraftChange({ toAccount })}
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
