import { notFound, redirect } from "next/navigation";
import { getAuthenticatedActor } from "@/authorization/session";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import {
  FORECAST_HORIZONS,
  type ForecastHorizonDays,
} from "@/modules/forecast/domain/forecast";
import { getWorkspaceForecast } from "@/modules/forecast/queries/get-workspace-forecast";
import { ForecastOverviewView } from "@/modules/forecast/ui/views/forecast-overview-view";
import { getPlansUiLabels } from "@/modules/plans/ui/plans-ui-labels";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export default async function ForecastPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ horizon?: string }>;
}) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const actor = await getAuthenticatedActor();
  if (!actor)
    redirect(loginPathForReturnTo(`/w/${workspaceSlug}/plans/forecast`));
  const workspace =
    await new DatabaseWorkspaceRepository().findMemberContextBySlug(
      workspaceSlug,
      actor.userId,
    );
  if (!workspace) notFound();
  const candidate = Number(query.horizon);
  const horizon = FORECAST_HORIZONS.includes(candidate as ForecastHorizonDays)
    ? (candidate as ForecastHorizonDays)
    : 90;
  const [language, forecast] = await Promise.all([
    getPersistedDashboardLanguage(actor.userId),
    getWorkspaceForecast({
      actor,
      workspaceId: workspace.workspace.id,
      horizonDays: horizon,
      timeZone: workspace.preferences.timezone,
    }),
  ]);
  return (
    <ForecastOverviewView
      forecast={forecast}
      labels={getPlansUiLabels(language)}
      locale={workspace.preferences.locale}
      workspaceSlug={workspaceSlug}
    />
  );
}
