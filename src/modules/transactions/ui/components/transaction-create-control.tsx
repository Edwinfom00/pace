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
import type { TransactionCategoryFixtureId } from "./transaction-category-fixtures";
import { TransactionAccountField } from "./transaction-account-field";
import type { AccountDraftOption } from "./transaction-account.types";
import { TransactionMerchantField } from "./transaction-merchant-field";
import { TransactionDateField, getTransactionFormToday } from "./transaction-date-field";
import { TransactionTimeField } from "./transaction-time-field";
import {
  transactionFormKindLabels,
  type TransactionFormKind,
} from "./transaction-type-selector";

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
  const [kind, setKind] = useState<TransactionFormKind>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState<TransactionCategoryFixtureId>("other-expense");
  const [account, setAccount] = useState("");
  const [date, setDate] = useState(() => getTransactionFormToday(timeZone));
  const [time, setTime] = useState("");
  const [createdAccounts, setCreatedAccounts] = useState<readonly AccountDraftOption[]>([]);
  const [createAccountDraft, setCreateAccountDraft] = useState<CreateAccountFormDraft>({
    name: "",
    type: "",
    currency: "",
    openingBalance: "",
  });
  const localAccountId = useRef(0);
  const accountTypeLabels = {
    CASH: labels.accountTypeCash,
    CHECKING: labels.accountTypeChecking,
    SAVINGS: labels.accountTypeSavings,
    CREDIT_CARD: labels.accountTypeCreditCard,
    MOBILE_MONEY: labels.accountTypeMobileMoney,
    OTHER: labels.accountTypeOther,
  } satisfies Readonly<Record<LedgerAccountType, string>>;
  const accounts = [...transactionAccountFixtures, ...createdAccounts];

  function handleCreateAccountRequest() {
    setCreateAccountDraft((draft) => (draft.currency ? draft : { ...draft, currency }));
    setView("create-account");
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) return;

    setView("transaction");
    setCreatedAccounts([]);
    setAccount((current) => (current.startsWith("draft-account-") ? "" : current));
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
    setAccount(createdAccount.id);
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
        kind={kind}
        onBackToTransaction={() => setView("transaction")}
        onKindChange={setKind}
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
        ) : kind === "EXPENSE" ? (
          <div className="grid gap-4">
            <TransactionAmountField
              currency={currency}
              currencyEmptyLabel={labels.formCurrencyEmpty}
              currencyLabel={labels.formCurrency}
              currencySearchPlaceholder={labels.formCurrencySearch}
              helperText={labels.formAmountExpenseHelper}
              label={labels.formAmount}
              language={language}
              onCurrencyChange={setCurrency}
              onValueChange={setAmount}
              value={amount}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TransactionMerchantField
                helperText={labels.formMerchantHelper}
                label={labels.formMerchant}
                onValueChange={setMerchant}
                placeholder={labels.formMerchantPlaceholder}
                value={merchant}
              />
              <TransactionCategoryField
                helperText={labels.formCategoryHelper}
                label={labels.formCategory}
                language={language}
                onValueChange={setCategory}
                placeholder={labels.formCategoryPlaceholder}
                searchPlaceholder={labels.formCategorySearch}
                value={category}
              />
            </div>

            <TransactionAccountField
              accountTypeLabels={accountTypeLabels}
              accounts={accounts}
              createAccountLabel={labels.accountsCreate}
              createFirstAccountLabel={labels.accountsCreateFirst}
              emptyDescription={labels.accountsEmptyDescription}
              emptyTitle={labels.accountsEmptyTitle}
              helperText={labels.formAccountHelper}
              label={labels.formAccount}
              noResultsLabel={labels.accountsSearchNoResults}
              onCreateAccount={handleCreateAccountRequest}
              onValueChange={setAccount}
              placeholder={labels.formAccountPlaceholder}
              preferredCurrency={currency}
              searchPlaceholder={labels.formAccountSearch}
              value={account}
            />

            <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <TransactionDateField
                label={labels.formDate}
                locale={locale}
                onValueChange={setDate}
                timeZone={timeZone}
                value={date}
              />
              <TransactionTimeField
                clearLabel={labels.actionRemove}
                label={labels.formTime}
                locale={locale}
                onValueChange={setTime}
                optionalLabel={labels.formOptional}
                placeholder={labels.formTimePlaceholder}
                value={time}
              />
            </div>
          </div>
        ) : (
          `${transactionFormKindLabels[kind]} form content`
        )}
      </TransactionFormDialog>
    </>
  );
}
