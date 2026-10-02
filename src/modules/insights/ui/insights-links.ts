import type { InsightsRange } from "../overview/insights-overview.types";

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
