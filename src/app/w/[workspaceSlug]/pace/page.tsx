import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { getAssistantMessages } from "@/modules/assistant/ui/assistant-messages";
import { AssistantFinancialSnapshotSkeleton } from "@/modules/assistant/ui/components/assistant-financial-snapshot";
import { AssistantSnapshotSection } from "@/modules/assistant/ui/views/assistant-snapshot-section";
import { PaceAssistantView } from "@/modules/assistant/ui/views/pace-assistant-view";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type PaceAssistantPageProps = {
  params: Promise<{ workspaceSlug: string }>;
};

export default async function PaceAssistantPage({
  params,
}: PaceAssistantPageProps) {
  const { workspaceSlug } = await params;
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo(`/w/${workspaceSlug}/pace`));

  const [workspace, language] = await Promise.all([
    new DatabaseWorkspaceRepository().findMemberContextBySlug(
      workspaceSlug,
      actor.userId,
    ),
    getPersistedDashboardLanguage(actor.userId),
  ]);
  if (!workspace) notFound();

  const messages = getAssistantMessages(language);
  const { currency, locale, timezone } = workspace.preferences;

  return (
    <PaceAssistantView
      key={workspace.workspace.id}
      language={language}
      locale={locale}
      snapshot={
        <Suspense
          fallback={
            <AssistantFinancialSnapshotSkeleton
              label={messages["rail.snapshot.loading"]}
            />
          }>
          <AssistantSnapshotSection
            actor={actor}
            currency={currency}
            locale={locale}
            messages={messages}
            timeZone={timezone}
            workspaceId={workspace.workspace.id}
            workspaceSlug={workspace.workspace.slug}
          />
        </Suspense>
      }
      timeZone={timezone}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
