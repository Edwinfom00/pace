import {
  canPerformWorkspaceAction,
  type WorkspaceRole,
} from "@/authorization/workspace-permissions";
import type { RecurringPaymentRecord } from "@/modules/financial-inbox/domain";


export const RECURRING_ACTION_REASONS = [
  "READ_ONLY_ROLE",
  "ALREADY_CONFIRMED",
  "ALREADY_IGNORED",
  "NOT_RESTORABLE",
  "NOT_CANDIDATE",
  "MANUAL_RECURRING",
  "NOT_CONFIRMED",
  "LINKED_ACCOUNT_UNAVAILABLE",
  "ALREADY_PAUSED",
  "NOT_PAUSED",
  "DELETE_NOT_SUPPORTED",
] as const;

export type RecurringActionReason = (typeof RECURRING_ACTION_REASONS)[number];

type RecurringManagementAction = "confirm" | "ignore" | "restore" | "edit" | "pause" | "resume" | "delete";


export type RecurringCapabilities = {
  readonly canConfirm: boolean;
  readonly canIgnore: boolean;
  readonly canRestore: boolean;
  readonly canEdit: boolean;
  readonly canPause: boolean;
  readonly canResume: boolean;
  readonly canDelete: false;
  readonly canViewHistory: boolean;
  readonly canViewRelatedTransactions: boolean;
  readonly reasons: Partial<Record<RecurringManagementAction, RecurringActionReason>>;
};

export type RecurringActionPolicyInput = {
  readonly recurring: Pick<RecurringPaymentRecord, "origin" | "status" | "lifecycle">;
  readonly workspaceRole: WorkspaceRole;
  /**
   * A recurring pattern may retain an archived account as historical context,
   * but future-pattern edits must not keep projecting against it.
   */
  readonly linkedAccountUnavailable?: boolean;
};

export function getRecurringCapabilities({
  recurring,
  workspaceRole,
  linkedAccountUnavailable = false,
}: RecurringActionPolicyInput): RecurringCapabilities {
  const canRead = canPerformWorkspaceAction(workspaceRole, "read");
  const canManageLedger = canPerformWorkspaceAction(workspaceRole, "manage_ledger");

  if (!canManageLedger) {
    return {
      canConfirm: false,
      canIgnore: false,
      canRestore: false,
      canEdit: false,
      canPause: false,
      canResume: false,
      canDelete: false,
      canViewHistory: canRead,
      canViewRelatedTransactions: canRead,
      reasons: {
        confirm: "READ_ONLY_ROLE",
        ignore: "READ_ONLY_ROLE",
        restore: "READ_ONLY_ROLE",
        edit: "READ_ONLY_ROLE",
        pause: "READ_ONLY_ROLE",
        resume: "READ_ONLY_ROLE",
        delete: "READ_ONLY_ROLE",
      },
    };
  }

  // M9.4 manual patterns are intentional. They must never be put through the
  // detected-review workflow, even if a corrupted row claimed candidate state.
  if (recurring.origin === "MANUAL") {
    const editReason = getEditReason(recurring.status, linkedAccountUnavailable);
    const pauseReason = getPauseReason(recurring.status, recurring.lifecycle);
    const resumeReason = getResumeReason(recurring.status, recurring.lifecycle);
    return {
      canConfirm: false,
      canIgnore: false,
      canRestore: false,
      canEdit: editReason === null,
      canPause: pauseReason === null,
      canResume: resumeReason === null,
      canDelete: false,
      canViewHistory: canRead,
      canViewRelatedTransactions: canRead,
      reasons: {
        confirm: "MANUAL_RECURRING",
        ignore: "MANUAL_RECURRING",
        restore: "MANUAL_RECURRING",
        ...(editReason ? { edit: editReason } : {}),
        ...(pauseReason ? { pause: pauseReason } : {}),
        ...(resumeReason ? { resume: resumeReason } : {}),
        delete: "DELETE_NOT_SUPPORTED",
      },
    };
  }

  const confirmReason = getConfirmReason(recurring.status);
  const ignoreReason = getIgnoreReason(recurring.status);
  const restoreReason = getRestoreReason(recurring.status);
  const editReason = getEditReason(recurring.status, linkedAccountUnavailable);
  const pauseReason = getPauseReason(recurring.status, recurring.lifecycle);
  const resumeReason = getResumeReason(recurring.status, recurring.lifecycle);

  return {
    canConfirm: confirmReason === null,
    canIgnore: ignoreReason === null,
    canRestore: restoreReason === null,
    canEdit: editReason === null,
    canPause: pauseReason === null,
    canResume: resumeReason === null,
    // Detected financial provenance is intentionally retained in V1.
    canDelete: false,
    canViewHistory: canRead,
    canViewRelatedTransactions: canRead,
    reasons: {
      ...(confirmReason ? { confirm: confirmReason } : {}),
      ...(ignoreReason ? { ignore: ignoreReason } : {}),
      ...(restoreReason ? { restore: restoreReason } : {}),
      ...(editReason ? { edit: editReason } : {}),
      ...(pauseReason ? { pause: pauseReason } : {}),
      ...(resumeReason ? { resume: resumeReason } : {}),
      delete: "DELETE_NOT_SUPPORTED",
    },
  };
}

function getEditReason(
  status: RecurringActionPolicyInput["recurring"]["status"],
  linkedAccountUnavailable = false,
): RecurringActionReason | null {
  if (status !== "CONFIRMED") return "NOT_CONFIRMED";
  return linkedAccountUnavailable ? "LINKED_ACCOUNT_UNAVAILABLE" : null;
}

function getPauseReason(
  status: RecurringActionPolicyInput["recurring"]["status"],
  lifecycle: RecurringActionPolicyInput["recurring"]["lifecycle"],
): RecurringActionReason | null {
  if (status !== "CONFIRMED") return "NOT_CONFIRMED";
  return lifecycle === "ACTIVE" ? null : "ALREADY_PAUSED";
}

function getResumeReason(
  status: RecurringActionPolicyInput["recurring"]["status"],
  lifecycle: RecurringActionPolicyInput["recurring"]["lifecycle"],
): RecurringActionReason | null {
  if (status !== "CONFIRMED") return "NOT_CONFIRMED";
  return lifecycle === "PAUSED" ? null : "NOT_PAUSED";
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

function getRestoreReason(
  status: RecurringActionPolicyInput["recurring"]["status"],
): RecurringActionReason | null {
  switch (status) {
    case "IGNORED":
      return null;
    case "CANDIDATE":
    case "CONFIRMED":
      return "NOT_RESTORABLE";
  }
}
