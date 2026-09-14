import ExcelJS from "exceljs";
import * as yauzl from "yauzl";

import type { ParsedImportFile } from "../domain";
import { validateHeaders } from "./csv";
import { ImportParseError } from "./errors";

const MAX_ROWS = 10_000;
const MAX_COLUMNS = 80;
const MAX_ARCHIVE_ENTRIES = 100;
const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;

export async function parseXlsx(bytes: Uint8Array): Promise<ParsedImportFile> {
  if (!hasZipSignature(bytes)) throw new ImportParseError("The XLSX file is not a valid ZIP archive.", "INVALID_XLSX");
  await inspectWorkbookArchive(Buffer.from(bytes) as never);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as never);
  } catch {
    throw new ImportParseError("The XLSX workbook could not be read.", "MALFORMED_XLSX");
  }

  const worksheet = workbook.worksheets.find((sheet) => sheet.actualRowCount > 0);
  if (!worksheet) throw new ImportParseError("The XLSX workbook has no populated worksheet.", "EMPTY_FILE");
  if (worksheet.actualRowCount > MAX_ROWS + 1) {
    throw new ImportParseError(`The file exceeds the ${MAX_ROWS.toLocaleString()}-row import limit.`, "ROW_LIMIT");
  }
  if (worksheet.actualColumnCount > MAX_COLUMNS) {
    throw new ImportParseError("The file has an unsupported number of columns.", "COLUMN_LIMIT");
  }

  const headers = validateHeaders(
    Array.from({ length: worksheet.actualColumnCount }, (_, index) => {
      const cell = worksheet.getRow(1).getCell(index + 1);
      return spreadsheetCellToText(cell.value, cell.text);
    }),
  );

  const rows = [];
  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const values = Object.fromEntries(
      headers.map((header, column) => {
        const cell = row.getCell(column + 1);
        return [header, spreadsheetCellToText(cell.value, cell.text).trim()];
      }),
    );
    if (Object.values(values).some((value) => value.length > 0)) rows.push({ rowNumber: rowIndex, values });
  }

  return {
    fileType: "XLSX",
    delimiter: null,
    sheetName: worksheet.name,
    headers,
    rows,
  };
}

function spreadsheetCellToText(value: ExcelJS.CellValue, renderedText: string): string {
  if (value && typeof value === "object" && "formula" in value) {
    throw new ImportParseError("Formula cells are not allowed in imported workbooks.", "FORMULA_CELL");
  }
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return renderedText;
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function inspectWorkbookArchive(buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer as never, { lazyEntries: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(new ImportParseError("The XLSX file is not a valid ZIP archive.", "INVALID_XLSX"));
        return;
      }
      let entries = 0;
      let uncompressedBytes = 0;
      let settled = false;
      const fail = (message: string, code: string) => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(new ImportParseError(message, code));
      };
      zipFile.on("error", () => fail("The XLSX archive is malformed.", "MALFORMED_XLSX"));
      zipFile.on("entry", (entry) => {
        entries += 1;
        uncompressedBytes += entry.uncompressedSize;
        if (entries > MAX_ARCHIVE_ENTRIES || uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
          fail("The XLSX workbook exceeds safe parser limits.", "XLSX_SIZE_LIMIT");
          return;
        }
        if (/vbaProject\.bin$/i.test(entry.fileName)) {
          fail("Macro-enabled workbooks are not supported.", "MACRO_WORKBOOK");
          return;
        }
        zipFile.readEntry();
      });
      zipFile.on("end", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      zipFile.readEntry();
    });
  });
}
