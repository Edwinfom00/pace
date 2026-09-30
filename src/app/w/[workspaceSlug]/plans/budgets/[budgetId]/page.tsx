import { notFound, redirect } from "next/navigation";
import { getAuthenticatedActor } from "@/authorization/session";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getBudgetDetail } from "@/modules/plans/queries/get-budget-detail";
import { BudgetDetailView } from "@/modules/plans/ui/views/budget-detail-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export default async function BudgetPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; budgetId: string }>;
}) {
  const { workspaceSlug, budgetId } = await params;
  const actor = await getAuthenticatedActor();
  if (!actor)
    redirect(
      loginPathForReturnTo(`/w/${workspaceSlug}/plans/budgets/${budgetId}`),
    );
  const workspace =
    await new DatabaseWorkspaceRepository().findMemberContextBySlug(
      workspaceSlug,
      actor.userId,
    );
  if (!workspace) notFound();
  const language = await getPersistedDashboardLanguage(actor.userId);
  const detail = await getBudgetDetail({
    actor,
    workspaceId: workspace.workspace.id,
    budgetId,
    timeZone: workspace.preferences.timezone,
    now: new Date(),
    unknownMerchantName: getDashboardLabels(language)["transactions.merchant.unknown"],
  });
  if (!detail) notFound();
  return (
    <BudgetDetailView
      detail={detail}
      language={language}
      locale={workspace.preferences.locale}
      timeZone={workspace.preferences.timezone}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspaceSlug}
      now={new Date().toISOString()}
    />
  );
}
