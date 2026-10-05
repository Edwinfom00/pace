export interface AccountReference {
  readonly accountId?: string | null;
  readonly accountName?: string | null;
}

export type AccountReferenceResolution<TAccount> =
  | { readonly status: "RESOLVED"; readonly account: TAccount }
  | { readonly status: "AMBIGUOUS" | "NOT_FOUND"; readonly candidates: readonly TAccount[] };

/**
 * Resolves the account a member named. An id must match exactly; a name
 * resolves only when exactly one account carries it, so two accounts that
 * could both be meant always come back as candidates instead of a pick.
 */
export function resolveAccountReference<TAccount extends { readonly id: string; readonly name: string }>(
  reference: AccountReference,
  accounts: readonly TAccount[],
): AccountReferenceResolution<TAccount> {
  if (reference.accountId) {
    const account = accounts.find((candidate) => candidate.id === reference.accountId);
    return account ? { status: "RESOLVED", account } : { status: "NOT_FOUND", candidates: [] };
  }

  const hint = normalizeAccountName(reference.accountName);
  if (!hint) return { status: "NOT_FOUND", candidates: accounts };

  const exact = accounts.filter((candidate) => normalizeAccountName(candidate.name) === hint);
  if (exact.length === 1) return { status: "RESOLVED", account: exact[0]! };
  if (exact.length > 1) return { status: "AMBIGUOUS", candidates: exact };

  const partial = accounts.filter((candidate) => normalizeAccountName(candidate.name).includes(hint));
  if (partial.length === 1) return { status: "RESOLVED", account: partial[0]! };
  return partial.length > 1
    ? { status: "AMBIGUOUS", candidates: partial }
    : { status: "NOT_FOUND", candidates: accounts };
}

function normalizeAccountName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replaceAll(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}
