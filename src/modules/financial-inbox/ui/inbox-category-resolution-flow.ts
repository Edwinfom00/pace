export type InboxCategoryResolutionError =
  | "staleSuggestion"
  | "changedSinceOpen"
  | "category"
  | "notAvailable"
  | "failed";

export type InboxCategoryResolutionFailure = {
  readonly error: InboxCategoryResolutionError | null;
  readonly refresh: "automatic" | "user" | "none";
};

type InboxCategoryMutationVersions = {
  readonly expectedInboxUpdatedAt: string;
  readonly expectedTransactionUpdatedAt: string;
};

export type AcceptInboxCategorySuggestionRequest = InboxCategoryMutationVersions & {
  readonly action: "ACCEPT_SUGGESTION";
  readonly expectedSuggestionCategoryId: string;
  readonly expectedSuggestionUpdatedAt: string;
  readonly idempotencyKey: string;
};

export type ChooseInboxCategoryRequest = InboxCategoryMutationVersions & {
  readonly action: "CHOOSE_CATEGORY";
  readonly categoryId: string;
  readonly idempotencyKey: string;
};

export function getInboxCategoryResolutionActionVisibility(input: {
  readonly canAcceptCategorySuggestion: boolean;
  readonly canChooseCategory: boolean;
  readonly hasSuggestion: boolean;
}): { readonly accept: boolean; readonly choose: boolean } {
  return {
    accept: input.canAcceptCategorySuggestion && input.hasSuggestion,
    choose: input.canChooseCategory,
  };
}

export function createAcceptInboxCategorySuggestionRequest(
  input: InboxCategoryMutationVersions & {
    readonly suggestionCategoryId: string;
    readonly suggestionUpdatedAt: string;
  },
  idempotencyKey: string,
): AcceptInboxCategorySuggestionRequest {
  return {
    action: "ACCEPT_SUGGESTION",
    expectedInboxUpdatedAt: input.expectedInboxUpdatedAt,
    expectedTransactionUpdatedAt: input.expectedTransactionUpdatedAt,
    expectedSuggestionCategoryId: input.suggestionCategoryId,
    expectedSuggestionUpdatedAt: input.suggestionUpdatedAt,
    idempotencyKey,
  };
}

export function createChooseInboxCategoryRequest(
  input: InboxCategoryMutationVersions & { readonly categoryId: string },
  idempotencyKey: string,
): ChooseInboxCategoryRequest {
  return {
    action: "CHOOSE_CATEGORY",
    categoryId: input.categoryId,
    expectedInboxUpdatedAt: input.expectedInboxUpdatedAt,
    expectedTransactionUpdatedAt: input.expectedTransactionUpdatedAt,
    idempotencyKey,
  };
}

export function canSaveInboxCategorySelection(
  selectedCategoryId: string,
  currentCategoryId: string | null,
): boolean {
  return selectedCategoryId.length > 0 && selectedCategoryId !== currentCategoryId;
}

export function inboxCategoryResolutionErrorCode(payload: unknown): string | undefined {
  if (!isRecord(payload) || typeof payload.code !== "string") return undefined;
  return payload.code;
}

export function isInboxCategoryResolutionResponse(payload: unknown): boolean {
  if (!isRecord(payload) || !isRecord(payload.result)) return false;
  return typeof payload.result.inboxItemId === "string"
    && typeof payload.result.transactionId === "string"
    && (typeof payload.result.categoryId === "string" || payload.result.categoryId === null)
    && Array.isArray(payload.result.resolvedInboxItemIds)
    && Array.isArray(payload.result.unresolvedReasons);
}

export function mapInboxCategoryResolutionFailure(
  code: string | undefined,
): InboxCategoryResolutionFailure {
  switch (code) {
    case "CATEGORY_SUGGESTION_STALE":
      return { error: "staleSuggestion", refresh: "automatic" };
    case "CATEGORY_SUGGESTION_NOT_AVAILABLE":
    case "INBOX_ACTION_NOT_ALLOWED":
    case "INBOX_ITEM_NOT_FOUND":
    case "TRANSACTION_NOT_FOUND":
      return { error: "notAvailable", refresh: "automatic" };
    case "CATEGORY_NOT_ALLOWED":
    case "CATEGORY_NOT_FOUND":
      return { error: "category", refresh: "none" };
    case "INBOX_ITEM_STALE":
    case "CONCURRENT_MODIFICATION":
    case "TRANSACTION_NOT_CURRENT":
    case "INBOX_REASON_ALREADY_RESOLVED":
      return { error: "changedSinceOpen", refresh: "user" };
    case "ACTION_ALREADY_PROCESSED":
      return { error: null, refresh: "automatic" };
    default:
      return { error: "failed", refresh: "none" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
