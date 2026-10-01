export const BUDGET_SCOPES = ["OVERALL", "CATEGORY"] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];

export const BUDGET_FREQUENCIES = ["MONTHLY"] as const;
export type BudgetFrequency = (typeof BUDGET_FREQUENCIES)[number];

export const BUDGET_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export const SAVINGS_GOAL_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "PAUSED",
  "ARCHIVED",
] as const;
export type SavingsGoalStatus = (typeof SAVINGS_GOAL_STATUSES)[number];

export interface BudgetRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly scope: BudgetScope;
  readonly categoryId: string | null;
  readonly subcategoryIds: readonly string[];
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly frequency: BudgetFrequency;
  readonly status: BudgetStatus;
  readonly startsOn: Date;
  readonly endsOn: Date | null;
  readonly createdByUserId: string;
  readonly updatedByUserId: string;
  readonly createdByAgentActionId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SavingsGoalRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly targetAmountMinor: bigint;
  readonly currentSavedMinor: bigint;
  readonly currency: string;
  readonly targetDate: Date | null;
  readonly status: SavingsGoalStatus;
  readonly createdByUserId: string;
  readonly updatedByUserId: string;
  readonly createdByAgentActionId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Planning-only, append-only savings progress. It is never a ledger movement. */
export interface SavingsGoalContribution {
  readonly id: string;
  readonly workspaceId: string;
  readonly goalId: string;
  readonly kind: "CONTRIBUTION" | "REVERSAL";
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly effectiveAt: Date;
  readonly note: string | null;
  readonly reversesContributionId: string | null;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly createdAt: Date;
}

export interface BudgetSummary {
  readonly budget: BudgetRecord;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly currentSpendMinor: bigint;
  readonly remainingMinor: bigint;
  /** Hundredths of one percent, retaining deterministic integer precision. */
  readonly percentageUsedBps: bigint;
  readonly expectedUsageBps: bigint;
  readonly overBudget: boolean;
  readonly activeForPeriod: boolean;
  /** Server-authoritative management affordances; UI must not infer lifecycle. */
  readonly capabilities: {
    readonly canEdit: boolean;
    readonly canArchive: boolean;
    readonly canPause: false;
    readonly canResume: false;
  };
}

export interface SavingsGoalSummary {
  readonly goal: SavingsGoalRecord;
  readonly remainingMinor: bigint;
  readonly progressBps: bigint;
  /** Required minor units per calendar day, rounded up; null with no target date. */
  readonly requiredDailyMinor: bigint | null;
  /** Calendar days remaining, inclusive of today; null when no target date exists. */
  readonly targetDateDaysRemaining: bigint | null;
  readonly completed: boolean;
  /** Server-authoritative management affordances; UI must not infer lifecycle. */
  readonly capabilities: {
    readonly canEdit: boolean;
    readonly canArchive: boolean;
    readonly canComplete: boolean;
    readonly canReopen: false;
  };
}
