import type { PaceAssistantBlock } from "@/modules/pace-assistant/types/pace-assistant";

import type { AssistantActionDetail } from "../domain/assistant-action";
import type { AssistantTurn } from "../domain/assistant-conversation";
import type { AssistantSnapshot } from "../domain/assistant-snapshot";

export const ASSISTANT_PREVIEW_STATES = [
  "empty",
  "read",
  "metric",
  "transactions",
  "insight",
  "prepared",
  "approval",
  "approval-pending",
  "executed",
  "outcomes",
  "report",
  "working",
  "error",
] as const;

export type AssistantPreviewState = (typeof ASSISTANT_PREVIEW_STATES)[number];

const xaf = (minorUnits: string) => ({ minorUnits, currency: "XAF" });

const user = (id: string, text: string): AssistantTurn => ({ id, role: "user", text });

const pace = (
  id: string,
  blocks: readonly PaceAssistantBlock[],
  actionIds: readonly string[] = [],
): AssistantTurn => ({
  id,
  role: "assistant",
  text: null,
  blocks,
  state: "complete",
  actions: actionIds.map((actionId) => ({ actionId, approvalRequestId: `request-${actionId}`, revision: "fixture" })),
});

const transferQuestion = user("u-transfer", "Move 50,000 XAF from Main Account to Savings.");

export const assistantPreviewTurns: Record<AssistantPreviewState, readonly AssistantTurn[]> = {
  empty: [],
  read: [
    user("u-read", "What needs my attention?"),
    pace("a-read", [
      { type: "text", text: "Three things are worth a look this week. Nothing is overdue." },
      {
        type: "list",
        style: "bullet",
        items: [
          "4 Inbox items are waiting for a category.",
          "Your Food budget is at 82% with 9 days left in the month.",
          "Canal+ renews on 28 Oct.",
        ],
      },
    ]),
  ],
  metric: [
    user("u-metric", "How much did I spend this month?"),
    pace("a-metric", [
      {
        type: "metric",
        label: "Spending this month",
        value: xaf("425000"),
        trend: { direction: "down", sentiment: "positive", label: "8% vs September" },
      },
      {
        type: "metric-grid",
        title: "Where it went",
        items: [
          { label: "Housing", value: xaf("180000") },
          { label: "Food", value: xaf("92400") },
          { label: "Transport", value: xaf("68500") },
          { label: "Other", value: xaf("84100") },
        ],
      },
      { type: "text", text: "Housing is your largest category. Food is the only one running ahead of last month." },
    ]),
  ],
  transactions: [
    user("u-transactions", "Show my recent transactions."),
    pace("a-transactions", [
      { type: "text", text: "Here are your five most recent transactions." },
      {
        type: "transaction-list",
        title: "Recent transactions",
        transactions: [
          { id: "t1", merchantName: "Carrefour Market", amount: xaf("18500"), kind: "EXPENSE", categoryName: "Food", occurredAt: "2026-10-04T10:12:00.000Z", status: "POSTED" },
          { id: "t2", merchantName: "Salary · Orange Cameroun", amount: xaf("750000"), kind: "INCOME", categoryName: "Salary", occurredAt: "2026-10-01T08:00:00.000Z", status: "POSTED" },
          { id: "t3", merchantName: "Yango", amount: xaf("3200"), kind: "EXPENSE", categoryName: "Transport", occurredAt: "2026-09-30T18:40:00.000Z", status: "PENDING" },
          { id: "t4", merchantName: "Main Account → Savings", amount: xaf("50000"), kind: "TRANSFER", occurredAt: "2026-09-29T09:00:00.000Z", status: "POSTED" },
          { id: "t5", merchantName: "Eneo", amount: xaf("24800"), kind: "EXPENSE", categoryName: null, occurredAt: "2026-09-27T14:05:00.000Z", status: "POSTED" },
        ],
      },
    ]),
  ],
  insight: [
    user("u-insight", "How is my Food budget doing?"),
    pace("a-insight", [
      {
        type: "insight",
        insightType: "BUDGET_AT_RISK",
        severity: "WARNING",
        title: "Food budget is likely to run out early",
        description: "You have used 82% of the Food budget with 9 days left in the month.",
        evidence: ["92,400 XAF spent of 112,000 XAF", "Typical spend by this date is 71,000 XAF"],
      },
      {
        type: "insight",
        insightType: "GOAL_ON_TRACK",
        severity: "INFO",
        title: "Emergency fund is on track",
        description: "At the current pace you reach the target two weeks before the date you set.",
        evidence: [],
      },
    ]),
  ],
  prepared: [
    user("u-prepared", "I spent 12,500 at the pharmacy yesterday."),
    pace("a-prepared", [{ type: "text", text: "I've drafted the expense. Which account did you pay from?" }], ["draft"]),
  ],
  approval: [
    transferQuestion,
    pace("a-approval", [{ type: "text", text: "I've prepared this transfer. Review it before I make any change." }], ["approval"]),
  ],
  "approval-pending": [
    transferQuestion,
    pace("a-pending", [{ type: "text", text: "I've prepared this transfer. Review it before I make any change." }], ["approval-pending"]),
  ],
  executed: [
    transferQuestion,
    pace("a-executed", [], ["executed"]),
    pace("a-executed-note", [{ type: "text", text: "Done. The transfer is recorded on both accounts." }]),
  ],
  outcomes: [
    transferQuestion,
    pace("a-cancelled", [], ["cancelled"]),
    user("u-outcomes", "Try it again."),
    pace("a-failed", [], ["failed"]),
  ],
  report: [
    user("u-report", "Generate my monthly report."),
    pace("a-report", [
      { type: "text", text: "Your September report is ready to generate." },
      {
        type: "report-export",
        workspaceSlug: "personal",
        period: "2026-09",
        periodFrom: "2026-09-01",
        periodTo: "2026-09-30",
        currency: "XAF",
        language: "en",
        sections: "all",
        fileName: "pace-report-2026-09.pdf",
        pageCount: 6,
      },
    ]),
  ],
  working: [user("u-working", "What payments are coming next?")],
  error: [user("u-error", "Compare this month to last month.")],
};

const transferDraft = {
  kind: "TRANSFER",
  amountMinor: "50000",
  currency: "XAF",
  occurredAt: "2026-10-05T09:00:00.000Z",
  accountId: "acc-main",
  transferAccountId: "acc-savings",
  missingFields: [],
};

const transactionContext = {
  accounts: [
    { id: "acc-main", name: "Main Account" },
    { id: "acc-savings", name: "Savings" },
  ],
  categories: [{ id: "cat-health", name: "Health" }],
};

const transfer = (
  id: string,
  status: AssistantActionDetail["action"]["status"],
  extra: Partial<AssistantActionDetail["action"]> = {},
): AssistantActionDetail => ({
  action: { id, type: "TRANSACTION_CREATE", status, draft: transferDraft, ...extra },
  transactionContext,
});

export const assistantPreviewActions: Record<string, AssistantActionDetail> = {
  draft: {
    action: {
      id: "draft",
      type: "TRANSACTION_CREATE",
      status: "DRAFT",
      draft: {
        kind: "EXPENSE",
        amountMinor: "12500",
        currency: "XAF",
        occurredAt: "2026-10-04T12:00:00.000Z",
        accountId: null,
        categoryId: "cat-health",
        merchantName: "Pharmacie du Centre",
        missingFields: ["account"],
      },
    },
    transactionContext,
  },
  approval: transfer("approval", "WAITING_APPROVAL"),
  "approval-pending": transfer("approval-pending", "EXECUTING"),
  executed: transfer("executed", "COMPLETED", {
    result: { transactionId: "t4", kind: "TRANSFER", verifiedAt: "2026-10-05T09:00:04.000Z" },
  }),
  cancelled: transfer("cancelled", "REJECTED"),
  failed: transfer("failed", "FAILED", {
    failureMessage: "Main Account no longer has enough available balance for this transfer.",
  }),
};

export const assistantPreviewSnapshot: AssistantSnapshot = {
  currency: "XAF",
  locale: "en-CM",
  timeZone: "Africa/Douala",
  periodStart: "2026-09-30T23:00:00.000Z",
  balance: { minor: "325000", accountCount: 2 },
  spending: {
    minor: "425000",
    trend: { direction: "down", sentiment: "positive", percentage: "8", comparisonMonth: "September" },
  },
  income: {
    minor: "750000",
    trend: { direction: "neutral", sentiment: "neutral", percentage: "0", comparisonMonth: "September" },
  },
  inboxCount: 4,
  upcoming: [
    { recurringId: "r1", name: "Canal+", nextExpectedAt: "2026-10-28T08:00:00.000Z", amountMinor: "15000", currency: "XAF" },
    { recurringId: "r2", name: "Rent", nextExpectedAt: "2026-11-01T08:00:00.000Z", amountMinor: "180000", currency: "XAF" },
  ],
};
