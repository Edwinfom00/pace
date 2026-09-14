import { requireAuthenticatedActor } from "@/authorization/session";
import { presentImportSession } from "@/modules/imports/presenters";
import { getImportService } from "@/modules/imports/server";

import { jsonError } from "../../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string; importSessionId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId, importSessionId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const session = await getImportService().execute(actor, workspaceId, importSessionId);
    return Response.json({ session: presentImportSession(session) });
  } catch (error) {
    return jsonError(error);
  }
}
