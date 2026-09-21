"use client";

import { useEffect, useId, useRef } from "react";

import { CurrencySelect } from "@/components/pace/forms/currency-select";
import { PaceSearchSelect, type SelectOption } from "@/components/pace/forms/pace-search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CurrencyCode } from "@/money/currency";
import type { LedgerAccountType } from "@/modules/ledger/domain";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

import { ACCOUNT_TYPE_METADATA } from "./account-type-metadata";
import type { CreateAccountUiLabels } from "./create-account-labels";
import type { CreateAccountFormErrors } from "./create-account-flow";

export type CreateAccountFormDraft = {
  readonly name: string;
  readonly type: LedgerAccountType | "";
  readonly currency: CurrencyCode;
  readonly openingBalance: string;
};

export function createEmptyCreateAccountFormDraft(currency: CurrencyCode): CreateAccountFormDraft {
  return { name: "", type: "", currency, openingBalance: "" };
}

export function CreateAccountForm({
  draft,
  errors,
  formError,
  isSubmitting,
  labels,
  language,
  onCancel,
  onDraftChange,
  onSubmit,
}: {
  readonly draft: CreateAccountFormDraft;
  readonly labels: CreateAccountUiLabels;
  readonly language: OnboardingLanguage;
  readonly errors: CreateAccountFormErrors;
  readonly formError: string | null;
  readonly isSubmitting: boolean;
  readonly onCancel: () => void;
  readonly onDraftChange: (draft: CreateAccountFormDraft) => void;
  readonly onSubmit: () => void;
}) {
  const nameId = useId();
  const typeId = useId();
  const currencyId = useId();
  const openingBalanceId = useId();
  const openingBalanceHelperId = useId();
  const nameErrorId = useId();
  const typeErrorId = useId();
  const currencyErrorId = useId();
  const openingBalanceErrorId = useId();
  const formErrorId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const typeTriggerRef = useRef<HTMLButtonElement>(null);
  const currencyTriggerRef = useRef<HTMLButtonElement>(null);
  const openingBalanceInputRef = useRef<HTMLInputElement>(null);
  const nameError = errors.name ? labels.errors.name : undefined;
  const typeError = errors.type ? labels.errors.type : undefined;
  const currencyError = errors.currency ? labels.errors.currency : undefined;
  const openingBalanceError = errors.openingBalance ? labels.errors.openingBalance : undefined;

  useEffect(() => {
    const firstInvalid = errors.name
      ? nameInputRef.current
      : errors.type
        ? typeTriggerRef.current
        : errors.currency
          ? currencyTriggerRef.current
          : errors.openingBalance
            ? openingBalanceInputRef.current
            : null;
    if (!firstInvalid) return;
    const frame = requestAnimationFrame(() => firstInvalid.focus());
    return () => cancelAnimationFrame(frame);
  }, [errors]);

  const accountTypeOptions: readonly SelectOption<LedgerAccountType>[] = ACCOUNT_TYPE_METADATA.map(({ icon: Icon, type }) => ({
    value: type,
    icon: <Icon aria-hidden className="size-4.25 text-[#526987]" />,
    label: labels.accountTypes[type].label,
    description: labels.accountTypes[type].description,
    searchTerms: [labels.accountTypes[type].label, labels.accountTypes[type].description],
  }));

  return (
    <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="grid gap-2">
        <label className="text-[13px] font-medium text-[#384862]" htmlFor={nameId}>
          {labels.name}<span aria-hidden="true" className="ml-0.5 text-[#d14343]">*</span>
        </label>
        <Input
          aria-describedby={nameError ? nameErrorId : undefined}
          aria-invalid={nameError ? true : undefined}
          autoComplete="off"
          className="h-11 rounded-[8px] border-[#d9e1ec] bg-white px-3 text-[13px] text-[#13213f] placeholder:text-[#8a9ab3] hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15"
          id={nameId}
          onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
          placeholder={labels.namePlaceholder}
          ref={nameInputRef}
          required
          value={draft.name}
        />
        {nameError ? <p aria-live="polite" className="text-[12px] leading-5 text-[#c23445]" id={nameErrorId} role="alert">{nameError}</p> : null}
      </div>

      <div className="grid gap-2">
        <label className="text-[13px] font-medium text-[#384862]" htmlFor={typeId}>{labels.type}</label>
        <PaceSearchSelect
          ariaLabel={labels.type}
          describedBy={typeError ? typeErrorId : undefined}
          emptyLabel={labels.typeEmpty}
          id={typeId}
          invalid={Boolean(typeError)}
          onValueChange={(type) => onDraftChange({ ...draft, type })}
          options={accountTypeOptions}
          placeholder={labels.typePlaceholder}
          renderOption={(option) => <span className="flex min-w-0 items-center gap-2.5">{option.icon}<span className="min-w-0"><span className="block truncate text-[13px] font-medium">{option.label}</span><span className="mt-0.5 block truncate text-[11px] leading-4 text-[#71809a]">{option.description}</span></span></span>}
          renderValue={(option) => <span className="flex items-center gap-2.5">{option.icon}<span>{option.label}</span></span>}
          searchPlaceholder={labels.typeSearch}
          triggerClassName="h-11 rounded-[8px] px-3 text-[13px]"
          triggerRef={typeTriggerRef}
          value={draft.type}
        />
        {typeError ? <p aria-live="polite" className="text-[12px] leading-5 text-[#c23445]" id={typeErrorId} role="alert">{typeError}</p> : null}
      </div>

      <div className="grid gap-2">
        <label className="text-[13px] font-medium text-[#384862]" htmlFor={currencyId}>{labels.currency}</label>
        <CurrencySelect
          ariaLabel={labels.currency}
          describedBy={currencyError ? currencyErrorId : undefined}
          emptyLabel={labels.currencyEmpty}
          id={currencyId}
          invalid={Boolean(currencyError)}
          language={language}
          onValueChange={(currency) => onDraftChange({ ...draft, currency })}
          placeholder={labels.currencyPlaceholder}
          searchPlaceholder={labels.currencySearch}
          triggerClassName="h-11 rounded-[8px] px-3 text-[13px]"
          triggerRef={currencyTriggerRef}
          value={draft.currency}
        />
        {currencyError ? <p aria-live="polite" className="text-[12px] leading-5 text-[#c23445]" id={currencyErrorId} role="alert">{currencyError}</p> : null}
      </div>

      <div className="grid gap-2">
        <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#384862]" htmlFor={openingBalanceId}>
          <span>{labels.openingBalance}</span><span className="text-[12px] font-normal text-[#71809a]">{labels.openingBalanceOptional}</span>
        </label>
        <div className={`flex h-11 overflow-hidden rounded-[8px] border bg-white transition-[border-color,box-shadow] hover:border-[#bac9df] focus-within:border-[#4e7fe3] focus-within:ring-3 focus-within:ring-[#5e8fe8]/15 ${openingBalanceError ? "border-[#d88690]" : "border-[#d9e1ec]"}`}>
          <Input
            aria-describedby={openingBalanceError ? `${openingBalanceHelperId} ${openingBalanceErrorId}` : openingBalanceHelperId}
            aria-invalid={openingBalanceError ? true : undefined}
            className="h-full min-w-0 flex-1 rounded-none border-0 px-3 text-[15px] font-medium text-[#13213f] shadow-none focus-visible:border-0 focus-visible:ring-0"
            id={openingBalanceId}
            inputMode="decimal"
            onChange={(event) => onDraftChange({ ...draft, openingBalance: event.target.value })}
            placeholder="0"
            ref={openingBalanceInputRef}
            value={draft.openingBalance}
          />
          <span className="flex items-center border-l border-[#e5eaf1] px-3 text-[12px] font-semibold text-[#526987]">{draft.currency}</span>
        </div>
        <p className="text-[12px] leading-5 text-[#71809a]" id={openingBalanceHelperId}>{labels.openingBalanceHelper}</p>
        {openingBalanceError ? <p aria-live="polite" className="text-[12px] leading-5 text-[#c23445]" id={openingBalanceErrorId} role="alert">{openingBalanceError}</p> : null}
      </div>

      <p aria-live="polite" className={formError ? "text-[12px] leading-5 text-[#c23445]" : "sr-only"} id={formErrorId} role="alert">{formError}</p>
      <footer className="mt-2 flex items-center justify-end gap-2 border-t border-[#e7ecf3] pt-4">
        <Button className="h-9 rounded-[8px] px-3.5 text-[13px] text-[#526987]" disabled={isSubmitting} onClick={onCancel} type="button" variant="outline">{labels.cancel}</Button>
        <Button aria-busy={isSubmitting || undefined} aria-describedby={formError ? formErrorId : undefined} className="h-9 rounded-[8px] bg-[#2563eb] px-3.5 text-[13px] text-white hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30" disabled={isSubmitting} type="submit">{isSubmitting ? labels.pending : labels.create}</Button>
      </footer>
    </form>
  );
}
