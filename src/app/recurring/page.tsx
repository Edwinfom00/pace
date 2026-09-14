import { RecurringDashboard } from "@/app/components/recurring-dashboard";
import { requireAuthenticatedActor } from "@/authorization/session";
import { getPersistedUserLanguage } from "@/i18n/server";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { getWorkspaceService } from "@/modules/workspaces/server";

export default async function RecurringPage() {
  let language: "en" | "fr" = "en";
  let locale = "en-US";
  let payments: Awaited<ReturnType<ReturnType<typeof getFinancialInboxService>["listRecurring"]>> = [];

  try {
    const actor = await requireAuthenticatedActor();
    const [workspaces, persistedLanguage] = await Promise.all([
      getWorkspaceService().listWorkspaces(actor),
      getPersistedUserLanguage(actor.userId),
    ]);
    language = persistedLanguage;
    locale = language === "fr" ? "fr-FR" : "en-US";
    const workspaceId = workspaces[0]?.id;
    if (workspaceId) {
      payments = await getFinancialInboxService().listRecurring(actor, workspaceId);
    }
  } catch {}

  return <RecurringDashboard initialPayments={payments} language={language} locale={locale} />;
}
