import { ConflictError, NotFoundError } from "@/authorization/errors";
import { resolveAccountReference } from "@/modules/accounts/domain/account-reference";
import type { RecurringPaymentDirection } from "@/modules/financial-inbox/domain";
import type { RecurringPaymentView } from "@/modules/financial-inbox/financial-inbox-service";
import type { LedgerAccountRecord, LedgerCategoryRecord } from "@/modules/ledger/domain";
import type { RecurringActionReason } from "@/modules/recurring/domain/recurring-action-policy";
import {
  cadenceDaysForFrequency,
  frequencyForCadenceDays,
  type RecurringFrequencyKey,
} from "@/modules/recurring/domain/recurring-frequency";
import type { RecurringOverviewItem } from "@/modules/recurring/domain/recurring-overview";
import {
  resolveRecurringReference,
  type RecurringReference,
  type RecurringReferenceResolution,
} from "@/modules/recurring/domain/recurring-reference";
import { isCurrencyCode } from "@/money/currency";
import { money, toDecimalString } from "@/money/money";

import {
  RECURRING_DRAFT_FIELDS,
  type RecurringActionResult,
  type RecurringApprovalSummary,
  type RecurringDraft,
  type RecurringDraftField,
  type RecurringDraftOperation,
  type RecurringDraftTarget,
  type RecurringDraftValues,
} from "./domain";
import { cleanOptionalText, matchByName, parseAmountToMinor } from "./transaction-draft";

export interface RecurringDraftIntent extends RecurringReference {
  recurringOperation: RecurringDraftOperation;
  direction?: RecurringPaymentDirection | null;
  name?: string | null;
  amountText?: string | null;
  frequency?: RecurringFrequencyKey | null;
  /** Calendar date, YYYY-MM-DD. */
  nextOccurrenceOn?: string | null;
  accountName?: string | null;
  categoryName?: string | null;
  currency?: string | null;
  sourceText?: string | null;
}

export interface RecurringDraftContext {
  currency: string;
  now: Date;
  items: readonly RecurringOverviewItem[];
  accounts: readonly LedgerAccountRecord[];
  categories: readonly LedgerCategoryRecord[];
}

type RequestedValues = { -readonly [TKey in keyof RecurringDraftValues]: RecurringDraftValues[TKey] };

const REFUSALS: Readonly<Record<RecurringActionReason, string>> = {
  READ_ONLY_ROLE: "You do not have permission to manage recurring payments in this workspace.",
  ALREADY_CONFIRMED: "This recurring payment is already confirmed.",
  ALREADY_IGNORED: "This recurring payment is already ignored.",
  NOT_RESTORABLE: "Only an ignored detected recurring payment can be restored.",
  NOT_CANDIDATE:
    "Only a detected recurring payment that still needs review can be ignored. A confirmed one can be paused instead.",
  MANUAL_RECURRING:
    "This recurring payment was created manually, so there is no detection to confirm, ignore, or restore. It can be paused instead.",
  NOT_CONFIRMED: "Only a confirmed recurring payment can be edited, paused, or resumed.",
  LINKED_ACCOUNT_UNAVAILABLE: "This recurring payment is linked to an archived account and cannot be edited.",
  ALREADY_PAUSED: "This recurring payment is already paused.",
  NOT_PAUSED: "This recurring payment is not paused.",
  DELETE_NOT_SUPPORTED: "A recurring payment cannot be deleted.",
};

const EFFECTS: Readonly<Record<RecurringDraftOperation, readonly [string, string]>> = {
  CREATE: [
    "This will add a recurring pattern that Pace uses for future projections only.",
    "It will not create a Transaction or change any balance.",
  ],
  EDIT: ["This will change future Pace projections only.", "It will not modify past Transactions."],
  PAUSE: ["This will stop future Pace projections only.", "It will not modify past Transactions."],
  RESUME: [
    "This will restart future Pace projections.",
    "It will not create Transactions for the time it was paused.",
  ],
  CONFIRM: [
    "This will confirm the detected pattern so Pace projects its future occurrences.",
    "It will not create or modify any Transaction.",
  ],
  IGNORE: [
    "This will stop Pace from treating this detected pattern as recurring. It can be restored later.",
    "It will not modify past Transactions.",
  ],
  RESTORE: [
    "This will return the ignored pattern to review as a detected recurring payment. It will not be confirmed.",
    "It will not modify past Transactions.",
  ],
};

const TITLES: Readonly<Record<RecurringDraftOperation, string>> = {
  CREATE: "Create",
  EDIT: "Edit",
  PAUSE: "Pause",
  RESUME: "Resume",
  CONFIRM: "Confirm detected",
  IGNORE: "Ignore detected",
  RESTORE: "Restore detected",
};

const CADENCE_LABELS: Readonly<Record<RecurringFrequencyKey, string>> = {
  weekly: "week",
  biweekly: "2 weeks",
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
};

/**
 * Turns a requested recurring change into a JSON-safe draft. The target is
 * resolved here from the workspace's own recurring items, never from an id or
 * a guess by the model, and the canonical recurring policy decides whether the
 * operation is allowed; anything unresolved is reported as a missing field.
 */
export function buildRecurringDraft(intent: RecurringDraftIntent, context: RecurringDraftContext): RecurringDraft {
  return intent.recurringOperation === "CREATE" ? buildCreateDraft(intent, context) : buildChangeDraft(intent, context);
}

function buildCreateDraft(intent: RecurringDraftIntent, context: RecurringDraftContext): RecurringDraft {
  const missingFields: RecurringDraftField[] = [];
  const direction = intent.direction ?? null;
  if (!direction) missingFields.push("direction");

  const account = requestedAccount(intent, context.accounts, missingFields);
  const requestedCurrency = cleanOptionalText(intent.currency)?.toUpperCase() ?? null;
  if (requestedCurrency && !isCurrencyCode(requestedCurrency)) missingFields.push("currency");
  else if (requestedCurrency && account && account.currency !== requestedCurrency) {
    throw new ConflictError("The recurring currency must match the selected account currency.");
  }
  const currency = requestedCurrency
    ? isCurrencyCode(requestedCurrency) ? requestedCurrency : null
    : account?.currency ?? context.currency;

  const values = requestedValues(intent, direction, currency, context.categories, missingFields);
  if (account) values.accountId = account.id;
  if (!values.name) missingFields.push("name");
  if (!values.amountMinor) missingFields.push("amount");
  if (!values.cadenceDays) missingFields.push("frequency");
  if (!values.nextOccurrenceOn) missingFields.push("nextOccurrence");

  const missing = orderedFields(missingFields);
  return {
    recurringOperation: "CREATE",
    recurringId: null,
    expectedUpdatedAt: null,
    current: null,
    direction,
    currency,
    values,
    amountText: cleanOptionalText(intent.amountText),
    candidates: [],
    approvalSummary:
      missing.length === 0 && direction && currency
        ? approvalSummary("CREATE", direction, values.name!, values.amountMinor!, currency, values.cadenceDays!, [])
        : null,
    sourceText: cleanOptionalText(intent.sourceText),
    missingFields: missing,
  };
}

function buildChangeDraft(intent: RecurringDraftIntent, context: RecurringDraftContext): RecurringDraft {
  const operation = intent.recurringOperation;
  const target = resolveTarget(intent, context.items);
  const item = target.status === "RESOLVED" ? target.recurring : null;
  const missingFields: RecurringDraftField[] = item ? [] : ["recurring"];
  let values: RequestedValues = {};
  let changes: string[] = [];

  if (item) {
    assertRecurringOperationAllowed(operation, item);
    if (operation === "EDIT") {
      const account = requestedAccount(intent, context.accounts, missingFields);
      if (account && account.currency !== item.currency) {
        throw new ConflictError("The recurring currency must match the selected account currency.");
      }
      values = requestedValues(intent, directionOf(item), item.currency, context.categories, missingFields);
      if (account) values.accountId = account.id;
      if (values.nextOccurrenceOn && nextOccurrenceInstant(values.nextOccurrenceOn) <= context.now) {
        throw new ConflictError("A recurring next occurrence must be a valid future date.");
      }
      if (missingFields.length === 0) {
        changes = describeChanges(item, values, context);
        if (Object.keys(values).length === 0) missingFields.push("change");
        else if (changes.length === 0) throw new ConflictError("This recurring payment already has these values.");
      }
    }
  }

  const missing = orderedFields(missingFields);
  return {
    recurringOperation: operation,
    recurringId: item?.id ?? null,
    expectedUpdatedAt: item?.updatedAt ?? null,
    current: item ? presentDraftRecurring(item) : null,
    direction: null,
    currency: item?.currency ?? null,
    values,
    amountText: operation === "EDIT" ? cleanOptionalText(intent.amountText) : null,
    candidates: target.status === "RESOLVED" ? [] : target.candidates.map(presentDraftRecurring),
    approvalSummary:
      item && missing.length === 0
        ? approvalSummary(
            operation,
            directionOf(item),
            item.merchantName,
            item.typicalAmountMinor,
            item.currency,
            item.cadenceDays,
            changes,
          )
        : null,
    sourceText: cleanOptionalText(intent.sourceText),
    missingFields: missing,
  };
}

function resolveTarget(
  intent: RecurringDraftIntent,
  items: readonly RecurringOverviewItem[],
): RecurringReferenceResolution<RecurringOverviewItem> {
  if (intent.recurringId) {
    const byId = resolveRecurringReference(intent, items);
    if (byId.status !== "RESOLVED") throw new NotFoundError("Recurring payment not found in this workspace.");
    return byId;
  }

  const eligible = items.filter((item) => isEligibleTarget(intent.recurringOperation, item));
  const amongEligible = resolveRecurringReference(intent, eligible);
  if (amongEligible.status !== "NOT_FOUND" || !cleanOptionalText(intent.recurringName)) return amongEligible;

  // A name that only matches an item in the wrong state still resolves, so the
  // canonical policy can refuse with its own reason instead of "not found".
  const amongAll = resolveRecurringReference(intent, items);
  return amongAll.status === "RESOLVED" ? amongAll : amongEligible;
}

function isEligibleTarget(operation: RecurringDraftOperation, item: RecurringOverviewItem): boolean {
  switch (operation) {
    case "EDIT":
      return item.status === "CONFIRMED";
    case "PAUSE":
      return item.status === "CONFIRMED" && item.lifecycle === "ACTIVE";
    case "RESUME":
      return item.status === "CONFIRMED" && item.lifecycle === "PAUSED";
    case "CONFIRM":
    case "IGNORE":
      return item.status === "CANDIDATE";
    case "RESTORE":
      return item.status === "IGNORED";
    case "CREATE":
      return false;
  }
}

function assertRecurringOperationAllowed(operation: RecurringDraftOperation, item: RecurringOverviewItem): void {
  const { capabilities } = item;
  const [allowed, reason] = ((): readonly [boolean, RecurringActionReason | undefined] => {
    switch (operation) {
      case "EDIT":
        return [capabilities.canEdit, capabilities.reasons.edit];
      case "PAUSE":
        return [capabilities.canPause, capabilities.reasons.pause];
      case "RESUME":
        return [capabilities.canResume, capabilities.reasons.resume];
      case "CONFIRM":
        return [capabilities.canConfirm, capabilities.reasons.confirm];
      case "IGNORE":
        return [capabilities.canIgnore, capabilities.reasons.ignore];
      case "RESTORE":
        return [capabilities.canRestore, capabilities.reasons.restore];
      case "CREATE":
        return [true, undefined];
    }
  })();
  if (!allowed) {
    throw new ConflictError(reason ? REFUSALS[reason] : "This recurring change is not allowed in its current state.");
  }
}

function requestedAccount(
  intent: RecurringDraftIntent,
  accounts: readonly LedgerAccountRecord[],
  missingFields: RecurringDraftField[],
): LedgerAccountRecord | null {
  const accountName = cleanOptionalText(intent.accountName);
  if (!accountName) return null;
  const resolution = resolveAccountReference(
    { accountName },
    accounts.filter((account) => account.archivedAt === null),
  );
  if (resolution.status === "RESOLVED") return resolution.account;
  missingFields.push("account");
  return null;
}

function requestedValues(
  intent: RecurringDraftIntent,
  direction: RecurringPaymentDirection | null,
  currency: string | null,
  categories: readonly LedgerCategoryRecord[],
  missingFields: RecurringDraftField[],
): RequestedValues {
  const values: RequestedValues = {};
  const name = cleanOptionalText(intent.name);
  if (name) values.name = name;

  const amountText = cleanOptionalText(intent.amountText);
  if (amountText) {
    const amountMinor = currency ? parseAmountToMinor(amountText, currency) : null;
    if (amountMinor) values.amountMinor = amountMinor;
    else missingFields.push("amount");
  }

  if (intent.frequency) values.cadenceDays = cadenceDaysForFrequency(intent.frequency);

  const nextOccurrenceOn = cleanOptionalText(intent.nextOccurrenceOn);
  if (nextOccurrenceOn) {
    if (isCalendarDate(nextOccurrenceOn)) values.nextOccurrenceOn = nextOccurrenceOn;
    else missingFields.push("nextOccurrence");
  }

  const categoryName = cleanOptionalText(intent.categoryName);
  if (categoryName) {
    const category = matchByName(categoryName, categories.filter((candidate) => candidate.kind === direction));
    if (category) values.categoryId = category.id;
    else missingFields.push("category");
  }
  return values;
}

function describeChanges(
  item: RecurringOverviewItem,
  values: RecurringDraftValues,
  context: RecurringDraftContext,
): string[] {
  const changes: string[] = [];
  const change = (label: string, from: string, to: string) => {
    if (from !== to) changes.push(`${label}: ${from} → ${to}`);
  };
  if (values.name !== undefined) change("Name", item.merchantName, values.name);
  if (values.amountMinor !== undefined) {
    change(
      "Amount",
      formatAmount(item.typicalAmountMinor, item.currency),
      formatAmount(values.amountMinor, item.currency),
    );
  }
  if (values.cadenceDays !== undefined) {
    change("Frequency", `every ${cadenceLabel(item.cadenceDays)}`, `every ${cadenceLabel(values.cadenceDays)}`);
  }
  if (values.nextOccurrenceOn !== undefined) {
    change("Next occurrence", item.editableNextOccurrenceAt?.slice(0, 10) ?? "not set", values.nextOccurrenceOn);
  }
  if (values.accountId !== undefined && values.accountId !== item.account?.id) {
    const next = context.accounts.find((account) => account.id === values.accountId);
    change("Account", item.account?.name ?? "none", next?.name ?? values.accountId);
  }
  if (values.categoryId !== undefined && values.categoryId !== item.category?.id) {
    const next = context.categories.find((category) => category.id === values.categoryId);
    change("Category", item.category?.name ?? "none", next?.name ?? values.categoryId);
  }
  return changes;
}

function approvalSummary(
  operation: RecurringDraftOperation,
  direction: RecurringPaymentDirection,
  name: string,
  amountMinor: string,
  currency: string,
  cadenceDays: number,
  changes: readonly string[],
): RecurringApprovalSummary {
  const title = `${TITLES[operation]} recurring ${direction === "INCOME" ? "income" : "payment"}`;
  const amount = `${formatAmount(amountMinor, currency)} / ${cadenceLabel(cadenceDays)}`;
  const effects = EFFECTS[operation];
  return {
    title,
    name,
    amount,
    changes,
    effects,
    text: [title, name, amount, ...(changes.length > 0 ? ["", ...changes] : []), "", ...effects].join("\n"),
  };
}

function formatAmount(amountMinor: string, currency: string): string {
  const [whole, fraction] = toDecimalString(money(currency, BigInt(amountMinor))).split(".");
  const grouped = whole!.replaceAll(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${fraction ? `${grouped}.${fraction}` : grouped} ${currency}`;
}

function cadenceLabel(cadenceDays: number): string {
  const frequency = frequencyForCadenceDays(cadenceDays);
  return frequency ? CADENCE_LABELS[frequency] : `${cadenceDays} days`;
}

function orderedFields(fields: readonly RecurringDraftField[]): RecurringDraftField[] {
  return RECURRING_DRAFT_FIELDS.filter((field) => fields.includes(field));
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function directionOf(item: RecurringOverviewItem): RecurringPaymentDirection {
  return item.direction === "INFLOW" ? "INCOME" : "EXPENSE";
}

export function nextOccurrenceInstant(nextOccurrenceOn: string): Date {
  return new Date(`${nextOccurrenceOn}T00:00:00.000Z`);
}

export function recurringIdempotencyKey(actionId: string): string {
  return `agent-action:${actionId}`;
}

export function presentDraftRecurring(item: RecurringOverviewItem): RecurringDraftTarget {
  return {
    id: item.id,
    name: item.merchantName,
    direction: directionOf(item),
    provenance: item.origin === "MANUAL" ? "MANUAL" : "DETECTED",
    status: item.status,
    lifecycle: item.lifecycle,
    amountMinor: item.typicalAmountMinor,
    currency: item.currency,
    cadenceDays: item.cadenceDays,
  };
}

export function presentRecurringResult(
  operation: RecurringDraftOperation,
  payment: RecurringPaymentView,
  verifiedAt: Date,
): RecurringActionResult {
  return {
    recurringOperation: operation,
    recurringId: payment.id,
    name: payment.displayName ?? payment.normalizedMerchant ?? "Recurring payment",
    direction: payment.direction,
    provenance: payment.origin,
    status: payment.status,
    lifecycle: payment.lifecycle,
    amountMinor: payment.typicalAmountMinor,
    currency: payment.currency,
    cadenceDays: payment.cadenceDays,
    nextOccurrenceAt: payment.nextOccurrenceAt,
    verifiedAt: verifiedAt.toISOString(),
  };
}

/** True when the stored recurring item is exactly what the approved draft asked for. */
export function persistedRecurringMatches(draft: RecurringDraft, payment: RecurringPaymentView | undefined): boolean {
  if (!payment) return false;
  const { values } = draft;
  const valuesMatch =
    (values.name === undefined || payment.displayName === values.name) &&
    (values.amountMinor === undefined || payment.typicalAmountMinor === values.amountMinor) &&
    (values.cadenceDays === undefined || payment.cadenceDays === values.cadenceDays) &&
    (values.nextOccurrenceOn === undefined ||
      payment.nextOccurrenceAt === nextOccurrenceInstant(values.nextOccurrenceOn).toISOString()) &&
    (values.accountId === undefined || payment.accountId === values.accountId) &&
    (values.categoryId === undefined || payment.categoryId === values.categoryId);

  if (draft.recurringOperation === "CREATE") {
    return (
      valuesMatch &&
      payment.origin === "MANUAL" &&
      payment.status === "CONFIRMED" &&
      payment.lifecycle === "ACTIVE" &&
      payment.direction === draft.direction &&
      payment.currency === draft.currency
    );
  }

  const { current } = draft;
  if (!current || payment.id !== draft.recurringId || payment.origin !== current.provenance) return false;
  switch (draft.recurringOperation) {
    case "EDIT":
      return valuesMatch && payment.status === "CONFIRMED" && payment.lifecycle === current.lifecycle;
    case "PAUSE":
      return payment.status === "CONFIRMED" && payment.lifecycle === "PAUSED";
    case "RESUME":
      return payment.status === "CONFIRMED" && payment.lifecycle === "ACTIVE";
    case "CONFIRM":
      return payment.status === "CONFIRMED";
    case "IGNORE":
      return payment.status === "IGNORED";
    case "RESTORE":
      return payment.status === "CANDIDATE";
  }
}
