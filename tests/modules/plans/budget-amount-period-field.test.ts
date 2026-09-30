import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BudgetAmountField,
  parseBudgetAmount,
} from "@/modules/plans/ui/components/budget-amount-field";
import {
  BudgetPeriodField,
  budgetPeriodKey,
  budgetPeriodStart,
  formatBudgetPeriod,
} from "@/modules/plans/ui/components/budget-period-field";

test("budget amount keeps an editable draft while parsing canonical bigint minor units", () => {
  assert.equal(parseBudgetAmount("120 000", "XAF")?.minor, 120_000n);
  assert.equal(parseBudgetAmount("1,234.50", "USD")?.minor, 123_450n);
  assert.equal(parseBudgetAmount("", "XAF"), null);
  assert.equal(parseBudgetAmount("0", "XAF")?.minor, 0n);
  assert.equal(parseBudgetAmount("-1", "XAF")?.minor, -1n);

  const markup = renderToStaticMarkup(
    createElement(BudgetAmountField, {
      currency: "XAF",
      helperText: "Maximum amount",
      label: "Budget amount",
      onChange: () => undefined,
      value: "120 000",
    }),
  );
  assert.match(markup, /value="120 000"/);
  assert.match(markup, /aria-label="XAF"/);
  assert.match(markup, /h-10/);
});

test("budget period uses a timezone-safe YYYY-MM identity and localized display labels", () => {
  assert.equal(
    budgetPeriodKey(new Date("2026-09-30T23:30:00.000Z"), "Africa/Douala"),
    "2026-10",
  );
  assert.equal(
    budgetPeriodStart("2026-09", "Africa/Douala")?.toISOString(),
    "2026-08-31T23:00:00.000Z",
  );
  assert.equal(budgetPeriodStart("September 2026", "Africa/Douala"), null);
  assert.match(formatBudgetPeriod("2026-09", "en-US"), /September 2026/);
  assert.match(formatBudgetPeriod("2026-09", "fr-FR"), /septembre 2026/i);
  assert.match(formatBudgetPeriod("2026-09", "de-DE"), /September 2026/);

  const markup = renderToStaticMarkup(
    createElement(BudgetPeriodField, {
      label: "Period",
      locale: "en-US",
      onChange: () => undefined,
      period: "2026-09",
      selectPeriod: "Select period",
      timeZone: "Africa/Douala",
    }),
  );
  assert.match(markup, /aria-label="Period"/);
  assert.match(markup, /September 2026/);
});
