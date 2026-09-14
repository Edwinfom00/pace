import { AskPace } from "@/app/components/ask-pace";
import { requireAuthenticatedActor } from "@/authorization/session";
import { getPersistedUserLanguage } from "@/i18n/server";
import { getWorkspaceService } from "@/modules/workspaces/server";

export default async function Home() {
  let language: "en" | "fr" = "en";
  let workspaceId: string | null = null;

  try {
    const actor = await requireAuthenticatedActor();
    const [workspaces, persistedLanguage] = await Promise.all([
      getWorkspaceService().listWorkspaces(actor),
      getPersistedUserLanguage(actor.userId),
    ]);
    language = persistedLanguage;
    workspaceId = workspaces[0]?.id ?? null;
  } catch {}

  return <AskPace language={language} workspaceId={workspaceId} />;
}
