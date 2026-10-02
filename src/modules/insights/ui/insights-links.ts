import type { InsightsRange } from "../overview/insights-overview.types";
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

export type InsightsSection = "overview" | "trends";

const SECTION_QUERY_KEYS = ["period", "range", "currency"] as const;

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
      section === "trends" &&
      !(TRENDS_RANGES as readonly string[]).includes(value)
    )
      continue;
    params.set(key, value);
  }
  const query = params.toString();
  const path =
    section === "trends"
      ? `/w/${workspaceSlug}/insights/trends`
      : `/w/${workspaceSlug}/insights`;
  return query ? `${path}?${query}` : path;
}
