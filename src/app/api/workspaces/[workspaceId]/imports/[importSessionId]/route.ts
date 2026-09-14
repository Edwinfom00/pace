import { requireAuthenticatedActor } from "@/authorization/session";
import { presentImportRow, presentImportSession } from "@/modules/imports/presenters";
import { getImportService } from "@/modules/imports/server";

import { jsonError } from "../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string; importSessionId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId, importSessionId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const result = await getImportService().getSession(actor, workspaceId, importSessionId);
    return Response.json({
      session: presentImportSession(result.session),
      mappingDraft: result.mappingDraft,
      rows: result.previewRows.map(presentImportRow),
    });
  } catch (error) {
    return jsonError(error);
  }
}
