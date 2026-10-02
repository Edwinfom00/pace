import { IMPORT_FIELDS, type ImportField, type ImportMappingDraft, type ParsedImportRow } from "../domain";

export const CONFIDENT_MAPPING_THRESHOLD = 0.9;
export const MAX_SAMPLE_VALUE_LENGTH = 80;
export const MAX_SAMPLE_VALUES = 2;

export const IMPORT_REQUIRED_GROUPS = [
  { id: "date", fields: ["transactionDate", "bookingDate"] },
  { id: "amount", fields: ["amount", "debit", "credit"] },
  { id: "description", fields: ["description", "merchant"] },
] as const satisfies readonly { id: string; fields: readonly ImportField[] }[];

export type ImportRequiredGroupId = (typeof IMPORT_REQUIRED_GROUPS)[number]["id"];

export const IMPORT_OPTIONAL_FIELDS = ["transactionType", "accountReference", "transferAccount", "currency"] as const satisfies readonly ImportField[];

export const IMPORT_COLUMN_IGNORED = "IGNORE";
export type ImportColumnTarget = ImportField | typeof IMPORT_COLUMN_IGNORED | null;
export type ImportColumnAssignments = Readonly<Record<string, ImportColumnTarget>>;

export type ImportColumnMappingIssue = "AMOUNT_MODE_CONFLICT";

export interface ImportDetectedColumn {
  header: string;
  samples: string[];
  detectedField: ImportField | null;
}

export interface ImportColumnMappingEvaluation {
  groups: readonly { id: ImportRequiredGroupId; satisfied: boolean }[];
  satisfiedCount: number;
  issues: readonly ImportColumnMappingIssue[];
  ready: boolean;
}

export function buildDetectedColumns(
  headers: readonly string[],
  rows: readonly ParsedImportRow[],
  draft: ImportMappingDraft,
): ImportDetectedColumn[] {
  const fieldByHeader = new Map<string, { field: ImportField; confidence: number }>();
  for (const field of IMPORT_FIELDS) {
    const header = draft.columns[field];
    const confidence = draft.confidence[field] ?? 0;
    if (!header || confidence < CONFIDENT_MAPPING_THRESHOLD) continue;
    const current = fieldByHeader.get(header);
    if (!current || confidence > current.confidence) fieldByHeader.set(header, { field, confidence });
  }
  return headers.map((header) => ({
    header,
    samples: sampleValues(rows, header),
    detectedField: fieldByHeader.get(header)?.field ?? null,
  }));
}

function sampleValues(rows: readonly ParsedImportRow[], header: string): string[] {
  const samples: string[] = [];
  for (const row of rows) {
    const value = row.values[header]?.trim();
    if (!value) continue;
    const sample = value.length > MAX_SAMPLE_VALUE_LENGTH ? `${value.slice(0, MAX_SAMPLE_VALUE_LENGTH - 1)}…` : value;
    if (!samples.includes(sample)) samples.push(sample);
    if (samples.length === MAX_SAMPLE_VALUES) break;
  }
  return samples;
}

export function initialColumnAssignments(
  columns: readonly ImportDetectedColumn[],
  saved: { columns: Partial<Record<ImportField, string>>; ignoredHeaders: readonly string[] } | null,
): ImportColumnAssignments {
  if (saved) {
    const fieldByHeader = new Map(Object.entries(saved.columns).map(([field, header]) => [header, field as ImportField]));
    const ignored = new Set(saved.ignoredHeaders);
    return Object.fromEntries(columns.map(({ header }) => [
      header,
      fieldByHeader.get(header) ?? (ignored.has(header) ? IMPORT_COLUMN_IGNORED : null),
    ]));
  }
  return Object.fromEntries(columns.map(({ header, detectedField }) => [header, detectedField]));
}

export function assignImportColumn(
  assignments: ImportColumnAssignments,
  header: string,
  target: ImportColumnTarget,
): ImportColumnAssignments {
  if (!(header in assignments)) return assignments;
  const next: Record<string, ImportColumnTarget> = { ...assignments };
  if (target && target !== IMPORT_COLUMN_IGNORED) {
    for (const [other, current] of Object.entries(next)) {
      if (other !== header && current === target) next[other] = null;
    }
  }
  next[header] = target;
  return next;
}

export function columnsFromAssignments(assignments: ImportColumnAssignments): {
  columns: Partial<Record<ImportField, string>>;
  ignoredHeaders: string[];
} {
  const columns: Partial<Record<ImportField, string>> = {};
  const ignoredHeaders: string[] = [];
  for (const [header, target] of Object.entries(assignments)) {
    if (target === IMPORT_COLUMN_IGNORED) ignoredHeaders.push(header);
    else if (target) columns[target] = header;
  }
  return { columns, ignoredHeaders };
}

export function evaluateImportColumns(columns: Partial<Record<ImportField, string>>): ImportColumnMappingEvaluation {
  const hasSignedAmount = Boolean(columns.amount);
  const hasDebitCredit = Boolean(columns.debit || columns.credit);
  const issues: ImportColumnMappingIssue[] = hasSignedAmount && hasDebitCredit ? ["AMOUNT_MODE_CONFLICT"] : [];
  const groups = IMPORT_REQUIRED_GROUPS.map((group) => ({
    id: group.id,
    satisfied: group.id === "amount"
      ? hasSignedAmount !== hasDebitCredit
      : group.fields.some((field) => Boolean(columns[field])),
  }));
  const satisfiedCount = groups.filter((group) => group.satisfied).length;
  return { groups, satisfiedCount, issues, ready: satisfiedCount === groups.length && issues.length === 0 };
}

export function ignoreUnmappedColumns(assignments: ImportColumnAssignments): ImportColumnAssignments {
  if (!Object.values(assignments).some((target) => target === null)) return assignments;
  return Object.fromEntries(Object.entries(assignments).map(([header, target]) => [header, target ?? IMPORT_COLUMN_IGNORED]));
}

export function columnForFields(assignments: ImportColumnAssignments, fields: readonly ImportField[]): string | null {
  for (const field of fields) {
    const header = Object.entries(assignments).find(([, target]) => target === field)?.[0];
    if (header) return header;
  }
  return null;
}

export const MAX_PREVIEW_ROWS = 3;

export function buildPreviewRows(headers: readonly string[], rows: readonly ParsedImportRow[]): Record<string, string>[] {
  return rows.slice(0, MAX_PREVIEW_ROWS).map((row) =>
    Object.fromEntries(headers.map((header) => {
      const value = row.values[header]?.trim() ?? "";
      return [header, value.length > MAX_SAMPLE_VALUE_LENGTH ? `${value.slice(0, MAX_SAMPLE_VALUE_LENGTH - 1)}…` : value];
    })),
  );
}

export function assignFieldToColumn(
  assignments: ImportColumnAssignments,
  field: ImportField,
  header: string | null,
): ImportColumnAssignments {
  if (header !== null) return assignImportColumn(assignments, header, field);
  const current = columnForFields(assignments, [field]);
  return current ? assignImportColumn(assignments, current, null) : assignments;
}

export function setAmountMode(assignments: ImportColumnAssignments, split: boolean): ImportColumnAssignments {
  const cleared: readonly ImportField[] = split ? ["amount"] : ["debit", "credit"];
  return cleared.reduce((next, field) => assignFieldToColumn(next, field, null), assignments);
}
