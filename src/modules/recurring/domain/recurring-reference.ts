export interface RecurringReference {
  readonly recurringId?: string | null;
  readonly recurringName?: string | null;
}

export type RecurringReferenceResolution<TRecurring> =
  | { readonly status: "RESOLVED"; readonly recurring: TRecurring }
  | { readonly status: "AMBIGUOUS" | "NOT_FOUND"; readonly candidates: readonly TRecurring[] };

/**
 * Resolves the recurring item a member named. An id must match exactly; a name
 * resolves only when exactly one item carries it, so two items that could both
 * be meant always come back as candidates instead of a pick.
 */
export function resolveRecurringReference<TRecurring extends { readonly id: string; readonly merchantName: string }>(
  reference: RecurringReference,
  items: readonly TRecurring[],
): RecurringReferenceResolution<TRecurring> {
  if (reference.recurringId) {
    const recurring = items.find((candidate) => candidate.id === reference.recurringId);
    return recurring ? { status: "RESOLVED", recurring } : { status: "NOT_FOUND", candidates: [] };
  }

  const hint = normalizeRecurringName(reference.recurringName);
  if (!hint) return { status: "NOT_FOUND", candidates: items };

  const tiers = [
    (name: string) => name === hint,
    (name: string) => name.includes(hint),
    (name: string) => ` ${hint} `.includes(` ${name} `),
  ];
  for (const matches of tiers) {
    const matched = items.filter((candidate) => matches(normalizeRecurringName(candidate.merchantName)));
    if (matched.length === 1) return { status: "RESOLVED", recurring: matched[0]! };
    if (matched.length > 1) return { status: "AMBIGUOUS", candidates: matched };
  }
  return { status: "NOT_FOUND", candidates: items };
}

/**
 * Names items the way the Recurring detail page does: a detected item with no
 * name of its own takes its merchant's display name instead of the normalized key.
 */
export function withRecurringDisplayNames<TRecurring extends { readonly id: string; readonly merchantName: string }>(
  items: readonly TRecurring[],
  payments: readonly {
    readonly id: string;
    readonly displayName: string | null;
    readonly normalizedMerchant: string | null;
  }[],
  merchants: readonly { readonly normalizedName: string; readonly name: string }[],
): TRecurring[] {
  const merchantNames = new Map(merchants.map((merchant) => [merchant.normalizedName, merchant.name]));
  const names = new Map(
    payments.map((payment) => [
      payment.id,
      payment.displayName ?? (payment.normalizedMerchant ? merchantNames.get(payment.normalizedMerchant) : undefined),
    ]),
  );
  return items.map((item) => ({ ...item, merchantName: names.get(item.id) ?? item.merchantName }));
}

function normalizeRecurringName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replaceAll(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}
