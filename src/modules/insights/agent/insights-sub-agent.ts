import { z } from "zod";

import {
  definePaceCapability,
  definePaceSubAgent,
  scopeOf,
} from "@/modules/pace-agents/capability";
import type {
  PaceCapabilityCall,
  PaceCapabilityTraceScope,
} from "@/modules/pace-agents/domain";
import { REPORT_LANGUAGES } from "@/modules/reports/domain/financial-report.types";

import {
  AGENT_INSIGHT_CHARTS,
  AGENT_INSIGHTS_PERIODS,
  AGENT_REPORT_PERIODS,
  type AgentInsightsScope,
  type AgentReportExportResult,
} from "../agent-insights-view";
import { RECURRING_HORIZONS } from "../recurring/insights-recurring.types";
import { TRENDS_RANGES } from "../trends/insights-trends.types";

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/)
  .optional();
const name = z.string().trim().min(1).max(160).optional();
const month = z.number().int().min(1).max(12).optional();
const year = z.number().int().min(2000).max(2100).optional();
const periodFields = {
  period: z.enum(AGENT_INSIGHTS_PERIODS).optional(),
  month,
  year,
};

type PeriodInput = {
  readonly period?: string;
  readonly month?: number;
  readonly year?: number;
};
const onePeriod = (input: PeriodInput) =>
  !(input.period && input.month) && !(input.year && !input.month);
const onePeriodMessage = {
  message:
    "Give either a relative period or a calendar month number, and a year only together with a month.",
};

const analyticsInput = z
  .object({ ...periodFields, currency })
  .strict()
  .refine(onePeriod, onePeriodMessage);

const categoryInput = z
  .object({
    categoryId: z.string().uuid().optional(),
    categoryName: name,
    ...periodFields,
    currency,
  })
  .strict()
  .refine(onePeriod, onePeriodMessage)
  .refine(
    (input) => Boolean(input.categoryId) !== Boolean(input.categoryName),
    {
      message:
        "Give either a category id a tool returned or the category's name.",
    },
  );

const accountInput = z
  .object({
    accountId: z.string().uuid().optional(),
    accountName: name,
    ...periodFields,
  })
  .strict()
  .refine(onePeriod, onePeriodMessage)
  .refine((input) => Boolean(input.accountId) !== Boolean(input.accountName), {
    message: "Give either an account id a tool returned or the account's name.",
  });

const trendsInput = z
  .object({ range: z.enum(TRENDS_RANGES).default("6m"), currency })
  .strict();

const recurringInput = z
  .object({
    ...periodFields,
    horizon: z.enum(RECURRING_HORIZONS).default("30d"),
    currency,
  })
  .strict()
  .refine(onePeriod, onePeriodMessage);

const chartInput = z
  .object({
    chart: z.enum(AGENT_INSIGHT_CHARTS),
    range: z.enum(TRENDS_RANGES).default("6m"),
    ...periodFields,
    currency,
  })
  .strict()
  .refine(onePeriod, onePeriodMessage);

const reportInput = z
  .object({
    period: z.enum(AGENT_REPORT_PERIODS).optional(),
    month,
    year,
    language: z.enum(REPORT_LANGUAGES).optional(),
    currency,
    includeTransactions: z.boolean().default(true),
    includeAccounts: z.boolean().default(true),
    includeRecurring: z.boolean().default(true),
    includeInsights: z.boolean().default(true),
  })
  .strict()
  .refine(onePeriod, onePeriodMessage);

const contextOf = (call: PaceCapabilityCall) => ({
  language: call.envelope.language,
});

function insightsTraceScope(
  _input: unknown,
  output: unknown,
): PaceCapabilityTraceScope | null {
  if (typeof output !== "object" || output === null) return null;
  if ((output as { kind?: unknown }).kind === "report_export_result") {
    const report = output as AgentReportExportResult;
    return {
      period: { from: report.period.from, to: report.period.to },
      currencies: [report.currency.code],
      report: { language: report.language, pageCount: report.pageCount },
    };
  }
  const scope = (output as { scope?: AgentInsightsScope }).scope;
  if (!scope) return null;
  return {
    period: { from: scope.period.from, to: scope.period.to },
    currencies: [scope.currency.code],
    report: null,
  };
}

export const insightsSubAgent = definePaceSubAgent({
  id: "insights",
  label: "Insights and Reports",
  description:
    "Answers analytical questions from Pace's canonical Insights read models: workspace income, spending, and net cash flow, period comparisons, category, account, trend, and recurring analytics, and deterministic insights. Builds charts from that same data and prepares the financial report PDF. Read-only: it never changes financial data and an insight never authorizes a change.",
  instructions: `Insights workflow:
Choosing the read
- Use get_financial_analytics for workspace totals in a month or range: income, spending, net cash flow, the comparison with the previous period, where the money went by category, what changed the most, and the deterministic insights for that month.
- Use get_category_analysis for one spending category: what was spent, its comparison with the previous period, its subcategories, its merchants, and the transactions that contribute to it.
- Use get_account_analysis for one account: its balance at the start and end of the period, inflows, outflows, net movement, top spending categories, and important movements.
- Use get_financial_trends for 3, 6, or 12 months: monthly income, spending, net, and transaction counts, category trends, and which categories grew or fell the most.
- Use get_recurring_analytics for what recurring items actually cost, their share of spending, price changes, and what is projected next.
- Use get_overview_summary only for this month's spending pace and expected month total. Use get_insight_context for the saved insights list.
- Use create_insight_chart when the member asks for a chart, graph, diagram, or visual, or when a trend or breakdown is clearer as a picture.
- Use generate_financial_report when the member asks to generate, create, or export their financial report or PDF.

Periods
- Never work out a date range yourself. Pass period (THIS_MONTH, LAST_MONTH, LAST_3_MONTHS, LAST_6_MONTHS, LAST_12_MONTHS), or pass month as the calendar month number the member named, with year only if they stated one. The server resolves it in the workspace time zone and returns the exact dates in scope.period; state those dates, not your own.
- These read models work in whole calendar months. For a question about today, yesterday, or a week, say that Insights reports by month and that the Transactions sub-agent lists a day or a week.
- Every comparison is with scope.comparedWith, the period of the same length immediately before. An in-progress month is compared with the same number of days of the previous month. To compare two periods that are not adjacent, read each one and report both figures side by side without computing a difference.

Authority of the figures
- Every amount, percentage, share, count, direction, and date comes from a tool result. Quote the returned minor units and currency exactly. Never add, subtract, average, annualize, convert, round into a new figure, or derive a percentage yourself.
- If the member's assumption disagrees with a tool result, the tool result is right. Say what the data shows, plainly and without agreeing first. If spending went down and they said it went up, tell them it went down and by how much.
- State only what the data establishes. "Transport spending rose 32%" is a fact when a tool returned it. Never add a cause, motive, habit, or life event the data does not contain, and never write "you probably", "it seems you", or "you must have". To explain why a figure moved, point only to returned rows: the subcategories, merchants, and contributingTransactions that rose.
- Never invent a recommendation. Deterministic insights and signals are the only observations you may offer; you may rephrase one for clarity, and you may not add a fact, figure, or advice it does not contain.
- If hasActivity is false or a list is empty, say there is no data for that period. Never fill a gap with an estimate.

Currencies
- Each result covers exactly one currency, named in scope.currency.code. scope.currency.reportedSeparately lists other currencies that have their own transactions. Never add or compare amounts across currencies and never convert one. To report another currency, call the tool again with that currency and present the results separately.
- If scope.currency.requestedButUnavailable is set, there are no transactions in the currency the member asked for; say so rather than presenting the returned currency as theirs.

Transfers, refunds, corrections
- In workspace analytics a transfer is neither income nor spending, a refund reduces spending, and a corrected transaction counts once at its corrected value.
- get_account_analysis is different: it reports movements of one account, where a transfer in is an inflow and a transfer out is an outflow. Never call account inflows income or account outflows spending, and never mix account movement with workspace totals. This is why an account's balance can fall while workspace spending also falls.

Actual versus projected
- In get_recurring_analytics, actual is real transactions and projected is expected future occurrences. A projection has not been paid, changes no balance, and is not spending. Never add the two, and always call a projection expected or projected.
- For a question about future spending, answer only with projected recurring commitments and say it is a projection from confirmed recurring items, not a forecast of all spending. Balance forecasts belong to the Plans sub-agent.

Charts
- create_insight_chart returns block, a finished chart. Present it with a chart block by copying block exactly as returned: same chartType, title, currency, categories, series, and note. Never build a chart block from other tool results, never add, drop, reorder, or edit a value or label, and never draw a chart as text or a Markdown table instead.
- The chart block is Pace's dedicated chart component; it draws the chart and gives the member a Download PNG button. Tell the member they can download the chart as a PNG from it. Do not describe any other way to save it.
- Chart choices: INCOME_VS_SPENDING, SPENDING_TREND, NET_CASH_FLOW, CATEGORY_TRENDS, and RECURRING_VS_OTHER_SPENDING plot months over range (3m, 6m, 12m). SPENDING_BY_CATEGORY plots one period; pass period or month for it.
- If hasData is false there is nothing to plot; say so and show no chart block.

Reports
- generate_financial_report is a read and export. It needs no approval because it changes nothing. If the member names no period, use THIS_MONTH. Pass language (en, fr, de) only when the member asked for one or wrote the request in that language; otherwise leave it out and the member's own language is used. Leave every include option on unless the member asks to leave a section out.
- Present the result with a report-export block by copying block exactly as returned. That block is the download control: Pace renders the PDF when the member uses it. Never write, guess, or describe a file link.
- State the period from the result, the language, and the page count only as returned in pageCount. If currency.excludedCurrencies is not empty, say those currencies are not in this report.

Boundaries
- You cannot change anything. If the member asks to change a budget, goal, rule, transaction, account, or recurring item, say that it belongs to the sub-agent that owns it and do not attempt it.
- An insight can suggest reviewing transactions or a plan. It never authorizes a mutation. If the member chooses a plan change, follow the Plans sub-agent's existing prepare → submit_plan_draft approval lifecycle exactly; never make a second insight-specific write path.
- For budgets, goals, and what is left to spend, the Plans sub-agent's results are authoritative; do not derive them from spending figures.
- If a tool returns resolved: false, the category or account is unknown or more than one could be meant. Show the returned candidates and ask which one. Never pick for the member.
- If a tool refuses or fails, relay its reason and do not retry with altered values.`,
  intents: {
    en: [
      "insight*",
      "report*",
      "trend*",
      "summary",
      "overview",
      "analysis",
      "analyze",
      "anomal*",
      "unusual",
      "compare",
      "comparison",
      "how much",
      "total*",
      "pace",
      "this month",
      "last month",
      "spending",
      "cash flow",
      "breakdown",
      "chart*",
      "graph*",
      "diagram*",
      "pdf",
    ],
    fr: [
      "analyse*",
      "rapport*",
      "tendance*",
      "resume",
      "bilan",
      "apercu",
      "anomalie*",
      "inhabituel*",
      "comparer",
      "comparaison",
      "combien",
      "total",
      "rythme",
      "ce mois",
      "mois dernier",
      "graphique*",
      "diagramme*",
      "pdf",
    ],
    de: [
      "einblick*",
      "bericht*",
      "finanzbericht*",
      "trend*",
      "zusammenfassung",
      "uberblick",
      "analyse*",
      "anomalie*",
      "ungewohnlich*",
      "vergleich*",
      "wie viel",
      "gesamt*",
      "tempo",
      "diesen monat",
      "letzten monat",
      "diagramm*",
      "grafik*",
      "pdf",
    ],
  },
  capabilities: [
    definePaceCapability({
      tool: "get_overview_summary",
      description:
        "Read the authenticated workspace's deterministic monthly spending, pace, and expected-month summary. Use it instead of calculating totals yourself.",
      inputSchema: z
        .object({
          period: z
            .enum(["CURRENT_MONTH", "PREVIOUS_MONTH"])
            .default("CURRENT_MONTH"),
        })
        .strict(),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getOverviewSummary"],
      run: ({ period }, call) =>
        call.services.getOverviewSummary(scopeOf(call), period),
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
      run: (_input, call) =>
        call.services.getInsightContext(scopeOf(call), call.envelope.language),
    }),
    definePaceCapability({
      tool: "get_financial_analytics",
      description:
        "Read the authenticated workspace's income, spending, net cash flow, and daily average for a month or range, each compared with the previous period, with the category breakdown, the biggest changes, and that month's deterministic insights. Computed by the server from effective posted Transactions in one currency; transfers are excluded and refunds reduce spending.",
      inputSchema: analyticsInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getInsightsAnalytics"],
      run: (input, call) =>
        call.services.getInsightsAnalytics(
          scopeOf(call),
          input,
          contextOf(call),
        ),
      traceScope: insightsTraceScope,
    }),
    definePaceCapability({
      tool: "get_category_analysis",
      description:
        "Analyze one spending category of the authenticated workspace, by name or by an id a tool returned: amount spent, comparison with the previous period, share of workspace spending, subcategories, merchants, the contributing transactions, and deterministic insights. Returns candidates instead when the name is unknown or ambiguous.",
      inputSchema: categoryInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getCategoryInsights"],
      run: (input, call) =>
        call.services.getCategoryInsights(
          scopeOf(call),
          input,
          contextOf(call),
        ),
      traceScope: insightsTraceScope,
    }),
    definePaceCapability({
      tool: "get_account_analysis",
      description:
        "Analyze one account of the authenticated workspace, by name or by an id a tool returned: balance at the start and end of the period, inflows, outflows, net movement, top spending categories, counterparties, and important movements. These are account movements, where transfers count as inflows and outflows; they are not workspace income or spending. Returns candidates instead when the name is unknown or ambiguous.",
      inputSchema: accountInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getAccountInsights"],
      run: (input, call) =>
        call.services.getAccountInsights(scopeOf(call), input, contextOf(call)),
      traceScope: insightsTraceScope,
    }),
    definePaceCapability({
      tool: "get_financial_trends",
      description:
        "Read the authenticated workspace's 3, 6, or 12 month trends ending this month: monthly income, spending, net, recurring spending, and transaction counts, per-category monthly spending, the categories that rose and fell the most against the previous range, and deterministic trend signals. One currency per call.",
      inputSchema: trendsInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getInsightsTrends"],
      run: (input, call) =>
        call.services.getInsightsTrends(scopeOf(call), input, contextOf(call)),
      traceScope: insightsTraceScope,
    }),
    definePaceCapability({
      tool: "get_recurring_analytics",
      description:
        "Read recurring analytics for the authenticated workspace. actual holds real recurring spending and income from effective Transactions, its share of spending, monthly history, top items, and price changes. projected holds expected upcoming occurrences over 30, 60, or 90 days; nothing projected has been paid and none of it is spending.",
      inputSchema: recurringInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getRecurringInsights"],
      run: (input, call) =>
        call.services.getRecurringInsights(
          scopeOf(call),
          input,
          contextOf(call),
        ),
      traceScope: insightsTraceScope,
    }),
    definePaceCapability({
      tool: "create_insight_chart",
      description:
        "Create a finished, formatted chart of the authenticated workspace's canonical Insights data: income vs spending, spending trend, net cash flow, category trends, or recurring vs other spending by month, or spending by category for one period. Returns block, a chart block to show unchanged with Pace's chart component, which also lets the member download it as a PNG.",
      inputSchema: chartInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["createInsightChart"],
      run: (input, call) =>
        call.services.createInsightChart(scopeOf(call), input, contextOf(call)),
      traceScope: insightsTraceScope,
    }),
    definePaceCapability({
      tool: "generate_financial_report",
      description:
        "Prepare the authenticated workspace's monthly financial report for PDF export in English, French, or German, with the optional transactions, accounts, recurring, and insights sections. It reads and exports only and changes no financial data. Returns the confirmed period, language, page count, and block, a report-export block that is the member's download control. It returns no file link.",
      inputSchema: reportInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["generateFinancialReport"],
      run: (input, call) =>
        call.services.generateFinancialReport(
          scopeOf(call),
          input,
          contextOf(call),
        ),
      traceScope: insightsTraceScope,
    }),
  ],
});
