import { z } from "zod";

import { definePaceCapability, definePaceSubAgent, scopeOf } from "@/modules/pace-agents/capability";

export const insightsSubAgent = definePaceSubAgent({
  id: "insights",
  label: "Insights and Reports",
  description:
    "Explains deterministic Money Engine insights, monthly totals, spending pace, trends, and anomalies. Read-only: an insight never authorizes a change.",
  instructions: `Insights workflow:
- Use get_overview_summary for monthly totals or pace. Do not duplicate its calculations.
- For a financial trend, anomaly, budget-risk, recurring-payment, or goal-progress question, call get_insight_context before answering. Its Money Engine facts are authoritative: quote its amount strings, percentages, baselines, dates, and action suggestions without recalculating or inventing any value.
- Explain those returned facts concisely in the authenticated member's preferred UI language. The workspace locale, country, currency, and timezone never override that language choice.
- An insight can suggest reviewing transactions or a plan. It never authorizes a mutation. If the member chooses a plan change, follow the Plans sub-agent's existing prepare → submit_plan_draft approval lifecycle exactly; never make a second insight-specific write path.`,
  intents: {
    en: [
      "insight*", "report*", "trend*", "summary", "overview", "analysis", "analyze", "anomal*", "unusual",
      "compare", "comparison", "how much", "total*", "pace", "this month", "last month", "spending",
    ],
    fr: [
      "analyse*", "rapport*", "tendance*", "resume", "bilan", "apercu", "anomalie*", "inhabituel*",
      "comparer", "comparaison", "combien", "total", "rythme", "ce mois", "mois dernier",
    ],
    de: [
      "einblick*", "bericht*", "trend*", "zusammenfassung", "uberblick", "analyse*", "anomalie*",
      "ungewohnlich*", "vergleich*", "wie viel", "gesamt*", "tempo", "diesen monat", "letzten monat",
    ],
  },
  capabilities: [
    definePaceCapability({
      tool: "get_overview_summary",
      description:
        "Read the authenticated workspace's deterministic monthly spending, pace, and expected-month summary. Use it instead of calculating totals yourself.",
      inputSchema: z
        .object({ period: z.enum(["CURRENT_MONTH", "PREVIOUS_MONTH"]).default("CURRENT_MONTH") })
        .strict(),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getOverviewSummary"],
      run: ({ period }, call) => call.services.getOverviewSummary(scopeOf(call), period),
    }),
    definePaceCapability({
      tool: "get_insight_context",
      description:
        "Get current deterministic financial insights for the authenticated workspace. Use before explaining financial trends or suggesting a review.",
      inputSchema: z.object({}),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getInsightContext"],
      run: (_input, call) => call.services.getInsightContext(scopeOf(call), call.envelope.language),
    }),
  ],
});
