import { requireAuthenticatedActor } from "@/authorization/session";
import { getImportService } from "@/modules/imports/server";

import { jsonError } from "../../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string; importSessionId: string }>;
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId, importSessionId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const input: unknown = await request.json().catch(() => null);
    const columnMapping = await getImportService().confirmColumnMapping(actor, workspaceId, importSessionId, input);
    return Response.json({ columnMapping });
  } catch (error) {
    return jsonError(error);
  }
}
