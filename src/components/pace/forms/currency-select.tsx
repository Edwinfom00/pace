"use client";

import { useMemo } from "react";
import { FiDatabase } from "react-icons/fi";

import { PaceSearchSelect, type SelectOption } from "@/components/pace/forms/pace-search-select";
import {
  CURRENCY_METADATA,
  getLocalizedCurrencyName,
  type OnboardingLanguage,
} from "@/modules/onboarding/metadata";

type CurrencySelectProps = {
  id?: string;
  describedBy?: string;
  value: string;
  language: OnboardingLanguage;
  onValueChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  ariaLabel: string;
  invalid?: boolean;
};

export function CurrencySelect({ language, ...props }: CurrencySelectProps) {
  const options = useMemo<readonly SelectOption[]>(
    () =>
      CURRENCY_METADATA.map((currency) => {
        const localizedName = getLocalizedCurrencyName(currency.code, language);
        return {
          value: currency.code,
          label: `${currency.code} — ${localizedName}`,
          icon: <FiDatabase aria-hidden className="size-5 shrink-0 text-[#60769e]" />,
          searchTerms: [currency.code, currency.englishName, currency.nativeName, currency.symbol, localizedName],
        };
      }),
    [language],
  );

  return <PaceSearchSelect options={options} {...props} />;
}
