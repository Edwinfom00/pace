import { requireAuthenticatedActor } from "@/authorization/session";
import { presentImportRow, presentImportSession } from "@/modules/imports/presenters";
import { getImportService } from "@/modules/imports/server";
import { importMappingRequestSchema } from "@/modules/imports/validation";

import { jsonError, parseJson } from "../../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string; importSessionId: string }>;
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId, importSessionId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, importMappingRequestSchema),
    ]);
    const result = await getImportService().prepare(actor, workspaceId, importSessionId, input.mapping);
    return Response.json({ session: presentImportSession(result.session), rows: result.previewRows.map(presentImportRow) });
  } catch (error) {
    return jsonError(error);
  }
}
