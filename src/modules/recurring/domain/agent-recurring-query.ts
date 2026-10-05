import type { RecurringHorizon } from "@/modules/insights/recurring/insights-recurring.types";

export const AGENT_RECURRING_STATES = ["ACTIVE", "PAUSED", "NEEDS_REVIEW", "IGNORED"] as const;
export type AgentRecurringState = (typeof AGENT_RECURRING_STATES)[number];

export const AGENT_RECURRING_FILTERS = ["ALL", ...AGENT_RECURRING_STATES] as const;
export type AgentRecurringFilter = (typeof AGENT_RECURRING_FILTERS)[number];

export const AGENT_RECURRING_PERIODS = ["THIS_MONTH", "LAST_MONTH"] as const;
export type AgentRecurringPeriod = (typeof AGENT_RECURRING_PERIODS)[number];

export interface AgentRecurringListQuery {
  readonly filter: AgentRecurringFilter;
  readonly limit: number;
}

export interface AgentRecurringSpendingQuery {
  readonly period: AgentRecurringPeriod;
  readonly currency?: string;
}

export interface AgentUpcomingRecurringQuery {
  readonly horizon: RecurringHorizon;
  readonly dueWithinDays?: number;
  readonly currency?: string;
}
