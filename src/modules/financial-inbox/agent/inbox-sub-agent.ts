import { z } from "zod";

import { definePaceCapability, definePaceSubAgent, scopeOf } from "@/modules/pace-agents/capability";

export const inboxSubAgent = definePaceSubAgent({
  id: "inbox",
  label: "Inbox",
  description:
    "Reads open financial Inbox items that need the member's attention, such as uncategorized transactions and recurring-payment reviews. Read-only: it never resolves an item.",
  instructions: `Inbox workflow:
- Use get_inbox_items to answer what needs attention. Report only the returned items and the returned unresolved count; never invent an alert or infer one from other data.
- Resolving, categorizing, or dismissing an Inbox item is not available to Pace. Point the member to the Inbox to review it.`,
  intents: {
    en: ["inbox", "review", "attention", "pending", "uncategorized", "unresolved", "todo"],
    fr: ["boite de reception", "a verifier", "a traiter", "attention", "en attente", "non resolu*"],
    de: ["posteingang", "prufen", "uberprufen", "aufmerksamkeit", "ausstehend", "unkategorisiert*", "offene"],
  },
  capabilities: [
    definePaceCapability({
      tool: "get_inbox_items",
      description:
        "Read open authenticated-workspace financial Inbox items. Use these facts to answer what needs attention; do not invent alerts.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5) }).strict(),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getInboxItems"],
      run: ({ limit }, call) => call.services.getInboxItems(scopeOf(call), limit),
    }),
  ],
});
