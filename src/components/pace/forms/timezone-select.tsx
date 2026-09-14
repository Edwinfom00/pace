"use client";

import { useMemo } from "react";
import { FiClock } from "react-icons/fi";

import { PaceSearchSelect, type SelectOption } from "@/components/pace/forms/pace-search-select";
import { getSupportedTimezones } from "@/modules/onboarding/metadata";

type TimezoneSelectProps = {
  id?: string;
  describedBy?: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  ariaLabel: string;
  invalid?: boolean;
};

export function TimezoneSelect(props: TimezoneSelectProps) {
  const options = useMemo<readonly SelectOption[]>(
    () =>
      getSupportedTimezones().map((timezone) => ({
        value: timezone,
        label: timezone,
        icon: <FiClock aria-hidden className="size-5 shrink-0 text-[#60769e]" />,
        searchTerms: [timezone.replaceAll("_", " "), timezone.split("/").at(-1) ?? ""],
      })),
    [],
  );

  return <PaceSearchSelect options={options} {...props} />;
}
