import type { ImportFileType } from "./domain";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_FILE_NAME_LENGTH = 255;

export const IMPORT_FILE_MIME_TYPES: Readonly<Record<ImportFileType, readonly string[]>> = {
  CSV: ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"],
  XLSX: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"],
};

const EXTENSION_FILE_TYPES: Readonly<Record<string, ImportFileType>> = {
  csv: "CSV",
  xlsx: "XLSX",
};

export const IMPORT_FILE_ACCEPT = [
  ...Object.keys(EXTENSION_FILE_TYPES).map((extension) => `.${extension}`),
  ...new Set(Object.values(IMPORT_FILE_MIME_TYPES).flat().filter((mime) => mime !== "application/zip" && mime !== "text/plain")),
].join(",");

export type ImportFileCheckCode =
  | "INVALID_FILE_NAME"
  | "EMPTY_FILE"
  | "FILE_SIZE_LIMIT"
  | "UNSUPPORTED_FILE_TYPE"
  | "MIME_MISMATCH";

export type ImportFileCheck =
  | { readonly ok: true; readonly fileType: ImportFileType }
  | { readonly ok: false; readonly code: ImportFileCheckCode };

export function importFileExtension(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLocaleLowerCase() : undefined;
}

export function checkImportFileType(name: string, mimeType: string | null): ImportFileCheck {
  const extension = importFileExtension(name);
  const fileType = extension ? EXTENSION_FILE_TYPES[extension] : undefined;
  if (!fileType) return { ok: false, code: "UNSUPPORTED_FILE_TYPE" };
  const normalizedMime = mimeType?.split(";", 1)[0]?.trim().toLocaleLowerCase() ?? "";
  if (normalizedMime && !IMPORT_FILE_MIME_TYPES[fileType].includes(normalizedMime)) {
    return { ok: false, code: "MIME_MISMATCH" };
  }
  return { ok: true, fileType };
}

export function checkImportFile(file: { readonly name: string; readonly type: string | null; readonly size: number }): ImportFileCheck {
  if (!file.name || file.name.length > MAX_IMPORT_FILE_NAME_LENGTH) return { ok: false, code: "INVALID_FILE_NAME" };
  const typeCheck = checkImportFileType(file.name, file.type);
  if (!typeCheck.ok) return typeCheck;
  if (file.size <= 0) return { ok: false, code: "EMPTY_FILE" };
  if (file.size > MAX_IMPORT_FILE_BYTES) return { ok: false, code: "FILE_SIZE_LIMIT" };
  return typeCheck;
}
