import {
  canPerformWorkspaceAction,
  type WorkspaceRole,
} from "@/authorization/workspace-permissions";

import {
  LEDGER_ACCOUNT_TYPES,
  type LedgerAccountRecord,
  type LedgerAccountType,
} from "./domain";
import { getSpendabilityMode } from "./spendability-policy";

export const ACCOUNT_ACTION_REASONS = [
  "READ_ONLY_ROLE",
  "ACCOUNT_HAS_FINANCIAL_ACTIVITY",
  "ACCOUNT_TYPE_TRANSITION_UNSUPPORTED",
  "ACCOUNT_ALREADY_ARCHIVED",
  "ACCOUNT_NOT_ARCHIVED",
  "DELETE_NOT_SUPPORTED",
] as const;

export type AccountActionReason = (typeof ACCOUNT_ACTION_REASONS)[number];

type AccountManagementAction = "rename" | "changeType" | "archive" | "restore" | "delete";


export type AccountActionPolicy = {
  readonly canRename: boolean;
  readonly canChangeType: boolean;
  readonly canArchive: boolean;
  readonly canRestore: boolean;
  /** Establishment/correction remains a separate financial action from metadata editing. */
  readonly canSetOpeningBalance: boolean;
  readonly canCorrectOpeningBalance: boolean;
  readonly canDelete: false;
  /** Safe targets have the same configured spendability semantics. */
  readonly allowedTypeChanges: readonly LedgerAccountType[];
  readonly reasons: Partial<Record<AccountManagementAction, AccountActionReason>>;
};

export type AccountActionPolicyInput = {
  readonly account: Pick<LedgerAccountRecord, "type" | "archivedAt">;
  readonly workspaceRole: WorkspaceRole;
  readonly hasFinancialActivity: boolean;
  /** The canonical opening-balance root exists, including an explicit zero balance. */
  readonly hasOpeningBalance?: boolean;
};

export function getAccountActionPolicy({
  account,
  workspaceRole,
  hasFinancialActivity,
  hasOpeningBalance = false,
}: AccountActionPolicyInput): AccountActionPolicy {
  const canManageLedger = canPerformWorkspaceAction(workspaceRole, "manage_ledger");
  if (!canManageLedger) {
    return {
      canRename: false,
      canChangeType: false,
      canArchive: false,
      canRestore: false,
      canSetOpeningBalance: false,
      canCorrectOpeningBalance: false,
      canDelete: false,
      allowedTypeChanges: [],
      reasons: {
        rename: "READ_ONLY_ROLE",
        changeType: "READ_ONLY_ROLE",
        archive: "READ_ONLY_ROLE",
        restore: "READ_ONLY_ROLE",
        delete: "READ_ONLY_ROLE",
      },
    };
  }

  const allowedTypeChanges = hasFinancialActivity
    ? []
    : safeTypeChangesFrom(account.type);
  const typeChangeReason = hasFinancialActivity
    ? "ACCOUNT_HAS_FINANCIAL_ACTIVITY"
    : allowedTypeChanges.some((type) => type !== account.type)
      ? null
      : "ACCOUNT_TYPE_TRANSITION_UNSUPPORTED";
  const archiveReason = account.archivedAt ? "ACCOUNT_ALREADY_ARCHIVED" : null;
  const restoreReason = account.archivedAt ? null : "ACCOUNT_NOT_ARCHIVED";

  return {
    // Names are descriptive metadata, including for historical accounts.
    canRename: true,
    canChangeType: allowedTypeChanges.some((type) => type !== account.type),
    canArchive: archiveReason === null,
    canRestore: restoreReason === null,
    canSetOpeningBalance: account.archivedAt === null && !hasOpeningBalance,
    canCorrectOpeningBalance: account.archivedAt === null && hasOpeningBalance,
    canDelete: false,
    allowedTypeChanges,
    reasons: {
      ...(typeChangeReason ? { changeType: typeChangeReason } : {}),
      ...(archiveReason ? { archive: archiveReason } : {}),
      ...(restoreReason ? { restore: restoreReason } : {}),
      delete: "DELETE_NOT_SUPPORTED",
    },
  };
}

export function isAccountTypeChangeAllowed(
  currentType: LedgerAccountType,
  targetType: LedgerAccountType,
  hasFinancialActivity: boolean,
): boolean {
  if (hasFinancialActivity) return false;
  return safeTypeChangesFrom(currentType).includes(targetType);
}

function safeTypeChangesFrom(type: LedgerAccountType): readonly LedgerAccountType[] {
  const currentMode = getSpendabilityMode(type);
  // CREDIT_CARD and OTHER currently have no configured debit semantics. Do
  // not treat that shared absence as a safe migration between meanings.
  if (currentMode === "UNSUPPORTED") return [type];
  // The enum owns all possible types; keeping this derived makes new types
  // opt into mutation only when their explicit spendability mode matches.
  return LEDGER_ACCOUNT_TYPES
    .filter((candidate) => getSpendabilityMode(candidate) === currentMode);
}
