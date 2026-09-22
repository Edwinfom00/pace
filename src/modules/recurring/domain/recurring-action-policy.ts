import {
  canPerformWorkspaceAction,
  type WorkspaceRole,
} from "@/authorization/workspace-permissions";
import type { RecurringPaymentRecord } from "@/modules/financial-inbox/domain";


export const RECURRING_ACTION_REASONS = [
  "READ_ONLY_ROLE",
  "ALREADY_CONFIRMED",
  "ALREADY_IGNORED",
  "NOT_CANDIDATE",
  "MANUAL_RECURRING",
  "EDIT_NOT_SUPPORTED",
  "DELETE_NOT_SUPPORTED",
] as const;

export type RecurringActionReason = (typeof RECURRING_ACTION_REASONS)[number];

type RecurringManagementAction = "confirm" | "ignore" | "edit" | "delete";


export type RecurringCapabilities = {
  readonly canConfirm: boolean;
  readonly canIgnore: boolean;
  readonly canEdit: false;
  readonly canDelete: false;
  readonly canViewHistory: boolean;
  readonly canViewRelatedTransactions: boolean;
  readonly reasons: Partial<Record<RecurringManagementAction, RecurringActionReason>>;
};

export type RecurringActionPolicyInput = {
  readonly recurring: Pick<RecurringPaymentRecord, "origin" | "status">;
  readonly workspaceRole: WorkspaceRole;
};

export function getRecurringCapabilities({
  recurring,
  workspaceRole,
}: RecurringActionPolicyInput): RecurringCapabilities {
  const canRead = canPerformWorkspaceAction(workspaceRole, "read");
  const canManageLedger = canPerformWorkspaceAction(workspaceRole, "manage_ledger");

  if (!canManageLedger) {
    return {
      canConfirm: false,
      canIgnore: false,
      canEdit: false,
      canDelete: false,
      canViewHistory: canRead,
      canViewRelatedTransactions: canRead,
      reasons: {
        confirm: "READ_ONLY_ROLE",
        ignore: "READ_ONLY_ROLE",
        edit: "READ_ONLY_ROLE",
        delete: "READ_ONLY_ROLE",
      },
    };
  }

  // M9.4 manual patterns are intentional. They must never be put through the
  // detected-review workflow, even if a corrupted row claimed candidate state.
  if (recurring.origin === "MANUAL") {
    return {
      canConfirm: false,
      canIgnore: false,
      canEdit: false,
      canDelete: false,
      canViewHistory: canRead,
      canViewRelatedTransactions: canRead,
      reasons: {
        confirm: "MANUAL_RECURRING",
        ignore: "MANUAL_RECURRING",
        edit: "EDIT_NOT_SUPPORTED",
        delete: "DELETE_NOT_SUPPORTED",
      },
    };
  }

  const confirmReason = getConfirmReason(recurring.status);
  const ignoreReason = getIgnoreReason(recurring.status);

  return {
    canConfirm: confirmReason === null,
    canIgnore: ignoreReason === null,
    canEdit: false,
    // Detected financial provenance is intentionally retained in V1.
    canDelete: false,
    canViewHistory: canRead,
    canViewRelatedTransactions: canRead,
    reasons: {
      ...(confirmReason ? { confirm: confirmReason } : {}),
      ...(ignoreReason ? { ignore: ignoreReason } : {}),
      edit: "EDIT_NOT_SUPPORTED",
      delete: "DELETE_NOT_SUPPORTED",
    },
  };
}

function getConfirmReason(
  status: RecurringActionPolicyInput["recurring"]["status"],
): RecurringActionReason | null {
  switch (status) {
    case "CANDIDATE":
      return null;
    case "CONFIRMED":
      return "ALREADY_CONFIRMED";
    case "IGNORED":
      return "ALREADY_IGNORED";
  }
}

function getIgnoreReason(
  status: RecurringActionPolicyInput["recurring"]["status"],
): RecurringActionReason | null {
  switch (status) {
    case "CANDIDATE":
      return null;
    case "CONFIRMED":
      return "NOT_CANDIDATE";
    case "IGNORED":
      return "ALREADY_IGNORED";
  }
}
