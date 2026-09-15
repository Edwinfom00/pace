import type { TransactionListItem, TransactionPaginationState } from "../types/transaction-ui.types";


export const transactionUiFixtures: readonly TransactionListItem[] = [
  { id: "fixture-carrefour", merchant: { name: "Carrefour Market", description: "Weekly groceries" }, amount: { currency: "XAF", minor: "24850" }, kind: "EXPENSE", category: { key: "groceries", label: "Groceries" }, account: { id: "fixture-checking", displayName: "Main account" }, occurredAt: "2026-09-15T10:24:00.000Z", status: "POSTED" },
  { id: "fixture-yango", merchant: { name: "Yango" }, amount: { currency: "XAF", minor: "3500" }, kind: "EXPENSE", category: { key: "transport", label: "Transport" }, account: { id: "fixture-checking", displayName: "Main account" }, occurredAt: "2026-09-14T17:48:00.000Z", status: "POSTED" },
  { id: "fixture-spotify", merchant: { name: "Spotify", description: "Spotify Premium" }, amount: { currency: "XAF", minor: "3200" }, kind: "EXPENSE", category: { key: "subscription", label: "Subscription" }, account: { id: "fixture-card", displayName: "Visa •••• 4242" }, occurredAt: "2026-09-12T08:15:00.000Z", status: "POSTED" },
  { id: "fixture-reimbursement", merchant: { name: "Team lunch reimbursement" }, amount: { currency: "EUR", minor: "4250" }, kind: "REFUND", category: { key: "dining", label: "Dining" }, account: { id: "fixture-card", displayName: "Visa •••• 4242" }, occurredAt: "2026-09-10T12:03:00.000Z", status: "POSTED" },
  { id: "fixture-payroll", merchant: { name: "Salary" }, amount: { currency: "XAF", minor: "750000" }, kind: "INCOME", category: { key: "income", label: "Income" }, account: { id: "fixture-checking", displayName: "Main account" }, occurredAt: "2026-09-08T09:00:00.000Z", status: "POSTED" },
  { id: "fixture-transfer", merchant: { name: "Transfer to Marc", description: "Shared expenses" }, amount: { currency: "XAF", minor: "12400" }, kind: "TRANSFER", account: { id: "fixture-wallet", displayName: "Mobile Money" }, occurredAt: "2026-09-06T14:35:00.000Z", status: "POSTED" },
  { id: "fixture-long", merchant: { name: "Restaurant Le Patio, Bastos Yaoundé", description: "Dinner with colleagues" }, amount: { currency: "XAF", minor: "18200" }, kind: "EXPENSE", category: { key: "dining", label: "Dining" }, account: { id: "fixture-checking", displayName: "Main account" }, occurredAt: "2026-09-04T19:22:00.000Z", status: "PENDING" },
  { id: "fixture-amazon", merchant: { name: "Amazon", description: "Online purchase" }, amount: { currency: "USD", minor: "67300" }, kind: "EXPENSE", account: { id: "fixture-card", displayName: "Visa •••• 4242" }, occurredAt: "2026-09-02T16:40:00.000Z", status: "POSTED" },
];

export const transactionUiFixturePagination: TransactionPaginationState = {
  page: 1,
  pageSize: 10,
  totalCount: 16,
};
