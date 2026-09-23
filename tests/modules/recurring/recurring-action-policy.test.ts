import assert from "node:assert/strict";
import test from "node:test";

import {
  RECURRING_PAYMENT_LIFECYCLES,
  RECURRING_PAYMENT_STATUSES,
  type RecurringPaymentRecord,
} from "@/modules/financial-inbox/domain";
import { getRecurringCapabilities } from "@/modules/recurring/domain/recurring-action-policy";

function recurring(
  status: RecurringPaymentRecord["status"],
  lifecycle: RecurringPaymentRecord["lifecycle"] = "ACTIVE",
): Pick<RecurringPaymentRecord, "origin" | "status" | "lifecycle"> {
  return { origin: "DETECTED", status, lifecycle };
}

test("M9.6 keeps review status and scheduling lifecycle as separate canonical dimensions", () => {
  assert.deepEqual(RECURRING_PAYMENT_STATUSES, ["CANDIDATE", "CONFIRMED", "IGNORED"]);
  assert.deepEqual(RECURRING_PAYMENT_LIFECYCLES, ["ACTIVE", "PAUSED"]);
  const capabilities = getRecurringCapabilities({ recurring: recurring("CANDIDATE"), workspaceRole: "OWNER" });
  assert.equal(capabilities.canPause, false);
  assert.equal(capabilities.canResume, false);
  assert.equal(capabilities.canRestore, false);
});

test("candidate detection can be confirmed or ignored by ledger managers without mutating it", () => {
  const candidate = recurring("CANDIDATE");
  const before = { ...candidate };
  const capabilities = getRecurringCapabilities({ recurring: candidate, workspaceRole: "MEMBER" });

  assert.equal(capabilities.canConfirm, true);
  assert.equal(capabilities.canIgnore, true);
  assert.equal(capabilities.canRestore, false);
  assert.equal(capabilities.canEdit, false);
  assert.equal(capabilities.reasons.edit, "NOT_CONFIRMED");
  assert.deepEqual(candidate, before);
});

test("confirmed patterns can edit and transition only between active and paused scheduling", () => {
  const capabilities = getRecurringCapabilities({ recurring: recurring("CONFIRMED"), workspaceRole: "ADMIN" });

  assert.equal(capabilities.canConfirm, false);
  assert.equal(capabilities.reasons.confirm, "ALREADY_CONFIRMED");
  assert.equal(capabilities.canIgnore, false);
  assert.equal(capabilities.canRestore, false);
  assert.equal(capabilities.reasons.ignore, "NOT_CANDIDATE");
  assert.equal(capabilities.canEdit, true);
  assert.equal(capabilities.canPause, true);
  assert.equal(capabilities.canResume, false);
  assert.equal(capabilities.reasons.resume, "NOT_PAUSED");
  assert.equal(capabilities.canDelete, false);
  assert.equal(capabilities.reasons.delete, "DELETE_NOT_SUPPORTED");
});

test("an unavailable linked account keeps history readable but blocks future edits", () => {
  const capabilities = getRecurringCapabilities({
    recurring: recurring("CONFIRMED"),
    workspaceRole: "OWNER",
    linkedAccountUnavailable: true,
  });

  assert.equal(capabilities.canViewHistory, true);
  assert.equal(capabilities.canEdit, false);
  assert.equal(capabilities.reasons.edit, "LINKED_ACCOUNT_UNAVAILABLE");
  assert.equal(capabilities.canPause, true);
});

test("manual recurring patterns retain their provenance while using the same scheduling policy", () => {
  const capabilities = getRecurringCapabilities({
    recurring: { origin: "MANUAL", status: "CONFIRMED", lifecycle: "ACTIVE" },
    workspaceRole: "OWNER",
  });

  assert.equal(capabilities.canConfirm, false);
  assert.equal(capabilities.canIgnore, false);
  assert.equal(capabilities.canRestore, false);
  assert.equal(capabilities.reasons.confirm, "MANUAL_RECURRING");
  assert.equal(capabilities.reasons.ignore, "MANUAL_RECURRING");
  assert.equal(capabilities.reasons.restore, "MANUAL_RECURRING");
  assert.equal(capabilities.canEdit, true);
  assert.equal(capabilities.canPause, true);
  assert.equal(capabilities.canResume, false);
});

test("ignored detection can be restored to review while history stays readable", () => {
  const capabilities = getRecurringCapabilities({ recurring: recurring("IGNORED"), workspaceRole: "OWNER" });

  assert.equal(capabilities.canConfirm, false);
  assert.equal(capabilities.canIgnore, false);
  assert.equal(capabilities.reasons.confirm, "ALREADY_IGNORED");
  assert.equal(capabilities.reasons.ignore, "ALREADY_IGNORED");
  assert.equal(capabilities.canRestore, true);
  assert.equal(capabilities.canViewHistory, true);
  assert.equal(capabilities.canViewRelatedTransactions, true);
});

test("viewers retain recurring history access but receive no mutation capability", () => {
  const capabilities = getRecurringCapabilities({ recurring: recurring("CANDIDATE"), workspaceRole: "VIEWER" });

  assert.equal(capabilities.canViewHistory, true);
  assert.equal(capabilities.canViewRelatedTransactions, true);
  assert.equal(capabilities.canConfirm, false);
  assert.equal(capabilities.canIgnore, false);
  assert.equal(capabilities.canRestore, false);
  assert.equal(capabilities.canEdit, false);
  assert.equal(capabilities.canPause, false);
  assert.equal(capabilities.canResume, false);
  assert.equal(capabilities.canDelete, false);
  assert.deepEqual(capabilities.reasons, {
    confirm: "READ_ONLY_ROLE",
    ignore: "READ_ONLY_ROLE",
    restore: "READ_ONLY_ROLE",
    edit: "READ_ONLY_ROLE",
    pause: "READ_ONLY_ROLE",
    resume: "READ_ONLY_ROLE",
    delete: "READ_ONLY_ROLE",
  });
});
