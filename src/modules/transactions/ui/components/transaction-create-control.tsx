"use client";

import { useState } from "react";
import { FiPlus } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import type { TransactionUiLabels } from "../transaction-ui-labels";

import { TransactionFormDialog } from "./transaction-form-dialog";
import { TransactionAmountField } from "./transaction-amount-field";
import { TransactionCategoryField } from "./transaction-category-field";
import type { TransactionCategoryFixtureId } from "./transaction-category-fixtures";
import { TransactionAccountField } from "./transaction-account-field";
import {
  transactionAccountFixtures,
  type TransactionAccountFixtureId,
} from "./transaction-account-fixtures";
import { TransactionMerchantField } from "./transaction-merchant-field";
import {
  transactionFormKindLabels,
  type TransactionFormKind,
} from "./transaction-type-selector";

export function TransactionCreateControl({
  defaultCurrency,
  labels,
  language,
}: {
  readonly defaultCurrency: string;
  readonly labels: TransactionUiLabels;
  readonly language: "en" | "fr" | "de";
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TransactionFormKind>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState<TransactionCategoryFixtureId>("other-expense");
  const [account, setAccount] = useState<TransactionAccountFixtureId | "">("");

  function handleCreateAccountRequest() {
    // M8.5C.5 owns the creation view. This boundary deliberately only receives
    // the request so the selector remains reusable when that view arrives.
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

      <TransactionFormDialog kind={kind} onKindChange={setKind} onOpenChange={setOpen} open={open}>
        {kind === "EXPENSE" ? (
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
              accounts={transactionAccountFixtures}
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
          </div>
        ) : (
          `${transactionFormKindLabels[kind]} form content`
        )}
      </TransactionFormDialog>
    </>
  );
}
