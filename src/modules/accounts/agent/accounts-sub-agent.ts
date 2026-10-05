import { z } from "zod";

import { definePaceCapability, definePaceSubAgent, scopeOf } from "@/modules/pace-agents/capability";

export const accountsSubAgent = definePaceSubAgent({
  id: "accounts",
  label: "Accounts",
  description:
    "Reads the workspace's accounts and their canonical ledger balances. Read-only: it never opens, edits, archives, or rebalances an account.",
  instructions: `Accounts workflow:
- Use get_accounts for account lists, account status, and balances. Each balance is the canonical ledger balance in that account's own currency; quote the returned minor units and currency exactly.
- The returned summary is already grouped per currency. Never add, net, or compare balances across currencies, and never derive a balance from transactions yourself.
- Account creation, editing, archiving, and opening balances are not available to Pace. Point the member to the Accounts page instead of drafting such a change.`,
  intents: {
    en: ["account*", "balance*", "wallet*", "cash", "bank", "checking", "mobile money", "net worth"],
    fr: ["compte*", "solde*", "portefeuille*", "especes", "banque", "tresorerie"],
    de: ["konto", "konten", "kontostand", "saldo", "guthaben", "bargeld", "geldborse"],
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
  ],
});
