import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BUDGET_ACCENT_KEYS,
  BUDGET_ICON_KEYS,
  BUDGET_ICON_OPTIONS,
  BudgetIconPicker,
  DEFAULT_BUDGET_VISUAL_IDENTITY,
  selectBudgetIcon,
} from "@/modules/plans/ui/components/budget-icon-picker";

test("budget icon picker renders its compact default selection", () => {
  const markup = renderToStaticMarkup(createElement(BudgetIconPicker, {
    onChange: () => undefined,
    value: DEFAULT_BUDGET_VISUAL_IDENTITY,
  }));

  assert.match(markup, /role="radiogroup"/);
  assert.equal((markup.match(/role="radio"/g) ?? []).length, BUDGET_ICON_OPTIONS.length);
  assert.match(markup, /aria-checked="true"/);
});

test("budget icon selection is controlled and uses stable semantic values", () => {
  assert.deepEqual(selectBudgetIcon("transport"), { iconKey: "transport", accentKey: "blue" });
  assert.deepEqual(BUDGET_ICON_KEYS, ["food", "transport", "shopping", "home", "health", "entertainment", "subscriptions", "bills", "education", "travel", "other"]);
  assert.deepEqual(BUDGET_ACCENT_KEYS, ["coral", "blue", "violet", "amber", "rose", "indigo"]);
  assert.equal(BUDGET_ICON_OPTIONS.some((option) => String(option.iconKey) === "FiCoffee"), false);
});

test("budget icon picker exposes keyboard-operable radio controls and clear selected state", () => {
  const markup = renderToStaticMarkup(createElement(BudgetIconPicker, {
    onChange: () => undefined,
    value: selectBudgetIcon("home"),
  }));

  assert.match(markup, /aria-checked="true"[^>]*aria-label="Home"/);
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /bg-\[\#2867e8\]/);
  assert.match(markup, /flex flex-wrap gap-2/);
});
