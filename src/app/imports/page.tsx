import { ImportDashboard } from "@/app/components/import-dashboard";
import { requireAuthenticatedActor } from "@/authorization/session";
import { getPersistedUserLanguage } from "@/i18n/server";
import { getLedgerService } from "@/modules/ledger/server";
import { getWorkspaceService } from "@/modules/workspaces/server";

export default async function ImportsPage() {
  let language: "en" | "fr" = "en";
  let workspaceId: string | null = null;
  let accounts: Awaited<ReturnType<ReturnType<typeof getLedgerService>["listAccounts"]>> = [];
  let categories: Awaited<ReturnType<ReturnType<typeof getLedgerService>["listCategories"]>> = [];

  try {
    const actor = await requireAuthenticatedActor();
    const [workspaces, persistedLanguage] = await Promise.all([
      getWorkspaceService().listWorkspaces(actor),
      getPersistedUserLanguage(actor.userId),
    ]);
    language = persistedLanguage;
    workspaceId = workspaces[0]?.id ?? null;
    if (workspaceId) {
      [accounts, categories] = await Promise.all([
        getLedgerService().listAccounts(actor, workspaceId),
        getLedgerService().listCategories(actor, workspaceId),
      ]);
    }
  } catch {}

  return <ImportDashboard
    accounts={accounts.map(({ id, name, currency }) => ({ id, name, currency }))}
    categories={categories.map(({ id, name, kind }) => ({ id, name, kind }))}
    language={language}
    workspaceId={workspaceId}
  />;
}
