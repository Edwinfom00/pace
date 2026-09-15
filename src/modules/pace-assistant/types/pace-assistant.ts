import { z } from "zod";

const decimalInteger = z.string().regex(/^-?\d+$/, "Expected an exact integer string.");
const nonNegativeDecimalInteger = z.string().regex(/^\d+$/, "Expected a non-negative integer string.");

export const serializedMoneySchema = z
  .object({
    minorUnits: decimalInteger,
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  })
  .strict();

export type SerializedMoney = z.infer<typeof serializedMoneySchema>;

const textBlockSchema = z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(8_000) }).strict();
const headingBlockSchema = z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3), z.literal(4)]), text: z.string().trim().min(1).max(240) }).strict();
const listBlockSchema = z.object({ type: z.literal("list"), style: z.enum(["bullet", "ordered"]), items: z.array(z.string().trim().min(1).max(800)).min(1).max(40) }).strict();

const tableCellSchema = z.union([
  z.string().max(1_000),
  z.object({ type: z.literal("money"), value: serializedMoneySchema }).strict(),
]);
const tableBlockSchema = z.object({
  type: z.literal("table"),
  title: z.string().trim().min(1).max(240).optional(),
  columns: z.array(z.object({ key: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(160), align: z.enum(["left", "right"]).default("left") }).strict()).min(1).max(8),
  rows: z.array(z.record(z.string(), tableCellSchema)).max(30),
}).strict();

const metricItemSchema = z.object({
  label: z.string().trim().min(1).max(140),
  value: serializedMoneySchema,
  description: z.string().trim().min(1).max(240).optional(),
  trend: z.object({ direction: z.enum(["up", "down", "neutral"]), sentiment: z.enum(["positive", "negative", "neutral"]), label: z.string().trim().min(1).max(160).optional() }).strict().optional(),
}).strict();
const metricBlockSchema = z.object({ type: z.literal("metric"), ...metricItemSchema.shape }).strict();
const metricGridBlockSchema = z.object({ type: z.literal("metric-grid"), title: z.string().trim().min(1).max(240).optional(), items: z.array(metricItemSchema).min(2).max(4) }).strict();

const transactionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  merchantName: z.string().trim().min(1).max(240),
  amount: serializedMoneySchema,
  kind: z.enum(["EXPENSE", "INCOME", "TRANSFER", "REFUND"]),
  categoryName: z.string().trim().min(1).max(160).nullable().optional(),
  categoryKey: z.string().trim().min(1).max(160).nullable().optional(),
  iconKey: z.string().trim().min(1).max(160).nullable().optional(),
  merchantLogoKey: z.string().trim().min(1).max(160).nullable().optional(),
  occurredAt: z.string().datetime(),
  status: z.enum(["PENDING", "POSTED"]),
}).strict();
const transactionListBlockSchema = z.object({ type: z.literal("transaction-list"), title: z.string().trim().min(1).max(240).optional(), transactions: z.array(transactionSchema).min(1).max(20) }).strict();

const expenseItemSchema = z.object({
  transactionId: z.string().trim().min(1).max(160).optional(),
  label: z.string().trim().min(1).max(240),
  amount: serializedMoneySchema,
  categoryName: z.string().trim().min(1).max(160).nullable().optional(),
  categoryKey: z.string().trim().min(1).max(160).nullable().optional(),
  iconKey: z.string().trim().min(1).max(160).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
}).strict();
const expenseListBlockSchema = z.object({ type: z.literal("expense-list"), title: z.string().trim().min(1).max(240).optional(), items: z.array(expenseItemSchema).min(1).max(20) }).strict();
const incomeListBlockSchema = z.object({ type: z.literal("income-list"), title: z.string().trim().min(1).max(240).optional(), items: z.array(expenseItemSchema).min(1).max(20) }).strict();

const recurringListBlockSchema = z.object({
  type: z.literal("recurring-list"),
  title: z.string().trim().min(1).max(240).optional(),
  items: z.array(z.object({ id: z.string().trim().min(1).max(160), label: z.string().trim().min(1).max(240), amount: serializedMoneySchema, cadence: z.string().trim().min(1).max(100), nextExpectedAt: z.string().datetime().optional(), status: z.enum(["CANDIDATE", "CONFIRMED", "IGNORED"]).optional() }).strict()).min(1).max(20),
}).strict();
const billsListBlockSchema = z.object({
  type: z.literal("bills-list"),
  title: z.string().trim().min(1).max(240).optional(),
  bills: z.array(z.object({ id: z.string().trim().min(1).max(160), label: z.string().trim().min(1).max(240), amount: serializedMoneySchema, dueAt: z.string().datetime(), iconKey: z.string().trim().min(1).max(160).nullable().optional(), status: z.enum(["upcoming", "due", "overdue"]).default("upcoming") }).strict()).min(1).max(20),
}).strict();

const budgetSummaryBlockSchema = z.object({
  type: z.literal("budget-summary"),
  title: z.string().trim().min(1).max(240).optional(),
  items: z.array(z.object({ id: z.string().trim().min(1).max(160), label: z.string().trim().min(1).max(240), spent: serializedMoneySchema, limit: serializedMoneySchema, percentageUsedBps: nonNegativeDecimalInteger, overBudget: z.boolean() }).strict()).min(1).max(12),
}).strict();
const goalSummaryBlockSchema = z.object({
  type: z.literal("goal-summary"),
  goals: z.array(z.object({ id: z.string().trim().min(1).max(160), name: z.string().trim().min(1).max(240), saved: serializedMoneySchema, target: serializedMoneySchema, progressBps: nonNegativeDecimalInteger, targetDate: z.string().datetime().nullable().optional(), status: z.enum(["ACTIVE", "COMPLETED", "PAUSED", "ARCHIVED"]).optional() }).strict()).min(1).max(12),
}).strict();

const insightBlockSchema = z.object({
  type: z.literal("insight"),
  insightType: z.string().trim().min(1).max(100),
  severity: z.enum(["INFO", "WARNING", "CRITICAL", "LOW", "MEDIUM", "HIGH"]),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(1_200),
  evidence: z.array(z.string().trim().min(1).max(500)).max(8).default([]),
}).strict();
const comparisonBlockSchema = z.object({
  type: z.literal("comparison"),
  title: z.string().trim().min(1).max(240),
  metrics: z.array(z.object({ label: z.string().trim().min(1).max(160), current: serializedMoneySchema, previous: serializedMoneySchema, percentageChange: z.number().finite().min(-10_000).max(10_000).nullable().optional(), sentiment: z.enum(["positive", "negative", "neutral"]) }).strict()).min(1).max(12),
}).strict();
const noticeBlockSchema = z.object({ type: z.literal("notice"), tone: z.enum(["info", "success", "warning", "error"]), title: z.string().trim().min(1).max(240).optional(), message: z.string().trim().min(1).max(1_200) }).strict();

const actionFieldSchema = z.object({ label: z.string().trim().min(1).max(160), value: z.string().trim().min(1).max(500), sensitive: z.boolean().optional() }).strict();
const actionProposalBlockSchema = z.object({ type: z.literal("action-proposal"), actionId: z.string().trim().min(1).max(160), actionType: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(240), summary: z.string().trim().min(1).max(1_200), fields: z.array(actionFieldSchema).max(12).default([]) }).strict();
const approvalBlockSchema = z.object({ type: z.literal("approval"), actionId: z.string().trim().min(1).max(160), title: z.string().trim().min(1).max(240), summary: z.string().trim().min(1).max(1_200).optional(), fields: z.array(actionFieldSchema).max(12).default([]), status: z.enum(["pending", "approved", "rejected", "executing"]).default("pending") }).strict();
const actionResultBlockSchema = z.object({ type: z.literal("action-result"), status: z.enum(["success", "failure"]), title: z.string().trim().min(1).max(240), message: z.string().trim().min(1).max(1_200).optional(), fields: z.array(actionFieldSchema).max(12).default([]) }).strict();

export const paceAssistantBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema, headingBlockSchema, listBlockSchema, tableBlockSchema, metricBlockSchema, metricGridBlockSchema,
  transactionListBlockSchema, expenseListBlockSchema, incomeListBlockSchema, recurringListBlockSchema, billsListBlockSchema,
  budgetSummaryBlockSchema, goalSummaryBlockSchema, insightBlockSchema, comparisonBlockSchema, noticeBlockSchema,
  actionProposalBlockSchema, approvalBlockSchema, actionResultBlockSchema,
]);

export type PaceAssistantBlock = z.infer<typeof paceAssistantBlockSchema>;

export const paceAssistantResponseSchema = z.object({
  blocks: z.array(paceAssistantBlockSchema).min(1).max(24),
}).strict();

export type PaceAssistantResponsePayload = z.infer<typeof paceAssistantResponseSchema>;

export type PaceAssistantMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly createdAt: string;
  readonly blocks: readonly PaceAssistantBlock[];
  readonly status?: "streaming" | "complete" | "failed";
};

export const PACE_ASSISTANT_BLOCK_TYPES = [
  "text", "heading", "list", "table", "metric", "metric-grid", "transaction-list", "expense-list", "income-list",
  "recurring-list", "bills-list", "budget-summary", "goal-summary", "insight", "comparison", "notice",
  "action-proposal", "approval", "action-result",
] as const;
