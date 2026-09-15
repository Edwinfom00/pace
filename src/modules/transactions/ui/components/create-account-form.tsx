"use client";

import { useId, type FormEvent } from "react";

import { CurrencySelect } from "@/components/pace/forms/currency-select";
import { PaceSearchSelect, type SelectOption } from "@/components/pace/forms/pace-search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LedgerAccountType } from "@/modules/ledger/domain";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

import type { TransactionUiLabels } from "../transaction-ui-labels";
import { ACCOUNT_TYPE_METADATA } from "./transaction-account-metadata";

export type CreateAccountFormDraft = {
  readonly name: string;
  readonly type: LedgerAccountType | "";
  readonly currency: string;
  readonly openingBalance: string;
};

type CreateAccountFormProps = {
  readonly draft: CreateAccountFormDraft;
  readonly labels: TransactionUiLabels;
  readonly language: OnboardingLanguage;
  readonly onCancel: () => void;
  readonly onCreateDraft: (draft: CreateAccountFormDraft & { readonly type: LedgerAccountType }) => void;
  readonly onDraftChange: (draft: CreateAccountFormDraft) => void;
};

export function CreateAccountForm({
  draft,
  labels,
  language,
  onCancel,
  onCreateDraft,
  onDraftChange,
}: CreateAccountFormProps) {
  const nameId = useId();
  const typeId = useId();
  const currencyId = useId();
  const openingBalanceId = useId();
  const openingBalanceHelperId = useId();
  const accountTypeCopy = {
    CASH: { label: labels.accountTypeCash, description: labels.accountTypeCashDescription },
    CHECKING: { label: labels.accountTypeChecking, description: labels.accountTypeCheckingDescription },
    SAVINGS: { label: labels.accountTypeSavings, description: labels.accountTypeSavingsDescription },
    CREDIT_CARD: { label: labels.accountTypeCreditCard, description: labels.accountTypeCreditCardDescription },
    MOBILE_MONEY: { label: labels.accountTypeMobileMoney, description: labels.accountTypeMobileMoneyDescription },
    OTHER: { label: labels.accountTypeOther, description: labels.accountTypeOtherDescription },
  } satisfies Readonly<Record<LedgerAccountType, { readonly label: string; readonly description: string }>>;
  const accountTypeOptions: readonly SelectOption<LedgerAccountType>[] = ACCOUNT_TYPE_METADATA.map(({ icon: Icon, type }) => ({
    value: type,
    icon: <Icon aria-hidden className="size-[17px] text-[#526987]" />,
    label: accountTypeCopy[type].label,
    description: accountTypeCopy[type].description,
    searchTerms: [accountTypeCopy[type].label, accountTypeCopy[type].description],
  }));
  const canCreate = Boolean(draft.name.trim() && draft.type && draft.currency);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.type || !draft.name.trim() || !draft.currency) return;
    onCreateDraft({ ...draft, name: draft.name.trim(), type: draft.type });
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-2">
        <label className="text-[13px] font-medium text-[#384862]" htmlFor={nameId}>
          {labels.accountName}
          <span aria-hidden="true" className="ml-0.5 text-[#d14343]">*</span>
        </label>
        <Input
          autoComplete="off"
          className="h-11 rounded-[8px] border-[#d9e1ec] bg-white px-3 text-[13px] text-[#13213f] placeholder:text-[#8a9ab3] hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15"
          id={nameId}
          onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
          placeholder={labels.accountNamePlaceholder}
          required
          value={draft.name}
        />
      </div>

      <div className="grid gap-2">
        <label className="text-[13px] font-medium text-[#384862]" htmlFor={typeId}>{labels.accountType}</label>
        <PaceSearchSelect
          ariaLabel={labels.accountType}
          emptyLabel={labels.accountTypeEmpty}
          id={typeId}
          onValueChange={(type) => onDraftChange({ ...draft, type })}
          options={accountTypeOptions}
          placeholder={labels.accountTypePlaceholder}
          searchPlaceholder={labels.accountTypeSearch}
          triggerClassName="h-11 rounded-[8px] px-3 text-[13px]"
          value={draft.type}
          renderOption={(option) => (
            <span className="flex min-w-0 items-center gap-2.5">
              {option.icon}
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{option.label}</span>
                <span className="mt-0.5 block truncate text-[11px] leading-4 text-[#71809a]">{option.description}</span>
              </span>
            </span>
          )}
          renderValue={(option) => (
            <span className="flex items-center gap-2.5">
              {option.icon}
              <span>{option.label}</span>
            </span>
          )}
        />
      </div>

      <div className="grid gap-2">
        <label className="text-[13px] font-medium text-[#384862]" htmlFor={currencyId}>{labels.accountCurrency}</label>
        <CurrencySelect
          ariaLabel={labels.accountCurrency}
          emptyLabel={labels.formCurrencyEmpty}
          id={currencyId}
          language={language}
          onValueChange={(currency) => onDraftChange({ ...draft, currency })}
          placeholder={labels.accountCurrencyPlaceholder}
          searchPlaceholder={labels.formCurrencySearch}
          triggerClassName="h-11 rounded-[8px] px-3 text-[13px]"
          value={draft.currency}
        />
      </div>

      <div className="grid gap-2">
        <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#384862]" htmlFor={openingBalanceId}>
          <span>{labels.accountOpeningBalance}</span>
          <span className="text-[12px] font-normal text-[#71809a]">{labels.accountOpeningBalanceOptional}</span>
        </label>
        <div className="flex h-11 overflow-hidden rounded-[8px] border border-[#d9e1ec] bg-white transition-[border-color,box-shadow] hover:border-[#bac9df] focus-within:border-[#4e7fe3] focus-within:ring-3 focus-within:ring-[#5e8fe8]/15">
          <Input
            aria-describedby={openingBalanceHelperId}
            className="h-full min-w-0 flex-1 rounded-none border-0 px-3 text-[15px] font-medium text-[#13213f] shadow-none focus-visible:border-0 focus-visible:ring-0"
            id={openingBalanceId}
            inputMode="decimal"
            onChange={(event) => onDraftChange({ ...draft, openingBalance: event.target.value })}
            placeholder="0"
            value={draft.openingBalance}
          />
          <span className="flex items-center border-l border-[#e5eaf1] px-3 text-[12px] font-semibold text-[#526987]">{draft.currency || "—"}</span>
        </div>
        <p className="text-[12px] leading-5 text-[#71809a]" id={openingBalanceHelperId}>{labels.accountOpeningBalanceHelper}</p>
      </div>

      <footer className="mt-2 flex items-center justify-end gap-2 border-t border-[#e7ecf3] pt-4">
        <Button className="h-9 rounded-[8px] px-3.5 text-[13px] text-[#526987]" onClick={onCancel} type="button" variant="outline">
          {labels.accountCancel}
        </Button>
        <Button className="h-9 rounded-[8px] bg-[#2563eb] px-3.5 text-[13px] text-white hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30" disabled={!canCreate} type="submit">
          {labels.accountsCreate}
        </Button>
      </footer>
    </form>
  );
}
