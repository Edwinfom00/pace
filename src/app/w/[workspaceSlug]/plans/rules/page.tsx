import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getRulesOverview } from "@/modules/plans/rules/queries/get-rules-overview";
import { parseRuleStatusFilter } from "@/modules/plans/rules/rules-overview";
import { getRulesUiLabels } from "@/modules/plans/ui/rules-ui-labels";
import { RulesOverviewView } from "@/modules/plans/ui/views/rules-overview-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export default async function RulesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ q?: string; status?: string; rule?: string }>;
}) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo(`/w/${workspaceSlug}/plans/rules`));
  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(
    workspaceSlug,
    actor.userId,
  );
  if (!workspace) notFound();
  const [language, overview] = await Promise.all([
    getPersistedDashboardLanguage(actor.userId),
    getRulesOverview({
      actor,
      workspaceId: workspace.workspace.id,
      role: workspace.membership.role,
      timeZone: workspace.preferences.timezone,
      query: typeof query.q === "string" ? query.q : "",
      status: parseRuleStatusFilter(typeof query.status === "string" ? query.status : undefined),
      ruleId: typeof query.rule === "string" ? query.rule : undefined,
    }),
  ]);
  return (
    <RulesOverviewView
      labels={getRulesUiLabels(language)}
      locale={workspace.preferences.locale}
      overview={overview}
      timeZone={workspace.preferences.timezone}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspaceSlug}
    />
  );
}
