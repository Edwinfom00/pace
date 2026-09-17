"use client";

import { useRef, useState, useTransition } from "react";
import { FiPlus } from "react-icons/fi";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { TransactionAccountOptionsState } from "@/modules/transactions/domain/transaction-account-options";
import type {
  TransactionCategoryOption,
  TransactionCategoryOptionsState,
} from "@/modules/transactions/domain/transaction-category-options";
import { getCompatibleTransactionCategoryOptions } from "@/modules/transactions/domain/transaction-category-options";
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
import type { TransactionAccountOption } from "./transaction-account.types";
import { TransactionAccountField } from "./transaction-account-field";
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

export function validateTransactionDraft(
  draft: TransactionFormDraft,
  accounts: readonly TransactionAccountOption[],
  categories: readonly TransactionCategoryOption[],
): TransactionFormValidationResult {
  const availableAccountIds = new Set(accounts.map((account) => account.id));
  let result: TransactionFormValidationResult;

  if (draft.kind === "EXPENSE") {
    result = validateTransactionForm({ kind: "EXPENSE", ...draft.expense });
  } else if (draft.kind === "INCOME") {
    result = validateTransactionForm({ kind: "INCOME", ...draft.income });
  } else {
    const fromAccount = accounts.find((account) => account.id === draft.transfer.fromAccount);
    const toAccount = accounts.find((account) => account.id === draft.transfer.toAccount);
    result = validateTransactionForm({
      kind: "TRANSFER",
      ...draft.transfer,
      fromAccountCurrency: fromAccount?.currency,
      toAccountCurrency: toAccount?.currency,
    });
  }

  const errors = { ...result.errors };
  const unavailable = (accountId: string, field: "account" | "fromAccount" | "toAccount") => {
    if (accountId && !availableAccountIds.has(accountId)) {
      errors[field] ??= "transactions.validation.accountUnavailable";
    }
  };
  if (draft.kind === "TRANSFER") {
    unavailable(draft.transfer.fromAccount, "fromAccount");
    unavailable(draft.transfer.toAccount, "toAccount");
  } else {
    unavailable(draft.kind === "EXPENSE" ? draft.expense.account : draft.income.account, "account");
    const category = draft.kind === "EXPENSE" ? draft.expense.category : draft.income.category;
    if (category && !getCompatibleTransactionCategoryOptions(categories, draft.kind).some((candidate) => candidate.id === category)) {
      errors.category ??= "transactions.validation.categoryUnavailable";
    }
  }

  return Object.keys(errors).length === 0 ? result : { isValid: false, errors };
}

/** Removes selections that no longer exist in the active workspace's account projection. */
export function clearUnavailableTransactionAccountSelections(
  draft: TransactionFormDraft,
  accounts: readonly TransactionAccountOption[],
): TransactionFormDraft {
  const accountIds = new Set(accounts.map((account) => account.id));
  const expenseAccount = accountIds.has(draft.expense.account) ? draft.expense.account : "";
  const incomeAccount = accountIds.has(draft.income.account) ? draft.income.account : "";
  const fromAccount = accountIds.has(draft.transfer.fromAccount) ? draft.transfer.fromAccount : "";
  const toAccount = accountIds.has(draft.transfer.toAccount) ? draft.transfer.toAccount : "";

  if (
    expenseAccount === draft.expense.account
    && incomeAccount === draft.income.account
    && fromAccount === draft.transfer.fromAccount
    && toAccount === draft.transfer.toAccount
  ) {
    return draft;
  }

  return {
    ...draft,
    expense: { ...draft.expense, account: expenseAccount },
    income: { ...draft.income, account: incomeAccount },
    transfer: { ...draft.transfer, fromAccount, toAccount },
  };
}

/** Removes category IDs that are no longer compatible with the current workspace projection. */
export function clearUnavailableTransactionCategorySelections(
  draft: TransactionFormDraft,
  categories: readonly TransactionCategoryOption[],
): TransactionFormDraft {
  const hasCategory = (categoryId: string, kind: "EXPENSE" | "INCOME") =>
    !categoryId || categories.some((category) => category.id === categoryId && category.kind === kind);
  const expenseCategory = hasCategory(draft.expense.category, "EXPENSE") ? draft.expense.category : "";
  const incomeCategory = hasCategory(draft.income.category, "INCOME") ? draft.income.category : "";

  if (expenseCategory === draft.expense.category && incomeCategory === draft.income.category) return draft;

  return {
    ...draft,
    expense: { ...draft.expense, category: expenseCategory },
    income: { ...draft.income, category: incomeCategory },
  };
}

export function TransactionCreateControl({
  accountOptions,
  categoryOptions,
  defaultCurrency,
  labels,
  language,
  locale,
  timeZone,
}: {
  readonly accountOptions: TransactionAccountOptionsState;
  readonly categoryOptions: TransactionCategoryOptionsState;
  readonly defaultCurrency: string;
  readonly labels: TransactionUiLabels;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
}) {
  const router = useRouter();
  const [isRetryingAccounts, startAccountRetry] = useTransition();
  const [isRetryingCategories, startCategoryRetry] = useTransition();
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
      expense: { ...accountDraft, category: "", merchant: "" },
      income: { ...accountDraft, category: "", source: "" },
      transfer: { ...commonDraft, fromAccount: "", toAccount: "" },
    };
  });
  const [createAccountTarget, setCreateAccountTarget] = useState<AccountCreationTarget>("EXPENSE_ACCOUNT");
  const [createAccountDraft, setCreateAccountDraft] = useState<CreateAccountFormDraft>({
    name: "",
    type: "",
    currency: "",
    openingBalance: "",
  });
  const [validationErrors, setValidationErrors] = useState<TransactionFormErrorsByKind>(emptyTransactionFormErrors);
  const [submittedKinds, setSubmittedKinds] = useState<SubmittedTransactionFormKinds>(emptySubmittedTransactionFormKinds);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const currencyTriggerRef = useRef<HTMLButtonElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const fromAccountTriggerRef = useRef<HTMLButtonElement>(null);
  const toAccountTriggerRef = useRef<HTMLButtonElement>(null);
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const timeTriggerRef = useRef<HTMLButtonElement>(null);
  const merchantInputRef = useRef<HTMLInputElement>(null);
  const noteTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const kind = formDraft.kind;
  const activeAccountDraft = kind === "INCOME" ? formDraft.income : formDraft.expense;
  const accounts = accountOptions.accounts;
  const accountAvailability = isRetryingAccounts ? "loading" : accountOptions.status;
  const categories = categoryOptions.categories;
  const categoryAvailability = isRetryingCategories ? "loading" : categoryOptions.status;
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
        case "category":
          categoryTriggerRef.current?.focus();
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
    categoriesForValidation: readonly TransactionCategoryOption[] = categories,
  ) {
    setFormDraft(nextDraft);
    if (!submittedKinds[nextDraft.kind]) return;

    const result = validateTransactionDraft(nextDraft, accountsForValidation, categoriesForValidation);
    setValidationErrors((current) => ({ ...current, [nextDraft.kind]: result.errors }));
  }

  function handlePrimaryAction() {
    const result = validateTransactionDraft(formDraft, accounts, categories);
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
    setValidationErrors(emptyTransactionFormErrors());
    setSubmittedKinds(emptySubmittedTransactionFormKinds());
    setCreateAccountDraft({ name: "", type: "", currency: "", openingBalance: "" });
  }

  function retryAccounts() {
    startAccountRetry(() => router.refresh());
  }

  function retryCategories() {
    startCategoryRetry(() => router.refresh());
  }

  function selectAccount(accountId: string) {
    const account = accounts.find((candidate) => candidate.id === accountId);
    if (formDraft.kind === "EXPENSE") {
      updateExpenseDraft({ account: accountId, currency: account?.currency ?? formDraft.expense.currency });
    } else if (formDraft.kind === "INCOME") {
      updateIncomeDraft({ account: accountId, currency: account?.currency ?? formDraft.income.currency });
    }
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
            onDraftChange={setCreateAccountDraft}
          />
        ) : kind === "TRANSFER" ? (
          <TransactionTransferForm
            accountAvailability={accountAvailability}
            accountLoadError={labels.accountLoadError}
            accountLoadingLabel={labels.accountLoading}
            accountRetryLabel={labels.errorRetry}
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
            onRetryAccounts={retryAccounts}
            noteTextAreaRef={noteTextAreaRef}
            timeZone={timeZone}
            timeTriggerRef={timeTriggerRef}
            toAccountTriggerRef={toAccountTriggerRef}
          />
        ) : (
          <div className="grid gap-4">
            <TransactionAmountField
              currency={activeAccountDraft.currency}
              currencyDisabled={Boolean(accounts.find((account) => account.id === activeAccountDraft.account))}
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
                  availability={categoryAvailability}
                  categories={categories}
                  categoryEmptyLabel={labels.categoryEmpty}
                  categoryLoadError={labels.categoryLoadError}
                  categoryLoadingLabel={labels.categoryLoading}
                  categoryRetryLabel={labels.errorRetry}
                  error={activeDisplayErrors.category}
                  helperText={labels.formCategoryHelper}
                  kind="INCOME"
                  label={labels.formCategory}
                  onRetryCategories={retryCategories}
                  onValueChange={(category) => updateIncomeDraft({ category })}
                  placeholder={labels.formCategoryPlaceholder}
                  searchPlaceholder={labels.formCategorySearch}
                  triggerRef={categoryTriggerRef}
                  value={formDraft.income.category}
                />
              ) : (
                <TransactionCategoryField
                  availability={categoryAvailability}
                  categories={categories}
                  categoryEmptyLabel={labels.categoryEmpty}
                  categoryLoadError={labels.categoryLoadError}
                  categoryLoadingLabel={labels.categoryLoading}
                  categoryRetryLabel={labels.errorRetry}
                  error={activeDisplayErrors.category}
                  helperText={labels.formCategoryHelper}
                  kind="EXPENSE"
                  label={labels.formCategory}
                  onRetryCategories={retryCategories}
                  onValueChange={(category) => updateExpenseDraft({ category })}
                  placeholder={labels.formCategoryPlaceholder}
                  searchPlaceholder={labels.formCategorySearch}
                  triggerRef={categoryTriggerRef}
                  value={formDraft.expense.category}
                />
              )}
            </div>

            <TransactionAccountField
              availability={accountAvailability}
              accountLoadError={labels.accountLoadError}
              accountLoadingLabel={labels.accountLoading}
              accountRetryLabel={labels.errorRetry}
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
              onRetryAccounts={retryAccounts}
              onValueChange={selectAccount}
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
