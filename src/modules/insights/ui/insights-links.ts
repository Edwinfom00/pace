import type { InsightsRange } from "../overview/insights-overview.types";
import {
  DEFAULT_RECURRING_HORIZON,
  RECURRING_HORIZONS,
  type RecurringHorizon,
} from "../recurring/insights-recurring.types";
import { TRENDS_RANGES } from "../trends/insights-trends.types";

export interface InsightsQueryState {
  readonly periodKey: string;
  readonly range: InsightsRange;
  readonly currency: string;
  readonly workspaceCurrency: string;
}

export function insightsQuery(state: InsightsQueryState): string {
  const params = new URLSearchParams({ period: state.periodKey });
  if (state.range !== "1m") params.set("range", state.range);
  if (state.currency !== state.workspaceCurrency)
    params.set("currency", state.currency);
  return params.toString();
}

export function insightsOverviewHref(
  workspaceSlug: string,
  state: InsightsQueryState,
): string {
  return `/w/${workspaceSlug}/insights?${insightsQuery(state)}`;
}

export function insightsCategoryHref(
  workspaceSlug: string,
  categoryId: string,
  state: InsightsQueryState,
): string {
  return `/w/${workspaceSlug}/insights/categories/${encodeURIComponent(categoryId)}?${insightsQuery(state)}`;
}

export function insightsAccountHref(
  workspaceSlug: string,
  accountId: string,
  state: InsightsQueryState,
): string {
  return `/w/${workspaceSlug}/insights/accounts/${encodeURIComponent(accountId)}?${insightsQuery(state)}`;
}

export function insightsTrendsHref(
  workspaceSlug: string,
  state: InsightsQueryState,
): string {
  return `/w/${workspaceSlug}/insights/trends?${insightsQuery(state)}`;
}

export function insightsRecurringHref(
  workspaceSlug: string,
  state: InsightsQueryState & { readonly horizon?: RecurringHorizon },
): string {
  const params = new URLSearchParams(insightsQuery(state));
  if (state.horizon && state.horizon !== DEFAULT_RECURRING_HORIZON)
    params.set("horizon", state.horizon);
  return `/w/${workspaceSlug}/insights/recurring?${params.toString()}`;
}

export function recurringDetailHref(
  workspaceSlug: string,
  recurringId: string,
): string {
  return `/w/${workspaceSlug}/recurring/${encodeURIComponent(recurringId)}`;
}

export function transactionDetailHref(
  workspaceSlug: string,
  transactionId: string,
): string {
  return `/w/${workspaceSlug}/transactions/${encodeURIComponent(transactionId)}`;
}

export type InsightsSection = "overview" | "trends" | "recurring";

const SECTION_QUERY_KEYS = ["period", "range", "currency", "horizon"] as const;

const SECTION_PATHS: Readonly<Record<InsightsSection, string>> = {
  overview: "",
  trends: "/trends",
  recurring: "/recurring",
};

export function insightsSectionHref(
  workspaceSlug: string,
  section: InsightsSection,
  search: string,
): string {
  const current = new URLSearchParams(search);
  const params = new URLSearchParams();
  for (const key of SECTION_QUERY_KEYS) {
    const value = current.get(key);
    if (!value) continue;
    if (
      key === "range" &&
      section !== "overview" &&
      !(TRENDS_RANGES as readonly string[]).includes(value)
    )
      continue;
    if (
      key === "horizon" &&
      (section !== "recurring" ||
        !(RECURRING_HORIZONS as readonly string[]).includes(value))
    )
      continue;
    params.set(key, value);
  }
  const query = params.toString();
  const path = `/w/${workspaceSlug}/insights${SECTION_PATHS[section]}`;
  return query ? `${path}?${query}` : path;
}
