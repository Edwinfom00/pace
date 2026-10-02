import Link from "next/link";
import { FiCalendar, FiTrendingUp } from "react-icons/fi";

import type {
  ForecastEvent,
  ForecastRecurringItem,
} from "@/modules/forecast/domain/forecast";
import {
  cadenceLabel,
  formatForecastLongDate,
  formatSignedMoney,
  recurringItemName,
  type ForecastLabels,
} from "@/modules/forecast/ui/forecast-format";
import { cn } from "@/lib/utils";

export function ForecastRecurringRow({
  currency,
  event,
  item,
  labels,
  locale,
  showDate = true,
  workspaceSlug,
}: {
  currency: string;
  event: ForecastEvent;
  item: ForecastRecurringItem | undefined;
  labels: ForecastLabels;
  locale: string;
  showDate?: boolean;
  workspaceSlug: string;
}) {
  const isInflow = event.direction === "INFLOW";
  const Icon = isInflow ? FiTrendingUp : FiCalendar;
  const name = recurringItemName(labels, item, event.direction);
  const date = formatForecastLongDate(event.occursAt, locale);

  return (
    <Link
      aria-label={`${labels.viewRecurring}: ${name}, ${date}`}
      className="-mx-2 flex items-center gap-3 rounded-[8px] px-2 py-2.5 transition-colors hover:bg-[#f7faff] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1769e8]"
      href={`/w/${workspaceSlug}/recurring/${event.recurringId}`}>
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-[9px]",
          isInflow ? "bg-[#e8f7ef] text-[#14945a]" : "bg-[#fdecee] text-[#e14958]",
        )}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[#18243b]">
          {name}
        </span>
        <span className="block truncate text-[11px] text-[#71809a]">
          {isInflow ? labels.income : labels.expense}
          {item ? ` · ${cadenceLabel(labels, item.cadenceDays)}` : ""}
          {event.amount.uncertainty === "VARIABLE" ? ` · ${labels.variable}` : ""}
        </span>
      </span>
      {showDate ? (
        <time
          className="hidden shrink-0 text-[12px] text-[#53627b] sm:block"
          dateTime={event.occursAt}>
          {date}
        </time>
      ) : null}
      <span
        className={cn(
          "w-28 shrink-0 text-right text-[13px] font-semibold tabular-nums",
          isInflow ? "text-[#14945a]" : "text-[#e14958]",
        )}>
        {formatSignedMoney(event.amount.nominalMinor, currency, locale, isInflow ? "+" : "-")}
      </span>
    </Link>
  );
}
