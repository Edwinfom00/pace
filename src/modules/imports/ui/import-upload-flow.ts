import type { ImportFileType } from "../domain";
import { checkImportFile, MAX_IMPORT_FILE_BYTES } from "../import-file-policy";
import { IMPORT_UPLOAD_ERROR_CODES, type ImportUploadErrorCode } from "./import-upload-labels";

export const IMPORT_UPLOAD_FORMATS = "CSV, XLSX";

export type SelectedImportFile = {
  readonly file: File;
  readonly fileType: ImportFileType;
};

export type ImportFileSelection =
  | { readonly ok: true; readonly selected: SelectedImportFile }
  | { readonly ok: false; readonly code: ImportUploadErrorCode }
  | { readonly ok: false; readonly code: null };

export function selectImportFile(files: ArrayLike<File> | null | undefined): ImportFileSelection {
  if (!files || files.length === 0) return { ok: false, code: null };
  if (files.length > 1) return { ok: false, code: "MULTIPLE_FILES" };
  const file = files[0];
  const check = checkImportFile({ name: file.name, type: file.type || null, size: file.size });
  if (!check.ok) return { ok: false, code: check.code };
  return { ok: true, selected: { file, fileType: check.fileType } };
}

export function formatImportFileSize(bytes: number, locale: string): string {
  const megabytes = bytes / (1024 * 1024);
  const [value, unit] = megabytes >= 1
    ? [megabytes, "megabyte"]
    : [Math.max(bytes / 1024, bytes > 0 ? 0.1 : 0), "kilobyte"];
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

export function formatImportSizeLimit(locale: string): string {
  return formatImportFileSize(MAX_IMPORT_FILE_BYTES, locale);
}

export function importUploadErrorCode(status: number, payload: unknown): ImportUploadErrorCode {
  if (status === 401 || status === 403) return "FORBIDDEN";
  const code = payload && typeof payload === "object" && "code" in payload ? payload.code : undefined;
  if (typeof code === "string" && (IMPORT_UPLOAD_ERROR_CODES as readonly string[]).includes(code)) {
    return code as ImportUploadErrorCode;
  }
  return "GENERIC";
}

export type AnalyzeImportFileResult =
  | { readonly ok: true; readonly importSessionId: string }
  | { readonly ok: false; readonly code: ImportUploadErrorCode };

export async function analyzeImportFile({
  workspaceId,
  file,
  signal,
  fetcher = fetch,
}: {
  readonly workspaceId: string;
  readonly file: File;
  readonly signal?: AbortSignal;
  readonly fetcher?: typeof fetch;
}): Promise<AnalyzeImportFileResult> {
  const body = new FormData();
  body.set("file", file, file.name);
  let response: Response;
  try {
    response = await fetcher(`/api/workspaces/${encodeURIComponent(workspaceId)}/imports`, {
      method: "POST",
      body,
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ok: false, code: "NETWORK" };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, code: importUploadErrorCode(response.status, payload) };
  const session = payload && typeof payload === "object" && "session" in payload ? payload.session : null;
  const id = session && typeof session === "object" && "id" in session ? session.id : null;
  const sessionWorkspaceId = session && typeof session === "object" && "workspaceId" in session ? session.workspaceId : null;
  if (typeof id !== "string" || !id || sessionWorkspaceId !== workspaceId) return { ok: false, code: "GENERIC" };
  return { ok: true, importSessionId: id };
}

export function transactionsHref(workspaceSlug: string): string {
  return `/w/${encodeURIComponent(workspaceSlug)}/transactions`;
}

export function transactionImportHref(workspaceSlug: string): string {
  return `${transactionsHref(workspaceSlug)}/import`;
}

export function importSessionHref(workspaceSlug: string, importSessionId: string): string {
  return `${transactionImportHref(workspaceSlug)}/${encodeURIComponent(importSessionId)}`;
}

export type ImportUploadState = {
  readonly selected: SelectedImportFile | null;
  readonly errorCode: ImportUploadErrorCode | null;
  readonly analyzing: boolean;
};

export type ImportUploadAction =
  | { readonly type: "filesChosen"; readonly files: ArrayLike<File> | null | undefined }
  | { readonly type: "removed" }
  | { readonly type: "analyzeStarted" }
  | { readonly type: "analyzeFailed"; readonly code: ImportUploadErrorCode }
  | { readonly type: "analyzeAborted" };

export const INITIAL_IMPORT_UPLOAD_STATE: ImportUploadState = { selected: null, errorCode: null, analyzing: false };

export function importUploadReducer(state: ImportUploadState, action: ImportUploadAction): ImportUploadState {
  switch (action.type) {
    case "filesChosen": {
      if (state.analyzing) return state;
      const selection = selectImportFile(action.files);
      if (selection.ok) return { ...state, selected: selection.selected, errorCode: null };
      return selection.code ? { ...state, errorCode: selection.code } : state;
    }
    case "removed":
      return state.analyzing ? state : { ...state, selected: null, errorCode: null };
    case "analyzeStarted":
      return state.selected && !state.analyzing ? { ...state, analyzing: true, errorCode: null } : state;
    case "analyzeFailed":
      return { ...state, analyzing: false, errorCode: action.code };
    case "analyzeAborted":
      return { ...state, analyzing: false };
  }
}
