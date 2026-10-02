import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import {
  parseReportLanguage,
  parseReportPeriodKey,
  parseReportSections,
} from "@/modules/reports/domain/financial-report.types";
import { getFinancialReport } from "@/modules/reports/financial-report-server";
import { FinancialReportDocument } from "@/modules/reports/ui/financial-report-document";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export default async function FinancialReportPreviewPage({
  params,
  searchParams,
}: PageProps<"/w/[workspaceSlug]/reports/preview/financial">) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const actor = await getAuthenticatedActor();
  const destination = `/w/${workspaceSlug}/reports/preview/financial`;
  if (!actor) redirect(loginPathForReturnTo(destination));
  const context =
    await new DatabaseWorkspaceRepository().findMemberContextBySlug(
      workspaceSlug,
      actor.userId,
    );
  if (!context) notFound();
  const language = parseReportLanguage(
    typeof query.language === "string"
      ? query.language
      : await getPersistedDashboardLanguage(actor.userId),
  );
  const report = await getFinancialReport({
    actor,
    workspace: context.workspace,
    workspaceCurrency: context.preferences.currency,
    workspaceLocale: context.preferences.locale,
    timeZone: context.preferences.timezone,
    now: new Date(),
    language,
    periodKey: parseReportPeriodKey(
      typeof query.period === "string" ? query.period : undefined,
    ),
    currency: context.preferences.currency,
    sections: parseReportSections(
      typeof query.sections === "string" ? query.sections : undefined,
    ),
  });
  return (
    <FinancialReportDocument
      report={report}
      onlyPage={
        typeof query.reportPage === "string" ? query.reportPage : undefined
      }
    />
  );
}
