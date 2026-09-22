import assert from "node:assert/strict";
import test from "node:test";

import { RECURRING_PAYMENT_STATUSES, type RecurringPaymentRecord } from "@/modules/financial-inbox/domain";
import { getRecurringCapabilities } from "@/modules/recurring/domain/recurring-action-policy";

function recurring(status: RecurringPaymentRecord["status"]): Pick<RecurringPaymentRecord, "origin" | "status"> {
  return { origin: "DETECTED", status };
}

test("M4 recurring state remains a single detection review dimension", () => {
  assert.deepEqual(RECURRING_PAYMENT_STATUSES, ["CANDIDATE", "CONFIRMED", "IGNORED"]);
  const capabilities = getRecurringCapabilities({ recurring: recurring("CANDIDATE"), workspaceRole: "OWNER" });
  assert.equal("canPause" in capabilities, false);
  assert.equal("canResume" in capabilities, false);
  assert.equal("canRestore" in capabilities, false);
});

test("candidate detection can be confirmed or ignored by ledger managers without mutating it", () => {
  const candidate = recurring("CANDIDATE");
  const before = { ...candidate };
  const capabilities = getRecurringCapabilities({ recurring: candidate, workspaceRole: "MEMBER" });

  assert.equal(capabilities.canConfirm, true);
  assert.equal(capabilities.canIgnore, true);
  assert.equal(capabilities.canEdit, false);
  assert.equal(capabilities.reasons.edit, "EDIT_NOT_SUPPORTED");
  assert.deepEqual(candidate, before);
});

test("confirmed detection has no second confirm, edit, or disable lifecycle in M4", () => {
  const capabilities = getRecurringCapabilities({ recurring: recurring("CONFIRMED"), workspaceRole: "ADMIN" });

  assert.equal(capabilities.canConfirm, false);
  assert.equal(capabilities.reasons.confirm, "ALREADY_CONFIRMED");
  assert.equal(capabilities.canIgnore, false);
  assert.equal(capabilities.reasons.ignore, "NOT_CANDIDATE");
  assert.equal(capabilities.canEdit, false);
  assert.equal(capabilities.canDelete, false);
  assert.equal(capabilities.reasons.delete, "DELETE_NOT_SUPPORTED");
});

test("manual recurring patterns never inherit detected review actions", () => {
  const capabilities = getRecurringCapabilities({
    recurring: { origin: "MANUAL", status: "CONFIRMED" },
    workspaceRole: "OWNER",
  });

  assert.equal(capabilities.canConfirm, false);
  assert.equal(capabilities.canIgnore, false);
  assert.equal(capabilities.reasons.confirm, "MANUAL_RECURRING");
  assert.equal(capabilities.reasons.ignore, "MANUAL_RECURRING");
});

test("ignored detection is terminal while history stays readable", () => {
  const capabilities = getRecurringCapabilities({ recurring: recurring("IGNORED"), workspaceRole: "OWNER" });

  assert.equal(capabilities.canConfirm, false);
  assert.equal(capabilities.canIgnore, false);
  assert.equal(capabilities.reasons.confirm, "ALREADY_IGNORED");
  assert.equal(capabilities.reasons.ignore, "ALREADY_IGNORED");
  assert.equal(capabilities.canViewHistory, true);
  assert.equal(capabilities.canViewRelatedTransactions, true);
});

test("viewers retain recurring history access but receive no mutation capability", () => {
  const capabilities = getRecurringCapabilities({ recurring: recurring("CANDIDATE"), workspaceRole: "VIEWER" });

  assert.equal(capabilities.canViewHistory, true);
  assert.equal(capabilities.canViewRelatedTransactions, true);
  assert.equal(capabilities.canConfirm, false);
  assert.equal(capabilities.canIgnore, false);
  assert.equal(capabilities.canEdit, false);
  assert.equal(capabilities.canDelete, false);
  assert.deepEqual(capabilities.reasons, {
    confirm: "READ_ONLY_ROLE",
    ignore: "READ_ONLY_ROLE",
    edit: "READ_ONLY_ROLE",
    delete: "READ_ONLY_ROLE",
  });
});
