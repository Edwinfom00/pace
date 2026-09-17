"use client";

import { useRef, useState } from "react";
import { FiPlus } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import type { LedgerAccountType } from "@/modules/ledger/domain";
import { transactionAccountFixtures } from "@/modules/transactions/dev/transaction-form.fixtures";
import type { TransactionUiLabels } from "../transaction-ui-labels";

import { CreateAccountForm, type CreateAccountFormDraft } from "./create-account-form";
import { TransactionFormDialog, type TransactionDialogView } from "./transaction-form-dialog";
import { TransactionAmountField } from "./transaction-amount-field";
import { TransactionCategoryField } from "./transaction-category-field";
import type {
  ExpenseTransactionCategoryFixtureId,
  IncomeTransactionCategoryFixtureId,
} from "./transaction-category-fixtures";
import { TransactionAccountField } from "./transaction-account-field";
import type { AccountDraftOption } from "./transaction-account.types";
import { TransactionMerchantField } from "./transaction-merchant-field";
import { TransactionDateField, getTransactionFormToday } from "./transaction-date-field";
import { TransactionFormFooter } from "./transaction-form-footer";
import { TransactionFormTip } from "./transaction-form-tip";
import { TransactionNoteField } from "./transaction-note-field";
import { TransactionTimeField } from "./transaction-time-field";
import {
  transactionFormKindLabels,
  type TransactionFormKind,
} from "./transaction-type-selector";

type TransactionFormCommonDraft = {
  readonly account: string;
  readonly amount: string;
  readonly currency: string;
  readonly date: Date;
  readonly note: string;
  readonly time: string;
};

type ExpenseTransactionFormDraft = TransactionFormCommonDraft & {
  readonly category: ExpenseTransactionCategoryFixtureId;
  readonly merchant: string;
};

type IncomeTransactionFormDraft = TransactionFormCommonDraft & {
  readonly category: IncomeTransactionCategoryFixtureId;
  readonly source: string;
};

type TransactionFormDraft = {
  readonly expense: ExpenseTransactionFormDraft;
  readonly income: IncomeTransactionFormDraft;
  readonly kind: TransactionFormKind;
  readonly transfer: TransactionFormCommonDraft;
};

export function TransactionCreateControl({
  defaultCurrency,
  labels,
  language,
  locale,
  timeZone,
}: {
  readonly defaultCurrency: string;
  readonly labels: TransactionUiLabels;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<TransactionDialogView>("transaction");
  const [formDraft, setFormDraft] = useState<TransactionFormDraft>(() => {
    const date = getTransactionFormToday(timeZone);
    const commonDraft = {
      account: "",
      amount: "",
      currency: defaultCurrency,
      date,
      note: "",
      time: "",
    } satisfies TransactionFormCommonDraft;

    return {
      kind: "EXPENSE",
      expense: { ...commonDraft, category: "other-expense", merchant: "" },
      income: { ...commonDraft, category: "salary", source: "" },
      transfer: commonDraft,
    };
  });
  const [createdAccounts, setCreatedAccounts] = useState<readonly AccountDraftOption[]>([]);
  const [createAccountDraft, setCreateAccountDraft] = useState<CreateAccountFormDraft>({
    name: "",
    type: "",
    currency: "",
    openingBalance: "",
  });
  const localAccountId = useRef(0);
  const kind = formDraft.kind;
  const activeDraft = kind === "EXPENSE" ? formDraft.expense : kind === "INCOME" ? formDraft.income : formDraft.transfer;
  const accountTypeLabels = {
    CASH: labels.accountTypeCash,
    CHECKING: labels.accountTypeChecking,
    SAVINGS: labels.accountTypeSavings,
    CREDIT_CARD: labels.accountTypeCreditCard,
    MOBILE_MONEY: labels.accountTypeMobileMoney,
    OTHER: labels.accountTypeOther,
  } satisfies Readonly<Record<LedgerAccountType, string>>;
  const accounts = [...transactionAccountFixtures, ...createdAccounts];

  function updateCurrentDraft(update: Partial<TransactionFormCommonDraft>) {
    setFormDraft((current) => {
      if (current.kind === "EXPENSE") return { ...current, expense: { ...current.expense, ...update } };
      if (current.kind === "INCOME") return { ...current, income: { ...current.income, ...update } };
      return { ...current, transfer: { ...current.transfer, ...update } };
    });
  }

  function updateExpenseDraft(update: Partial<ExpenseTransactionFormDraft>) {
    setFormDraft((current) => ({ ...current, expense: { ...current.expense, ...update } }));
  }

  function updateIncomeDraft(update: Partial<IncomeTransactionFormDraft>) {
    setFormDraft((current) => ({ ...current, income: { ...current.income, ...update } }));
  }

  function handleKindChange(nextKind: TransactionFormKind) {
    setFormDraft((current) => ({ ...current, kind: nextKind }));
  }

  function handleCreateAccountRequest() {
    setCreateAccountDraft((draft) => (draft.currency ? draft : { ...draft, currency: activeDraft.currency }));
    setView("create-account");
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) return;

    setView("transaction");
    setCreatedAccounts([]);
    setFormDraft((current) => ({
      ...current,
      expense: {
        ...current.expense,
        account: current.expense.account.startsWith("draft-account-") ? "" : current.expense.account,
      },
      income: {
        ...current.income,
        account: current.income.account.startsWith("draft-account-") ? "" : current.income.account,
      },
      transfer: {
        ...current.transfer,
        account: current.transfer.account.startsWith("draft-account-") ? "" : current.transfer.account,
      },
    }));
    setCreateAccountDraft({ name: "", type: "", currency: "", openingBalance: "" });
  }

  function handleCreateAccountDraft(draft: CreateAccountFormDraft & { readonly type: LedgerAccountType }) {
    const createdAccount: AccountDraftOption = {
      id: `draft-account-${localAccountId.current += 1}`,
      name: draft.name,
      type: draft.type,
      currency: draft.currency,
      openingBalance: draft.openingBalance,
      source: "local-draft",
    };

    setCreatedAccounts((current) => [...current, createdAccount]);
    updateCurrentDraft({ account: createdAccount.id });
    setCreateAccountDraft({ name: "", type: "", currency: "", openingBalance: "" });
    setView("transaction");
  }

  return (
    <>
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="h-9 rounded-[8px] bg-[#2563eb] px-3.5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30"
        onClick={() => setOpen(true)}
        type="button"
      >
        <FiPlus aria-hidden="true" className="size-4" />
        Add transaction
      </Button>

      <TransactionFormDialog
        createAccountHeader={{
          backLabel: labels.accountCreateBackToExpense,
          description: labels.accountCreateSubtitle,
          title: labels.accountCreateTitle,
        }}
        footer={kind === "TRANSFER" ? undefined : (
          <TransactionFormFooter
            cancelLabel={labels.actionCancel}
            onCancel={() => handleOpenChange(false)}
            primaryActionLabel={kind === "INCOME" ? labels.actionAddIncome : labels.actionAddExpense}
          />
        )}
        kind={kind}
        onBackToTransaction={() => setView("transaction")}
        onKindChange={handleKindChange}
        onOpenChange={handleOpenChange}
        open={open}
        view={view}
      >
        {view === "create-account" ? (
          <CreateAccountForm
            draft={createAccountDraft}
            labels={labels}
            language={language}
            onCancel={() => setView("transaction")}
            onCreateDraft={handleCreateAccountDraft}
            onDraftChange={setCreateAccountDraft}
          />
        ) : kind === "TRANSFER" ? (
          `${transactionFormKindLabels[kind]} form content`
        ) : (
          <div className="grid gap-4">
            <TransactionAmountField
              currency={activeDraft.currency}
              currencyEmptyLabel={labels.formCurrencyEmpty}
              currencyLabel={labels.formCurrency}
              currencySearchPlaceholder={labels.formCurrencySearch}
              helperText={kind === "INCOME" ? labels.formAmountIncomeHelper : labels.formAmountExpenseHelper}
              label={labels.formAmount}
              language={language}
              onCurrencyChange={(currency) => updateCurrentDraft({ currency })}
              onValueChange={(amount) => updateCurrentDraft({ amount })}
              value={activeDraft.amount}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TransactionMerchantField
                helperText={kind === "INCOME" ? labels.formSourceHelper : labels.formMerchantHelper}
                label={kind === "INCOME" ? labels.formSource : labels.formMerchant}
                onValueChange={(value) => {
                  if (kind === "INCOME") updateIncomeDraft({ source: value });
                  else updateExpenseDraft({ merchant: value });
                }}
                placeholder={kind === "INCOME" ? labels.formSourcePlaceholder : labels.formMerchantPlaceholder}
                value={kind === "INCOME" ? formDraft.income.source : formDraft.expense.merchant}
              />
              {kind === "INCOME" ? (
                <TransactionCategoryField
                  helperText={labels.formCategoryHelper}
                  kind="INCOME"
                  label={labels.formCategory}
                  language={language}
                  onValueChange={(category) => updateIncomeDraft({ category })}
                  placeholder={labels.formCategoryPlaceholder}
                  searchPlaceholder={labels.formCategorySearch}
                  value={formDraft.income.category}
                />
              ) : (
                <TransactionCategoryField
                  helperText={labels.formCategoryHelper}
                  kind="EXPENSE"
                  label={labels.formCategory}
                  language={language}
                  onValueChange={(category) => updateExpenseDraft({ category })}
                  placeholder={labels.formCategoryPlaceholder}
                  searchPlaceholder={labels.formCategorySearch}
                  value={formDraft.expense.category}
                />
              )}
            </div>

            <TransactionAccountField
              accountTypeLabels={accountTypeLabels}
              accounts={accounts}
              createAccountLabel={labels.accountsCreate}
              createFirstAccountLabel={labels.accountsCreateFirst}
              emptyDescription={labels.accountsEmptyDescription}
              emptyTitle={labels.accountsEmptyTitle}
              helperText={kind === "INCOME" ? labels.formAccountIncomeHelper : labels.formAccountHelper}
              label={labels.formAccount}
              noResultsLabel={labels.accountsSearchNoResults}
              onCreateAccount={handleCreateAccountRequest}
              onValueChange={(account) => updateCurrentDraft({ account })}
              placeholder={labels.formAccountPlaceholder}
              preferredCurrency={activeDraft.currency}
              searchPlaceholder={labels.formAccountSearch}
              value={activeDraft.account}
            />

            <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <TransactionDateField
                label={labels.formDate}
                locale={locale}
                onValueChange={(date) => updateCurrentDraft({ date })}
                timeZone={timeZone}
                value={activeDraft.date}
              />
              <TransactionTimeField
                clearLabel={labels.actionRemove}
                label={labels.formTime}
                locale={locale}
                onValueChange={(time) => updateCurrentDraft({ time })}
                optionalLabel={labels.formOptional}
                placeholder={labels.formTimePlaceholder}
                value={activeDraft.time}
              />
            </div>

            <TransactionNoteField
              label={labels.formNote}
              onValueChange={(note) => updateCurrentDraft({ note })}
              optionalLabel={labels.formOptional}
              placeholder={labels.formNotePlaceholder}
              value={activeDraft.note}
            />

            <TransactionFormTip
              description={kind === "INCOME" ? labels.formTipIncome : labels.formTipExpense}
              title={labels.formTipTitle}
            />
          </div>
        )}
      </TransactionFormDialog>
    </>
  );
}
