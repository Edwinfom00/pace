import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import {
  BudgetIconPicker,
  DEFAULT_BUDGET_VISUAL_IDENTITY,
} from "@/modules/plans/ui/components/budget-icon-picker";
import { formatBudgetPeriod } from "@/modules/plans/ui/components/budget-period-field";
import { getPlansUiLabels } from "@/modules/plans/ui/plans-ui-labels";

test("Create Budget labels are complete and localized in EN, FR, and DE", () => {
  const expectations = {
    en: { title: "New budget", icon: "Food", preview: "Preview" },
    fr: { title: "Nouveau budget", icon: "Alimentation", preview: "Aperçu" },
    de: { title: "Neues Budget", icon: "Lebensmittel", preview: "Vorschau" },
  } as const;

  for (const [language, expected] of Object.entries(expectations)) {
    const labels = getPlansUiLabels(language as keyof typeof expectations).createBudget;
    assert.equal(labels.title, expected.title);
    assert.equal(labels.iconFood, expected.icon);
    assert.equal(labels.preview, expected.preview);
    assert.match(labels.notice, /\{startsOn\}.*\{resetsOn\}/);
  }
});

test("Create Budget preview formats months and money for the workspace locale", () => {
  assert.match(formatBudgetPeriod("2026-09", "en-US"), /September 2026/);
  assert.match(formatBudgetPeriod("2026-09", "fr-FR"), /septembre 2026/i);
  assert.match(formatBudgetPeriod("2026-09", "de-DE"), /September 2026/);
  assert.equal(formatOverviewMoney(120_000n, "XAF", "en-US"), "FCFA 120,000");
  assert.equal(formatOverviewMoney(120_000n, "XAF", "fr-FR"), "120 000 FCFA");
  assert.equal(formatOverviewMoney(120_000n, "XAF", "de-DE"), "120.000 FCFA");
});

test("Create Budget icon controls render their localized accessible labels", () => {
  for (const [language, iconLabel] of Object.entries({
    en: "Food",
    fr: "Alimentation",
    de: "Lebensmittel",
  })) {
    const labels = getPlansUiLabels(language as "en" | "fr" | "de").createBudget;
    const markup = renderToStaticMarkup(
      createElement(BudgetIconPicker, {
        labels: {
          groupLabel: labels.iconPicker,
          icons: {
            food: labels.iconFood,
            transport: labels.iconTransport,
            shopping: labels.iconShopping,
            home: labels.iconHome,
            health: labels.iconHealth,
            entertainment: labels.iconEntertainment,
            subscriptions: labels.iconSubscriptions,
            bills: labels.iconBills,
            education: labels.iconEducation,
            travel: labels.iconTravel,
            other: labels.iconOther,
          },
        },
        onChange: () => undefined,
        value: DEFAULT_BUDGET_VISUAL_IDENTITY,
      }),
    );
    assert.match(markup, new RegExp(`aria-label="${iconLabel}"`));
  }
});
