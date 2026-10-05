import { z } from "zod";

import { RECURRING_PAYMENT_DIRECTIONS } from "@/modules/financial-inbox/domain";
import { RECURRING_HORIZONS } from "@/modules/insights/recurring/insights-recurring.types";
import {
  actionIdOfOutput,
  definePaceCapability,
  definePaceSubAgent,
  eveCallReference,
  scopeOf,
} from "@/modules/pace-agents/capability";

import { AGENT_RECURRING_FILTERS, AGENT_RECURRING_PERIODS } from "../domain/agent-recurring-query";
import { RECURRING_FREQUENCY_KEYS } from "../domain/recurring-frequency";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const recurringName = z.string().trim().min(1).max(160);
const optionalName = z.string().trim().min(1).max(160).optional();
const amountText = z.string().trim().min(1).max(80);
const currency = z.string().trim().length(3).optional();
const sourceText = z.string().trim().min(1).max(1_000);

const recurringReference = {
  recurringId: z.string().uuid().optional(),
  recurringName: recurringName.optional(),
};
const oneRecurringReference = { message: "Give either a recurring id a tool returned or the recurring item's name." };

const recurringInput = z
  .object(recurringReference)
  .strict()
  .refine((input) => Boolean(input.recurringId) !== Boolean(input.recurringName), oneRecurringReference);

const recurringListInput = z
  .object({
    filter: z.enum(AGENT_RECURRING_FILTERS).default("ALL"),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

const recurringSpendingInput = z
  .object({ period: z.enum(AGENT_RECURRING_PERIODS).default("THIS_MONTH"), currency })
  .strict();

const upcomingRecurringInput = z
  .object({
    horizon: z.enum(RECURRING_HORIZONS).default("30d"),
    dueWithinDays: z.number().int().min(1).max(90).optional(),
    currency,
  })
  .strict();

const recurringCreateInput = z
  .object({
    direction: z.enum(RECURRING_PAYMENT_DIRECTIONS),
    name: optionalName,
    amountText: amountText.optional(),
    frequency: z.enum(RECURRING_FREQUENCY_KEYS).optional(),
    nextOccurrenceOn: calendarDate.optional(),
    accountName: optionalName,
    categoryName: optionalName,
    currency,
    sourceText,
  })
  .strict();

const recurringChangeInput = z
  .object({
    operation: z.enum(["EDIT", "PAUSE", "RESUME", "CONFIRM", "IGNORE", "RESTORE"]),
    ...recurringReference,
    newName: optionalName,
    amountText: amountText.optional(),
    frequency: z.enum(RECURRING_FREQUENCY_KEYS).optional(),
    nextOccurrenceOn: calendarDate.optional(),
    accountName: optionalName,
    categoryName: optionalName,
    sourceText,
  })
  .strict()
  .refine((input) => !(input.recurringId && input.recurringName), oneRecurringReference);

function presentRecurringDraft(action: {
  readonly id: string;
  readonly status: string;
  readonly draft: { readonly missingFields: readonly string[]; readonly approvalSummary?: unknown };
}) {
  return {
    actionId: action.id,
    status: action.status,
    draft: action.draft,
    approvalSummary: action.draft.approvalSummary ?? null,
    isReadyForApproval: action.draft.missingFields.length === 0,
  };
}

export const recurringSubAgent = definePaceSubAgent({
  id: "recurring",
  label: "Recurring",
  description:
    "Lists and inspects recurring payments, subscriptions, bills, and recurring income; explains what they actually cost from real transactions and what is projected next; and prepares creating, editing, pausing, resuming, confirming, ignoring, and restoring them. Owns the recurring draft, approval, and verified recurring-write lifecycle. It never posts a transaction or deletes a recurring item.",
  instructions: `Recurring workflow:
Reading
- Use get_recurring_payments to list recurring items. Filter by state when the member asks for one: ACTIVE, PAUSED, NEEDS_REVIEW, or IGNORED. Present them with a recurring-list block rather than a Markdown list. If listedCount is lower than matchingCount, say that only some are listed.
- Use get_recurring_payment for one item: its state and what that state means, its typical amount and cadence, its real payment history, its next projections, and which changes it allows.
- Use get_recurring_spending for what recurring items actually cost or brought in. Its figures come only from real Transactions in the period. Pass THIS_MONTH or LAST_MONTH.
- Use get_upcoming_recurring for what is coming next or due soon. Pass dueWithinDays to list only the occurrences due within that many days. Its horizon totals cover the whole horizon, not the dueWithinDays window.

Actual versus projected
- Actual recurring spending and income come only from get_recurring_spending and from the history of get_recurring_payment. They are real Transactions.
- Everything from get_upcoming_recurring, nextProjectedAt, and projections is a projection from the item's cadence. A projection is not a Transaction: it has not been paid, it never changes a balance, and it never counts as spending or income. Always call it expected or projected, never paid or spent.
- Never add a projection to an actual amount, and never present a typical amount as a real charge.
- Quote the returned minor units and currency exactly. Never total, annualize, average, or convert amounts yourself, and never combine amounts across currencies; otherCurrencies lists currencies that are reported separately.

States and provenance
- ACTIVE: confirmed and projected. PAUSED: confirmed, projections stopped until it is resumed. NEEDS_REVIEW: detected by Pace from past Transactions and not confirmed; it is a suggestion and is not projected. IGNORED: a detected pattern the member dismissed; it can be restored to review.
- Pause is not Ignore. Pause applies to a confirmed item and keeps it; Ignore applies only to a detected item that still needs review. Detected is not confirmed.
- provenance MANUAL means a member entered it; DETECTED means Pace inferred it from real Transactions. A manual item is never confirmed, ignored, or restored, and its provenance never changes.

Choosing the recurring item
- Refer to an item by the name the member used, or by an id a tool returned. Never invent or guess a recurring id.
- If a tool returns resolved: false, or a draft lists "recurring" in missingFields, the item is unknown or more than one could be meant. Show the returned candidates and ask the member which one. Never pick for them.

Changing recurring items
- Use create_recurring_draft for a new recurring payment or income. Pass only what the member stated: name, amount as text, frequency (weekly, biweekly, monthly, quarterly, yearly), the next occurrence date, and optionally an account or category by name. The workspace currency is used unless the member names another or an account. Never invent the next occurrence date; ask for it.
- Use create_recurring_change_draft with EDIT to change future values, PAUSE or RESUME for a confirmed item, CONFIRM or IGNORE for a detected item that needs review, and RESTORE for an ignored one. The server applies the canonical recurring policy and refuses a change it does not allow.
- Every change affects future projections only. None of them creates, edits, or deletes a Transaction, and none changes a balance. Pace never posts a recurring payment automatically; to record one that happened, point the member to the Transactions sub-agent.
- A recurring item is never deleted. If the member asks to delete or cancel one, offer to pause it, or to ignore it if it is a detected item that needs review. Pausing in Pace does not cancel anything with the provider.
- A recurring draft is not edited. To adjust it, prepare a new one.

Missing information and approval
- If a returned draft lists missingFields, nothing can be submitted yet. Tell the member exactly what is missing and ask for it.
- If the draft is complete, show the member its approvalSummary and call submit_recurring_draft immediately. It always pauses for the member's approval before anything changes; never describe a change as done until its verified result returns.
- If a tool refuses or fails, relay its reason and do not retry with altered values.
- Never invent ids, amounts, currencies, permissions, or dates. Tool results are authoritative over anything you expected.`,
  intents: {
    en: [
      "recurring", "subscription*", "bill*", "rent", "membership*", "renewal*",
      "recurring payment*", "recurring expense*", "recurring income", "monthly rent", "monthly payment*",
      "weekly payment*", "yearly payment*", "pause*", "resume*", "unpause", "detected", "coming next", "due soon",
    ],
    fr: [
      "recurrent*", "abonnement*", "facture*", "loyer", "mensualite*", "prelevement*", "renouvellement*",
      "paiement* recurrent*", "depense* recurrente*", "suspend*", "reprendre", "reprends", "detecte*", "a venir",
    ],
    de: [
      "wiederkehrend*", "abo", "abos", "abonnement*", "rechnung*", "miete", "dauerauftrag*", "verlangerung*",
      "pausier*", "fortsetz*", "erkannt*", "anstehend*", "fallig",
    ],
  },
  capabilities: [
    definePaceCapability({
      tool: "get_recurring_payments",
      description:
        "List the authenticated workspace's recurring items with their state (ACTIVE, PAUSED, NEEDS_REVIEW, IGNORED), provenance (MANUAL or DETECTED), typical amount, cadence, and next projected date. Use a recurring-list block rather than a Markdown list when presenting them. Typical amounts and projected dates are not Transactions.",
      inputSchema: recurringListInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getRecurringPayments"],
      run: (input, call) => call.services.getRecurringPayments(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_recurring_payment",
      description:
        "Inspect one recurring item of the authenticated workspace by name or by an id a tool returned: its state and what it means, typical amount, cadence, real payment history, next projections, and which changes it allows. History holds only real Transactions; projections are never Transactions. Returns candidates instead when the name is unknown or ambiguous.",
      inputSchema: recurringInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getRecurringPayment"],
      run: (input, call) => call.services.getRecurringPayment(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_recurring_spending",
      description:
        "Report what recurring items actually cost and brought in during this month or last month, computed by the server only from real effective Transactions linked to confirmed recurring items. It contains no projection. One currency per call; amounts in different currencies are never combined.",
      inputSchema: recurringSpendingInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getRecurringSpending"],
      run: (input, call) => call.services.getRecurringSpending(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_upcoming_recurring",
      description:
        "Project the next occurrences of confirmed, active recurring items over the next 30, 60, or 90 days, optionally only those due within a number of days. Every figure is a projection: nothing listed has been paid, none affects a balance, and none counts as actual spending or income.",
      inputSchema: upcomingRecurringInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getUpcomingRecurring"],
      run: (input, call) => call.services.getUpcomingRecurring(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "create_recurring_draft",
      description:
        "Prepare a new manual recurring payment or income from the member's explicit words. Supply the name, amount text, frequency, and next occurrence date only when the member stated them. It never creates a Transaction and never changes a balance.",
      inputSchema: recurringCreateInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createRecurringDraft"],
      async run(input, call) {
        return presentRecurringDraft(
          await call.services.createRecurringDraft(scopeOf(call), {
            recurringOperation: "CREATE",
            ...input,
            ...eveCallReference(call),
          }),
        );
      },
      actionRef: actionIdOfOutput,
    }),
    definePaceCapability({
      tool: "create_recurring_change_draft",
      description:
        "Prepare an edit, pause, resume, confirmation, ignore, or restore of one existing recurring item, named as the member did or by an id a tool returned. The server resolves the item, returns candidates when it is ambiguous, and applies the canonical recurring policy. It changes future projections only and never touches a Transaction.",
      inputSchema: recurringChangeInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createRecurringDraft"],
      async run({ operation, newName, ...input }, call) {
        return presentRecurringDraft(
          await call.services.createRecurringDraft(scopeOf(call), {
            recurringOperation: operation,
            name: newName,
            ...input,
            ...eveCallReference(call),
          }),
        );
      },
      actionRef: actionIdOfOutput,
    }),
    definePaceCapability({
      tool: "submit_recurring_draft",
      description:
        "Submit a complete recurring draft for human approval and, only after Eve approves it, apply it through Pace's canonical recurring service and return the verified recurring item.",
      inputSchema: z.object({ actionId: z.string().uuid() }).strict(),
      access: "commit",
      stages: ["VALIDATE", "APPROVAL", "EXECUTE", "VERIFY", "AUDIT"],
      requiredPermission: "manage_ledger",
      domainServices: ["getActionDetail", "requestApproval", "approveAction", "rejectAction", "executeApprovedRecurring"],
      run: ({ actionId }, call) => call.services.executeApprovedRecurring(scopeOf(call), actionId),
      actionRef: (input) => input.actionId,
    }),
  ],
});
