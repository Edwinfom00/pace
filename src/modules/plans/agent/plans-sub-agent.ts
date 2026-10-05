import { z } from "zod";

import {
  actionIdOfOutput,
  definePaceCapability,
  definePaceSubAgent,
  eveCallReference,
  scopeOf,
} from "@/modules/pace-agents/capability";

const planDraftInput = z
  .object({
    actionType: z.enum(["BUDGET_CREATE", "BUDGET_UPDATE", "SAVINGS_GOAL_CREATE", "SAVINGS_GOAL_UPDATE"]),
    budgetId: z.string().uuid().optional(),
    goalId: z.string().uuid().optional(),
    scope: z.enum(["OVERALL", "CATEGORY"]).optional(),
    categoryId: z.string().uuid().optional(),
    amountText: z.string().trim().max(80).optional(),
    startsOnText: z.string().trim().max(20).optional(),
    endsOnText: z.string().trim().max(20).optional(),
    budgetStatus: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
    name: z.string().trim().max(160).optional(),
    targetAmountText: z.string().trim().max(80).optional(),
    currentSavedText: z.string().trim().max(80).optional(),
    targetDateText: z.string().trim().max(20).optional(),
    clearTargetDate: z.boolean().optional(),
    goalStatus: z.enum(["ACTIVE", "COMPLETED", "PAUSED", "ARCHIVED"]).optional(),
    sourceText: z.string().trim().min(1).max(1_000),
  })
  .strict();

const planDraftEdit = z
  .object({
    actionId: z.string().uuid(),
    scope: z.enum(["OVERALL", "CATEGORY"]).nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    amountText: z.string().trim().max(80).nullable().optional(),
    startsOnText: z.string().trim().max(20).nullable().optional(),
    endsOnText: z.string().trim().max(20).nullable().optional(),
    budgetStatus: z.enum(["ACTIVE", "ARCHIVED"]).nullable().optional(),
    name: z.string().trim().max(160).nullable().optional(),
    targetAmountText: z.string().trim().max(80).nullable().optional(),
    currentSavedText: z.string().trim().max(80).nullable().optional(),
    targetDateText: z.string().trim().max(20).nullable().optional(),
    clearTargetDate: z.boolean().nullable().optional(),
    goalStatus: z.enum(["ACTIVE", "COMPLETED", "PAUSED", "ARCHIVED"]).nullable().optional(),
    sourceText: z.string().trim().max(1_000).nullable().optional(),
  })
  .strict();

export const plansSubAgent = definePaceSubAgent({
  id: "plans",
  label: "Plans, Budgets and Goals",
  description:
    "Reads budget and savings-goal status and prepares budget or savings-goal changes. Owns the plan draft, approval, and verified plan-write lifecycle.",
  instructions: `Plans workflow:
- A plan is either a monthly budget or an explicit savings goal. Budgets are computed exclusively from posted ledger transactions; transfers do not consume a budget and refunds reduce it. Savings-goal progress is only an explicit saved amount, never inferred from a balance or transaction.
- For a plan request, first call get_plan_context. It is the authoritative workspace, currency, timezone, expense-category, budget, and goal context.
- When the user asks about budget consumption, remaining amounts, over-budget state, goal progress, or required pace, call get_plan_status and report its returned values without recalculating them.
- Then call create_plan_draft using only target and category ids returned by that context. Copy all money as exact user text; never calculate minor units, percentages, cadence, or required pace. Use known ISO dates only. A missing budget start defaults server-side to the current monthly period; never guess an unknown workspace, currency, target, or destructive request.
- For changing or pausing a plan, use the exact budgetId or goalId from get_plan_context. If a target cannot be matched, leave the editable draft incomplete rather than choosing one.
- If a returned plan draft is incomplete, say an editable draft is ready. If it is complete, call submit_plan_draft immediately. It always pauses for an Eve approval before any plan mutation.
- Never modify a budget or savings goal except through submit_plan_draft after approval. Do not create budgets, forecasts, insights, imports, provider connections, investments, or autonomous follow-up work.`,
  intents: {
    en: ["plan*", "budget*", "goal*", "savings", "save", "target*", "limit*", "remaining"],
    fr: ["plan*", "budget*", "objectif*", "epargne*", "epargner", "economiser", "plafond*", "limite*"],
    de: ["plan", "plane", "budget*", "ziel*", "sparziel*", "sparen", "ersparnis*", "limit*", "ubrig"],
  },
  capabilities: [
    definePaceCapability({
      tool: "get_plan_context",
      description:
        "Get the authenticated workspace's authoritative plan context before drafting a budget or savings-goal change. It includes currency, timezone, expense categories, existing budgets, and savings goals.",
      inputSchema: z.object({}),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getPlanContext"],
      run: (_input, call) => call.services.getPlanContext(scopeOf(call)),
    }),
    definePaceCapability({
      tool: "get_plan_status",
      description:
        "Read deterministic budget and savings-goal status for the authenticated workspace. It returns current posted spend, remaining amount, usage versus elapsed-period expectation, and explicit savings-goal progress and required pace. Never calculate or infer those values yourself.",
      inputSchema: z.object({}),
      access: "read",
      stages: ["UNDERSTAND"],
      requiredPermission: "read",
      domainServices: ["getPlanStatus"],
      run: (_input, call) => call.services.getPlanStatus(scopeOf(call)),
    }),
    definePaceCapability({
      tool: "create_plan_draft",
      description:
        "Create an editable typed plan draft after get_plan_context. Use ids only from that context, copy money as the user's exact text, and use ISO YYYY-MM-DD dates (or YYYY-MM for a whole budget month). The server resolves currency, parses amounts, and applies known defaults.",
      inputSchema: planDraftInput,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["createPlanDraft"],
      async run(input, call) {
        const action = await call.services.createPlanDraft(scopeOf(call), { ...input, ...eveCallReference(call) });
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
      tool: "edit_plan_draft",
      description:
        "Edit a DRAFT budget or savings-goal action. Only edit an action id created in this workspace; use ids from get_plan_context and preserve exact user money text.",
      inputSchema: planDraftEdit,
      access: "prepare",
      stages: ["PREPARE_ACTION"],
      requiredPermission: "manage_ledger",
      domainServices: ["editPlanDraft"],
      async run({ actionId, ...input }, call) {
        const action = await call.services.editPlanDraft(scopeOf(call), actionId, input);
        return { actionId: action.id, status: action.status, draft: action.draft };
      },
      actionRef: actionIdOfOutput,
    }),
    definePaceCapability({
      tool: "submit_plan_draft",
      description:
        "Submit a complete budget or savings-goal draft for human approval and, only after Eve approves it, persist it through Pace's deterministic plan service.",
      inputSchema: z.object({ actionId: z.string().uuid() }).strict(),
      access: "commit",
      stages: ["VALIDATE", "APPROVAL", "EXECUTE", "VERIFY", "AUDIT"],
      requiredPermission: "manage_ledger",
      domainServices: ["getActionDetail", "requestApproval", "approveAction", "rejectAction", "executeApprovedPlan"],
      run: ({ actionId }, call) => call.services.executeApprovedPlan(scopeOf(call), actionId),
      actionRef: (input) => input.actionId,
    }),
  ],
});
