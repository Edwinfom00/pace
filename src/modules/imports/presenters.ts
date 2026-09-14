import type { ImportSessionRecord, NormalizedImportRow } from "./domain";

export function presentImportSession(session: ImportSessionRecord) {
  return {
    id: session.id,
    workspaceId: session.workspaceId,
    status: session.status,
    fileName: session.fileName,
    fileType: session.fileType,
    sheetName: session.sheetName,
    headers: session.headers,
    mapping: session.mapping,
    preview: session.preview,
    result: session.result,
    failureCode: session.failureCode,
    failureMessage: session.failureMessage,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
  };
}

export function presentImportRow(row: NormalizedImportRow) {
  return row;
}
