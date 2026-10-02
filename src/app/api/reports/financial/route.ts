import { getAuthenticatedActor } from "@/authorization/session";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import {
  parseReportLanguage,
  parseReportPeriodKey,
  parseReportSections,
} from "@/modules/reports/domain/financial-report.types";
import { getFinancialReport } from "@/modules/reports/financial-report-server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export async function POST(request: Request) {
  const actor = await getAuthenticatedActor();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const options = input as Record<string, unknown>;

  if (typeof options.workspaceSlug !== "string" || !options.workspaceSlug) {
    return Response.json({ error: "Invalid workspace" }, { status: 400 });
  }

  const context =
    await new DatabaseWorkspaceRepository().findMemberContextBySlug(
      options.workspaceSlug,
      actor.userId,
    );
  if (!context) return Response.json({ error: "Not found" }, { status: 404 });

  const language = parseReportLanguage(
    typeof options.language === "string"
      ? options.language
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
      typeof options.period === "string" ? options.period : undefined,
    ),
    currency:
      typeof options.currency === "string" && /^[A-Z]{3}$/.test(options.currency)
        ? options.currency
        : context.preferences.currency,
    sections: parseReportSections(
      typeof options.sections === "string" ? options.sections : undefined,
    ),
  });

  return Response.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}
