import { z } from "zod";

import {
  actionIdOfOutput,
  definePaceCapability,
  definePaceSubAgent,
  eveCallReference,
  scopeOf,
} from "@/modules/pace-agents/capability";

import { AGENT_TRANSACTION_KINDS, AGENT_TRANSACTION_PERIODS } from "../domain/agent-transaction-query";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const transactionSearchInput = z
  .object({
    period: z.enum(AGENT_TRANSACTION_PERIODS).optional(),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    kind: z.enum(AGENT_TRANSACTION_KINDS).optional(),
    search: z.string().trim().min(1).max(200).optional(),
    amountText: z.string().trim().min(1).max(80).optional(),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict()
  .refine((input) => !input.period || (!input.from && !input.to), {
    message: "Use either a named period or explicit dates.",
  });

const transactionChangeInput = z
  .object({
    transactionId: z.string().uuid(),
    amountText: z.string().trim().max(80).optional(),
    occurredAtText: z.string().trim().max(40).optional(),
    accountHint: z.string().trim().max(120).optional(),
    transferAccountHint: z.string().trim().max(120).optional(),
    categoryHint: z.string().trim().max(120).optional(),
    merchantName: z.string().trim().max(160).optional(),
    note: z.string().trim().max(1_000).optional(),
    reason: z.string().trim().max(500).optional(),
    sourceText: z.string().trim().min(1).max(1_000),
  })
  .strict();

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
    "Lists, searches, inspects, and explains ledger activity, and prepares expenses, income, transfers, metadata edits, and financial corrections. Owns the transaction draft, approval, and verified ledger-write lifecycle.",
  instructions: `Transaction workflow:
Reading
- Use search_transactions to list, search, or total transactions. Pass a named period (TODAY, YESTERDAY, THIS_WEEK, LAST_WEEK, THIS_MONTH, LAST_MONTH) or explicit dates; the server resolves them in the workspace timezone. Its totals are the answer to "how much did I spend or receive": report them exactly and never add up rows yourself.
- Use get_transaction to inspect one transaction, including what it changed and which actions it still allows. Use get_recent_transactions for a quick latest-activity list and get_expenses for the largest expenses of a month.
- If totals report other currencies, say they are not included instead of combining them.

Recording an expense, income, or transfer
- Call get_transaction_context first. It is the authoritative server context for accounts, categories, currency, locale, and timezone.
- Then call create_transaction_draft. Copy the amount as text and sourceText as the full request; never convert, multiply, round, or otherwise calculate money yourself.
- When the member names a merchant, pass that exact text as merchantName. Never invent a category, confidence score, or reusable rule: Pace's server normalizes the merchant, applies user rules first, and records any uncertain classification in the financial Inbox.
- A transfer needs both accounts. It is a movement between accounts, never income or spending.

Changing an existing transaction
- Find it first with search_transactions (period, kind, search text, or amountText) and use only an id a tool returned. If more than one transaction could be meant, or none matches, ask the member which one instead of picking.
- Call create_transaction_change_draft with that id and only what the member asked to change, naming accounts and categories as the member did. The server decides what kind of change it is: a category, merchant, note, or date edit is a safe metadata edit, while any amount or account change becomes a ledger correction that reverses the original and posts a replacement, keeping the history.
- A posted transaction is never deleted or overwritten. If the member asks to delete or remove one, explain that Pace keeps financial history and that it can be corrected or reversed from the transaction's page.
- A change draft is not edited. To adjust it, prepare a new one.

Missing information and approval
- If a returned draft lists missingFields, nothing can be submitted yet. Tell the member exactly which details are missing and ask for them. Never guess an amount, account, category, date, or destination account.
- When the member supplies a missing detail for a new transaction, call edit_transaction_draft with ids returned by get_transaction_context.
- If the draft is complete, call submit_transaction_draft immediately. It always pauses for the member's approval before any ledger write; never describe a write as done until its verified result returns.
- If a tool refuses or fails, relay its reason, for example insufficient funds, and do not retry with altered values.
- Never invent financial ids, workspace ids, currencies, permissions, or dates. Tool results are authoritative over anything you expected.`,
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
      "spend",
      "category",
      "recategori*",
      "correction*",
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
      "categorie",
      "correction*",
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
      "kategorie",
      "korrektur*",
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
      tool: "search_transactions",
      description:
        "List, search, and total the authenticated workspace's current transactions. Filter by a named period or explicit dates, kind, merchant or note text, an exact amount given as text, an account id, or a category id. Returns newest-first rows plus server-computed spending and income totals for every transaction matching the filters.",
      inputSchema: transactionSearchInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["searchTransactions"],
      run: (input, call) => call.services.searchTransactions(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_transaction",
      description:
        "Inspect one transaction of the authenticated workspace by an id a tool returned: amount, accounts, category, merchant, correction and refund history, its effect on balances, and which actions it still allows.",
      inputSchema: z.object({ transactionId: z.string().uuid() }).strict(),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getTransactionDetail"],
      run: ({ transactionId }, call) => call.services.getTransactionDetail(scopeOf(call), transactionId),
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
      tool: "create_transaction_change_draft",
      description:
        "Prepare a change to one existing transaction, identified by an id a tool returned. Supply only what the member asked to change, with money as their exact text and accounts or categories by name. The server classifies it as a safe metadata edit or a ledger correction and never deletes the original.",
      inputSchema: transactionChangeInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createTransactionChangeDraft"],
      async run(input, call) {
        const action = await call.services.createTransactionChangeDraft(scopeOf(call), {
          ...input,
          ...eveCallReference(call),
        });
        return {
          actionId: action.id,
          status: action.status,
          changeType: action.draft.changeType,
          draft: action.draft,
          isReadyForApproval: action.draft.missingFields.length === 0,
        };
      },
      actionRef: actionIdOfOutput,
    }),
    definePaceCapability({
      tool: "submit_transaction_draft",
      description:
        "Submit a complete transaction draft or transaction change draft for human approval and, only after Eve approves it, apply it through Pace's server-side ledger service and return the verified result.",
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
