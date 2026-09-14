import type { ImportPreview, NormalizedImportRow } from "./domain";

export function buildImportPreview(rows: readonly NormalizedImportRow[]): ImportPreview {
  const accepted = rows.filter((row) => row.disposition === "ACCEPT");
  const validRows = rows.filter((row) => row.disposition !== "INVALID");
  const totals = new Map<string, { expenses: { count: number; amount: bigint }; income: { count: number; amount: bigint }; transfers: { count: number; amount: bigint } }>();
  for (const row of validRows) {
    if (!row.currency || !row.amountMinor || row.amountMinor === "0") continue;
    const entry = totals.get(row.currency) ?? {
      expenses: { count: 0, amount: 0n },
      income: { count: 0, amount: 0n },
      transfers: { count: 0, amount: 0n },
    };
    const bucket = row.kind === "EXPENSE" ? entry.expenses : row.kind === "INCOME" ? entry.income : entry.transfers;
    bucket.count += 1;
    bucket.amount += BigInt(row.amountMinor);
    totals.set(row.currency, entry);
  }
  const dates = validRows.map((row) => row.occurredAt).filter(Boolean).sort();
  return {
    parsedRowCount: rows.length,
    acceptedRowCount: accepted.length,
    invalidRowCount: rows.filter((row) => row.disposition === "INVALID").length,
    exactDuplicateRowCount: rows.filter((row) => row.disposition === "SKIP_EXACT_DUPLICATE").length,
    likelyDuplicateRowCount: rows.filter((row) => row.duplicateStatus === "LIKELY").length,
    transferCandidateCount: rows.filter((row) => row.transferCandidate).length,
    dateRange: dates.length ? { start: dates[0]!.slice(0, 10), end: dates.at(-1)!.slice(0, 10) } : null,
    currencies: [...totals.keys()].sort(),
    totalsByCurrency: [...totals.entries()]
      .map(([currency, values]) => ({
        currency,
        expenses: { count: values.expenses.count, amountMinor: values.expenses.amount.toString() },
        income: { count: values.income.count, amountMinor: values.income.amount.toString() },
        transfers: { count: values.transfers.count, amountMinor: values.transfers.amount.toString() },
      }))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
  };
}
