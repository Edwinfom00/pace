import { z } from "zod";

import { definePaceCapability, definePaceSubAgent, scopeOf } from "@/modules/pace-agents/capability";

export const recurringSubAgent = definePaceSubAgent({
  id: "recurring",
  label: "Recurring",
  description:
    "Reads detected and confirmed recurring payments, subscriptions, and bills. Read-only: it never confirms, edits, or dismisses a recurring payment.",
  instructions: `Recurring workflow:
- Use get_recurring_payments for recurring-payment, subscription, and bill questions. Present them with a recurring-list block rather than a Markdown list.
- Cadence, expected amount, and next expected date come from Pace's recurring detection. Never predict a charge, annualize an amount, or total subscriptions yourself.
- Confirming, editing, or dismissing a recurring payment is not available to Pace. Point the member to the Recurring page.`,
  intents: {
    en: ["recurring", "subscription*", "bill*", "rent", "membership*", "renewal*"],
    fr: ["recurrent*", "abonnement*", "facture*", "loyer", "mensualite*", "prelevement*", "renouvellement*"],
    de: ["wiederkehrend*", "abo", "abos", "abonnement*", "rechnung*", "miete", "dauerauftrag*", "verlangerung*"],
  },
  capabilities: [
    definePaceCapability({
      tool: "get_recurring_payments",
      description:
        "Read detected recurring payments for the authenticated workspace. Use a recurring-list block rather than a Markdown list when presenting them.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(10) }).strict(),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getRecurringPayments"],
      run: ({ limit }, call) => call.services.getRecurringPayments(scopeOf(call), limit),
    }),
  ],
});
