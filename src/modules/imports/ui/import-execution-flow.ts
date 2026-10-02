import type {
  ImportProgress,
  ImportResult,
  ImportSessionStatus,
} from "../domain";
import type { ImportReviewView } from "../import-service";
import type { ImportReviewRequest } from "../validation";
import {
  IMPORT_EXECUTION_ERROR_CODES,
  type ImportExecutionErrorCode,
  type ImportExecutionStep,
} from "./import-execution-labels";
import {
  importSessionHref,
  transactionImportHref,
  transactionsHref,
} from "./import-upload-flow";

export const IMPORT_EXECUTION_STEPS: readonly ImportExecutionStep[] = [
  "prepare",
  "validate",
  "import",
  "finalize",
];
export const IMPORT_PROGRESS_POLL_MS = 1_000;
export const IMPORT_PROGRESS_STALL_MS = 150_000;

export type ImportStepStatus = "done" | "active" | "pending";

export type ImportExecutionSnapshot = {
  readonly status: ImportSessionStatus;
  readonly progress: ImportProgress | null;
  readonly result: ImportResult | null;
};

export function isTerminalImportStatus(status: ImportSessionStatus): boolean {
  return status === "COMPLETED" || status === "PARTIALLY_COMPLETED";
}

export function activeImportStep(
  snapshot: ImportExecutionSnapshot,
): ImportExecutionStep | null {
  switch (snapshot.status) {
    case "AWAITING_APPROVAL":
      return "validate";
    case "IMPORTING":
      return snapshot.progress?.phase === "FINALIZE" ? "finalize" : "import";
    case "COMPLETED":
    case "PARTIALLY_COMPLETED":
      return null;
    default:
      return "prepare";
  }
}

export function importExecutionSteps(
  snapshot: ImportExecutionSnapshot,
): Readonly<Record<ImportExecutionStep, ImportStepStatus>> {
  const active = activeImportStep(snapshot);
  const activeIndex = active
    ? IMPORT_EXECUTION_STEPS.indexOf(active)
    : IMPORT_EXECUTION_STEPS.length;
  return Object.fromEntries(
    IMPORT_EXECUTION_STEPS.map((step, index) => [
      step,
      index < activeIndex
        ? "done"
        : index === activeIndex
          ? "active"
          : "pending",
    ]),
  ) as Record<ImportExecutionStep, ImportStepStatus>;
}

export function importProgressPercent(
  progress: ImportProgress | null,
): number | null {
  if (!progress || progress.totalRowCount <= 0) return null;
  return Math.min(
    100,
    Math.floor((progress.processedRowCount / progress.totalRowCount) * 100),
  );
}

export function isImportProgressStalled(
  snapshot: ImportExecutionSnapshot,
  now = Date.now(),
): boolean {
  if (snapshot.status !== "IMPORTING" || !snapshot.progress) return false;
  return (
    now - new Date(snapshot.progress.heartbeatAt).getTime() >
    IMPORT_PROGRESS_STALL_MS
  );
}

export function importExecutionErrorCode(
  status: number,
  payload: unknown,
): ImportExecutionErrorCode {
  if (status === 401 || status === 403) return "FORBIDDEN";
  if (status === 404) return "IMPORT_SESSION_STALE";
  const code =
    payload && typeof payload === "object" && "code" in payload
      ? payload.code
      : undefined;
  if (
    typeof code === "string" &&
    (IMPORT_EXECUTION_ERROR_CODES as readonly string[]).includes(code)
  ) {
    return code as ImportExecutionErrorCode;
  }
  if (status === 409) return "IMPORT_NOT_READY";
  return "GENERIC";
}

type ImportRequestResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ImportExecutionErrorCode };

async function importRequest<T>(
  url: string,
  init: RequestInit,
  read: (payload: unknown) => T | null,
  fetcher: typeof fetch,
): Promise<ImportRequestResult<T>> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, cache: "no-store" });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    return { ok: false, code: "NETWORK" };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok)
    return {
      ok: false,
      code: importExecutionErrorCode(response.status, payload),
    };
  const value = read(payload);
  return value === null ? { ok: false, code: "GENERIC" } : { ok: true, value };
}

function importApiUrl(
  workspaceId: string,
  importSessionId: string,
  action: string,
): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/imports/${encodeURIComponent(importSessionId)}/${action}`;
}

function readSnapshot(
  payload: unknown,
  key: "session" | "progress",
): ImportExecutionSnapshot | null {
  const value =
    payload && typeof payload === "object" && key in payload
      ? (payload as Record<string, unknown>)[key]
      : null;
  if (
    !value ||
    typeof value !== "object" ||
    !("status" in value) ||
    typeof value.status !== "string"
  )
    return null;
  const record = value as {
    status: ImportSessionStatus;
    progress?: ImportProgress | null;
    result?: ImportResult | null;
  };
  return {
    status: record.status,
    progress: record.progress ?? null,
    result: record.result ?? null,
  };
}

type ImportRequestInput = {
  readonly workspaceId: string;
  readonly importSessionId: string;
  readonly signal?: AbortSignal;
  readonly fetcher?: typeof fetch;
};

export type ImportReviewChange = Omit<
  ImportReviewRequest,
  "accountId" | "transferAccountId"
>;

export function importReviewRequest(
  review: ImportReviewView,
  change: ImportReviewChange & {
    accountId?: string;
    transferAccountId?: string | null;
  },
): ImportReviewRequest | null {
  const accountId = change.accountId ?? review.accountId;
  if (!accountId) return null;
  const transferAccountId =
    change.transferAccountId !== undefined
      ? change.transferAccountId
      : review.transferAccountId;
  return {
    ...change,
    accountId,
    transferAccountId:
      transferAccountId === accountId ? null : transferAccountId,
  };
}

export function updateImportReview({
  workspaceId,
  importSessionId,
  request,
  signal,
  fetcher = fetch,
}: ImportRequestInput & { readonly request: ImportReviewRequest }) {
  return importRequest<ImportReviewView>(
    importApiUrl(workspaceId, importSessionId, "review"),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    (payload) =>
      payload && typeof payload === "object" && "review" in payload
        ? (payload.review as ImportReviewView)
        : null,
    fetcher,
  );
}

export type ImportAccountDraft = {
  readonly name: string;
  readonly type: string;
  readonly currency: string;
  readonly openingBalance: string;
};

export async function createImportAccount({
  workspaceId,
  draft,
  fetcher = fetch,
}: {
  readonly workspaceId: string;
  readonly draft: ImportAccountDraft;
  readonly fetcher?: typeof fetch;
}): Promise<
  | { readonly ok: true; readonly payload: unknown }
  | { readonly ok: false; readonly code: string | undefined }
> {
  try {
    const response = await fetcher(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/ledger/accounts`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, payload };
    const code =
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      typeof payload.code === "string"
        ? payload.code
        : undefined;
    return { ok: false, code };
  } catch {
    return { ok: false, code: undefined };
  }
}

export function isoDateForInput(value: string): string {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(trimmed);
  if (!parts) return "";
  const day = Number(parts[1]);
  const month = Number(parts[2]);
  const candidate = new Date(Date.UTC(Number(parts[3]), month - 1, day));
  if (candidate.getUTCMonth() + 1 !== month || candidate.getUTCDate() !== day)
    return "";
  return candidate.toISOString().slice(0, 10);
}

export function approveImport({
  workspaceId,
  importSessionId,
  signal,
  fetcher = fetch,
}: ImportRequestInput) {
  return importRequest(
    importApiUrl(workspaceId, importSessionId, "approval"),
    { method: "POST", signal },
    (payload) => readSnapshot(payload, "session"),
    fetcher,
  );
}

export function executeImport({
  workspaceId,
  importSessionId,
  signal,
  fetcher = fetch,
}: ImportRequestInput) {
  return importRequest(
    importApiUrl(workspaceId, importSessionId, "execute"),
    { method: "POST", signal },
    (payload) => readSnapshot(payload, "session"),
    fetcher,
  );
}

export function fetchImportProgress({
  workspaceId,
  importSessionId,
  signal,
  fetcher = fetch,
}: ImportRequestInput) {
  return importRequest(
    importApiUrl(workspaceId, importSessionId, "progress"),
    { method: "GET", signal },
    (payload) => readSnapshot(payload, "progress"),
    fetcher,
  );
}

export type ImportResultAction = "transactions" | "inbox" | "another";

export function importResultHrefs(
  workspaceSlug: string,
): Readonly<Record<ImportResultAction, string>> {
  return {
    transactions: transactionsHref(workspaceSlug),
    inbox: `/w/${encodeURIComponent(workspaceSlug)}/inbox`,
    another: transactionImportHref(workspaceSlug),
  };
}

export function importMappingHref(
  workspaceSlug: string,
  importSessionId: string,
): string {
  return importSessionHref(workspaceSlug, importSessionId);
}

export function canStartImport(
  review: Pick<
    ImportReviewView,
    "summary" | "transferAccountRequired" | "transferAccountId"
  >,
): boolean {
  if (!review.summary) return false;
  return (
    review.summary.toImportRowCount > 0 &&
    review.summary.blockingErrorRowCount === 0 &&
    (!review.transferAccountRequired || Boolean(review.transferAccountId))
  );
}
