"use client";

import { useId } from "react";

import { PaceSearchSelect, type SelectOption } from "@/components/pace/forms/pace-search-select";
import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

import {
  getTransactionCategoryFixtures,
  type TransactionCategoryFixtureIdByKind,
  type TransactionCategoryFixtureKind,
} from "./transaction-category-fixtures";

export type TransactionCategoryFieldProps<K extends TransactionCategoryFixtureKind = TransactionCategoryFixtureKind> = {
  readonly helperText: string;
  readonly kind: K;
  readonly label: string;
  readonly language: OnboardingLanguage;
  readonly onValueChange: (value: TransactionCategoryFixtureIdForKind<K>) => void;
  readonly placeholder: string;
  readonly searchPlaceholder: string;
  readonly value: TransactionCategoryFixtureIdForKind<K> | "";
};

type TransactionCategoryFixtureIdForKind<K extends TransactionCategoryFixtureKind> = TransactionCategoryFixtureIdByKind[K];

export function TransactionCategoryField<K extends TransactionCategoryFixtureKind>({
  helperText,
  kind,
  label,
  language,
  onValueChange,
  placeholder,
  searchPlaceholder,
  value,
}: TransactionCategoryFieldProps<K>) {
  const triggerId = useId();
  const helperId = useId();
  const options = getTransactionCategoryFixtures(kind, language).map(
    (category): SelectOption<TransactionCategoryFixtureIdForKind<K>> => ({
      value: category.id as TransactionCategoryFixtureIdForKind<K>,
      label: category.label,
      searchTerms: [category.labels.en, category.labels.fr, category.labels.de],
      icon: (
        <TransactionIcon
          categoryKey={category.iconKey}
          decorative
          size="sm"
          transactionKind={kind}
        />
      ),
    }),
  );

  return (
    <div className="grid min-w-0 gap-2">
      <label className="text-[13px] font-medium text-[#384862]" htmlFor={triggerId}>
        {label}
      </label>

      <PaceSearchSelect
        ariaLabel={label}
        describedBy={helperId}
        id={triggerId}
        onValueChange={onValueChange}
        options={options}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        triggerClassName="h-11 rounded-[8px] px-3 text-[13px] font-normal"
        value={value}
      />

      <p className="min-h-5 text-[12px] leading-5 text-[#71809a]" id={helperId}>
        {helperText}
      </p>
    </div>
  );
}
