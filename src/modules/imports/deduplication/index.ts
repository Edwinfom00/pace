import { normalizeMerchantName, type LedgerTransactionRecord } from "@/modules/ledger/domain";

import type { NormalizedImportRow } from "../domain";

export function applyImportDeduplication(
  rows: readonly NormalizedImportRow[],
  existingTransactions: readonly LedgerTransactionRecord[],
): NormalizedImportRow[] {
  const existingFingerprints = new Set(
    existingTransactions.map((transaction) => transaction.deduplicationFingerprint).filter((value): value is string => Boolean(value)),
  );
  const seenFingerprints = new Set<string>();

  return rows.map((row) => {
    if (row.disposition !== "ACCEPT") return row;
    if (existingFingerprints.has(row.fingerprint)) {
      return exactDuplicate(row, "EXACT_EXISTING", "This transaction is already in Pace.");
    }
    if (seenFingerprints.has(row.fingerprint)) {
      return exactDuplicate(row, "EXACT_IN_FILE", "This exact transaction appears more than once in this file.");
    }
    seenFingerprints.add(row.fingerprint);
    const likely = existingTransactions.some((transaction) => isLikelyDuplicate(row, transaction));
    return likely
      ? {
          ...row,
          duplicateStatus: "LIKELY",
          issues: [...row.issues, { code: "LIKELY_DUPLICATE", message: "A similar transaction already exists and needs review.", severity: "WARNING" }],
        }
      : row;
  });
}

function exactDuplicate(
  row: NormalizedImportRow,
  duplicateStatus: Extract<NormalizedImportRow["duplicateStatus"], "EXACT_IN_FILE" | "EXACT_EXISTING">,
  message: string,
): NormalizedImportRow {
  return {
    ...row,
    duplicateStatus,
    disposition: "SKIP_EXACT_DUPLICATE",
    issues: [...row.issues, { code: "EXACT_DUPLICATE", message, severity: "WARNING" }],
  };
}

function isLikelyDuplicate(row: NormalizedImportRow, transaction: LedgerTransactionRecord): boolean {
  if (
    transaction.accountId === null ||
    transaction.accountId === undefined ||
    transaction.currency !== row.currency ||
    transaction.amountMinor.toString() !== row.amountMinor ||
    transaction.kind !== row.kind
  ) {
    return false;
  }
  const dateDistance = Math.abs(new Date(transaction.occurredAt).getTime() - new Date(row.occurredAt).getTime());
  if (dateDistance > 2 * 86_400_000) return false;
  const incomingText = normalizeMerchantName(row.merchantName ?? row.description ?? "");
  if (!incomingText) return false;
  const sourceText = typeof transaction.source.importDescription === "string"
    ? transaction.source.importDescription
    : transaction.note ?? "";
  const existingText = normalizeMerchantName(sourceText);
  return existingText === incomingText || existingText.includes(incomingText) || incomingText.includes(existingText);
}
