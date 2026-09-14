"use client";

import { useMemo } from "react";

import { PaceSearchSelect, type SelectOption } from "@/components/pace/forms/pace-search-select";
import {
  COUNTRY_METADATA,
  getLocalizedCountryName,
  type OnboardingLanguage,
} from "@/modules/onboarding/metadata";

type CountrySelectProps = {
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

export function CountrySelect({ language, ...props }: CountrySelectProps) {
  const options = useMemo<readonly SelectOption[]>(
    () =>
      COUNTRY_METADATA.map((country) => {
        const label = getLocalizedCountryName(country.code, language);
        return {
          value: country.code,
          label,
          icon: <span aria-hidden className="text-lg leading-none">{country.flag}</span>,
          searchTerms: [country.englishName, country.code, label],
        };
      }),
    [language],
  );

  return <PaceSearchSelect options={options} {...props} />;
}
