import { notFound } from "next/navigation";

import { PaceDashboardShell } from "@/components/pace/layout/app-sidebar";
import {
  getDashboardLabels,
  toDashboardLanguage,
} from "@/i18n/dashboard-messages";
import {
  ASSISTANT_PREVIEW_STATES,
  type AssistantPreviewState,
} from "@/modules/assistant/dev/assistant-fixtures";
import { AssistantPreview } from "@/modules/assistant/dev/assistant-preview";

type PreviewPageProps = {
  searchParams: Promise<{
    state?: string | string[];
    lang?: string | string[];
  }>;
};

export default async function PaceAssistantPreviewPage({
  searchParams,
}: PreviewPageProps) {
  // Fixture-only surface for visual checks. It must never be reachable in a production build.
  if (process.env.NODE_ENV === "production") notFound();

  const query = await searchParams;
  const requested = Array.isArray(query.state) ? query.state[0] : query.state;
  const state = ASSISTANT_PREVIEW_STATES.includes(
    requested as AssistantPreviewState,
  )
    ? (requested as AssistantPreviewState)
    : "empty";
  const language = toDashboardLanguage(
    Array.isArray(query.lang) ? query.lang[0] : query.lang,
  );

  return (
    <PaceDashboardShell
      activeWorkspaceSlug="personal"
      inboxCount={4}
      labels={getDashboardLabels(language)}
      language={language}
      workspaces={[
        { id: "preview", name: "Personal", slug: "personal", type: "PERSONAL" },
      ]}>
      <AssistantPreview language={language} state={state} />
    </PaceDashboardShell>
  );
}
