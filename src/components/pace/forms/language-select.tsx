"use client";

import { FiBookOpen } from "react-icons/fi";

import { PaceSearchSelect, type SelectOption } from "@/components/pace/forms/pace-search-select";
import { ONBOARDING_LANGUAGES, type OnboardingLanguage } from "@/modules/onboarding/metadata";

const names: Record<OnboardingLanguage, string> = { en: "English", fr: "Français", de: "Deutsch" };

type LanguageSelectProps = {
  id?: string;
  describedBy?: string;
  value: OnboardingLanguage;
  onValueChange: (value: OnboardingLanguage) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  ariaLabel: string;
  invalid?: boolean;
};

const options: readonly SelectOption<OnboardingLanguage>[] = ONBOARDING_LANGUAGES.map((language) => ({
  value: language,
  label: names[language],
  icon: <FiBookOpen aria-hidden className="size-5 text-[#60769e]" />,
  searchTerms: [language, names[language]],
}));

export function LanguageSelect(props: LanguageSelectProps) {
  return <PaceSearchSelect options={options} {...props} />;
}
