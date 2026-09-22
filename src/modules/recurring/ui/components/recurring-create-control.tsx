"use client";

import { useState } from "react";
import { FiPlus } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import type { CurrencyCode } from "@/money/currency";

import type { RecurringUiLabels } from "../recurring-ui-labels";
import type { RecurringCreateAccountOption, RecurringCreateCategoryOption } from "./recurring-create-flow";
import { RecurringCreateDialog } from "./recurring-create-dialog";

function todayInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function RecurringCreateControl({
  accounts,
  accountAvailability,
  categories,
  categoryAvailability,
  defaultCurrency,
  labels,
  language,
  locale,
  timeZone,
  workspaceId,
}: {
  readonly accounts: readonly RecurringCreateAccountOption[];
  readonly accountAvailability: "ready" | "error";
  readonly categories: readonly RecurringCreateCategoryOption[];
  readonly categoryAvailability: "ready" | "error";
  readonly defaultCurrency: CurrencyCode;
  readonly labels: RecurringUiLabels;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button className="h-9 rounded-[8px] bg-[#2563eb] px-3.5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30" onClick={() => setOpen(true)} type="button">
        <FiPlus aria-hidden="true" className="size-4" />
        {labels.create.trigger}
      </Button>
      <RecurringCreateDialog
        accounts={accounts}
        accountAvailability={accountAvailability}
        categories={categories}
        categoryAvailability={categoryAvailability}
        defaultCurrency={defaultCurrency}
        defaultNextOccurrence={todayInTimeZone(timeZone)}
        labels={labels}
        language={language}
        locale={locale}
        onOpenChange={setOpen}
        open={open}
        workspaceId={workspaceId}
      />
    </>
  );
}
