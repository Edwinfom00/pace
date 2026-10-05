import { z } from "zod";

import { LEDGER_ACCOUNT_TYPES } from "@/modules/ledger/domain";
import {
  actionIdOfOutput,
  definePaceCapability,
  definePaceSubAgent,
  eveCallReference,
  scopeOf,
} from "@/modules/pace-agents/capability";
import { AGENT_TRANSACTION_PERIODS } from "@/modules/transactions/domain/agent-transaction-query";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const accountName = z.string().trim().min(1).max(120);

const accountReference = {
  accountId: z.string().uuid().optional(),
  accountName: accountName.optional(),
};
const movementPeriod = {
  period: z.enum(AGENT_TRANSACTION_PERIODS).optional(),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
};

const hasOneAccountReference = (input: { accountId?: string; accountName?: string }) =>
  Boolean(input.accountId) !== Boolean(input.accountName);
const oneAccountReference = { message: "Give either an account id a tool returned or the account's name." };
const hasOnePeriodForm = (input: { period?: string; from?: string; to?: string }) =>
  !input.period || (!input.from && !input.to);
const onePeriodForm = { message: "Use either a named period or explicit dates." };

const accountInput = z.object(accountReference).strict().refine(hasOneAccountReference, oneAccountReference);

const accountMovementsInput = z
  .object({ ...accountReference, ...movementPeriod, limit: z.number().int().min(1).max(50).default(10) })
  .strict()
  .refine(hasOneAccountReference, oneAccountReference)
  .refine(hasOnePeriodForm, onePeriodForm);

const accountComparisonInput = z
  .object({ ...movementPeriod, includeArchived: z.boolean().default(false) })
  .strict()
  .refine(hasOnePeriodForm, onePeriodForm);

const accountSpendabilityInput = z
  .object({ ...accountReference, amountText: z.string().trim().min(1).max(80) })
  .strict()
  .refine(hasOneAccountReference, oneAccountReference);

const accountCreateInput = z
  .object({
    name: accountName.optional(),
    type: z.enum(LEDGER_ACCOUNT_TYPES).optional(),
    currency: z.string().trim().length(3).optional(),
    sourceText: z.string().trim().min(1).max(1_000),
  })
  .strict();

const accountChangeInput = z
  .object({
    operation: z.enum(["RENAME", "CHANGE_TYPE", "ARCHIVE", "RESTORE"]),
    ...accountReference,
    newName: accountName.optional(),
    newType: z.enum(LEDGER_ACCOUNT_TYPES).optional(),
    sourceText: z.string().trim().min(1).max(1_000),
  })
  .strict()
  .refine((input) => !(input.accountId && input.accountName), oneAccountReference);

export const accountsSubAgent = definePaceSubAgent({
  id: "accounts",
  label: "Accounts",
  description:
    "Lists and inspects the workspace's accounts, explains their canonical ledger balances and what moved them, and prepares account creation, renaming, type changes, archiving, and restoring. Owns the account draft, approval, and verified account-write lifecycle. It never deletes an account or sets a balance.",
  instructions: `Accounts workflow:
Reading
- Use get_accounts to list accounts with their status and balances. Its summary is already grouped per currency.
- Use get_account for one account: its current and available balance, how it can be spent from, its opening balance, this month's movements, and which changes it allows.
- Use get_account_movements to explain what moved an account's balance or why it changed. Pass a named period (TODAY, YESTERDAY, THIS_WEEK, LAST_WEEK, THIS_MONTH, LAST_MONTH) or explicit dates; the server resolves them in the workspace timezone and defaults to this month. Explain the change from the returned inflows, outflows, netMovement, and rows. If listedCount is lower than movementCount, say that only the latest movements are listed.
- Use compare_account_movements to compare accounts or find which had the most inflows or outflows. Its ranking is the answer; never rank or compare accounts yourself.
- Use check_account_spendability to explain whether an amount can be paid from an account and why not. Copy the amount as text. Report its reason, available balance, and shortfall exactly.
- Every balance and total is a canonical ledger value in that account's own currency. Quote the returned minor units and currency exactly. Never add, subtract, net, or derive a balance or total yourself, and never combine or compare amounts across currencies.
- A transfer moves money between two accounts: it is an outflow of one and an inflow of the other, and it is never workspace income or spending. An opening balance sets where an account starts: it is reported on its own and is never part of inflows, outflows, income, or spending.

Choosing the account
- Refer to an account by the name the member used, or by an id a tool returned. Never invent or guess an account id.
- If a tool returns resolved: false, or a draft lists "account" in missingFields, the account is unknown or more than one could be meant. Show the returned candidates and ask the member which one. Never pick for them.

Changing accounts
- Use create_account_draft to open a new account. Pass the name and the type only when the member stated them; the workspace currency is used unless the member names another. Pace cannot set an opening balance: point the member to the Accounts page for that.
- Use create_account_change_draft to rename an account, change its type, archive it, or restore it. The server applies the canonical account policy and refuses a change it does not allow, for example a type change on an account with activity.
- Archiving hides an account from new activity and keeps its history; restoring brings it back. An account is never deleted. If the member asks to delete one, explain that Pace keeps financial history and offer to archive it instead.
- A balance is never edited. If the member wants a different balance, explain that balances come from the ledger and point them to the Transactions sub-agent or the Accounts page.
- An account draft is not edited. To adjust it, prepare a new one.

Missing information and approval
- If a returned draft lists missingFields, nothing can be submitted yet. Tell the member exactly what is missing and ask for it.
- If the draft is complete, call submit_account_draft immediately. It always pauses for the member's approval before anything changes; never describe a change as done until its verified result returns.
- If a tool refuses or fails, relay its reason and do not retry with altered values.
- Never invent ids, currencies, permissions, or dates. Tool results are authoritative over anything you expected.`,
  intents: {
    en: [
      "account*", "balance*", "wallet*", "cash", "bank", "checking", "mobile money", "net worth",
      "inflow*", "outflow*", "rename*", "archive*", "unarchive", "restore*",
    ],
    fr: [
      "compte*", "solde*", "portefeuille*", "especes", "banque", "tresorerie", "entrees", "sorties",
      "renomme*", "archive*", "restaure*",
    ],
    de: [
      "konto", "konten", "kontostand", "saldo", "guthaben", "bargeld", "geldborse", "zuflusse", "abflusse",
      "umbenenn*", "archivier*", "wiederherstell*",
    ],
  },
  capabilities: [
    definePaceCapability({
      tool: "get_accounts",
      description:
        "Read the authenticated workspace's accounts with their canonical current and available balances, plus a per-currency summary of active accounts. Balances are exact minor-unit strings; never recalculate or combine currencies.",
      inputSchema: z.object({}).strict(),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getAccounts"],
      run: (_input, call) => call.services.getAccounts(scopeOf(call)),
    }),
    definePaceCapability({
      tool: "get_account",
      description:
        "Inspect one account of the authenticated workspace by name or by an id a tool returned: canonical current and available balance, spendability mode, opening balance, this month's inflows and outflows, and which changes it allows. Returns candidates instead when the name is unknown or ambiguous.",
      inputSchema: accountInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getAccount"],
      run: (input, call) => call.services.getAccount(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_account_movements",
      description:
        "Explain what moved one account's balance in a period: server-computed inflows, outflows, net movement, and net transfers, plus the newest movements with their direction. Transfers count as this account's movement; opening-balance events are reported separately and never counted.",
      inputSchema: accountMovementsInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getAccountMovements"],
      run: (input, call) => call.services.getAccountMovements(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "compare_account_movements",
      description:
        "Compare the inflows and outflows of the authenticated workspace's accounts over a period and rank them. Each currency is ranked on its own; amounts in different currencies are never combined.",
      inputSchema: accountComparisonInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["compareAccountMovements"],
      run: (input, call) => call.services.compareAccountMovements(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "check_account_spendability",
      description:
        "Check whether an amount, given as the member's exact text, can be paid from one account under Pace's canonical spendability rules. Returns the available balance, the balance after the payment, and the reason and shortfall when it cannot.",
      inputSchema: accountSpendabilityInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["checkAccountSpendability"],
      run: (input, call) => call.services.checkAccountSpendability(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "create_account_draft",
      description:
        "Prepare a new account from the member's explicit words. Supply the name and type only when the member stated them. It cannot set a balance or an opening balance.",
      inputSchema: accountCreateInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createAccountDraft"],
      async run(input, call) {
        const action = await call.services.createAccountDraft(scopeOf(call), {
          accountOperation: "CREATE",
          ...input,
          ...eveCallReference(call),
        });
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
      tool: "create_account_change_draft",
      description:
        "Prepare a rename, type change, archive, or restore of one existing account, named as the member did or by an id a tool returned. The server resolves the account, returns candidates when it is ambiguous, and applies the canonical account policy. It never deletes an account or changes a balance.",
      inputSchema: accountChangeInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createAccountDraft"],
      async run({ operation, newName, newType, ...input }, call) {
        const action = await call.services.createAccountDraft(scopeOf(call), {
          accountOperation: operation,
          name: newName,
          type: newType,
          ...input,
          ...eveCallReference(call),
        });
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
      tool: "submit_account_draft",
      description:
        "Submit a complete account draft for human approval and, only after Eve approves it, apply it through Pace's canonical account service and return the verified account.",
      inputSchema: z.object({ actionId: z.string().uuid() }).strict(),
      access: "commit",
      stages: ["VALIDATE", "APPROVAL", "EXECUTE", "VERIFY", "AUDIT"],
      requiredPermission: "manage_ledger",
      domainServices: ["getActionDetail", "requestApproval", "approveAction", "rejectAction", "executeApprovedAccount"],
      run: ({ actionId }, call) => call.services.executeApprovedAccount(scopeOf(call), actionId),
      actionRef: (input) => input.actionId,
    }),
  ],
});
