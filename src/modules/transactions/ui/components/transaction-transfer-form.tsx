"use client";

import type { RefObject } from "react";
import { FiArrowDown } from "react-icons/fi";

import type { LedgerAccountType } from "@/modules/ledger/domain";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

import type { TransactionUiLabels } from "../transaction-ui-labels";
import type { TransactionAccountOption } from "./transaction-account.types";
import { TransactionAccountField } from "./transaction-account-field";
import { TransactionAmountField } from "./transaction-amount-field";
import { TransactionDateField } from "./transaction-date-field";
import { TransactionFormTip } from "./transaction-form-tip";
import { TransactionNoteField } from "./transaction-note-field";
import { TransactionTimeField } from "./transaction-time-field";

export type TransferTransactionFormDraft = {
  readonly amount: string;
  readonly currency: string;
  readonly date: Date;
  readonly fromAccount: string;
  readonly note: string;
  readonly time: string;
  readonly toAccount: string;
};

export function TransactionTransferForm({
  accountTypeLabels,
  accounts,
  draft,
  fromAccountTriggerRef,
  labels,
  language,
  locale,
  onCreateAccount,
  onDraftChange,
  timeZone,
  toAccountTriggerRef,
}: {
  readonly accountTypeLabels: Readonly<Record<LedgerAccountType, string>>;
  readonly accounts: readonly TransactionAccountOption[];
  readonly draft: TransferTransactionFormDraft;
  readonly fromAccountTriggerRef: RefObject<HTMLButtonElement | null>;
  readonly labels: TransactionUiLabels;
  readonly language: OnboardingLanguage;
  readonly locale: string;
  readonly onCreateAccount: (target: "FROM" | "TO") => void;
  readonly onDraftChange: (update: Partial<TransferTransactionFormDraft>) => void;
  readonly timeZone: string;
  readonly toAccountTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="grid gap-4">
      <TransactionAmountField
        currency={draft.currency}
        currencyEmptyLabel={labels.formCurrencyEmpty}
        currencyLabel={labels.formCurrency}
        currencySearchPlaceholder={labels.formCurrencySearch}
        helperText={labels.formAmountTransferHelper}
        label={labels.formAmount}
        language={language}
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
          disabledAccountIds={draft.toAccount ? [draft.toAccount] : []}
          disabledAccountLabel={labels.formAccountUnavailable}
          emptyDescription={labels.accountsEmptyDescription}
          emptyTitle={labels.accountsEmptyTitle}
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
          disabledAccountIds={draft.fromAccount ? [draft.fromAccount] : []}
          disabledAccountLabel={labels.formAccountUnavailable}
          emptyDescription={labels.accountsEmptyDescription}
          emptyTitle={labels.accountsEmptyTitle}
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
          label={labels.formDate}
          locale={locale}
          onValueChange={(date) => onDraftChange({ date })}
          timeZone={timeZone}
          value={draft.date}
        />
        <TransactionTimeField
          clearLabel={labels.actionRemove}
          label={labels.formTime}
          locale={locale}
          onValueChange={(time) => onDraftChange({ time })}
          optionalLabel={labels.formOptional}
          placeholder={labels.formTimePlaceholder}
          value={draft.time}
        />
      </div>

      <TransactionNoteField
        label={labels.formNote}
        onValueChange={(note) => onDraftChange({ note })}
        optionalLabel={labels.formOptional}
        placeholder={labels.formNotePlaceholder}
        value={draft.note}
      />

      <TransactionFormTip description={labels.formTipTransfer} title={labels.formTipTitle} />
    </div>
  );
}
