import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { formatAssistantMoney } from "@/modules/pace-assistant/domain/formatters";
import { parsePacePageContext } from "@/modules/pace-assistant/domain/page-context";
import { createPaceAssistantTurnOptions } from "@/modules/pace-assistant/domain/turn-options";
import { getPaceAssistantLabels } from "@/modules/pace-assistant/ui/assistant-labels";
import { TextBlock } from "@/modules/pace-assistant/ui/components/blocks/text-block";
import { getAssistantProgress } from "@/modules/pace-assistant/ui/views/pace-assistant-panel-view";
import { PaceAssistantBlockRenderer, PaceAssistantResponse } from "@/modules/pace-assistant/ui/components/pace-assistant-response";
import { PACE_ASSISTANT_BLOCK_TYPES, paceAssistantResponseSchema, type PaceAssistantBlock } from "@/modules/pace-assistant/types/pace-assistant";

const money = { minorUnits: "24850", currency: "XAF" } as const;
const date = "2026-09-15T12:00:00.000Z";

const blocks: readonly PaceAssistantBlock[] = [
  { type: "text", text: "A **structured** explanation." },
  { type: "heading", level: 2, text: "Largest expenses" },
  { type: "list", style: "bullet", items: ["Dining increased", "Transport decreased"] },
  { type: "list", style: "ordered", items: ["Review", "Approve"] },
  { type: "table", title: "Categories", columns: [{ key: "name", label: "Name", align: "left" }, { key: "amount", label: "Amount", align: "right" }], rows: [{ name: "Dining", amount: { type: "money", value: money } }] },
  { type: "metric", label: "Spent this month", value: money, trend: { direction: "down", sentiment: "positive", label: "Lower than August" } },
  { type: "metric-grid", title: "At a glance", items: [{ label: "Income", value: money }, { label: "Pace", value: money }] },
  { type: "transaction-list", title: "Transactions", transactions: [{ id: "transaction-1", merchantName: "Carrefour Market", amount: money, kind: "EXPENSE", categoryName: "Groceries", categoryKey: "supermarket", iconKey: "supermarket", occurredAt: date, status: "POSTED" }, { id: "transaction-2", merchantName: "Savings transfer", amount: money, kind: "TRANSFER", occurredAt: date, status: "POSTED" }] },
  { type: "expense-list", title: "Expenses", items: [{ transactionId: "expense-1", label: "Yango", amount: money, categoryName: "Transport", iconKey: "ride-hailing", occurredAt: date }] },
  { type: "income-list", title: "Income", items: [{ transactionId: "income-1", label: "Salary", amount: money, categoryName: "Income", iconKey: "salary", occurredAt: date }] },
  { type: "recurring-list", title: "Recurring", items: [{ id: "recurring-1", label: "Netflix", amount: money, cadence: "Monthly", nextExpectedAt: date, status: "CONFIRMED" }] },
  { type: "bills-list", title: "Bills", bills: [{ id: "bill-1", label: "Internet", amount: money, dueAt: date, status: "upcoming" }] },
  { type: "budget-summary", title: "Budgets", items: [{ id: "budget-1", label: "Dining", spent: money, limit: { minorUnits: "80000", currency: "XAF" }, percentageUsedBps: "3106", overBudget: false }] },
  { type: "goal-summary", goals: [{ id: "goal-1", name: "Emergency fund", saved: money, target: { minorUnits: "100000", currency: "XAF" }, progressBps: "2485", targetDate: date, status: "ACTIVE" }] },
  { type: "insight", insightType: "CATEGORY_SPIKE", severity: "MEDIUM", title: "Dining is higher", description: "Review recent restaurant purchases.", evidence: ["More than usual"] },
  { type: "comparison", title: "September vs August", metrics: [{ label: "Dining", current: money, previous: { minorUnits: "22000", currency: "XAF" }, percentageChange: 13, sentiment: "negative" }] },
  { type: "notice", tone: "warning", title: "Currency check", message: "An FX strategy is required." },
  { type: "action-proposal", actionId: "action-1", actionType: "CREATE_TRANSACTION", title: "Add expense?", summary: "A draft is ready.", fields: [{ label: "Amount", value: "500 XAF" }] },
  { type: "approval", actionId: "action-1", title: "Confirm expense", summary: "Review before approval.", fields: [{ label: "Amount", value: "500 XAF" }], status: "pending" },
  { type: "action-result", status: "success", title: "Expense added", message: "The ledger write was verified.", fields: [] },
];

test("structured response protocol validates every supported Pace block", () => {
  assert.deepEqual(PACE_ASSISTANT_BLOCK_TYPES.length, 19);
  const parsed = paceAssistantResponseSchema.safeParse({ blocks });
  assert.equal(parsed.success, true);
  assert.equal(paceAssistantResponseSchema.safeParse({ blocks: [{ type: "metric", label: "Invalid", value: { minorUnits: "12.5", currency: "XAF" } }] }).success, false);
});

test("rich renderer emits structured financial interfaces rather than raw payloads", () => {
  const markup = renderToStaticMarkup(createElement(PaceAssistantResponse, {
    blocks,
    labels: getPaceAssistantLabels("en"),
    locale: "en-CM",
    timeZone: "Africa/Douala",
  }));
  for (const expected of ["Largest expenses", "Carrefour Market", "Netflix", "Emergency fund", "Expense added"]) {
    assert.match(markup, new RegExp(expected));
  }
  assert.match(markup, /<table/);
  assert.match(markup, /<ul/);
});

test("fallback assistant text turns inline or line-based dashes into semantic stacked lists", () => {
  const inlineMarkup = renderToStaticMarkup(createElement(TextBlock, {
    text: "I can help with: - Log an expense - Review your bills - Check your budget",
  }));
  const lineMarkup = renderToStaticMarkup(createElement(TextBlock, {
    text: "Next steps\n- Review expenses\n- Confirm the plan",
  }));
  assert.match(inlineMarkup, /<ul/);
  assert.match(inlineMarkup, /<li>Log an expense<\/li>/);
  assert.match(lineMarkup, /<li>Review expenses<\/li>/);
  assert.match(lineMarkup, /<li>Confirm the plan<\/li>/);
});

test("streaming progress reports the active user-facing Eve step", () => {
  const labels = getPaceAssistantLabels("en");
  assert.equal(getAssistantProgress("submitted", [], labels), labels.sending);
  assert.equal(getAssistantProgress("streaming", [{ type: "turn.started" }, { type: "actions.requested", data: { actions: [{ toolName: "get_expenses" }] } }], labels), labels.retrieving);
  assert.equal(getAssistantProgress("streaming", [{ type: "turn.started" }, { type: "actions.requested", data: { actions: [{ toolName: "submit_transaction_draft" }] } }], labels), labels.preparingApproval);
  assert.equal(getAssistantProgress("streaming", [{ type: "turn.started" }, { type: "input.requested" }], labels), labels.waitingApproval);
  assert.equal(getAssistantProgress("streaming", [{ type: "turn.started" }, { type: "action.result" }], labels), labels.verifying);
});

test("unknown renderer blocks degrade to a safe notice", () => {
  const markup = renderToStaticMarkup(createElement(PaceAssistantBlockRenderer, {
    block: { type: "unknown-block" } as unknown as PaceAssistantBlock,
    index: 0,
    labels: getPaceAssistantLabels("en"),
    locale: "en-CM",
    timeZone: "Africa/Douala",
  }));
  assert.match(markup, /unsupported response/i);
});

test("money formatting preserves bigint precision and transfers remain neutral rather than spending", () => {
  assert.equal(formatAssistantMoney({ minorUnits: "2485000", currency: "XAF" }, "fr-CM"), "2 485 000 FCFA");
  assert.equal(formatAssistantMoney({ minorUnits: "9223372036854775", currency: "XAF" }, "en-CM"), "FCFA9,223,372,036,854,775");
  const transfer = blocks.find((block) => block.type === "transaction-list")!;
  assert.equal(transfer.type, "transaction-list");
  assert.equal(transfer.transactions[1]?.kind, "TRANSFER");
  const markup = renderToStaticMarkup(createElement(PaceAssistantResponse, {
    blocks: [transfer], labels: getPaceAssistantLabels("en"), locale: "en-CM", timeZone: "Africa/Douala",
  }));
  assert.match(markup, /Savings transfer/);
  assert.match(markup, /text-\[\#53627c\]/);
  assert.match(markup, />Transfer · /);
});

test("page context only accepts view context and turn options keep it ephemeral", () => {
  const context = { page: "overview", period: "2026-09", transactionType: "EXPENSE" } as const;
  assert.deepEqual(parsePacePageContext(context), context);
  assert.equal(parsePacePageContext({ ...context, transactions: [{ id: "raw-data" }] }), null);
  assert.deepEqual(createPaceAssistantTurnOptions(context).clientContext, { pacePageContext: context });
  assert.equal("transactions" in createPaceAssistantTurnOptions(context).clientContext, false);
});

test("Eve scope rejects missing server-authenticated workspace identity", () => {
  assert.throws(() => requirePaceEveScope({ session: { auth: { current: null } } }));
});
