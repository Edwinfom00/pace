import { createHash } from "node:crypto";

import type { ImportFileType, ParsedImportFile } from "../domain";
import { parseCsv } from "./csv";
import { ImportParseError } from "./errors";
import { parseXlsx } from "./xlsx";

export { ImportParseError } from "./errors";
export { parseCsv } from "./csv";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export interface ImportFileInput {
  name: string;
  mimeType: string | null;
  bytes: Uint8Array;
}

export interface ParsedUpload {
  parsed: ParsedImportFile;
  fileType: ImportFileType;
  checksum: string;
}

export async function parseImportUpload(input: ImportFileInput): Promise<ParsedUpload> {
  if (!input.name || input.name.length > 255) {
    throw new ImportParseError("The uploaded file name is invalid.", "INVALID_FILE_NAME");
  }
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new ImportParseError("The uploaded file exceeds the 5 MB import limit.", "FILE_SIZE_LIMIT");
  }
  const fileType = inferFileType(input.name, input.mimeType);
  const parsed = fileType === "CSV" ? parseCsv(input.bytes) : await parseXlsx(input.bytes);
  return {
    parsed,
    fileType,
    checksum: createHash("sha256").update(input.bytes).digest("hex"),
  };
}

function inferFileType(name: string, mimeType: string | null): ImportFileType {
  const extension = name.split(".").at(-1)?.toLocaleLowerCase();
  const normalizedMime = mimeType?.split(";", 1)[0]?.trim().toLocaleLowerCase() ?? "";
  if (extension === "csv") {
    if (normalizedMime && !["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"].includes(normalizedMime)) {
      throw new ImportParseError("The file MIME type does not match a CSV file.", "MIME_MISMATCH");
    }
    return "CSV";
  }
  if (extension === "xlsx") {
    if (normalizedMime && ![
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
    ].includes(normalizedMime)) {
      throw new ImportParseError("The file MIME type does not match an XLSX file.", "MIME_MISMATCH");
    }
    return "XLSX";
  }
  throw new ImportParseError("Only CSV and XLSX statements can be imported.", "UNSUPPORTED_FILE_TYPE");
}
