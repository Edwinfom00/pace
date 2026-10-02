import { requireAuthenticatedActor } from "@/authorization/session";
import { getImportService } from "@/modules/imports/server";

import { jsonError } from "../../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string; importSessionId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const [{ workspaceId, importSessionId }, actor] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
    ]);
    const progress = await getImportService().getProgress(
      actor,
      workspaceId,
      importSessionId,
    );
    return Response.json(
      { progress },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
