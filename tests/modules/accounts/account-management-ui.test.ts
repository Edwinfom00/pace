import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  accountManagementChanges,
  createAccountLifecycleRequest,
  createChangeAccountTypeRequest,
  createRenameAccountRequest,
  mapAccountManagementFailure,
  normalizedAccountName,
  parseManagedAccountResponse,
  validateAccountManagementDraft,
} from "@/modules/accounts/ui/components/account-management-flow";

const snapshot = { name: "Everyday", type: "CHECKING" as const, updatedAt: "2026-09-21T12:00:00.000Z" };

test("account-management metadata drafts trim names, retain canonical type restrictions, and skip no-op saves", () => {
  assert.equal(normalizedAccountName("  Everyday  "), "Everyday");
  assert.deepEqual(
    accountManagementChanges(snapshot, { name: " Everyday ", type: "CHECKING" }, { canRename: true, canChangeType: true }),
    { name: false, type: false },
  );
  assert.deepEqual(
    accountManagementChanges(snapshot, { name: "Daily", type: "CASH" }, { canRename: true, canChangeType: false }),
    { name: true, type: false },
  );
  assert.deepEqual(validateAccountManagementDraft({ name: "   ", type: "CHECKING" }, { canRename: true }), { name: "invalid" });
  assert.deepEqual(validateAccountManagementDraft({ name: "x".repeat(121), type: "CHECKING" }, { canRename: true }), { name: "tooLong" });
});

test("account-management requests contain only the canonical action payload", () => {
  const version = snapshot.updatedAt;
  const key = "00000000-0000-4000-8000-000000000001";

  assert.deepEqual(createRenameAccountRequest("  Daily  ", version, key), {
    action: "RENAME",
    name: "Daily",
    expectedUpdatedAt: version,
    idempotencyKey: key,
  });
  assert.deepEqual(createChangeAccountTypeRequest("CASH", version, key), {
    action: "CHANGE_TYPE",
    type: "CASH",
    expectedUpdatedAt: version,
    idempotencyKey: key,
  });
  assert.deepEqual(createAccountLifecycleRequest("ARCHIVE", version, key), {
    action: "ARCHIVE",
    expectedUpdatedAt: version,
    idempotencyKey: key,
  });
});

test("account-management response parsing and error mapping preserve safe field and conflict UX", () => {
  assert.deepEqual(parseManagedAccountResponse({
    account: {
      id: "account-1",
      name: "Everyday",
      type: "CHECKING",
      currency: "XAF",
      archivedAt: null,
      updatedAt: "2026-09-21T12:01:00.000Z",
    },
  }), {
    id: "account-1",
    name: "Everyday",
    type: "CHECKING",
    currency: "XAF",
    archivedAt: null,
    updatedAt: "2026-09-21T12:01:00.000Z",
  });
  assert.equal(parseManagedAccountResponse({ account: { id: "account-1" } }), null);
  assert.deepEqual(mapAccountManagementFailure("ACCOUNT_HAS_FINANCIAL_ACTIVITY"), { field: "type", formError: "notAllowed" });
  assert.deepEqual(mapAccountManagementFailure("CONCURRENT_MODIFICATION"), { formError: "conflict" });
  assert.deepEqual(mapAccountManagementFailure("ACCOUNT_WORKSPACE_MISMATCH"), { formError: "failed" });
});

test("Account Detail management uses the shared responsive dialog layer, canonical opening-balance action, and never exposes delete", async () => {
  const source = await readFile(
    resolve("src/modules/accounts/ui/components/account-management-actions.tsx"),
    "utf8",
  );

  assert.match(source, /ResponsiveDialog/);
  assert.doesNotMatch(source, /components\/ui\/dialog/);
  assert.doesNotMatch(source, /DELETE/);
  assert.match(source, /OpeningBalanceDialog/);
  assert.match(source, /canSetOpeningBalance/);
  assert.match(source, /canCorrectOpeningBalance/);
  assert.doesNotMatch(source, /availableBalance/);
});
