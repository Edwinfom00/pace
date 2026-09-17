"use client";

import { useMemo, useRef, useState } from "react";
import { FiPlus } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import type { LedgerAccountType } from "@/modules/ledger/domain";
import { transactionAccountFixtures } from "@/modules/transactions/dev/transaction-form.fixtures";
import {
  getFirstInvalidTransactionFormField,
  validateTransactionForm,
  type AccountTransactionFormDraft,
  type ExpenseTransactionFormDraft,
  type IncomeTransactionFormDraft,
  type TransactionFormCommonDraft,
  type TransactionFormDraft,
  type TransactionFormErrors,
  type TransactionFormField,
  type TransactionFormValidationResult,
} from "@/modules/transactions/schemas/transaction-form.schema";
import type { TransactionUiLabels } from "../transaction-ui-labels";

import { CreateAccountForm, type CreateAccountFormDraft } from "./create-account-form";
import { TransactionFormDialog, type TransactionDialogView } from "./transaction-form-dialog";
import { TransactionAmountField } from "./transaction-amount-field";
import { TransactionCategoryField } from "./transaction-category-field";
import type {
  ExpenseTransactionCategoryFixtureId,
  IncomeTransactionCategoryFixtureId,
} from "./transaction-category-fixtures";
import type { TransactionAccountOption } from "./transaction-account.types";
import { TransactionAccountField } from "./transaction-account-field";
import type { AccountDraftOption } from "./transaction-account.types";
import { TransactionMerchantField } from "./transaction-merchant-field";
import { TransactionDateField, getTransactionFormToday } from "./transaction-date-field";
import { TransactionFormFooter } from "./transaction-form-footer";
import { TransactionFormTip } from "./transaction-form-tip";
import { TransactionNoteField } from "./transaction-note-field";
import { TransactionTimeField } from "./transaction-time-field";
import { TransactionTransferForm } from "./transaction-transfer-form";
import type { TransactionFormKind } from "./transaction-type-selector";

export type AccountCreationTarget = "EXPENSE_ACCOUNT" | "INCOME_ACCOUNT" | "FROM" | "TO";

type TransactionFormErrorsByKind = Record<TransactionFormKind, TransactionFormErrors>;
type SubmittedTransactionFormKinds = Record<TransactionFormKind, boolean>;
type LocalizedTransactionFormErrors = Partial<Record<TransactionFormField, string>>;

export function emptyTransactionFormErrors(): TransactionFormErrorsByKind {
  return { EXPENSE: {}, INCOME: {}, TRANSFER: {} };
}

export function emptySubmittedTransactionFormKinds(): SubmittedTransactionFormKinds {
  return { EXPENSE: false, INCOME: false, TRANSFER: false };
}

function localizeTransactionFormErrors(
  labels: TransactionUiLabels,
  errors: TransactionFormErrors,
): LocalizedTransactionFormErrors {
  const localized: LocalizedTransactionFormErrors = {};

  for (const field of Object.keys(errors) as TransactionFormField[]) {
    const error = errors[field];
    if (error) localized[field] = labels.validation[error];
  }

  return localized;
}

function validateTransactionDraft(
  draft: TransactionFormDraft,
  accounts: readonly TransactionAccountOption[],
): TransactionFormValidationResult {
  if (draft.kind === "EXPENSE") {
    return validateTransactionForm({ kind: "EXPENSE", ...draft.expense });
  }

  if (draft.kind === "INCOME") {
    return validateTransactionForm({ kind: "INCOME", ...draft.income });
  }

  const fromAccount = accounts.find((account) => account.id === draft.transfer.fromAccount);
  const toAccount = accounts.find((account) => account.id === draft.transfer.toAccount);
  return validateTransactionForm({
    kind: "TRANSFER",
    ...draft.transfer,
    fromAccountCurrency: fromAccount?.currency,
    toAccountCurrency: toAccount?.currency,
  });
}

export function assignCreatedAccountToTransactionDraft(
  draft: TransactionFormDraft,
  target: AccountCreationTarget,
  accountId: string,
): TransactionFormDraft {
  if (target === "INCOME_ACCOUNT") {
    return { ...draft, income: { ...draft.income, account: accountId } };
  }
  if (target === "FROM") {
    return { ...draft, transfer: { ...draft.transfer, fromAccount: accountId } };
  }
  if (target === "TO") {
    return { ...draft, transfer: { ...draft.transfer, toAccount: accountId } };
  }
  return { ...draft, expense: { ...draft.expense, account: accountId } };
}

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
  const [validationErrors, setValidationErrors] = useState<TransactionFormErrorsByKind>(emptyTransactionFormErrors);
  const [submittedKinds, setSubmittedKinds] = useState<SubmittedTransactionFormKinds>(emptySubmittedTransactionFormKinds);
  const localAccountId = useRef(0);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const currencyTriggerRef = useRef<HTMLButtonElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const fromAccountTriggerRef = useRef<HTMLButtonElement>(null);
  const toAccountTriggerRef = useRef<HTMLButtonElement>(null);
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const timeTriggerRef = useRef<HTMLButtonElement>(null);
  const merchantInputRef = useRef<HTMLInputElement>(null);
  const noteTextAreaRef = useRef<HTMLTextAreaElement>(null);
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
  const accounts = useMemo(() => [...transactionAccountFixtures, ...createdAccounts], [createdAccounts]);
  const activeErrors = validationErrors[kind];
  const activeDisplayErrors = localizeTransactionFormErrors(labels, activeErrors);

  function focusFirstInvalidField(errors: TransactionFormErrors) {
    const field = getFirstInvalidTransactionFormField(kind, errors);
    if (!field) return;

    requestAnimationFrame(() => {
      switch (field) {
        case "amount":
          amountInputRef.current?.focus();
          break;
        case "currency":
          currencyTriggerRef.current?.focus();
          break;
        case "account":
          accountTriggerRef.current?.focus();
          break;
        case "fromAccount":
          fromAccountTriggerRef.current?.focus();
          break;
        case "toAccount":
          toAccountTriggerRef.current?.focus();
          break;
        case "date":
          dateTriggerRef.current?.focus();
          break;
        case "time":
          timeTriggerRef.current?.focus();
          break;
        case "merchant":
        case "source":
          merchantInputRef.current?.focus();
          break;
        case "note":
          noteTextAreaRef.current?.focus();
          break;
      }
    });
  }

  function commitTransactionDraft(
    nextDraft: TransactionFormDraft,
    accountsForValidation: readonly TransactionAccountOption[] = accounts,
  ) {
    setFormDraft(nextDraft);
    if (!submittedKinds[nextDraft.kind]) return;

    const result = validateTransactionDraft(nextDraft, accountsForValidation);
    setValidationErrors((current) => ({ ...current, [nextDraft.kind]: result.errors }));
  }

  function handlePrimaryAction() {
    const result = validateTransactionDraft(formDraft, accounts);
    setSubmittedKinds((current) => ({ ...current, [kind]: true }));
    setValidationErrors((current) => ({ ...current, [kind]: result.errors }));
    if (!result.isValid) focusFirstInvalidField(result.errors);
  }

  function updateCurrentDraft(update: Partial<TransactionFormCommonDraft>) {
    if (formDraft.kind === "EXPENSE") {
      commitTransactionDraft({ ...formDraft, expense: { ...formDraft.expense, ...update } });
    } else if (formDraft.kind === "INCOME") {
      commitTransactionDraft({ ...formDraft, income: { ...formDraft.income, ...update } });
    } else {
      commitTransactionDraft({ ...formDraft, transfer: { ...formDraft.transfer, ...update } });
    }
  }

  function updateExpenseDraft(update: Partial<ExpenseTransactionFormDraft>) {
    commitTransactionDraft({ ...formDraft, expense: { ...formDraft.expense, ...update } });
  }

  function updateIncomeDraft(update: Partial<IncomeTransactionFormDraft>) {
    commitTransactionDraft({ ...formDraft, income: { ...formDraft.income, ...update } });
  }

  function handleKindChange(nextKind: TransactionFormKind) {
    setFormDraft({ ...formDraft, kind: nextKind });
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
    setValidationErrors(emptyTransactionFormErrors());
    setSubmittedKinds(emptySubmittedTransactionFormKinds());
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

    const nextAccounts = [...accounts, createdAccount];
    const nextDraft = assignCreatedAccountToTransactionDraft(formDraft, createAccountTarget, createdAccount.id);

    setCreatedAccounts((current) => [...current, createdAccount]);
    commitTransactionDraft(nextDraft, nextAccounts);
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
            onPrimaryAction={handlePrimaryAction}
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
            amountInputRef={amountInputRef}
            currencyTriggerRef={currencyTriggerRef}
            dateTriggerRef={dateTriggerRef}
            draft={formDraft.transfer}
            errors={activeDisplayErrors}
            fromAccountTriggerRef={fromAccountTriggerRef}
            labels={labels}
            language={language}
            locale={locale}
            onCreateAccount={handleCreateAccountRequest}
            onDraftChange={(update) => commitTransactionDraft({
              ...formDraft,
              transfer: { ...formDraft.transfer, ...update },
            })}
            noteTextAreaRef={noteTextAreaRef}
            timeZone={timeZone}
            timeTriggerRef={timeTriggerRef}
            toAccountTriggerRef={toAccountTriggerRef}
          />
        ) : (
          <div className="grid gap-4">
            <TransactionAmountField
              currency={activeAccountDraft.currency}
              currencyError={activeDisplayErrors.currency}
              currencyEmptyLabel={labels.formCurrencyEmpty}
              currencyLabel={labels.formCurrency}
              currencySearchPlaceholder={labels.formCurrencySearch}
              currencyTriggerRef={currencyTriggerRef}
              error={activeDisplayErrors.amount}
              helperText={kind === "INCOME" ? labels.formAmountIncomeHelper : labels.formAmountExpenseHelper}
              label={labels.formAmount}
              language={language}
              inputRef={amountInputRef}
              onCurrencyChange={(currency) => updateCurrentDraft({ currency })}
              onValueChange={(amount) => updateCurrentDraft({ amount })}
              value={activeAccountDraft.amount}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TransactionMerchantField
                error={kind === "INCOME" ? activeDisplayErrors.source : activeDisplayErrors.merchant}
                helperText={kind === "INCOME" ? labels.formSourceHelper : labels.formMerchantHelper}
                label={kind === "INCOME" ? labels.formSource : labels.formMerchant}
                onValueChange={(value) => {
                  if (kind === "INCOME") updateIncomeDraft({ source: value });
                  else updateExpenseDraft({ merchant: value });
                }}
                placeholder={kind === "INCOME" ? labels.formSourcePlaceholder : labels.formMerchantPlaceholder}
                inputRef={merchantInputRef}
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
                  value={formDraft.income.category as IncomeTransactionCategoryFixtureId}
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
                  value={formDraft.expense.category as ExpenseTransactionCategoryFixtureId}
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
              error={activeDisplayErrors.account}
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
              triggerRef={accountTriggerRef}
              value={activeAccountDraft.account}
            />

            <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <TransactionDateField
                error={activeDisplayErrors.date}
                label={labels.formDate}
                locale={locale}
                onValueChange={(date) => updateCurrentDraft({ date })}
                timeZone={timeZone}
                triggerRef={dateTriggerRef}
                value={activeAccountDraft.date}
              />
              <TransactionTimeField
                clearLabel={labels.actionRemove}
                error={activeDisplayErrors.time}
                label={labels.formTime}
                locale={locale}
                onValueChange={(time) => updateCurrentDraft({ time })}
                optionalLabel={labels.formOptional}
                placeholder={labels.formTimePlaceholder}
                triggerRef={timeTriggerRef}
                value={activeAccountDraft.time}
              />
            </div>

            <TransactionNoteField
              error={activeDisplayErrors.note}
              label={labels.formNote}
              onValueChange={(note) => updateCurrentDraft({ note })}
              optionalLabel={labels.formOptional}
              placeholder={labels.formNotePlaceholder}
              textAreaRef={noteTextAreaRef}
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
