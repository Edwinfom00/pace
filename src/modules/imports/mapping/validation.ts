import type { ImportMapping, ImportMappingDraft, ParsedImportFile } from "../domain";
import { importMappingSchema } from "../validation";

/**
 * This is the only accepted boundary for an Eve/DeepSeek mapping proposal.
 * It verifies the proposal is typed, references real headers, and leaves all
 * money/date interpretation to the deterministic normalizer.
 */
export function validateImportMappingDraft(
  draft: ImportMappingDraft,
  parsed: Pick<ParsedImportFile, "headers" | "rows">,
): ImportMappingDraft {
  const knownHeaders = new Set(parsed.headers);
  const proposedColumns = Object.entries(draft.columns);
  const acceptedColumns = proposedColumns.filter(([, header]) => typeof header === "string" && knownHeaders.has(header));
  const columns = Object.fromEntries(
    acceptedColumns,
  ) as ImportMappingDraft["columns"];
  const droppedUnknownColumn = acceptedColumns.length !== proposedColumns.length;
  const isUsable = Boolean(columns.transactionDate || columns.bookingDate) && Boolean(columns.amount || columns.debit || columns.credit);
  return {
    columns,
    confidence: Object.fromEntries(
      Object.entries(draft.confidence).filter(([field, value]) => field in columns && typeof value === "number" && value >= 0 && value <= 1),
    ),
    reasons: Object.fromEntries(Object.entries(draft.reasons).filter(([field]) => field in columns)),
    requiresConfirmation: draft.requiresConfirmation || droppedUnknownColumn || !isUsable || parsed.rows.length === 0,
  };
}

export function validateMappingAgainstParsedFile(mapping: unknown, parsed: Pick<ParsedImportFile, "headers">): ImportMapping {
  const validated = importMappingSchema.parse(mapping);
  const headers = new Set(parsed.headers);
  for (const [field, header] of Object.entries(validated.columns)) {
    if (header && !headers.has(header)) {
      throw new Error(`The mapped ${field} column does not exist in this import.`);
    }
  }
  return validated;
}
