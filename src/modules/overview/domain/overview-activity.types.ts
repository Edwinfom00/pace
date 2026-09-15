import type { TransactionIconKey } from "@/lib/transaction-visuals/transaction-icon.types";
import type { InboxReason } from "@/modules/financial-inbox/domain";
import type {
  LedgerTransactionKind,
  LedgerTransactionStatus,
} from "@/modules/ledger/domain";

export interface OverviewRecentTransaction {
  readonly id: string;
  readonly merchantName: string | null;
  readonly amountMinor: string;
  readonly currency: string;
  readonly kind: LedgerTransactionKind;
  readonly effectiveAt: string;
  readonly categoryName: string | null;
  readonly categoryKey: string | null;
  readonly iconKey: TransactionIconKey;
  readonly status: LedgerTransactionStatus;
}

export interface OverviewInboxPreviewItem {
  readonly id: string;
  readonly transactionId: string;
  readonly merchantName: string | null;
  readonly occurredAt: string;
  readonly reason: InboxReason;
  readonly kind: LedgerTransactionKind;
  readonly iconKey: TransactionIconKey;
}

export interface OverviewInboxPreview {
  readonly unresolvedCount: number;
  readonly items: readonly OverviewInboxPreviewItem[];
}
