import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BudgetAdvancedOptions } from "@/modules/plans/ui/components/budget-advanced-options";

const labels = {
  monthlyResetTitle: "Monthly reset",
  monthlyResetHint: "This budget starts fresh on the first day of each month.",
};

test("advanced options render only the M5 monthly behavior", () => {
  const markup = renderToStaticMarkup(
    createElement(BudgetAdvancedOptions, { frequency: "MONTHLY", labels }),
  );

  assert.match(markup, /Monthly reset/);
  assert.match(markup, /first day of each month/);
  assert.doesNotMatch(markup, /Notify|alert|rollover|carry-over/i);
});

test("advanced options use a compact mobile-safe layout without an unsupported toggle", () => {
  const markup = renderToStaticMarkup(
    createElement(BudgetAdvancedOptions, { frequency: "MONTHLY", labels }),
  );

  assert.match(markup, /flex min-w-0 items-start gap-3/);
  assert.match(markup, /text-\[12px\] leading-5/);
  assert.doesNotMatch(markup, /role="switch"|aria-checked/);
});
