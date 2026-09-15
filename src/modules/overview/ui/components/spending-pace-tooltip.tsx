"use client";

import type { DashboardLabels } from "@/i18n/dashboard-messages";

import { formatOverviewDate, formatOverviewMoney } from "../../domain/overview-formatters";
import type { OverviewSpendingPacePoint } from "../../domain/overview.types";

export function SpendingPaceTooltip({
  active,
  point,
  currency,
  locale,
  labels,
}: {
  active?: boolean;
  point?: OverviewSpendingPacePoint;
  currency: string;
  locale: string;
  labels: DashboardLabels;
}) {
  if (!active || !point || point.actualMinor === null) return null;

  return (
    <div className="w-[172px] rounded-[8px] border border-[#e4e9f1] bg-white px-3 py-2.5 shadow-[0_5px_12px_rgb(16_24_40/8%)]">
      <p className="mb-1.5 text-[12px] font-medium text-[#7b879e]">{formatOverviewDate(point.date, locale)}</p>
      <p className="text-[13px] font-semibold text-[#15213b]">
        {formatOverviewMoney(point.actualMinor, currency, locale)}
      </p>
      <p className="mt-0.5 text-[12px] leading-4 text-[#71809a]">
        {labels["overview.kpi.vs"]} {formatOverviewMoney(point.typicalMinor, currency, locale)} {labels["overview.spendingPace.typical"].toLocaleLowerCase()}
      </p>
    </div>
  );
}
