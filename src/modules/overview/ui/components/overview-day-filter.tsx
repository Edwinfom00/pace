"use client";

import { MonthDayPicker } from "@/components/pace/shared/month-day-picker";
import type { DashboardLabels } from "@/i18n/dashboard-messages";

import { useOverviewFilterLoading } from "./overview-filter-loading";

export function OverviewDayFilter({
  labels,
  locale,
  periodKey,
  todayDate,
}: {
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly periodKey: string;
  readonly todayDate: string;
}) {
  const { activeDate, isLoading, selectDate, selectToday } = useOverviewFilterLoading();

  return (
    <MonthDayPicker
      disabled={isLoading}
      labels={{
        clear: labels["overview.day.clear"],
        label: labels["overview.day.label"],
        placeholder: labels["overview.day.placeholder"],
        today: labels["overview.day.today"],
      }}
      locale={locale}
      monthKey={periodKey}
      onChange={selectDate}
      onSelectToday={() => selectToday(todayDate)}
      selectedDate={activeDate}
    />
  );
}
