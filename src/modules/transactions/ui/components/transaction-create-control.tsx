"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FiPlus } from "react-icons/fi";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { CurrencyCode } from "@/money/currency";
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

import {
  CreateAccountForm,
  createEmptyCreateAccountFormDraft,
  type CreateAccountFormDraft,
} from "./create-account-form";
import {
  canAttachCreatedAccountToWorkspace,
  canStartCreateAccountSubmission,
  mapCreateAccountFailure,
  parseCreatedAccountDTO,
  selectCreatedAccountForTarget,
  validateCreateAccountForm,
  type AccountCreationTarget,
  type CreateAccountFormErrors,
} from "./create-account-flow";
import {
  createExpenseCommand,
  resetExpenseTransactionDraft,
  serverExpenseFieldErrors,
  submitCanonicalExpense,
} from "./expense-create-flow";
import {
  createIncomeCommand,
  resetIncomeTransactionDraft,
  serverIncomeFieldErrors,
  submitCanonicalIncome,
} from "./income-create-flow";
import {
  canStartManualTransactionSubmission,
  manualTransactionRetryKeyForCommand,
  manualTransactionReconciliationPlan,
  type ManualTransactionRetryKey,
} from "./manual-transaction-create-flow";
import {
  createTransferCommand,
  resetTransferTransactionDraft,
  serverTransferFieldErrors,
  submitCanonicalTransfer,
} from "./transfer-create-flow";
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
import {
  applyAuthoritativeBalanceOverride,
  formatTransactionBalance,
  validateOutgoingBalance,
  type InsufficientFundsDetails,
} from "./transaction-balance";
import { TransactionBalanceHint } from "./transaction-balance-hint";

export type { AccountCreationTarget } from "./create-account-flow";

type TransactionFormErrorsByKind = Record<TransactionFormKind, TransactionFormErrors>;
type SubmittedTransactionFormKinds = Record<TransactionFormKind, boolean>;
type LocalizedTransactionFormErrors = Partial<Record<TransactionFormField, string>>;
type TransactionFormMessagesByKind = Record<TransactionFormKind, string | null>;
type TransactionBalanceFeedbackByKind = Record<TransactionFormKind, InsufficientFundsDetails | null>;

type ManualTransactionMutationResult =
  | { readonly ok: true }
  | {
    readonly ok: false;
    readonly errors: TransactionFormErrors;
    readonly insufficientFunds?: InsufficientFundsDetails | null;
  };

type ManualTransactionMutation = {
  readonly kind: TransactionFormKind;
  readonly requestWorkspaceId: string;
  readonly execute: () => Promise<ManualTransactionMutationResult>;
  readonly onSucceeded: () => void;
  readonly genericFailure: string;
  readonly resetDraft: (draft: TransactionFormDraft) => TransactionFormDraft;
  readonly successAnnouncement: string;
};

function accountCreationErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const code = (payload as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function emptyTransactionFormErrors(): TransactionFormErrorsByKind {
  return { EXPENSE: {}, INCOME: {}, TRANSFER: {} };
}

export function emptySubmittedTransactionFormKinds(): SubmittedTransactionFormKinds {
  return { EXPENSE: false, INCOME: false, TRANSFER: false };
}

export function emptyTransactionFormMessages(): TransactionFormMessagesByKind {
  return { EXPENSE: null, INCOME: null, TRANSFER: null };
}

export function emptyTransactionBalanceFeedback(): TransactionBalanceFeedbackByKind {
  return { EXPENSE: null, INCOME: null, TRANSFER: null };
}

export function createTransactionFormDraft(
  defaultCurrency: CurrencyCode,
  timeZone: string,
): TransactionFormDraft {
  const commonDraft = {
    amount: "",
    currency: defaultCurrency,
    date: getTransactionFormToday(timeZone),
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
  options: { readonly accountAvailability?: "error" | "loading" | "ready" } = {},
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

  const debitAccountId = draft.kind === "EXPENSE" ? draft.expense.account : draft.kind === "TRANSFER" ? draft.transfer.fromAccount : "";
  const debitCurrency = draft.kind === "EXPENSE" ? draft.expense.currency : draft.kind === "TRANSFER" ? draft.transfer.currency : "";
  const debitAmount = draft.kind === "EXPENSE" ? draft.expense.amount : draft.kind === "TRANSFER" ? draft.transfer.amount : "";
  if (options.accountAvailability && debitAccountId) {
    const balanceValidation = validateOutgoingBalance({
      account: accounts.find((account) => account.id === debitAccountId),
      accountAvailability: options.accountAvailability,
      amount: debitAmount,
      currency: debitCurrency,
    });
    if (balanceValidation.status === "insufficient") {
      errors.amount ??= "transactions.validation.insufficientFunds";
    } else if (balanceValidation.status === "unavailable") {
      errors.amount ??= "transactions.validation.unableToVerifyBalance";
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
  workspaceId,
}: {
  readonly accountOptions: TransactionAccountOptionsState;
  readonly categoryOptions: TransactionCategoryOptionsState;
  readonly defaultCurrency: CurrencyCode;
  readonly labels: TransactionUiLabels;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const [isRetryingAccounts, startAccountRetry] = useTransition();
  const [isRetryingCategories, startCategoryRetry] = useTransition();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<TransactionDialogView>("transaction");
  const [formDraft, setFormDraft] = useState<TransactionFormDraft>(() => createTransactionFormDraft(defaultCurrency, timeZone));
  const [createAccountTarget, setCreateAccountTarget] = useState<AccountCreationTarget>("EXPENSE_ACCOUNT");
  const [createAccountDraft, setCreateAccountDraft] = useState<CreateAccountFormDraft>(() => createEmptyCreateAccountFormDraft(defaultCurrency));
  const [createAccountErrors, setCreateAccountErrors] = useState<CreateAccountFormErrors>({});
  const [createAccountFormError, setCreateAccountFormError] = useState<string | null>(null);
  const [createAccountAnnouncement, setCreateAccountAnnouncement] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [pendingTransactionKind, setPendingTransactionKind] = useState<TransactionFormKind | null>(null);
  const [transactionFormErrors, setTransactionFormErrors] = useState<TransactionFormMessagesByKind>(emptyTransactionFormMessages);
  const [transactionAnnouncements, setTransactionAnnouncements] = useState<TransactionFormMessagesByKind>(emptyTransactionFormMessages);
  const [transactionBalanceFeedback, setTransactionBalanceFeedback] = useState<TransactionBalanceFeedbackByKind>(emptyTransactionBalanceFeedback);
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
  const workspaceIdRef = useRef(workspaceId);
  const pendingTransactionKindRef = useRef<TransactionFormKind | null>(null);
  const manualTransactionRetryKeysRef = useRef<Partial<Record<TransactionFormKind, ManualTransactionRetryKey>>>({});
  const kind = formDraft.kind;
  const activeAccountDraft = kind === "INCOME" ? formDraft.income : formDraft.expense;
  const authoritativeAccounts = accountOptions.accounts;
  const accountAvailability = isRetryingAccounts ? "loading" : accountOptions.status;
  const accounts = applyAuthoritativeBalanceOverride(authoritativeAccounts, transactionBalanceFeedback[kind]);
  const categories = categoryOptions.categories;
  const categoryAvailability = isRetryingCategories ? "loading" : categoryOptions.status;
  const activeErrors = validationErrors[kind];
  const activeDisplayErrors = localizeTransactionFormErrors(labels, activeErrors);
  const isTransactionPending = pendingTransactionKind !== null;
  const selectedExpenseOrIncomeAccount = accounts.find((account) => account.id === activeAccountDraft.account);
  const selectedTransferFromAccount = accounts.find((account) => account.id === formDraft.transfer.fromAccount);
  const selectedTransferToAccount = accounts.find((account) => account.id === formDraft.transfer.toAccount);
  const outgoingBalanceValidation = kind === "EXPENSE"
    ? validateOutgoingBalance({
      account: selectedExpenseOrIncomeAccount,
      accountAvailability,
      amount: formDraft.expense.amount,
      currency: formDraft.expense.currency,
    })
    : kind === "TRANSFER"
      ? validateOutgoingBalance({
        account: selectedTransferFromAccount,
        accountAvailability,
        amount: formDraft.transfer.amount,
        currency: formDraft.transfer.currency,
      })
      : { status: "not-applicable" as const };
  const balanceFeedback = transactionBalanceFeedback[kind];
  const balanceError = outgoingBalanceValidation.status === "insufficient"
    ? labels.balance.insufficientFunds
    : outgoingBalanceValidation.status === "unavailable"
      ? labels.balance.unableToVerify
      : undefined;
  const balanceErrorDetail = balanceFeedback
    ? formatBalanceMessage(
      labels.balance.balanceChanged,
      { amount: formatBalanceDetail(balanceFeedback.availableBalanceMinor, balanceFeedback.currency, locale) },
    )
    : outgoingBalanceValidation.status === "insufficient"
      ? formatBalanceMessage(
        labels.balance.availableInAccount,
        {
          amount: formatBalanceDetail(outgoingBalanceValidation.availableBalanceMinor.toString(), outgoingBalanceValidation.account.currency, locale),
          account: outgoingBalanceValidation.account.name,
        },
      )
      : undefined;

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  useEffect(() => {
    setTransactionBalanceFeedback(emptyTransactionBalanceFeedback());
  }, [authoritativeAccounts]);

  function focusFirstInvalidField(kindToFocus: TransactionFormKind, errors: TransactionFormErrors) {
    const field = getFirstInvalidTransactionFormField(kindToFocus, errors);
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
    setTransactionFormErrors((current) => ({ ...current, [nextDraft.kind]: null }));
    setTransactionBalanceFeedback((current) => ({ ...current, [nextDraft.kind]: null }));
    if (!submittedKinds[nextDraft.kind]) return;

    const result = validateTransactionDraft(nextDraft, accountsForValidation, categoriesForValidation, { accountAvailability });
    setValidationErrors((current) => ({ ...current, [nextDraft.kind]: result.errors }));
  }

  function validateActiveTransactionDraft(): TransactionFormValidationResult {
    const result = validateTransactionDraft(formDraft, accounts, categories, { accountAvailability });
    setSubmittedKinds((current) => ({ ...current, [kind]: true }));
    setValidationErrors((current) => ({ ...current, [kind]: result.errors }));
    if (!result.isValid) focusFirstInvalidField(kind, result.errors);
    return result;
  }

  function handlePrimaryAction() {
    const result = validateActiveTransactionDraft();
    if (!result.isValid) return;
    if (kind === "EXPENSE") void submitExpense();
    if (kind === "INCOME") void submitIncome();
    if (kind === "TRANSFER") void submitTransfer();
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
    if (pendingTransactionKindRef.current) return;
    setFormDraft({ ...formDraft, kind: nextKind });
  }

  function handleCreateAccountRequest(target: AccountCreationTarget) {
    const currency = target === "INCOME_ACCOUNT"
      ? formDraft.income.currency
      : target === "EXPENSE_ACCOUNT"
        ? formDraft.expense.currency
        : formDraft.transfer.currency;

    setCreateAccountTarget(target);
    setCreateAccountErrors({});
    setCreateAccountFormError(null);
    setCreateAccountAnnouncement("");
    setCreateAccountDraft((draft) => (
      draft.name || draft.type || draft.openingBalance ? draft : createEmptyCreateAccountFormDraft(currency)
    ));
    setView("create-account");
  }

  function returnToTransaction() {
    if (isCreatingAccount) return;
    setView("transaction");
    if (createAccountTarget !== "TRANSFER_FROM" && createAccountTarget !== "TRANSFER_TO") return;

    requestAnimationFrame(() => {
      (createAccountTarget === "TRANSFER_FROM" ? fromAccountTriggerRef : toAccountTriggerRef).current?.focus();
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && (isCreatingAccount || pendingTransactionKindRef.current)) return;
    setOpen(nextOpen);
    if (nextOpen) return;

    setView("transaction");
    setCreateAccountTarget("EXPENSE_ACCOUNT");
    setCreateAccountErrors({});
    setCreateAccountFormError(null);
    setCreateAccountAnnouncement("");
    setValidationErrors(emptyTransactionFormErrors());
    setSubmittedKinds(emptySubmittedTransactionFormKinds());
    setCreateAccountDraft(createEmptyCreateAccountFormDraft(defaultCurrency));
    setTransactionFormErrors(emptyTransactionFormMessages());
    setTransactionAnnouncements(emptyTransactionFormMessages());
    setTransactionBalanceFeedback(emptyTransactionBalanceFeedback());
  }

  function updateCreateAccountDraft(nextDraft: CreateAccountFormDraft) {
    setCreateAccountDraft(nextDraft);
    setCreateAccountErrors({});
    setCreateAccountFormError(null);
    setCreateAccountAnnouncement("");
  }

  function formErrorForAccountCreation(code: ReturnType<typeof mapCreateAccountFailure>["code"]): string {
    if (code === "WORKSPACE_FORBIDDEN") return labels.accountCreateErrorWorkspaceForbidden;
    if (code === "WORKSPACE_CHANGED") return labels.accountCreateErrorWorkspaceChanged;
    return labels.accountCreateErrorGeneric;
  }

  async function submitCreateAccount() {
    if (!canStartCreateAccountSubmission(isCreatingAccount)) return;

    const requestWorkspaceId = workspaceIdRef.current;
    const requestTarget = createAccountTarget;
    const clientErrors = validateCreateAccountForm(requestWorkspaceId, createAccountDraft);
    if (Object.keys(clientErrors).length > 0) {
      setCreateAccountErrors(clientErrors);
      setCreateAccountFormError(null);
      return;
    }

    setCreateAccountErrors({});
    setCreateAccountFormError(null);
    setCreateAccountAnnouncement("");
    setIsCreatingAccount(true);

    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(requestWorkspaceId)}/ledger/accounts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: createAccountDraft.name,
          type: createAccountDraft.type,
          currency: createAccountDraft.currency,
          openingBalance: createAccountDraft.openingBalance,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const failure = mapCreateAccountFailure(accountCreationErrorCode(payload));
        if (failure.field) setCreateAccountErrors({ [failure.field]: true });
        else setCreateAccountFormError(formErrorForAccountCreation(failure.code));
        return;
      }

      const account = parseCreatedAccountDTO(payload);
      if (!account) {
        setCreateAccountFormError(labels.accountCreateErrorGeneric);
        return;
      }

      // A completed request belongs only to the workspace it was submitted for.
      // Never attach it to a transaction form that has since changed workspace.
      if (!canAttachCreatedAccountToWorkspace(requestWorkspaceId, workspaceIdRef.current)) {
        setCreateAccountFormError(labels.accountCreateErrorWorkspaceChanged);
        router.refresh();
        return;
      }

      // Keep the real returned ID in the draft, but never invent an account
      // option or a zero balance while the authoritative list refreshes.
      const nextDraft = selectCreatedAccountForTarget(formDraft, requestTarget, account, accounts);
      commitTransactionDraft(nextDraft);
      setCreateAccountDraft(createEmptyCreateAccountFormDraft(defaultCurrency));
      setCreateAccountErrors({});
      setCreateAccountFormError(null);
      setCreateAccountAnnouncement(labels.accountCreateSuccess);
      setView("transaction");
      requestAnimationFrame(() => {
        const trigger = requestTarget === "TRANSFER_FROM"
          ? fromAccountTriggerRef
          : requestTarget === "TRANSFER_TO"
            ? toAccountTriggerRef
            : accountTriggerRef;
        trigger.current?.focus();
      });
      router.refresh();
    } catch {
      setCreateAccountFormError(labels.accountCreateErrorGeneric);
    } finally {
      setIsCreatingAccount(false);
    }
  }

  async function submitManualTransaction(mutation: ManualTransactionMutation) {
    if (!canStartManualTransactionSubmission(Boolean(pendingTransactionKindRef.current))) return;

    pendingTransactionKindRef.current = mutation.kind;
    setPendingTransactionKind(mutation.kind);
    setTransactionFormErrors((current) => ({ ...current, [mutation.kind]: null }));
    setTransactionAnnouncements((current) => ({ ...current, [mutation.kind]: null }));

    try {
      const result = await mutation.execute();
      if (!result.ok) {
        const insufficientFunds = result.insufficientFunds ?? null;
        if (insufficientFunds) {
          const errors = { ...result.errors, amount: "transactions.validation.insufficientFunds" as const };
          setTransactionBalanceFeedback((current) => ({ ...current, [mutation.kind]: insufficientFunds }));
          setValidationErrors((current) => ({
            ...current,
            [mutation.kind]: { ...current[mutation.kind], ...errors },
          }));
          focusFirstInvalidField(mutation.kind, errors);
          // The structured conflict is canonical at the moment of rejection;
          // refresh the full account read rather than decrementing locally.
          router.refresh();
          return;
        }
        if (Object.keys(result.errors).length > 0) {
          setValidationErrors((current) => ({
            ...current,
            [mutation.kind]: { ...current[mutation.kind], ...result.errors },
          }));
          focusFirstInvalidField(mutation.kind, result.errors);
        } else {
          setTransactionFormErrors((current) => ({ ...current, [mutation.kind]: mutation.genericFailure }));
        }
        return;
      }

      // A DTO confirms persistence, but never becomes a speculative local row
      // or balance. Refresh server-owned financial projections instead.
      const reconciliation = manualTransactionReconciliationPlan(
        mutation.requestWorkspaceId,
        workspaceIdRef.current,
      );
      mutation.onSucceeded();
      if (!reconciliation.shouldResetDraft) {
        if (reconciliation.shouldRefreshData) router.refresh();
        return;
      }

      setFormDraft(mutation.resetDraft);
      setValidationErrors((current) => ({ ...current, [mutation.kind]: {} }));
      setSubmittedKinds((current) => ({ ...current, [mutation.kind]: false }));
      setTransactionFormErrors((current) => ({ ...current, [mutation.kind]: null }));
      setTransactionAnnouncements((current) => ({ ...current, [mutation.kind]: mutation.successAnnouncement }));
      if (reconciliation.shouldCloseDialog) setOpen(false);
      if (reconciliation.shouldRefreshData) router.refresh();
    } catch {
      setTransactionFormErrors((current) => ({ ...current, [mutation.kind]: mutation.genericFailure }));
    } finally {
      pendingTransactionKindRef.current = null;
      setPendingTransactionKind(null);
    }
  }

  function submitExpense() {
    const expenseValidation = validateTransactionForm({ kind: "EXPENSE", ...formDraft.expense });
    if (!expenseValidation.isValid || expenseValidation.value.kind !== "EXPENSE") return;

    const requestWorkspaceId = workspaceIdRef.current;
    const command = withManualTransactionIdempotency(
      "EXPENSE",
      createExpenseCommand(requestWorkspaceId, expenseValidation.value),
    );
    void submitManualTransaction({
      kind: "EXPENSE",
      requestWorkspaceId,
      onSucceeded: () => clearManualTransactionIdempotency("EXPENSE", command.idempotencyKey),
      genericFailure: labels.expenseCreateErrorGeneric,
      successAnnouncement: labels.expenseCreated,
      resetDraft: (current) => resetExpenseTransactionDraft(
        current,
        createTransactionFormDraft(defaultCurrency, timeZone).expense,
      ),
      execute: async () => {
        const result = await submitCanonicalExpense(command, postManualTransaction(requestWorkspaceId));
        return result.ok
          ? { ok: true }
          : {
            ok: false,
            errors: serverExpenseFieldErrors(result.failure),
            insufficientFunds: result.failure.insufficientFunds,
          };
      },
    });
  }

  function submitIncome() {
    const incomeValidation = validateTransactionForm({ kind: "INCOME", ...formDraft.income });
    if (!incomeValidation.isValid || incomeValidation.value.kind !== "INCOME") return;

    const requestWorkspaceId = workspaceIdRef.current;
    const command = withManualTransactionIdempotency(
      "INCOME",
      createIncomeCommand(requestWorkspaceId, incomeValidation.value),
    );
    void submitManualTransaction({
      kind: "INCOME",
      requestWorkspaceId,
      onSucceeded: () => clearManualTransactionIdempotency("INCOME", command.idempotencyKey),
      genericFailure: labels.incomeCreateErrorGeneric,
      successAnnouncement: labels.incomeCreated,
      resetDraft: (current) => resetIncomeTransactionDraft(
        current,
        createTransactionFormDraft(defaultCurrency, timeZone).income,
      ),
      execute: async () => {
        const result = await submitCanonicalIncome(command, postManualTransaction(requestWorkspaceId));
        return result.ok
          ? { ok: true }
          : {
            ok: false,
            errors: serverIncomeFieldErrors(result.failure),
            insufficientFunds: result.failure.insufficientFunds,
          };
      },
    });
  }

  function submitTransfer() {
    const transferValidation = validateTransactionForm({ kind: "TRANSFER", ...formDraft.transfer });
    if (!transferValidation.isValid || transferValidation.value.kind !== "TRANSFER") return;

    const requestWorkspaceId = workspaceIdRef.current;
    const command = withManualTransactionIdempotency(
      "TRANSFER",
      createTransferCommand(requestWorkspaceId, transferValidation.value),
    );
    void submitManualTransaction({
      kind: "TRANSFER",
      requestWorkspaceId,
      onSucceeded: () => clearManualTransactionIdempotency("TRANSFER", command.idempotencyKey),
      genericFailure: labels.transferCreateErrorGeneric,
      successAnnouncement: labels.transferCreated,
      resetDraft: (current) => resetTransferTransactionDraft(
        current,
        createTransactionFormDraft(defaultCurrency, timeZone).transfer,
      ),
      execute: async () => {
        const result = await submitCanonicalTransfer(command, postManualTransaction(requestWorkspaceId));
        return result.ok
          ? { ok: true }
          : {
            ok: false,
            errors: serverTransferFieldErrors(result.failure),
            insufficientFunds: result.failure.insufficientFunds,
          };
      },
    });
  }

  function postManualTransaction(requestWorkspaceId: string) {
    return async (input: unknown) => {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(requestWorkspaceId)}/ledger/transactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      return { ok: response.ok, payload: await response.json().catch(() => null) };
    };
  }

  function withManualTransactionIdempotency<Command extends Record<string, unknown>>(
    transactionKind: TransactionFormKind,
    command: Command,
  ): Command & { readonly idempotencyKey: string } {
    const commandSignature = JSON.stringify(command);
    const retryKey = manualTransactionRetryKeyForCommand(
      manualTransactionRetryKeysRef.current[transactionKind],
      commandSignature,
      () => crypto.randomUUID(),
    );
    manualTransactionRetryKeysRef.current[transactionKind] = retryKey;
    return { ...command, idempotencyKey: retryKey.idempotencyKey };
  }

  function clearManualTransactionIdempotency(
    transactionKind: TransactionFormKind,
    idempotencyKey: string,
  ): void {
    if (manualTransactionRetryKeysRef.current[transactionKind]?.idempotencyKey === idempotencyKey) {
      delete manualTransactionRetryKeysRef.current[transactionKind];
    }
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
      <p aria-live="polite" className="sr-only" role="status">{transactionAnnouncements.EXPENSE}</p>
      <p aria-live="polite" className="sr-only" role="status">{transactionAnnouncements.INCOME}</p>
      <p aria-live="polite" className="sr-only" role="status">{transactionAnnouncements.TRANSFER}</p>
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="h-9 rounded-[8px] bg-[#2563eb] px-3.5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30"
        onClick={() => setOpen(true)}
        type="button"
      >
        <FiPlus aria-hidden="true" className="size-4" />
        {labels.createTitle}
      </Button>

      <TransactionFormDialog
        createAccountHeader={{
          backLabel: createAccountTarget === "TRANSFER_FROM" || createAccountTarget === "TRANSFER_TO" ? labels.accountCreateBackToTransfer : labels.accountCreateBackToExpense,
          description: labels.accountCreateSubtitle,
          title: labels.accountCreateTitle,
        }}
        footer={(
          <TransactionFormFooter
            cancelLabel={labels.actionCancel}
            formError={transactionFormErrors[kind]}
            isPending={pendingTransactionKind === kind}
            onCancel={() => handleOpenChange(false)}
            onPrimaryAction={handlePrimaryAction}
            primaryActionLabel={kind === "EXPENSE" && pendingTransactionKind === "EXPENSE" ? labels.actionSavingExpense : kind === "INCOME" && pendingTransactionKind === "INCOME" ? labels.actionSavingIncome : kind === "TRANSFER" && pendingTransactionKind === "TRANSFER" ? labels.actionTransferring : kind === "TRANSFER" ? labels.actionTransferMoney : kind === "INCOME" ? labels.actionAddIncome : labels.actionAddExpense}
          />
        )}
        kind={kind}
        isCreateAccountPending={isCreatingAccount}
        isTransactionPending={isTransactionPending}
        onBackToTransaction={returnToTransaction}
        onKindChange={handleKindChange}
        onOpenChange={handleOpenChange}
        open={open}
        transactionHeader={{
          closeLabel: labels.createClose,
          description: labels.createSubtitle,
          title: labels.createTitle,
          typeSelector: {
            ariaLabel: labels.createTypeLabel,
            expense: labels.createTypeExpense,
            income: labels.createTypeIncome,
            transfer: labels.createTypeTransfer,
          },
        }}
        view={view}
      >
        {view === "create-account" ? (
          <>
            <p aria-live="polite" className="sr-only" role="status">{createAccountAnnouncement}</p>
            <CreateAccountForm
              draft={createAccountDraft}
              errors={createAccountErrors}
              formError={createAccountFormError}
              isSubmitting={isCreatingAccount}
                      labels={labels.createAccountForm}
              language={language}
              onCancel={returnToTransaction}
              onDraftChange={updateCreateAccountDraft}
              onSubmit={submitCreateAccount}
            />
          </>
        ) : kind === "TRANSFER" ? (
          <TransactionTransferForm
            accountAvailability={accountAvailability}
            accountBalanceLabels={labels.balance}
            accountLoadError={labels.balance.unableToVerify}
            accountLoadingLabel={labels.accountLoading}
            accountRetryLabel={labels.errorRetry}
            accounts={accounts}
            amountInputRef={amountInputRef}
            amountError={balanceError ?? activeDisplayErrors.amount}
            amountErrorDetail={balanceError ? balanceErrorDetail : undefined}
            currencyTriggerRef={currencyTriggerRef}
            dateTriggerRef={dateTriggerRef}
            draft={formDraft.transfer}
            errors={activeDisplayErrors}
            fromAccountTriggerRef={fromAccountTriggerRef}
            fromAccountHelper={accountAvailability === "ready" ? (
              <TransactionBalanceHint
                account={selectedTransferFromAccount}
                amount={formDraft.transfer.amount}
                balanceKind="available"
                direction="debit"
                labels={labels.balance}
                locale={locale}
              />
            ) : undefined}
            labels={labels}
            language={language}
            locale={locale}
            onCreateAccount={(target) => handleCreateAccountRequest(target === "FROM" ? "TRANSFER_FROM" : "TRANSFER_TO")}
            onDraftChange={(update) => commitTransactionDraft({
              ...formDraft,
              transfer: { ...formDraft.transfer, ...update },
            })}
            onRetryAccounts={retryAccounts}
            noteTextAreaRef={noteTextAreaRef}
            timeZone={timeZone}
            timeTriggerRef={timeTriggerRef}
            toAccountTriggerRef={toAccountTriggerRef}
            toAccountHelper={accountAvailability === "ready" ? (
              <TransactionBalanceHint
                account={selectedTransferToAccount}
                amount={formDraft.transfer.amount}
                balanceKind="current"
                direction="credit"
                labels={labels.balance}
                locale={locale}
              />
            ) : undefined}
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
              error={balanceError ?? activeDisplayErrors.amount}
              errorDetail={balanceError ? balanceErrorDetail : undefined}
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
              accountLoadError={kind === "INCOME" ? labels.accountLoadError : labels.balance.unableToVerify}
              accountLoadingLabel={labels.accountLoading}
              accountRetryLabel={labels.errorRetry}
              accounts={accounts}
              balanceKind={kind === "INCOME" ? "current" : "available"}
              balanceLabels={labels.balance}
              createAccountLabel={labels.accountsCreate}
              createFirstAccountLabel={labels.accountsCreateFirst}
              emptyDescription={labels.accountsEmptyDescription}
              emptyTitle={labels.accountsEmptyTitle}
              error={activeDisplayErrors.account}
              helperText={accountAvailability === "ready" && selectedExpenseOrIncomeAccount ? (
                <TransactionBalanceHint
                  account={selectedExpenseOrIncomeAccount}
                  amount={activeAccountDraft.amount}
                  balanceKind={kind === "INCOME" ? "current" : "available"}
                  direction={kind === "INCOME" ? "credit" : "debit"}
                  labels={labels.balance}
                  locale={locale}
                />
              ) : kind === "INCOME" ? labels.formAccountIncomeHelper : labels.formAccountHelper}
              label={labels.formAccount}
              locale={locale}
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

function formatBalanceDetail(minor: string, currency: string, locale: string): string {
  const formatted = formatTransactionBalance(minor, currency, locale);
  return formatted ?? currency;
}

function formatBalanceMessage(template: string, variables: Record<string, string>): string {
  return Object.entries(variables).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, value),
    template,
  );
}
