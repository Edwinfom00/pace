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
import { TransactionTransferForm, type TransferTransactionFormDraft } from "./transaction-transfer-form";
import type { TransactionFormKind } from "./transaction-type-selector";

type TransactionFormCommonDraft = {
  readonly amount: string;
  readonly currency: string;
  readonly date: Date;
  readonly note: string;
  readonly time: string;
};

type AccountTransactionFormDraft = TransactionFormCommonDraft & {
  readonly account: string;
};

type ExpenseTransactionFormDraft = AccountTransactionFormDraft & {
  readonly category: ExpenseTransactionCategoryFixtureId;
  readonly merchant: string;
};

type IncomeTransactionFormDraft = AccountTransactionFormDraft & {
  readonly category: IncomeTransactionCategoryFixtureId;
  readonly source: string;
};

type AccountCreationTarget = "EXPENSE_ACCOUNT" | "INCOME_ACCOUNT" | "FROM" | "TO";

type TransactionFormDraft = {
  readonly expense: ExpenseTransactionFormDraft;
  readonly income: IncomeTransactionFormDraft;
  readonly kind: TransactionFormKind;
  readonly transfer: TransferTransactionFormDraft;
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
      amount: "",
      currency: defaultCurrency,
      date,
      note: "",
      time: "",
    } satisfies TransactionFormCommonDraft;
    const accountDraft = { ...commonDraft, account: "" } satisfies AccountTransactionFormDraft;

    return {
      kind: "EXPENSE",
      expense: { ...accountDraft, category: "other-expense", merchant: "" },
      income: { ...accountDraft, category: "salary", source: "" },
      transfer: { ...commonDraft, fromAccount: "", toAccount: "" },
    };
  });
  const [createdAccounts, setCreatedAccounts] = useState<readonly AccountDraftOption[]>([]);
  const [createAccountTarget, setCreateAccountTarget] = useState<AccountCreationTarget>("EXPENSE_ACCOUNT");
  const [createAccountDraft, setCreateAccountDraft] = useState<CreateAccountFormDraft>({
    name: "",
    type: "",
    currency: "",
    openingBalance: "",
  });
  const localAccountId = useRef(0);
  const fromAccountTriggerRef = useRef<HTMLButtonElement>(null);
  const toAccountTriggerRef = useRef<HTMLButtonElement>(null);
  const kind = formDraft.kind;
  const activeAccountDraft = kind === "INCOME" ? formDraft.income : formDraft.expense;
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

  function handleCreateAccountRequest(target: AccountCreationTarget) {
    const currency = target === "INCOME_ACCOUNT"
      ? formDraft.income.currency
      : target === "EXPENSE_ACCOUNT"
        ? formDraft.expense.currency
        : formDraft.transfer.currency;

    setCreateAccountTarget(target);
    setCreateAccountDraft((draft) => (draft.currency ? draft : { ...draft, currency }));
    setView("create-account");
  }

  function returnToTransaction() {
    setView("transaction");
    if (createAccountTarget !== "FROM" && createAccountTarget !== "TO") return;

    requestAnimationFrame(() => {
      (createAccountTarget === "FROM" ? fromAccountTriggerRef : toAccountTriggerRef).current?.focus();
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) return;

    setView("transaction");
    setCreateAccountTarget("EXPENSE_ACCOUNT");
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
        fromAccount: current.transfer.fromAccount.startsWith("draft-account-") ? "" : current.transfer.fromAccount,
        toAccount: current.transfer.toAccount.startsWith("draft-account-") ? "" : current.transfer.toAccount,
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
    setFormDraft((current) => {
      if (createAccountTarget === "INCOME_ACCOUNT") {
        return { ...current, income: { ...current.income, account: createdAccount.id } };
      }
      if (createAccountTarget === "FROM") {
        return { ...current, transfer: { ...current.transfer, fromAccount: createdAccount.id } };
      }
      if (createAccountTarget === "TO") {
        return { ...current, transfer: { ...current.transfer, toAccount: createdAccount.id } };
      }
      return { ...current, expense: { ...current.expense, account: createdAccount.id } };
    });
    setCreateAccountDraft({ name: "", type: "", currency: "", openingBalance: "" });
    returnToTransaction();
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
          backLabel: createAccountTarget === "FROM" || createAccountTarget === "TO" ? labels.accountCreateBackToTransfer : labels.accountCreateBackToExpense,
          description: labels.accountCreateSubtitle,
          title: labels.accountCreateTitle,
        }}
        footer={(
          <TransactionFormFooter
            cancelLabel={labels.actionCancel}
            onCancel={() => handleOpenChange(false)}
            primaryActionLabel={kind === "TRANSFER" ? labels.actionTransferMoney : kind === "INCOME" ? labels.actionAddIncome : labels.actionAddExpense}
          />
        )}
        kind={kind}
        onBackToTransaction={returnToTransaction}
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
            onCancel={returnToTransaction}
            onCreateDraft={handleCreateAccountDraft}
            onDraftChange={setCreateAccountDraft}
          />
        ) : kind === "TRANSFER" ? (
          <TransactionTransferForm
            accountTypeLabels={accountTypeLabels}
            accounts={accounts}
            draft={formDraft.transfer}
            fromAccountTriggerRef={fromAccountTriggerRef}
            labels={labels}
            language={language}
            locale={locale}
            onCreateAccount={handleCreateAccountRequest}
            onDraftChange={(update) => setFormDraft((current) => ({
              ...current,
              transfer: { ...current.transfer, ...update },
            }))}
            timeZone={timeZone}
            toAccountTriggerRef={toAccountTriggerRef}
          />
        ) : (
          <div className="grid gap-4">
            <TransactionAmountField
              currency={activeAccountDraft.currency}
              currencyEmptyLabel={labels.formCurrencyEmpty}
              currencyLabel={labels.formCurrency}
              currencySearchPlaceholder={labels.formCurrencySearch}
              helperText={kind === "INCOME" ? labels.formAmountIncomeHelper : labels.formAmountExpenseHelper}
              label={labels.formAmount}
              language={language}
              onCurrencyChange={(currency) => updateCurrentDraft({ currency })}
              onValueChange={(amount) => updateCurrentDraft({ amount })}
              value={activeAccountDraft.amount}
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
              onCreateAccount={() => handleCreateAccountRequest(kind === "INCOME" ? "INCOME_ACCOUNT" : "EXPENSE_ACCOUNT")}
              onValueChange={(account) => {
                if (kind === "INCOME") updateIncomeDraft({ account });
                else updateExpenseDraft({ account });
              }}
              placeholder={labels.formAccountPlaceholder}
              preferredCurrency={activeAccountDraft.currency}
              searchPlaceholder={labels.formAccountSearch}
              value={activeAccountDraft.account}
            />

            <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <TransactionDateField
                label={labels.formDate}
                locale={locale}
                onValueChange={(date) => updateCurrentDraft({ date })}
                timeZone={timeZone}
                value={activeAccountDraft.date}
              />
              <TransactionTimeField
                clearLabel={labels.actionRemove}
                label={labels.formTime}
                locale={locale}
                onValueChange={(time) => updateCurrentDraft({ time })}
                optionalLabel={labels.formOptional}
                placeholder={labels.formTimePlaceholder}
                value={activeAccountDraft.time}
              />
            </div>

            <TransactionNoteField
              label={labels.formNote}
              onValueChange={(note) => updateCurrentDraft({ note })}
              optionalLabel={labels.formOptional}
              placeholder={labels.formNotePlaceholder}
              value={activeAccountDraft.note}
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
