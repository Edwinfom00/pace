import { z } from "zod";

import {
  actionIdOfOutput,
  definePaceCapability,
  definePaceSubAgent,
  eveCallReference,
  scopeOf,
} from "@/modules/pace-agents/capability";

import { AGENT_BUDGET_FILTERS, AGENT_GOAL_FILTERS, AGENT_RULE_FILTERS } from "../agent-plans-view";
import { RULE_ACTION_TYPES, RULE_SET_OPERATORS, RULE_TEXT_OPERATORS } from "../rules/domain";
import { MAX_RULE_CONDITIONS, MAX_RULE_PRIORITY, MIN_RULE_PRIORITY } from "../rules/rule-contract";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const calendarMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const name = z.string().trim().min(1).max(160);
const amountText = z.string().trim().min(1).max(80);
const currency = z.string().trim().length(3).optional();
const sourceText = z.string().trim().min(1).max(1_000);
const limit = z.number().int().min(1).max(50).default(20);

const budgetReference = {
  budgetId: z.string().uuid().optional(),
  categoryName: name.optional(),
  overall: z.literal(true).optional(),
  month: calendarMonth.optional(),
};
const goalReference = { goalId: z.string().uuid().optional(), goalName: name.optional() };
const ruleReference = { ruleId: z.string().uuid().optional(), ruleName: name.optional() };

const given = (...values: readonly unknown[]) => values.filter((value) => value !== undefined).length;
const oneBudget = { message: "Give a budget id a tool returned, the budget's category name, or overall: true." };
const oneGoal = { message: "Give either a goal id a tool returned or the goal's name." };
const oneRule = { message: "Give either a rule id a tool returned or the rule's name." };

const budgetInput = z
  .object(budgetReference)
  .strict()
  .refine((input) => given(input.budgetId, input.categoryName, input.overall) === 1, oneBudget);
const goalInput = z
  .object(goalReference)
  .strict()
  .refine((input) => given(input.goalId, input.goalName) === 1, oneGoal);
const ruleInput = z
  .object(ruleReference)
  .strict()
  .refine((input) => given(input.ruleId, input.ruleName) === 1, oneRule);

const forecastInput = z
  .object({
    horizonDays: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(30),
    accountName: name.optional(),
  })
  .strict();

const budgetDraftInput = z
  .object({
    operation: z.enum(["CREATE", "EDIT", "ARCHIVE"]),
    ...budgetReference,
    subcategoryNames: z.array(name).min(1).max(50).optional(),
    wholeCategory: z.literal(true).optional(),
    amountText: amountText.optional(),
    currency,
    sourceText,
  })
  .strict()
  .refine((input) => given(input.budgetId, input.categoryName, input.overall) <= 1, oneBudget)
  .refine((input) => !(input.subcategoryNames && input.wholeCategory), {
    message: "Choose either the whole category or selected subcategories.",
  });

const goalDraftInput = z
  .object({
    operation: z.enum(["CREATE", "EDIT", "ARCHIVE", "COMPLETE"]),
    ...goalReference,
    name: name.optional(),
    targetAmountText: amountText.optional(),
    targetDate: calendarDate.optional(),
    clearTargetDate: z.literal(true).optional(),
    savedAmountText: amountText.optional(),
    currency,
    sourceText,
  })
  .strict()
  .refine((input) => given(input.goalId, input.goalName) <= 1, oneGoal);

const contributionDraftInput = z
  .object({
    operation: z.enum(["ADD", "CORRECT", "REVERSE"]),
    ...goalReference,
    contributionId: z.string().uuid().optional(),
    contributionAmountText: amountText.optional(),
    latestContribution: z.literal(true).optional(),
    amountText: amountText.optional(),
    currency,
    effectiveOn: calendarDate.optional(),
    note: z.string().trim().min(1).max(500).optional(),
    sourceText,
  })
  .strict()
  .refine((input) => given(input.goalId, input.goalName) <= 1, oneGoal)
  .refine((input) => given(input.contributionId, input.contributionAmountText, input.latestContribution) <= 1, {
    message: "Identify the contribution one way: its id, its amount, or latestContribution: true.",
  });

const ruleConditionInput = z
  .object({
    field: z.enum(["COUNTERPARTY", "NOTE", "ACCOUNT", "CATEGORY", "TRANSACTION_KIND", "ENTRY_ORIGIN"]),
    operator: z.enum([...RULE_TEXT_OPERATORS, ...RULE_SET_OPERATORS]),
    text: z.string().trim().min(1).max(160).optional(),
    values: z.array(name).min(1).max(50).optional(),
  })
  .strict();

const ruleDraftInput = z
  .object({
    operation: z.enum(["CREATE", "EDIT", "ENABLE", "DISABLE", "ARCHIVE"]),
    ...ruleReference,
    name: name.optional(),
    priority: z.number().int().min(MIN_RULE_PRIORITY).max(MAX_RULE_PRIORITY).optional(),
    conditions: z.array(ruleConditionInput).min(1).max(MAX_RULE_CONDITIONS).optional(),
    action: z.object({ type: z.enum(RULE_ACTION_TYPES), categoryName: name.optional() }).strict().optional(),
    sourceText,
  })
  .strict()
  .refine((input) => given(input.ruleId, input.ruleName) <= 1, oneRule);

function presentPlanningDraft(action: {
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

export const plansSubAgent = definePaceSubAgent({
  id: "plans",
  label: "Plans, Budgets and Goals",
  description:
    "Reads budgets, savings goals, the balance forecast, and rules; explains spending against a budget, progress toward a goal, projected balances, and what a rule does; and prepares budget, savings-goal, goal-contribution, and rule changes. Owns the plan draft, approval, and verified plan-write lifecycle. The forecast is read-only. Nothing here posts a transaction or moves money.",
  instructions: `Plans workflow:
Budgets
- Use get_budgets to list budgets and get_budget for one budget, named by its category as the member did (or overall: true for the overall budget). Both return the amount, what was spent, what remains, utilization, and whether it is over budget for the period being tracked. get_budget also returns the categories and subcategories that contributed to the spending.
- Budget spending is computed by the server from effective posted Transactions only. Transfers never count and refunds reduce it. A budget counts only its own currency; currencies are never combined or converted.
- Scope is explicit: OVERALL counts all spending, WHOLE_CATEGORY counts a category and every subcategory, SELECTED_SUBCATEGORIES counts only the listed subcategories. Say which one applies; never widen or narrow it yourself.
- Use create_budget_draft with CREATE for a new budget. Pass the category name the member used, subcategoryNames only when they named subcategories (otherwise the whole category is budgeted), the amount as text, and month as YYYY-MM only when they named a month; the current month is the default. Use EDIT to change the amount or the subcategory scope, and ARCHIVE to stop tracking a budget. A budget is never deleted and cannot be paused or resumed; offer to archive it instead.

Savings goals
- Use get_savings_goals to list goals and get_savings_goal for one goal: its target, saved amount, remaining amount, progress, required pace, and contribution history.
- Saved progress is the sum of recorded contributions. A contribution is a planning event only: it is not a Transaction, it moves no money, and it changes no account balance. Never describe a contribution as a transfer, a deposit, or a payment, and never say an account was debited or credited. To actually move money, point the member to the Transactions sub-agent.
- Use create_goal_draft with CREATE, EDIT, ARCHIVE, or COMPLETE. A goal completes on its own when its target is saved; COMPLETE is refused before that. There is no manual reopen: raising a completed goal's target with EDIT returns it to active.
- Use create_goal_contribution_draft with ADD to record progress. Use CORRECT to change the amount of a past contribution and REVERSE to cancel one. Identify the contribution by an id from get_savings_goal, by its amount, or with latestContribution: true only when the member said last or latest. Contribution history is append-only: a correction or reversal adds entries and never edits or deletes the original.

Forecast
- Use get_forecast for projected balances, projected inflows and outflows, and which recurring items drive them. It supports 30, 60, and 90 days from today only; if the member asks for another period, use the closest supported horizon and say which one you used.
- The forecast is read-only. currentBalance is an actual ledger balance. Every other figure is a projection built only from confirmed, active recurring items. Always call it projected or expected, never guaranteed, and mention when amounts are a range. A projection is not a Transaction and has changed no balance.
- Each currency is forecast separately. Never add, compare, or convert amounts across currencies.

Rules
- Use get_rules to list rules and get_rule for one rule: its conditions, its action, its priority, whether it is enabled, and its recent executions. Rules are evaluated in priority order with the lowest number first; for each action type only the first matching rule applies and later ones are shadowed. Never predict an outcome that differs from this order.
- A rule can only do one of two things: ASSIGN_CATEGORY or ROUTE_FOR_REVIEW. No rule can move money, create or split a transaction, change an amount, or change a balance. If the member asks for anything else, say that rules cannot do that and do not prepare a draft.
- Use create_rule_draft with CREATE, EDIT, ENABLE, DISABLE, or ARCHIVE. Build conditions only from what the member said: COUNTERPARTY or NOTE with text, TRANSACTION_KIND, ENTRY_ORIGIN, ACCOUNT and CATEGORY with names. Give a new rule a short name from the member's own words when they did not name it. The server resolves every name, picks the next priority when none is given, and runs the canonical dry run; report the dry run from the returned draft, never estimate it.
- A rule created through Pace starts disabled. Say so, and offer to enable it as a separate change.

Choosing the target
- Refer to a budget, goal, contribution, or rule by the name the member used, or by an id a tool returned. Never invent or guess an id, a category, an account, or a contribution.
- If a tool returns resolved: false, or a draft lists a missing field, the target or a named reference is unknown or more than one could be meant. Show the returned candidates or options and ask the member which one. Never pick for them.

Amounts
- Copy every amount as the member's exact text. Quote returned minor units and currency exactly. Never calculate totals, percentages, remaining amounts, progress, or projections yourself; the tools return them.
- An amount in a currency other than the plan's currency is refused. Relay that; never convert it.

Missing information and approval
- If a returned draft lists missingFields, nothing can be submitted yet. Tell the member exactly what is missing and ask for it. A draft is not edited; prepare a new one.
- If the draft is complete, show the member its approvalSummary and call submit_plan_draft immediately. It always pauses for the member's approval before anything changes; never describe a change as done until its verified result returns.
- If a tool refuses or fails, relay its reason and do not retry with altered values. A draft prepared against an older version is refused at execution; prepare a new one from the current state.
- Tool results are authoritative over anything you expected.`,
  intents: {
    en: [
      "plan*", "budget*", "goal*", "savings", "save", "target*", "limit*", "remaining",
      "contribution*", "contribute", "forecast*", "projected", "projection*", "will my balance",
      "30 days", "60 days", "90 days", "rule*", "a rule",
    ],
    fr: [
      "plan*", "budget*", "objectif*", "epargne*", "epargner", "economiser", "plafond*", "limite*",
      "contribution*", "versement*", "prevision*", "projection*", "regle", "regles",
    ],
    de: [
      "plan", "plane", "budget*", "ziel*", "sparziel*", "sparen", "ersparnis*", "limit*", "ubrig",
      "einzahlung*", "prognose*", "regel", "regeln",
    ],
  },
  capabilities: [
    definePaceCapability({
      tool: "get_budgets",
      description:
        "List the authenticated workspace's budgets with their scope, amount, period, and the server-computed spent, remaining, and utilization for the period being tracked. Spending comes from effective posted Transactions only; transfers are excluded and refunds reduce it.",
      inputSchema: z.object({ filter: z.enum(AGENT_BUDGET_FILTERS).default("ACTIVE"), limit }).strict(),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getBudgets"],
      run: (input, call) => call.services.getBudgets(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_budget",
      description:
        "Inspect one budget of the authenticated workspace by its category name, by overall: true, or by an id a tool returned: amount, spent, remaining, utilization, its explicit whole-category or selected-subcategory scope, and the categories and subcategories that contributed to the spending. Returns candidates instead when the budget is unknown or ambiguous.",
      inputSchema: budgetInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getBudget"],
      run: (input, call) => call.services.getBudget(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_savings_goals",
      description:
        "List the authenticated workspace's savings goals with target, saved amount, remaining amount, progress, and required pace. Saved progress is the sum of recorded contributions and never an account balance.",
      inputSchema: z.object({ filter: z.enum(AGENT_GOAL_FILTERS).default("ALL"), limit }).strict(),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getSavingsGoals"],
      run: (input, call) => call.services.getSavingsGoals(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_savings_goal",
      description:
        "Inspect one savings goal of the authenticated workspace by name or by an id a tool returned: target, saved, remaining, progress, and its append-only contribution history with which entries can be corrected or reversed. Contributions are planning progress only and never Transactions. Returns candidates instead when the goal is unknown or ambiguous.",
      inputSchema: goalInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getSavingsGoal"],
      run: (input, call) => call.services.getSavingsGoal(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_forecast",
      description:
        "Project the authenticated workspace's balances over the next 30, 60, or 90 days, optionally for one account by name. Returns, per currency, the actual current balance and the projected inflows, outflows, and balance, plus the confirmed active recurring items behind them. It is a read-only estimate: nothing is posted, no balance changes, and currencies are never combined.",
      inputSchema: forecastInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getForecast"],
      run: (input, call) => call.services.getForecast(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_rules",
      description:
        "List the authenticated workspace's rules with their conditions, action, priority, and status (ACTIVE means enabled, PAUSED means disabled, ARCHIVED). A rule can only assign a category or route a transaction for review.",
      inputSchema: z
        .object({ filter: z.enum(AGENT_RULE_FILTERS).default("ALL"), search: z.string().trim().min(1).max(160).optional(), limit })
        .strict(),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getRules"],
      run: (input, call) => call.services.getRules(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "get_rule",
      description:
        "Inspect one rule of the authenticated workspace by name or by an id a tool returned: its conditions, action, priority, status, and recent executions. Returns candidates instead when the rule is unknown or ambiguous.",
      inputSchema: ruleInput,
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getRule"],
      run: (input, call) => call.services.getRule(scopeOf(call), input),
    }),
    definePaceCapability({
      tool: "create_budget_draft",
      description:
        "Prepare creating, editing, or archiving a budget from the member's explicit words. The server resolves the category and subcategories by name, parses the amount, and previews the current matching spend. It sets a spending plan only and never touches a Transaction or a balance.",
      inputSchema: budgetDraftInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createPlanningDraft"],
      async run(input, call) {
        return presentPlanningDraft(
          await call.services.createPlanningDraft(scopeOf(call), { family: "BUDGET", ...input, ...eveCallReference(call) }),
        );
      },
      actionRef: actionIdOfOutput,
    }),
    definePaceCapability({
      tool: "create_goal_draft",
      description:
        "Prepare creating, editing, archiving, or completing a savings goal, named as the member did or by an id a tool returned. It changes the goal's plan only; it never moves money or touches an account.",
      inputSchema: goalDraftInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createPlanningDraft"],
      async run(input, call) {
        return presentPlanningDraft(
          await call.services.createPlanningDraft(scopeOf(call), { family: "GOAL", ...input, ...eveCallReference(call) }),
        );
      },
      actionRef: actionIdOfOutput,
    }),
    definePaceCapability({
      tool: "create_goal_contribution_draft",
      description:
        "Prepare adding a contribution to a savings goal, or correcting or reversing a past one. A contribution records goal progress only: it creates no Transaction, moves no money, and changes no account balance. Corrections and reversals append entries and keep the original in the history.",
      inputSchema: contributionDraftInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createPlanningDraft"],
      async run(input, call) {
        return presentPlanningDraft(
          await call.services.createPlanningDraft(scopeOf(call), {
            family: "CONTRIBUTION",
            ...input,
            ...eveCallReference(call),
          }),
        );
      },
      actionRef: actionIdOfOutput,
    }),
    definePaceCapability({
      tool: "create_rule_draft",
      description:
        "Prepare creating, editing, enabling, disabling, or archiving a rule. The only actions are ASSIGN_CATEGORY and ROUTE_FOR_REVIEW; no rule can move money or change an amount or balance. The server resolves category and account names, validates the rule against the canonical contract, and returns the canonical dry run over recent transactions.",
      inputSchema: ruleDraftInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createPlanningDraft"],
      async run(input, call) {
        return presentPlanningDraft(
          await call.services.createPlanningDraft(scopeOf(call), { family: "RULE", ...input, ...eveCallReference(call) }),
        );
      },
      actionRef: actionIdOfOutput,
    }),
    definePaceCapability({
      tool: "submit_plan_draft",
      description:
        "Submit a complete budget, savings-goal, contribution, or rule draft for human approval and, only after Eve approves it, apply it through Pace's canonical Plans and Rules services and return the verified result.",
      inputSchema: z.object({ actionId: z.string().uuid() }).strict(),
      access: "commit",
      stages: ["VALIDATE", "APPROVAL", "EXECUTE", "VERIFY", "AUDIT"],
      requiredPermission: "manage_ledger",
      domainServices: ["getActionDetail", "requestApproval", "approveAction", "rejectAction", "executeApprovedPlanning"],
      run: ({ actionId }, call) => call.services.executeApprovedPlanning(scopeOf(call), actionId),
      actionRef: (input) => input.actionId,
    }),
  ],
});
