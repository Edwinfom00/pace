import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerTransactionRecord,
} from "./domain";

/** JSON cannot encode bigint; APIs expose exact minor units as decimal strings. */
export function presentLedgerAccount(account: LedgerAccountRecord) {
  return { ...account, openingBalanceMinor: account.openingBalanceMinor.toString() };
}

export function presentLedgerCategory(category: LedgerCategoryRecord) {
  return category;
}

export function presentLedgerMerchant(merchant: LedgerMerchantRecord) {
  return merchant;
}

export function presentLedgerTransaction(transaction: LedgerTransactionRecord) {
  return { ...transaction, amountMinor: transaction.amountMinor.toString() };
}
