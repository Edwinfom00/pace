import { createHash } from "node:crypto";

import type { ImportFileType, ParsedImportFile } from "../domain";
import { checkImportFileType, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_FILE_NAME_LENGTH } from "../import-file-policy";
import { parseCsv } from "./csv";
import { ImportParseError } from "./errors";
import { parseXlsx } from "./xlsx";

export { ImportParseError } from "./errors";
export { parseCsv } from "./csv";
export { MAX_IMPORT_FILE_BYTES } from "../import-file-policy";

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
  if (!input.name || input.name.length > MAX_IMPORT_FILE_NAME_LENGTH) {
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
  const check = checkImportFileType(name, mimeType);
  if (check.ok) return check.fileType;
  if (check.code === "MIME_MISMATCH") {
    throw new ImportParseError("The file MIME type does not match the file extension.", "MIME_MISMATCH");
  }
  throw new ImportParseError("Only CSV and XLSX statements can be imported.", "UNSUPPORTED_FILE_TYPE");
}
