import type { ImportField, ImportMappingDraft } from "../domain";

const HEADER_ALIASES: Readonly<Record<ImportField, readonly string[]>> = {
  transactionDate: [
    "date", "transaction date", "transactiondate", "value date", "fecha", "datum", "buchungstag",
    "buchungsdatum", "date operation", "date d operation", "date de l operation", "data",
  ],
  bookingDate: ["booking date", "bookingdate", "book date", "posting date", "buchungstag", "valuta", "date comptable"],
  description: [
    "description", "details", "narration", "memo", "note", "reference", "referenz", "verwendungszweck",
    "libelle", "libellé", "motif", "concepto", "detalle", "transaction details",
  ],
  merchant: ["merchant", "payee", "beneficiary", "beneficiaire", "bénéficiaire", "counterparty", "vendor", "marchand"],
  amount: ["amount", "montant", "betrag", "umsatz", "value", "valor", "somme", "sum", "transaction amount"],
  debit: ["debit", "débit", "soll", "withdrawal", "charge", "outflow", "belastung", "debito", "débito", "dã©bit"],
  credit: ["credit", "crédit", "haben", "deposit", "inflow", "gutschrift", "credito", "crédito", "crã©dit"],
  currency: ["currency", "devise", "wahrung", "währung", "moneda", "curr", "ccy"],
  accountReference: ["account", "account number", "account reference", "konto", "iban", "reference account"],
  transactionType: ["type", "transaction type", "type operation", "art", "transactiontype", "operation type"],
};

export function detectImportMapping(headers: readonly string[]): ImportMappingDraft {
  const available = new Set(headers);
  const columns: ImportMappingDraft["columns"] = {};
  const confidence: ImportMappingDraft["confidence"] = {};
  const reasons: ImportMappingDraft["reasons"] = {};

  for (const field of Object.keys(HEADER_ALIASES) as ImportField[]) {
    const matches = headers
      .map((header) => ({ header, score: scoreHeader(field, header) }))
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score || left.header.localeCompare(right.header));
    const top = matches[0];
    if (!top || !available.has(top.header)) continue;
    columns[field] = top.header;
    confidence[field] = top.score;
    reasons[field] = top.score === 1 ? "exact_header_match" : "header_alias_match";
  }

  if (columns.debit || columns.credit) delete columns.amount;
  if (!columns.transactionDate && columns.bookingDate) {
    columns.transactionDate = columns.bookingDate;
    confidence.transactionDate = confidence.bookingDate;
    reasons.transactionDate = "booking_date_fallback";
  }

  const hasDate = Boolean(columns.transactionDate || columns.bookingDate);
  const hasAmount = Boolean(columns.amount || columns.debit || columns.credit);
  const hasStrongRequiredField = hasDate && hasAmount && Object.values(confidence).every((value) => value === undefined || value >= 0.9);
  return { columns, confidence, reasons, requiresConfirmation: !hasStrongRequiredField || Boolean(columns.amount) };
}

function scoreHeader(field: ImportField, header: string): number {
  const normalized = normalizeHeader(header);
  const aliases = HEADER_ALIASES[field];
  if (aliases.some((alias) => normalizeHeader(alias) === normalized)) return 1;
  if (aliases.some((alias) => normalized.includes(normalizeHeader(alias)))) return 0.82;
  return 0;
}

export function normalizeHeader(header: string): string {
  return header
    .replaceAll("Ã©", "é")
    .replaceAll("Ã¨", "è")
    .replaceAll("Ãª", "ê")
    .replaceAll("Ã¢", "â")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
