import { ImportParseError } from "./errors";
import type { ParsedImportFile } from "../domain";

const MAX_ROWS = 10_000;
const MAX_COLUMNS = 80;

export function parseCsv(bytes: Uint8Array): ParsedImportFile {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new ImportParseError("The CSV file must use valid UTF-8 encoding.", "INVALID_ENCODING");
  }
  if (!text.trim()) throw new ImportParseError("The CSV file is empty.", "EMPTY_FILE");

  const delimiter = detectDelimiter(text);
  const matrix = parseDelimited(text, delimiter);
  const [headerRow, ...dataRows] = matrix;
  if (!headerRow) throw new ImportParseError("The CSV file has no header row.", "MISSING_HEADERS");
  const headers = validateHeaders(headerRow);
  if (dataRows.length > MAX_ROWS) {
    throw new ImportParseError(`The file exceeds the ${MAX_ROWS.toLocaleString()}-row import limit.`, "ROW_LIMIT");
  }

  return {
    fileType: "CSV",
    delimiter,
    sheetName: null,
    headers,
    rows: dataRows
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row, index) => ({
        rowNumber: index + 2,
        values: Object.fromEntries(headers.map((header, column) => [header, row[column]?.trim() ?? ""])),
      })),
  };
}

export function parseDelimited(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      if (value.length) throw new ImportParseError("A CSV quote begins inside an unquoted cell.", "MALFORMED_CSV");
      quoted = true;
    } else if (character === delimiter) {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new ImportParseError("A CSV quoted value is not closed.", "MALFORMED_CSV");
  row.push(value);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function detectDelimiter(input: string): string {
  const candidates = [",", ";", "\t", "|"];
  const sample = input.slice(0, 16_384);
  const scores = candidates.map((candidate) => ({
    candidate,
    score: countOutsideQuotes(sample, candidate),
  }));
  return scores.sort((left, right) => right.score - left.score)[0]?.candidate ?? ",";
}

function countOutsideQuotes(input: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (character === '"' && input[index + 1] === '"' && quoted) {
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function validateHeaders(headerRow: readonly string[]): string[] {
  if (!headerRow.length || headerRow.length > MAX_COLUMNS) {
    throw new ImportParseError("The file has an unsupported number of columns.", "COLUMN_LIMIT");
  }
  const headers = headerRow.map((value) => value.trim().replace(/^\uFEFF/, ""));
  if (headers.some((header) => !header)) {
    throw new ImportParseError("Every imported column needs a header.", "MISSING_HEADER");
  }
  if (new Set(headers.map((header) => header.toLocaleLowerCase())).size !== headers.length) {
    throw new ImportParseError("Imported column headers must be unique.", "DUPLICATE_HEADERS");
  }
  return headers;
}
