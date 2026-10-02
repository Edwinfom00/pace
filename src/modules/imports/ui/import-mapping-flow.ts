import { IMPORT_FIELDS, type ImportField } from "../domain";
import {
  assignFieldToColumn,
  assignImportColumn,
  columnsFromAssignments,
  evaluateImportColumns,
  IMPORT_COLUMN_IGNORED,
  ignoreUnmappedColumns,
  setAmountMode,
  IMPORT_REQUIRED_GROUPS,
  type ImportColumnAssignments,
  type ImportColumnMappingEvaluation,
  type ImportColumnTarget,
  type ImportDetectedColumn,
  type ImportRequiredGroupId,
} from "../mapping/column-mapping";
import { importSessionHref } from "./import-upload-flow";
import {
  IMPORT_MAPPING_ERROR_CODES,
  type ImportColumnStatus,
  type ImportMappingErrorCode,
} from "./import-mapping-labels";

export const REQUIRED_FIELD_OPTIONS: readonly ImportField[] = IMPORT_REQUIRED_GROUPS.flatMap((group) => group.fields);
export const OPTIONAL_FIELD_OPTIONS: readonly ImportField[] = IMPORT_FIELDS.filter((field) => !REQUIRED_FIELD_OPTIONS.includes(field));

export function importColumnStatus(column: ImportDetectedColumn, target: ImportColumnTarget): ImportColumnStatus {
  if (target === IMPORT_COLUMN_IGNORED) return "IGNORED";
  if (!target) return "UNMAPPED";
  if (target === column.detectedField) return "DETECTED";
  return OPTIONAL_FIELD_OPTIONS.includes(target) ? "OPTIONAL" : "MAPPED";
}

export function parseColumnTarget(value: string): ImportColumnTarget {
  if (value === IMPORT_COLUMN_IGNORED) return IMPORT_COLUMN_IGNORED;
  return (IMPORT_FIELDS as readonly string[]).includes(value) ? (value as ImportField) : null;
}

export const IMPORT_COLUMN_FILTERS = ["ALL", "TO_MAP", "MAPPED", "IGNORED"] as const;
export type ImportColumnFilter = (typeof IMPORT_COLUMN_FILTERS)[number];

export function columnMatchesFilter(status: ImportColumnStatus, filter: ImportColumnFilter): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "TO_MAP":
      return status === "UNMAPPED";
    case "IGNORED":
      return status === "IGNORED";
    case "MAPPED":
      return status === "DETECTED" || status === "MAPPED" || status === "OPTIONAL";
  }
}

export type ImportColumnSummary = Readonly<Record<ImportColumnFilter, number>> & { readonly DETECTED: number };

export function summarizeImportColumns(
  columns: readonly ImportDetectedColumn[],
  assignments: ImportColumnAssignments,
): ImportColumnSummary {
  const statuses = columns.map((column) => importColumnStatus(column, assignments[column.header] ?? null));
  const count = (filter: ImportColumnFilter) => statuses.filter((status) => columnMatchesFilter(status, filter)).length;
  return {
    ALL: statuses.length,
    TO_MAP: count("TO_MAP"),
    MAPPED: count("MAPPED"),
    IGNORED: count("IGNORED"),
    DETECTED: statuses.filter((status) => status === "DETECTED").length,
  };
}

export function spreadsheetColumnLetter(index: number): string {
  let value = index + 1;
  let letter = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    value = Math.floor((value - 1) / 26);
  }
  return letter;
}

export function missingRequiredGroups(evaluation: ImportColumnMappingEvaluation): ImportRequiredGroupId[] {
  return evaluation.groups.filter((group) => !group.satisfied).map((group) => group.id);
}

export type ImportMappingState = {
  readonly assignments: ImportColumnAssignments;
  readonly errorCode: ImportMappingErrorCode | null;
  readonly saving: boolean;
  readonly stale: boolean;
  readonly moved: { readonly field: ImportField; readonly column: string } | null;
};

export type ImportMappingAction =
  | { readonly type: "assigned"; readonly header: string; readonly target: ImportColumnTarget }
  | { readonly type: "unmappedIgnored" }
  | { readonly type: "fieldAssigned"; readonly field: ImportField; readonly header: string | null }
  | { readonly type: "amountModeChanged"; readonly split: boolean }
  | { readonly type: "continueBlocked"; readonly code: ImportMappingErrorCode }
  | { readonly type: "saveStarted" }
  | { readonly type: "saveFailed"; readonly code: ImportMappingErrorCode }
  | { readonly type: "saveSettled" };

export function initialImportMappingState(assignments: ImportColumnAssignments): ImportMappingState {
  return { assignments, errorCode: null, saving: false, stale: false, moved: null };
}

export function importMappingReducer(state: ImportMappingState, action: ImportMappingAction): ImportMappingState {
  switch (action.type) {
    case "assigned": {
      if (state.saving || state.stale) return state;
      const assignments = assignImportColumn(state.assignments, action.header, action.target);
      if (assignments === state.assignments) return state;
      const field = action.target && action.target !== IMPORT_COLUMN_IGNORED ? action.target : null;
      const displaced = field !== null
        && Object.entries(state.assignments).some(([header, target]) => header !== action.header && target === field);
      const stillBlocked = state.errorCode === "REQUIRED_FIELDS_MISSING" || state.errorCode === "AMOUNT_MODE_CONFLICT";
      const errorCode = stillBlocked ? blockedContinueCode(evaluateImportColumns(columnsFromAssignments(assignments).columns)) : null;
      return {
        ...state,
        assignments,
        errorCode,
        moved: displaced && field ? { field, column: action.header } : null,
      };
    }
    case "fieldAssigned": {
      if (state.saving || state.stale) return state;
      const assignments = assignFieldToColumn(state.assignments, action.field, action.header);
      if (assignments === state.assignments) return state;
      const stillBlocked = state.errorCode === "REQUIRED_FIELDS_MISSING" || state.errorCode === "AMOUNT_MODE_CONFLICT";
      const errorCode = stillBlocked ? blockedContinueCode(evaluateImportColumns(columnsFromAssignments(assignments).columns)) : null;
      const previous = action.header ? state.assignments[action.header] : null;
      const moved = action.header && previous && previous !== IMPORT_COLUMN_IGNORED && previous !== action.field
        ? { field: action.field, column: action.header }
        : null;
      return { ...state, assignments, errorCode, moved };
    }
    case "amountModeChanged": {
      if (state.saving || state.stale) return state;
      const assignments = setAmountMode(state.assignments, action.split);
      const stillBlocked = state.errorCode === "REQUIRED_FIELDS_MISSING" || state.errorCode === "AMOUNT_MODE_CONFLICT";
      const errorCode = stillBlocked ? blockedContinueCode(evaluateImportColumns(columnsFromAssignments(assignments).columns)) : null;
      return { ...state, assignments, errorCode, moved: null };
    }
    case "unmappedIgnored": {
      if (state.saving || state.stale) return state;
      const assignments = ignoreUnmappedColumns(state.assignments);
      return assignments === state.assignments ? state : { ...state, assignments, moved: null };
    }
    case "continueBlocked":
      return { ...state, errorCode: action.code };
    case "saveStarted":
      return state.saving || state.stale ? state : { ...state, saving: true, errorCode: null };
    case "saveFailed":
      return {
        ...state,
        saving: false,
        errorCode: action.code,
        stale: action.code === "IMPORT_FILE_CHANGED" || action.code === "IMPORT_SESSION_STALE",
      };
    case "saveSettled":
      return { ...state, saving: false };
  }
}

export function blockedContinueCode(evaluation: ImportColumnMappingEvaluation): ImportMappingErrorCode | null {
  if (evaluation.issues.includes("AMOUNT_MODE_CONFLICT")) return "AMOUNT_MODE_CONFLICT";
  return evaluation.ready ? null : "REQUIRED_FIELDS_MISSING";
}

export function importMappingErrorCode(status: number, payload: unknown): ImportMappingErrorCode {
  if (status === 401 || status === 403) return "FORBIDDEN";
  if (status === 404) return "IMPORT_SESSION_STALE";
  const code = payload && typeof payload === "object" && "code" in payload ? payload.code : undefined;
  if (typeof code === "string" && (IMPORT_MAPPING_ERROR_CODES as readonly string[]).includes(code)) {
    return code as ImportMappingErrorCode;
  }
  return "GENERIC";
}

export async function confirmImportColumns({
  workspaceId,
  importSessionId,
  fileChecksum,
  assignments,
  signal,
  fetcher = fetch,
}: {
  readonly workspaceId: string;
  readonly importSessionId: string;
  readonly fileChecksum: string;
  readonly assignments: ImportColumnAssignments;
  readonly signal?: AbortSignal;
  readonly fetcher?: typeof fetch;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly code: ImportMappingErrorCode }> {
  let response: Response;
  try {
    response = await fetcher(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/imports/${encodeURIComponent(importSessionId)}/columns`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileChecksum, ...columnsFromAssignments(assignments) }),
        signal,
      },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ok: false, code: "NETWORK" };
  }
  if (response.ok) return { ok: true };
  const payload: unknown = await response.json().catch(() => null);
  return { ok: false, code: importMappingErrorCode(response.status, payload) };
}

export function importPreviewHref(workspaceSlug: string, importSessionId: string): string {
  return `${importSessionHref(workspaceSlug, importSessionId)}/preview`;
}
