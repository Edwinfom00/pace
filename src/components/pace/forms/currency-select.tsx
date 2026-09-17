"use client";

import { useMemo, type RefObject } from "react";
import { FiDatabase } from "react-icons/fi";

import { PaceSearchSelect, type SelectOption } from "@/components/pace/forms/pace-search-select";
import {
  CURRENCY_CATALOG,
  getLocalizedCurrencyName,
  type CurrencyCode,
} from "@/money/currency";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

type CurrencySelectProps = {
  id?: string;
  describedBy?: string;
  value: CurrencyCode | "";
  language: OnboardingLanguage;
  onValueChange: (value: CurrencyCode) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  ariaLabel: string;
  invalid?: boolean;
  triggerClassName?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

export function getCurrencySelectOptions(language: OnboardingLanguage): readonly SelectOption<CurrencyCode>[] {
  return CURRENCY_CATALOG.map((currency) => {
    const localizedName = getLocalizedCurrencyName(currency.code, language);
    return {
      value: currency.code,
      label: `${currency.code} — ${localizedName}`,
      icon: <FiDatabase aria-hidden className="size-5 shrink-0 text-[#60769e]" />,
      searchTerms: [currency.code, currency.englishName, currency.nativeName, currency.symbol, localizedName],
    };
  });
}

export function CurrencySelect({ language, ...props }: CurrencySelectProps) {
  const options = useMemo(() => getCurrencySelectOptions(language), [language]);

  return <PaceSearchSelect options={options} {...props} />;
}
