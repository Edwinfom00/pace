import type {
  FinancialInboxAuditRecord,
  FinancialInboxItemRecord,
  InboxItemStatus,
  InboxReason,
  RecurringPaymentRecord,
  TransactionClassificationRecord,
} from "./domain";
import type {
  LedgerCategoryRecord,
  LedgerTransactionCorrectionRecord,
  LedgerTransactionListRow,
} from "../ledger/domain";
import type { TransactionListItem } from "../transactions/types/transaction-ui.types";
import type { InboxResolutionCapabilities } from "./inbox-resolution-policy";

export const INBOX_DETAIL_SIMILAR_TRANSACTION_LIMIT = 3;

export type InboxItemDetailReadInput = {
  readonly workspaceId: string;
  readonly inboxItemId: string;
  readonly similarLimit: number;
};

export type InboxItemDetailReadRecord = {
  readonly item: FinancialInboxItemRecord;
  readonly sourceTransaction: LedgerTransactionListRow;
  readonly effectiveTransaction: LedgerTransactionListRow;
  readonly classification: TransactionClassificationRecord | null;
  readonly suggestedCategory: LedgerCategoryRecord | null;
  readonly recurring: RecurringPaymentRecord | null;
  readonly relatedItems: readonly FinancialInboxItemRecord[];
  readonly similarTransactions: readonly LedgerTransactionListRow[];
  readonly audits: readonly FinancialInboxAuditRecord[];
  readonly corrections: readonly LedgerTransactionCorrectionRecord[];
};

export interface InboxItemDetailReader {
  readInboxItemDetail(input: InboxItemDetailReadInput): Promise<InboxItemDetailReadRecord | null>;
}

export type InboxDetailConfidence = "HIGH" | "REVIEW";
export type InboxDetailActivityEvent = "INBOX_ITEM_CREATED" | "CLASSIFICATION_REVIEW_CREATED" | "RECURRING_CANDIDATE_DETECTED";

export type InboxItemDetail = {
  readonly id: string;
  readonly workspaceId: string;
  readonly status: InboxItemStatus;
  readonly reason: InboxReason;
  readonly updatedAt: string;
  readonly sourceId: string;
  readonly transactionUpdatedAt: string;
  readonly transaction: TransactionListItem & {
    readonly merchantName: string | null;
    readonly note: string | null;
    readonly source: "IMPORT" | "MANUAL" | "AGENT" | "BANK_SYNC" | null;
    readonly technicalId: string;
    readonly effectiveTransactionId: string;
  };
  readonly currentClassification: {
    readonly state: "CONFIRMED" | "UNCERTAIN" | "UNCATEGORIZED";
    readonly category: { readonly id: string; readonly name: string; readonly systemKey: string | null } | null;
  };

  readonly suggestion: {
    readonly category: { readonly id: string; readonly name: string; readonly systemKey: string | null };
    readonly confidence: InboxDetailConfidence;
    readonly score: number;
    readonly updatedAt: string;
  } | null;
  readonly attentionReasons: readonly InboxReason[];
  readonly similarTransactions: readonly TransactionListItem[];
  readonly context: {
    readonly account: { readonly id: string; readonly name: string } | null;
    readonly source: "IMPORT" | "MANUAL" | "AGENT" | "BANK_SYNC" | null;
    readonly recurring: {
      readonly id: string;
      readonly displayName: string | null;
      readonly status: RecurringPaymentRecord["status"];
      readonly lifecycle: RecurringPaymentRecord["lifecycle"];
      readonly typicalAmountMinor: string;
      readonly currency: string;
      readonly cadenceDays: number;
      readonly updatedAt: string;
    } | null;
  };
  readonly activity: readonly { readonly id: string; readonly event: InboxDetailActivityEvent; readonly occurredAt: string }[];
  readonly capabilities: InboxResolutionCapabilities;
};
