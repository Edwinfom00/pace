import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  createCorrectOpeningBalanceCommand,
  createOpeningBalanceDraft,
  createSetOpeningBalanceCommand,
  mapOpeningBalanceFailure,
  openingBalanceEffectiveAt,
  parseOpeningBalanceAmount,
  validateOpeningBalanceDraft,
} from "@/modules/accounts/ui/components/opening-balance-flow";

const account = {
  id: "68e60482-66e6-4e5e-8ac6-855d04ef5228",
  name: "Main Account",
  type: "CHECKING" as const,
  currency: "XAF",
  status: "ACTIVE" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
};

const openingBalance = {
  amountMinor: "125000",
  currency: "XAF",
  effectiveAt: "2026-09-01T23:00:00.000Z",
  hasBeenCorrected: false,
  updatedAt: "2026-09-02T12:00:00.000Z",
};

test("opening-balance flow uses grouped input only as a display convenience and submits bigint minor-unit strings", () => {
  const amount = parseOpeningBalanceAmount("125,000", "XAF");
  assert.equal(amount?.minor, 125_000n);

  const draft = {
    amount: "125,000",
    effectiveDate: new Date("2026-09-21T12:00:00.000Z"),
    reason: "",
  };
  assert.deepEqual(createSetOpeningBalanceCommand("workspace-one", account, draft, "Africa/Douala", "00000000-0000-4000-8000-000000000001"), {
    workspaceId: "workspace-one",
    accountId: account.id,
    amountMinor: "125000",
    currency: "XAF",
    effectiveAt: "2026-09-20T23:00:00.000Z",
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(openingBalanceEffectiveAt(draft.effectiveDate, "Africa/Douala"), "2026-09-20T23:00:00.000Z");
});

test("opening-balance correction preserves the locked effective date and uses optimistic versioning", () => {
  const draft = createOpeningBalanceDraft(openingBalance, account.currency, "Africa/Douala", new Date("2026-09-21T12:00:00.000Z"));
  assert.equal(draft.amount, "125000");
  assert.equal(draft.effectiveDate.toISOString(), "2026-09-02T12:00:00.000Z");

  const correction = createCorrectOpeningBalanceCommand(
    "workspace-one",
    account,
    openingBalance,
    { ...draft, amount: "150,000", reason: " Incorrect starting amount " },
    "00000000-0000-4000-8000-000000000002",
  );
  assert.deepEqual(correction, {
    workspaceId: "workspace-one",
    accountId: account.id,
    newAmountMinor: "150000",
    expectedVersion: openingBalance.updatedAt,
    idempotencyKey: "00000000-0000-4000-8000-000000000002",
    reason: "Incorrect starting amount",
  });
  assert.equal(BigInt(correction!.newAmountMinor) - BigInt(openingBalance.amountMinor), 25_000n);
  assert.deepEqual(
    validateOpeningBalanceDraft("correct", draft, account, openingBalance, "Africa/Douala"),
    { amount: true },
  );
});

test("opening-balance client errors maintain retry-safe conflict and policy states", () => {
  assert.deepEqual(mapOpeningBalanceFailure("NEGATIVE_OPENING_BALANCE_NOT_ALLOWED"), { fieldErrors: { amount: true }, formError: null });
  assert.deepEqual(mapOpeningBalanceFailure("OPENING_BALANCE_ALREADY_EXISTS"), { fieldErrors: {}, formError: "conflict" });
  assert.deepEqual(mapOpeningBalanceFailure("CONCURRENT_MODIFICATION"), { fieldErrors: {}, formError: "conflict" });
  assert.deepEqual(mapOpeningBalanceFailure("ACCOUNT_UNAVAILABLE"), { fieldErrors: {}, formError: "notAllowed" });
});

test("opening-balance UI uses the shared dialog, canonical endpoint, and no optimistic balance mutation", async () => {
  const [dialog, management, messages, ledgerSchema, migration] = await Promise.all([
    readFile(resolve("src/modules/accounts/ui/components/opening-balance-dialog.tsx"), "utf8"),
    readFile(resolve("src/modules/accounts/ui/components/account-management-actions.tsx"), "utf8"),
    readFile(resolve("src/i18n/dashboard-messages.ts"), "utf8"),
    readFile(resolve("src/db/schema/ledger.ts"), "utf8"),
    readFile(resolve("drizzle/0026_dusty_madripoor.sql"), "utf8"),
  ]);

  assert.match(dialog, /ResponsiveDialog/);
  assert.doesNotMatch(dialog, /components\/ui\/dialog/);
  assert.doesNotMatch(dialog, /FilterLoadingSurface/);
  assert.match(dialog, /opening-balance/);
  assert.match(dialog, /router\.refresh\(\)/);
  assert.doesNotMatch(dialog, /currentBalanceMinor\s*[+\-]=/);
  assert.match(management, /canSetOpeningBalance/);
  assert.match(management, /canCorrectOpeningBalance/);
  for (const key of ["setAction", "correctAction", "notIncome", "conflict", "reloadLatest"]) {
    assert.equal((messages.match(new RegExp(`accounts\\.openingBalance\\.${key}`, "g")) ?? []).length, 3);
  }
  assert.match(ledgerSchema, /action: varchar\("action", \{ length: 64 \}\)/);
  assert.match(migration, /ledger_transaction_audit.*varchar\(64\)/);
});
