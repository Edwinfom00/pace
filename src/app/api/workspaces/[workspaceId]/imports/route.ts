import { requireAuthenticatedActor } from "@/authorization/session";
import { MAX_IMPORT_FILE_BYTES } from "@/modules/imports/import-file-policy";
import { ImportParseError } from "@/modules/imports/parsers";
import { presentImportSession } from "@/modules/imports/presenters";
import { getImportService } from "@/modules/imports/server";

import { jsonError } from "../../../_lib/http";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const body = await request.formData();
    const file = body.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "A CSV or XLSX file is required." }, { status: 400 });
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw new ImportParseError("The uploaded file exceeds the 5 MB import limit.", "FILE_SIZE_LIMIT");
    }
    const result = await getImportService().upload(actor, workspaceId, {
      name: file.name,
      mimeType: file.type || null,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json({
      session: presentImportSession(result.session),
      mappingDraft: result.mappingDraft,
      rows: result.previewRows,
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
