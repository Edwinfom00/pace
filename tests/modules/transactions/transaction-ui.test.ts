import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { transactionUiFixtures } from "@/modules/transactions/test/fixtures/transaction-ui-fixtures";
import { TransactionAmountCell } from "@/modules/transactions/ui/components/transaction-amount-cell";
import { formatTransactionFormDate, getTransactionFormToday } from "@/modules/transactions/ui/components/transaction-date-field";
import { TransactionCategoryBadge } from "@/modules/transactions/ui/components/transaction-category-badge";
import { TransactionEmptyState } from "@/modules/transactions/ui/components/transaction-empty-state";
import { TransactionFormFooter } from "@/modules/transactions/ui/components/transaction-form-footer";
import { TransactionFormTip } from "@/modules/transactions/ui/components/transaction-form-tip";
import { formatTransactionAmount, formatTransactionDate } from "@/modules/transactions/ui/components/transaction-formatters";
import { TransactionMerchantCell } from "@/modules/transactions/ui/components/transaction-merchant-cell";
import { TransactionMobileCard } from "@/modules/transactions/ui/components/transaction-mobile-card";
import { TransactionNoteField } from "@/modules/transactions/ui/components/transaction-note-field";
import { visiblePages } from "@/modules/transactions/ui/components/transaction-pagination";
import { TransactionRowActions } from "@/modules/transactions/ui/components/transaction-row-actions";
import { TransactionStatusBadge } from "@/modules/transactions/ui/components/transaction-status-badge";
import { TransactionTable } from "@/modules/transactions/ui/components/transaction-table";
import { TransactionTableSkeleton } from "@/modules/transactions/ui/components/transaction-table-skeleton";
import { formatTransactionFormTime } from "@/modules/transactions/ui/components/transaction-time-field";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";

const labels = getTransactionUiLabels(getDashboardLabels("en"));
const now = "2026-09-15T14:00:00.000Z";

test("transaction amount treatment preserves exact money formatting and domain semantics", () => {
  const [expense, , , refund, income, transfer] = transactionUiFixtures;

  assert.match(formatTransactionAmount(expense.amount, expense.kind, "fr-CM"), /^−24/);
  assert.match(formatTransactionAmount(income.amount, income.kind, "fr-CM"), /^\+750/);
  assert.match(formatTransactionAmount(refund.amount, refund.kind, "fr-FR"), /^\+42,50/);
  assert.doesNotMatch(formatTransactionAmount(transfer.amount, transfer.kind, "fr-CM"), /^[+−]/);

  const expenseMarkup = renderToStaticMarkup(createElement(TransactionAmountCell, { amount: expense.amount, kind: expense.kind, locale: "fr-CM" }));
  const incomeMarkup = renderToStaticMarkup(createElement(TransactionAmountCell, { amount: income.amount, kind: income.kind, locale: "fr-CM" }));
  assert.match(expenseMarkup, /text-\[#1b2844\]/);
  assert.match(incomeMarkup, /text-\[#078652\]/);
});

test("transaction cells cover pending, uncategorized, long merchant, and accessible actions", () => {
  const pending = transactionUiFixtures.find((transaction) => transaction.status === "PENDING");
  const uncategorized = transactionUiFixtures.find((transaction) => !transaction.category);
  const longMerchant = transactionUiFixtures.find((transaction) => transaction.id === "fixture-long");
  assert.ok(pending);
  assert.ok(uncategorized);
  assert.ok(longMerchant);

  assert.match(renderToStaticMarkup(createElement(TransactionStatusBadge, { pendingLabel: "Pending", postedLabel: "Posted", status: pending.status })), /Pending/);
  assert.match(renderToStaticMarkup(createElement(TransactionCategoryBadge, { uncategorizedLabel: "Uncategorized" })), /Uncategorized/);
  const merchantMarkup = renderToStaticMarkup(createElement(TransactionMerchantCell, { category: longMerchant.category, kind: longMerchant.kind, merchant: longMerchant.merchant }));
  assert.match(merchantMarkup, /Restaurant Le Patio/);
  assert.match(merchantMarkup, /<img/);
  assert.match(renderToStaticMarkup(createElement(TransactionRowActions, { label: "Transaction actions", merchantName: "Carrefour Market" })), /aria-label="Transaction actions: Carrefour Market"/);
});

test("transaction dates use the supplied canonical locale and timezone context", () => {
  assert.equal(
    formatTransactionDate("2026-09-15T10:24:00.000Z", now, "en-US", "UTC", { today: "Today", yesterday: "Yesterday" }),
    "Today, 10:24 AM",
  );
  assert.equal(
    formatTransactionDate("2026-09-14T10:24:00.000Z", now, "en-US", "UTC", { today: "Today", yesterday: "Yesterday" }),
    "Yesterday",
  );
  assert.match(
    formatTransactionDate("2025-09-12T10:24:00.000Z", now, "en-US", "UTC", { today: "Today", yesterday: "Yesterday" }),
    /2025/,
  );
});

test("manual transaction date and time values preserve the workspace timezone and locale", () => {
  const now = new Date("2026-09-17T00:30:00.000Z");
  const losAngelesToday = getTransactionFormToday("America/Los_Angeles", now);
  const doualaToday = getTransactionFormToday("Africa/Douala", now);

  assert.equal(formatTransactionFormDate(losAngelesToday, "en-US"), "09/16/2026");
  assert.equal(formatTransactionFormDate(doualaToday, "fr-FR"), "17/09/2026");
  assert.equal(formatTransactionFormDate(doualaToday, "de-DE"), "17.09.2026");
  assert.equal(formatTransactionFormTime("14:30", "fr-FR"), "14:30");
  assert.match(formatTransactionFormTime("14:30", "en-US"), /2:30 PM/);
});

test("table, skeleton, empty state, and mobile presentation expose the foundation states", () => {
  const table = renderToStaticMarkup(createElement(TransactionTable, { labels, locale: "en-US", now, timeZone: "UTC", transactions: transactionUiFixtures.slice(0, 2) }));
  assert.match(table, /<table/);
  assert.match(table, /Transaction/);
  assert.match(table, /hidden px-3 py-3\.5 xl:table-cell/);

  const skeleton = renderToStaticMarkup(createElement(TransactionTableSkeleton, { rows: 2 }));
  assert.match(skeleton, /aria-busy="true"/);
  assert.equal((skeleton.match(/animate-pulse/g) ?? []).length >= 10, true);

  const empty = renderToStaticMarkup(createElement(TransactionEmptyState, { labels }));
  assert.match(empty, /No transactions yet/);

  const mobileCard = renderToStaticMarkup(createElement(TransactionMobileCard, {
    labels,
    locale: "en-US",
    now,
    timeZone: "UTC",
    transaction: transactionUiFixtures[0]!,
  }));
  assert.match(mobileCard, /Carrefour Market/);
  assert.match(mobileCard, /md:hidden|Weekly groceries/);
});

test("pagination produces a compact stable page window", () => {
  assert.deepEqual(visiblePages(1, 8), [1, 2, 3, 4, 8]);
  assert.deepEqual(visiblePages(4, 8), [1, 3, 4, 5, 8]);
  assert.deepEqual(visiblePages(8, 8), [1, 5, 6, 7, 8]);
});

test("transactions labels are complete across English, French, and German", () => {
  assert.equal(getTransactionUiLabels(getDashboardLabels("en")).searchPlaceholder, "Search transactions…");
  assert.equal(getTransactionUiLabels(getDashboardLabels("fr")).statusPending, "En attente");
  assert.equal(getTransactionUiLabels(getDashboardLabels("de")).sortNewest, "Neueste zuerst");
  assert.equal(getTransactionUiLabels(getDashboardLabels("en")).formTimePlaceholder, "Add time");
  assert.equal(getTransactionUiLabels(getDashboardLabels("fr")).formOptional, "Facultatif");
  assert.equal(getTransactionUiLabels(getDashboardLabels("de")).formDate, "Datum");
  assert.equal(getTransactionUiLabels(getDashboardLabels("en")).formNotePlaceholder, "Add a note...");
  assert.equal(getTransactionUiLabels(getDashboardLabels("fr")).formTipTitle, "Conseil");
  assert.equal(getTransactionUiLabels(getDashboardLabels("de")).actionAddExpense, "Ausgabe hinzufügen");
});

test("expense form finishing components stay compact, labelled, and visual-only", () => {
  const note = renderToStaticMarkup(createElement(TransactionNoteField, {
    label: "Note",
    onValueChange: () => undefined,
    optionalLabel: "Optional",
    placeholder: "Add a note...",
    value: "",
  }));
  const tip = renderToStaticMarkup(createElement(TransactionFormTip, {
    description: "Adding an account and category helps Pace keep your spending organized.",
    title: "Tip",
  }));
  const footer = renderToStaticMarkup(createElement(TransactionFormFooter, {
    addExpenseLabel: "Add expense",
    cancelLabel: "Cancel",
    onCancel: () => undefined,
  }));

  assert.match(note, /<textarea/);
  assert.match(note, /rows="3"/);
  assert.match(note, /Optional/);
  assert.match(tip, /<aside/);
  assert.match(tip, /aria-hidden="true"/);
  assert.match(footer, /Cancel/);
  assert.match(footer, /Add expense/);
  assert.equal((footer.match(/type="button"/g) ?? []).length, 2);
});
