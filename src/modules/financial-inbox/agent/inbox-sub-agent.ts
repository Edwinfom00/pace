import { z } from "zod";

import {
  actionIdOfOutput,
  definePaceCapability,
  definePaceSubAgent,
  eveCallReference,
  scopeOf,
} from "@/modules/pace-agents/capability";

import { AGENT_INBOX_FILTERS, AGENT_INBOX_OPERATIONS } from "../agent-inbox-query";

const inboxItemId = z.string().trim().min(1).max(100);
const merchantName = z.string().trim().min(1).max(160);
const sourceText = z.string().trim().min(1).max(1_000);

const inboxItemReference = {
  inboxItemId: inboxItemId.optional(),
  merchantName: merchantName.optional(),
};
const oneInboxItemReference = { message: "Give either an Inbox item id a tool returned or the merchant name." };

const inboxListInput = z
  .object({
    reason: z.enum(AGENT_INBOX_FILTERS).default("ALL"),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict();

const inboxItemInput = z
  .object(inboxItemReference)
  .strict()
  .refine((input) => Boolean(input.inboxItemId) !== Boolean(input.merchantName), oneInboxItemReference);

const inboxResolutionInput = z
  .object({
    operation: z.enum(AGENT_INBOX_OPERATIONS),
    ...inboxItemReference,
    categoryName: z.string().trim().min(1).max(120).optional(),
    sourceText,
  })
  .strict()
  .refine((input) => !(input.inboxItemId && input.merchantName), oneInboxItemReference);

function presentInboxDraft(action: {
  readonly id: string;
  readonly status: string;
  readonly draft: { readonly missingFields: readonly string[]; readonly approvalSummary?: unknown };
}) {
  return {
    prepared: true,
    actionId: action.id,
    status: action.status,
    draft: action.draft,
    approvalSummary: action.draft.approvalSummary ?? null,
    isReadyForApproval: action.draft.missingFields.length === 0,
  };
}

export const inboxSubAgent = definePaceSubAgent({
  id: "inbox",
  label: "Inbox",
  description:
    "Lists and inspects the open financial Inbox items that need the member's attention, explains why each one is there, summarizes the Inbox by reason, and prepares the resolutions Pace supports: confirming a transaction's category, and confirming or ignoring a detected recurring payment. Owns the Inbox resolution draft, approval, and verified-resolution lifecycle. It never resolves a merchant ambiguity, a suspected transfer, or a duplicate, and it never dismisses an item.",
  instructions: `Inbox workflow:
Reading
- Use get_inbox_items to answer what needs attention or review. It returns the unresolved count, a summary by reason, and the open items. Report only what it returns; never invent an alert or infer one from other data. If listedCount is lower than matchingCount, say that only some are listed.
- Use get_inbox_item for one item: why it needs attention, its transaction, Pace's category suggestion when there is one, the detected recurring payment when there is one, and which resolutions it allows.
- Explain an item only with its returned issue, why, and resolution note. Never invent a cause, a confidence, or a merchant.
- Quote returned minor units and currency exactly. Never total or convert amounts yourself.

Choosing the item
- Refer to an item by an id a tool returned, or by the merchant name the member used. Never invent or guess an Inbox item id, a transaction id, a category id, or a recurring id.
- If a tool returns resolved: false, or a draft lists "item" in missingFields, the item is unknown or more than one could be meant. Show the returned candidates and ask the member which one. Never pick for them.

Resolving a category (UNKNOWN_CATEGORY, CLASSIFICATION_REVIEW)
- Use create_inbox_resolution_draft with ACCEPT_SUGGESTION only when the item returned a suggestion and the member wants it. Never accept a suggestion that was not returned.
- Use CHOOSE_CATEGORY when the member names a category, and pass that name as categoryName. If the draft lists "category" in missingFields, the name matched no category for this transaction: show the returned categoryCandidates and ask. Never choose a category for the member.
- Resolving a category changes only that transaction's category. It never changes an amount, an account, or a balance.

Resolving a recurring review (POSSIBLE_RECURRING)
- Use CONFIRM_RECURRING to confirm the detected recurring payment, or IGNORE_RECURRING to ignore it. Both go through Pace's canonical recurring service and neither creates or changes a Transaction.

What cannot be resolved
- MERCHANT_AMBIGUITY: Pace could not tell which merchant the transaction belongs to. Explain it. There is no way to resolve it yet: never offer to pick a merchant, resolve it, dismiss it, or mark it reviewed.
- POSSIBLE_TRANSFER: Pace suspects the expense is a transfer between the member's own accounts. Explain it. Pace cannot convert the transaction, create a transfer from it, or settle the item.
- Duplicates: Pace cannot confirm, merge, or remove a duplicate. Exact import duplicates are already skipped at import, and similar transactions are hints only.
- An Inbox item is never dismissed. If create_inbox_resolution_draft returns prepared: false, nothing was prepared: relay its explanation and offer no other action.

Resolving the whole Inbox
- Each draft resolves exactly one item. When the member asks to resolve the Inbox, list it first, say which items can be resolved and which cannot, and prepare one item at a time. Never decide a category or a recurring review on the member's behalf.

Missing information and approval
- If a returned draft lists missingFields, nothing can be submitted yet. Tell the member exactly what is missing and ask for it.
- If the draft is complete, show the member its approvalSummary and call submit_inbox_resolution_draft immediately. It always pauses for the member's approval before anything changes; never describe an item as resolved until its verified result returns.
- If a tool refuses or fails, relay its reason and do not retry with altered values. The item is still in the Inbox.
- Never invent ids, amounts, categories, or permissions. Tool results are authoritative over anything you expected.`,
  intents: {
    en: [
      "inbox", "my inbox", "review", "attention", "pending", "uncategorized", "unresolved", "todo",
      "categorize*", "categorise*", "suggest*", "suggested category", "recurring suggestion*",
    ],
    fr: [
      "boite de reception", "a verifier", "a traiter", "attention", "en attente", "non resolu*",
      "categorise*", "suggestion*", "suggere*", "categorie suggeree",
    ],
    de: [
      "posteingang", "prufen", "uberprufen", "aufmerksamkeit", "ausstehend", "unkategorisiert*", "offene",
      "kategorisier*", "vorschlag*", "vorgeschlagen*", "vorgeschlagene kategorie",
    ],
  },
  capabilities: [
    definePaceCapability({
      tool: "get_inbox_items",
      description:
        "List the authenticated workspace's open financial Inbox items with the unresolved count and a summary by reason. Each item carries why it needs attention and which resolutions it allows. Filter by one reason when the member asks for it. Use these facts to answer what needs attention; do not invent alerts.",
      inputSchema: inboxListInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getInboxItems"],
      run: (input, call) => call.services.getInboxItems(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_inbox_item",
      description:
        "Inspect one open Inbox item of the authenticated workspace by an id a tool returned or by merchant name: why it needs attention, its transaction, the category suggestion when there is one, the detected recurring payment when there is one, and which resolutions it allows. Returns candidates instead when the name is unknown or ambiguous.",
      inputSchema: inboxItemInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getInboxItem"],
      run: (input, call) => call.services.getInboxItem(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "create_inbox_resolution_draft",
      description:
        "Prepare the resolution of one open Inbox item: accept Pace's category suggestion, choose a category the member named, or confirm or ignore a detected recurring payment. The server resolves the item and the category, returns candidates when either is ambiguous, and applies the canonical Inbox resolution policy. For a merchant ambiguity or a suspected transfer it prepares nothing and returns an explanation instead.",
      inputSchema: inboxResolutionInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createInboxDraft"],
      async run({ operation, ...input }, call) {
        const outcome = await call.services.createInboxDraft(scopeOf(call), {
          inboxOperation: operation,
          ...input,
          ...eveCallReference(call),
        });
        return outcome.prepared ? presentInboxDraft(outcome.action) : outcome;
      },
      actionRef: actionIdOfOutput,
    }),
    definePaceCapability({
      tool: "submit_inbox_resolution_draft",
      description:
        "Submit a complete Inbox resolution draft for human approval and, only after Eve approves it, resolve the item through Pace's canonical Inbox resolution service and return the verified result.",
      inputSchema: z.object({ actionId: z.string().uuid() }).strict(),
      access: "commit",
      stages: ["VALIDATE", "APPROVAL", "EXECUTE", "VERIFY", "AUDIT"],
      requiredPermission: "manage_ledger",
      domainServices: ["getActionDetail", "requestApproval", "approveAction", "rejectAction", "executeApprovedInbox"],
      run: ({ actionId }, call) => call.services.executeApprovedInbox(scopeOf(call), actionId),
      actionRef: (input) => input.actionId,
    }),
  ],
});
