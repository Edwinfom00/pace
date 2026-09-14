import { InboxDashboard } from "@/app/components/inbox-dashboard";
import { requireAuthenticatedActor } from "@/authorization/session";
import { getPersistedUserLanguage } from "@/i18n/server";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { getLedgerService } from "@/modules/ledger/server";
import { getWorkspaceService } from "@/modules/workspaces/server";

export default async function InboxPage() {
  let language: "en" | "fr" = "en";
  let locale = "en-US";
  let workspaceId: string | null = null;
  let items: Awaited<ReturnType<ReturnType<typeof getFinancialInboxService>["listInbox"]>> = [];
  let categories: Awaited<ReturnType<ReturnType<typeof getLedgerService>["listCategories"]>> = [];

  try {
    const actor = await requireAuthenticatedActor();
    const [workspaces, persistedLanguage] = await Promise.all([
      getWorkspaceService().listWorkspaces(actor),
      getPersistedUserLanguage(actor.userId),
    ]);
    language = persistedLanguage;
    locale = language === "fr" ? "fr-FR" : "en-US";
    workspaceId = workspaces[0]?.id ?? null;
    if (workspaceId) {
      [items, categories] = await Promise.all([
        getFinancialInboxService().listInbox(actor, workspaceId),
        getLedgerService().listCategories(actor, workspaceId),
      ]);
    }
  } catch {}

  return (
    <InboxDashboard
      categories={categories.map(({ id, kind, name }) => ({ id, kind, name }))}
      initialItems={items}
      language={language}
      locale={locale}
      workspaceId={workspaceId}
    />
  );
}
