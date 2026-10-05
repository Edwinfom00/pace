import { z } from "zod";

import {
  actionIdOfOutput,
  definePaceCapability,
  definePaceSubAgent,
  eveCallReference,
  scopeOf,
} from "@/modules/pace-agents/capability";

const transactionDraftInput = z
  .object({
    kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
    amountText: z.string().trim().max(80).optional(),
    occurredAtText: z.string().trim().max(40).optional(),
    accountHint: z.string().trim().max(120).optional(),
    transferAccountHint: z.string().trim().max(120).optional(),
    categoryHint: z.string().trim().max(120).optional(),
    merchantName: z.string().trim().max(160).optional(),
    note: z.string().trim().max(1_000).optional(),
    sourceText: z.string().trim().min(1).max(1_000),
  })
  .strict();

const transactionDraftEdit = z
  .object({
    actionId: z.string().uuid(),
    amountText: z.string().trim().max(80).nullable().optional(),
    occurredAtText: z.string().trim().max(40).nullable().optional(),
    accountId: z.string().uuid().nullable().optional(),
    transferAccountId: z.string().uuid().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    merchantName: z.string().trim().max(160).nullable().optional(),
    note: z.string().trim().max(1_000).nullable().optional(),
  })
  .strict();

export const transactionsSubAgent = definePaceSubAgent({
  id: "transactions",
  label: "Transactions",
  description:
    "Reads ledger activity and prepares expense, income, and transfer drafts. Owns the transaction draft, approval, and verified ledger-write lifecycle.",
  instructions: `Transaction workflow:
- Use get_recent_transactions for recent activity and get_expenses for largest expenses.
- For a natural-language expense, income, or transfer, call get_transaction_context before creating a draft. It is the authoritative server context for accounts, categories, currency, locale, and timezone.
- Then call create_transaction_draft. Copy the amount as text and sourceText as the full request; never convert, multiply, round, or otherwise calculate money yourself.
- When the user names a merchant, pass that exact merchant text as merchantName. Never invent a category, confidence score, or reusable rule: Pace's server normalizes the merchant, applies user rules first, and records any uncertain classification in the financial Inbox.
- If the returned draft has missing fields, say that an editable draft is ready. Do not ask follow-up questions for a missing account, category, or date.
- If the draft is complete, call submit_transaction_draft immediately. It always pauses for an Eve approval before any ledger write.
- Only call edit_transaction_draft with ids returned by get_transaction_context. Never invent financial ids, workspace ids, currencies, permissions, or dates.
- Never write to a database or ledger except through submit_transaction_draft after approval. Transfers are movements between accounts, never income or spending.`,
  intents: {
    en: [
      "transaction*",
      "expense*",
      "spent",
      "paid",
      "pay",
      "bought",
      "purchase*",
      "income",
      "salary",
      "received",
      "earned",
      "transfer*",
      "refund*",
      "payment*",
      "merchant*",
      "taxi",
    ],
    fr: [
      "depense*",
      "achat*",
      "achete",
      "paye",
      "payer",
      "revenu*",
      "salaire",
      "recu",
      "virement*",
      "transfert*",
      "remboursement*",
      "paiement*",
      "marchand*",
    ],
    de: [
      "transaktion*",
      "ausgabe*",
      "ausgegeben",
      "bezahlt",
      "gekauft",
      "einkauf*",
      "einnahme*",
      "gehalt",
      "erhalten",
      "uberweisung*",
      "erstattung*",
      "zahlung*",
      "handler",
    ],
  },
  capabilities: [
    definePaceCapability({
      tool: "get_transaction_context",
      description:
        "Get the authenticated workspace's authoritative accounts, categories, currency, locale, and timezone before creating or editing a transaction draft.",
      inputSchema: z.object({}),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "manage_ledger",
      domainServices: ["getTransactionContext"],
      run: (_input, call) => call.services.getTransactionContext(scopeOf(call)),
    }),
    definePaceCapability({
      tool: "get_recent_transactions",
      description:
        "Read recent authenticated-workspace transactions as safe presentation data. Use a structured transaction-list block in the final response.",
      inputSchema: z
        .object({ limit: z.number().int().min(1).max(20).default(5) })
        .strict(),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getRecentTransactions"],
      run: ({ limit }, call) =>
        call.services.getRecentTransactions(scopeOf(call), limit),
    }),
    definePaceCapability({
      tool: "get_expenses",
      description:
        "Read the authenticated workspace's largest posted expenses for the requested month. Returns deterministic money and transaction data; do not fabricate expense rows.",
      inputSchema: z
        .object({
          period: z
            .enum(["CURRENT_MONTH", "PREVIOUS_MONTH"])
            .default("CURRENT_MONTH"),
          limit: z.number().int().min(1).max(20).default(5),
        })
        .strict(),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getExpenses"],
      run: ({ period, limit }, call) =>
        call.services.getExpenses(scopeOf(call), { period, limit }),
    }),
    definePaceCapability({
      tool: "create_transaction_draft",
      description:
        "Create an editable, typed transaction draft from a user's explicit words after get_transaction_context. Supply money as the exact text the user gave, never calculated minor units.",
      inputSchema: transactionDraftInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createTransactionDraft"],
      async run(input, call) {
        const action = await call.services.createTransactionDraft(
          scopeOf(call),
          {
            ...input,
            ...eveCallReference(call),
          },
        );
        return {
          actionId: action.id,
          status: action.status,
          draft: action.draft,
          isReadyForApproval: action.draft.missingFields.length === 0,
        };
      },
      actionRef: actionIdOfOutput,
    }),
    definePaceCapability({
      tool: "edit_transaction_draft",
      description:
        "Edit an existing DRAFT transaction using only account and category ids returned by get_transaction_context. Use this when the user supplies missing or corrected details.",
      inputSchema: transactionDraftEdit,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["editTransactionDraft"],
      async run({ actionId, ...input }, call) {
        const action = await call.services.editTransactionDraft(
          scopeOf(call),
          actionId,
          input,
        );
        return {
          actionId: action.id,
          status: action.status,
          draft: action.draft,
        };
      },
      actionRef: actionIdOfOutput,
    }),
    definePaceCapability({
      tool: "submit_transaction_draft",
      description:
        "Submit a complete transaction draft for human approval and, only after Eve approves it, record it through Pace's server-side ledger service.",
      inputSchema: z.object({ actionId: z.string().uuid() }).strict(),
      access: "commit",
      stages: ["VALIDATE", "APPROVAL", "EXECUTE", "VERIFY", "AUDIT"],
      requiredPermission: "manage_ledger",
      domainServices: [
        "getActionDetail", "requestApproval",
        "approveAction",
        "rejectAction",
        "executeApprovedTransaction",
      ],
      run: ({ actionId }, call) =>
        call.services.executeApprovedTransaction(scopeOf(call), actionId),
      actionRef: (input) => input.actionId,
    }),
  ],
});
