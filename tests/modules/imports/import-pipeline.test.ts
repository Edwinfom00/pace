import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import { ImportService } from "@/modules/imports/import-service";
import { applyImportDeduplication } from "@/modules/imports/deduplication";
import { detectImportMapping, validateImportMappingDraft } from "@/modules/imports/mapping";
import { normalizeImportRows, parseLocalizedNumber } from "@/modules/imports/normalization";
import { parseCsv, parseImportUpload, ImportParseError } from "@/modules/imports/parsers";
import { buildImportPreview } from "@/modules/imports/preview";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import { InMemoryImportRepository } from "../../support/in-memory-import-repository";
import {
  InMemoryLedgerRepository,
  SYSTEM_OTHER_EXPENSE_ID,
  SYSTEM_SALARY_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";

test("CSV parsing supports UTF-8 headers, quoted values, and delimiter variants", () => {
  const parsed = parseCsv(new TextEncoder().encode("Datum;DÃ©bit;CrÃ©dit;Verwendungszweck\n01/02/2026;1 234,50;;\"Market; weekly\"\n"));
  assert.deepEqual(parsed.headers, ["Datum", "DÃ©bit", "CrÃ©dit", "Verwendungszweck"]);
  assert.equal(parsed.delimiter, ";");
  assert.equal(parsed.rows[0]?.values.Verwendungszweck, "Market; weekly");
  assert.equal(parsed.rows[0]?.rowNumber, 2);
});

test("CSV parsing rejects invalid UTF-8 safely", () => {
  assert.throws(
    () => parseCsv(Uint8Array.of(0xff, 0xfe, 0xfd)),
    (error: unknown) => error instanceof ImportParseError && error.code === "INVALID_ENCODING",
  );
});

test("XLSX parsing reads values but rejects formula cells", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");
  sheet.addRow(["Date", "Amount", "Description"]);
  sheet.addRow([new Date(2026, 0, 2), 12.5, "Coffee"]);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const parsed = await parseImportUpload({
    name: "statement.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes,
  });
  assert.equal(parsed.parsed.fileType, "XLSX");
  assert.equal(parsed.parsed.rows[0]?.values.Amount, "12.5");

  sheet.getCell("B2").value = { formula: "1+1", result: 2 };
  await assert.rejects(
    parseImportUpload({ name: "formula.xlsx", mimeType: null, bytes: new Uint8Array(await workbook.xlsx.writeBuffer()) }),
    ImportParseError,
  );
});

test("mapping heuristics are multilingual and external AI drafts are constrained to known headers", () => {
  const draft = detectImportMapping(["Fecha", "Montant", "DÃ©bit", "CrÃ©dit", "Verwendungszweck", "Devise"]);
  assert.equal(draft.columns.transactionDate, "Fecha");
  assert.equal(draft.columns.debit, "DÃ©bit");
  assert.equal(draft.columns.credit, "CrÃ©dit");
  const validated = validateImportMappingDraft({
    ...draft,
    columns: { ...draft.columns, amount: "Made up column" },
  }, { headers: ["Fecha", "Montant", "DÃ©bit", "CrÃ©dit", "Verwendungszweck", "Devise"], rows: [{} as never] });
  assert.equal(validated.columns.amount, undefined);
  assert.equal(validated.requiresConfirmation, true);
});

test("normalization handles locale dates, decimal/thousand separators, and 0/2/3-decimal currencies without guessing currency", () => {
  const mapping = {
    columns: { transactionDate: "Date", debit: "Debit", credit: "Credit", description: "Description", currency: "Currency" },
    amountMode: "DEBIT_CREDIT" as const,
    signedAmountDirection: null,
    dateFormat: "DMY" as const,
    decimalSeparator: "," as const,
    accountId: "account-one",
    transferAccountId: null,
    fallbackCurrency: null,
    defaultExpenseCategoryId: SYSTEM_OTHER_EXPENSE_ID,
    defaultIncomeCategoryId: SYSTEM_SALARY_ID,
  };
  const rows = normalizeImportRows([
    { rowNumber: 2, values: { Date: "31/01/2026", Debit: "1.234,50", Credit: "", Description: "Market", Currency: "EUR" } },
    { rowNumber: 3, values: { Date: "01/02/2026", Debit: "", Credit: "1 234", Description: "Cash", Currency: "XAF" } },
    { rowNumber: 4, values: { Date: "02/02/2026", Debit: "", Credit: "1,234", Description: "Kuwait", Currency: "KWD" } },
    { rowNumber: 5, values: { Date: "03/02/2026", Debit: "10", Credit: "", Description: "Unknown", Currency: "" } },
  ], mapping, { workspaceId: workspaceOne, fallbackCurrency: null, timezone: "UTC" });
  assert.equal(rows[0]?.amountMinor, "123450");
  assert.equal(rows[0]?.kind, "EXPENSE");
  assert.equal(rows[1]?.amountMinor, "1234");
  assert.equal(rows[2]?.amountMinor, "1234");
  assert.equal(rows[3]?.disposition, "INVALID");
  assert.equal(rows[3]?.issues.some((issue) => issue.code === "MISSING_CURRENCY"), true);
  const mismatched = normalizeImportRows([
    { rowNumber: 6, values: { Date: "04/02/2026", Debit: "", Credit: "10.00", Description: "Foreign", Currency: "USD" } },
  ], mapping, { workspaceId: workspaceOne, fallbackCurrency: "EUR", timezone: "UTC" });
  assert.equal(mismatched[0]?.issues.some((issue) => issue.code === "ACCOUNT_CURRENCY_MISMATCH"), true);
  assert.equal(parseLocalizedNumber("1,234.50", "USD", "AUTO")?.minor, 123450n);
});

test("preview keeps currency totals separate and exact rows are not accepted twice", () => {
  const base = {
    sourceRowNumber: 2,
    occurredAt: "2026-02-01T12:00:00.000Z",
    bookingAt: null,
    description: "Market",
    merchantName: "Market",
    accountReference: null,
    kind: "EXPENSE" as const,
    amountMinor: "100",
    currency: "USD",
    fingerprint: "one",
    duplicateStatus: "NONE" as const,
    disposition: "ACCEPT" as const,
    issues: [],
    transferCandidate: false,
  };
  const preview = buildImportPreview([
    base,
    { ...base, sourceRowNumber: 3, currency: "EUR", kind: "INCOME", amountMinor: "200", fingerprint: "two" },
    { ...base, sourceRowNumber: 4, fingerprint: "three", duplicateStatus: "EXACT_IN_FILE", disposition: "SKIP_EXACT_DUPLICATE" },
  ]);
  assert.deepEqual(preview.currencies, ["EUR", "USD"]);
  assert.equal(preview.exactDuplicateRowCount, 1);
  assert.equal(preview.acceptedRowCount, 2);
  assert.equal(preview.totalsByCurrency.find((total) => total.currency === "USD")?.expenses.amountMinor, "200");
});

test("deduplication skips exact records while retaining likely matches for review", () => {
  const row = {
    sourceRowNumber: 2,
    occurredAt: "2026-02-01T12:00:00.000Z",
    bookingAt: null,
    description: "Netflix subscription",
    merchantName: "Netflix",
    accountReference: null,
    kind: "EXPENSE" as const,
    amountMinor: "1000",
    currency: "USD",
    fingerprint: "new-fingerprint",
    duplicateStatus: "NONE" as const,
    disposition: "ACCEPT" as const,
    issues: [],
    transferCandidate: false,
  };
  const now = new Date();
  const existing = {
    id: "transaction-1",
    workspaceId: workspaceOne,
    accountId: "account-one",
    kind: "EXPENSE" as const,
    status: "POSTED" as const,
    amountMinor: 1000n,
    currency: "USD",
    occurredAt: new Date("2026-02-02T12:00:00.000Z"),
    transferAccountId: null,
    categoryId: "category-one",
    merchantId: "merchant-one",
    createdByUserId: owner.userId,
    paidByUserId: null,
    transferGroupId: null,
    refundedTransactionId: null,
    source: { importDescription: "Netflix subscription" },
    deduplicationFingerprint: "existing-fingerprint",
    note: "Netflix subscription",
    createdAt: now,
    updatedAt: now,
  };
  const likely = applyImportDeduplication([row], [existing])[0];
  assert.equal(likely?.duplicateStatus, "LIKELY");
  assert.equal(likely?.disposition, "ACCEPT");
  const exact = applyImportDeduplication([{ ...row, fingerprint: "existing-fingerprint" }], [existing])[0];
  assert.equal(exact?.duplicateStatus, "EXACT_EXISTING");
  assert.equal(exact?.disposition, "SKIP_EXACT_DUPLICATE");
});

test("approved imports are workspace-scoped, idempotent, and feed classification and recurring detection", async () => {
  const fixture = await createFixture();
  await assert.rejects(
    fixture.imports.upload(viewer, workspaceOne, csvFile("2026-01-01,Netflix,-10.00\n")),
    AuthorizationError,
  );

  const first = await importStatement(fixture, "2026-01-01,Netflix,-10.00\n");
  await assert.rejects(fixture.imports.getSession(owner, workspaceTwo, first.id), NotFoundError);
  await assert.rejects(fixture.imports.execute(owner, workspaceOne, first.id), ConflictError);
  await fixture.imports.requestApproval(owner, workspaceOne, first.id);
  const completed = await fixture.imports.execute(owner, workspaceOne, first.id);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.result?.importedRowCount, 1);
  const retried = await fixture.imports.execute(owner, workspaceOne, first.id);
  assert.equal(retried.result?.importedRowCount, 1);
  assert.equal((await fixture.ledgerRecords.listTransactions(workspaceOne)).length, 1);
  const importedTransaction = (await fixture.ledgerRecords.listTransactions(workspaceOne))[0];
  assert.ok(importedTransaction);
  assert.ok(await fixture.inboxRecords.findClassificationByTransaction(workspaceOne, importedTransaction.id));

  const importedAgain = await fixture.imports.upload(owner, workspaceOne, csvFile("2026-01-01,Netflix,-10.00\n"));
  const duplicatePreview = await fixture.imports.prepare(owner, workspaceOne, importedAgain.session.id, mapping(fixture.account.id));
  assert.equal(duplicatePreview.session.preview?.acceptedRowCount, 0);
  assert.equal(duplicatePreview.session.preview?.exactDuplicateRowCount, 1);
  await assert.rejects(fixture.imports.requestApproval(owner, workspaceOne, importedAgain.session.id), ConflictError);

  const invalidUpload = await fixture.imports.upload(owner, workspaceOne, csvFile("not-a-date,Invalid,-10.00\n"));
  const invalidPreview = await fixture.imports.prepare(owner, workspaceOne, invalidUpload.session.id, mapping(fixture.account.id));
  assert.equal(invalidPreview.session.preview?.invalidRowCount, 1);
  await assert.rejects(fixture.imports.requestApproval(owner, workspaceOne, invalidUpload.session.id), ConflictError);

  await completeImport(fixture, "2026-02-01,Netflix,-10.00\n");
  await completeImport(fixture, "2026-03-01,Netflix,-10.00\n");
  assert.equal((await fixture.inboxRecords.listRecurringPayments(workspaceOne)).length >= 1, true);
  assert.equal(fixture.insightRefreshes >= 3, true);

  const cancelled = await importStatement(fixture, "2026-04-01,Cancelled,-1.00\n");
  const rejected = await fixture.imports.cancel(owner, workspaceOne, cancelled.id);
  assert.equal(rejected.status, "CANCELLED");
  await assert.rejects(fixture.imports.execute(owner, workspaceOne, cancelled.id), ConflictError);

  const expiring = await fixture.imports.upload(owner, workspaceOne, csvFile("2026-05-01,Expired,-1.00\n"));
  fixture.importsRecords.expireRawData(expiring.session.id);
  assert.equal(await fixture.imports.purgeExpiredData(), 1);
  const expired = await fixture.imports.getSession(owner, workspaceOne, expiring.session.id);
  assert.equal(expired.session.status, "CANCELLED");
  assert.equal(expired.session.parsedRows, null);
});

async function createFixture() {
  const importsRecords = new InMemoryImportRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const inboxRecords = new InMemoryFinancialInboxRepository();
  for (const workspaceId of [workspaceOne, workspaceTwo]) {
    await workspaces.createWorkspaceWithOwner({
      workspace: { id: workspaceId, name: workspaceId, slug: workspaceId, type: "PERSONAL", createdByUserId: owner.userId, createdAt: new Date(), updatedAt: new Date() },
      preferences: { currency: "USD", locale: "en-US", timezone: "UTC", weekStartsOn: 1 },
      owner: { workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: new Date() },
    });
  }
  workspaces.addMembership({ workspaceId: workspaceOne, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: new Date() });
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const account = await ledger.createAccount(owner, workspaceOne, { name: "Checking", type: "CHECKING", currency: "USD" });
  const inbox = new FinancialInboxService(inboxRecords, ledgerRecords, workspaces);
  let insightRefreshes = 0;
  const imports = new ImportService(
    importsRecords,
    ledger,
    ledgerRecords,
    workspaces,
    inbox,
    { refreshForMember: async () => { insightRefreshes += 1; return {} as never; } },
  );
  return {
    imports,
    importsRecords,
    ledgerRecords,
    inboxRecords,
    account,
    get insightRefreshes() { return insightRefreshes; },
  };
}

async function importStatement(fixture: Awaited<ReturnType<typeof createFixture>>, rows: string) {
  const uploaded = await fixture.imports.upload(owner, workspaceOne, csvFile(rows));
  const prepared = await fixture.imports.prepare(owner, workspaceOne, uploaded.session.id, mapping(fixture.account.id));
  assert.equal(prepared.session.preview?.acceptedRowCount, 1);
  return prepared.session;
}

async function completeImport(fixture: Awaited<ReturnType<typeof createFixture>>, rows: string) {
  const session = await importStatement(fixture, rows);
  await fixture.imports.requestApproval(owner, workspaceOne, session.id);
  return fixture.imports.execute(owner, workspaceOne, session.id);
}

function csvFile(rows: string) {
  return {
    name: "statement.csv",
    mimeType: "text/csv",
    bytes: new TextEncoder().encode(`Date,Description,Amount\n${rows}`),
  };
}

function mapping(accountId: string) {
  return {
    columns: { transactionDate: "Date", description: "Description", amount: "Amount" },
    amountMode: "SIGNED" as const,
    signedAmountDirection: "POSITIVE_IS_INCOME" as const,
    dateFormat: "YMD" as const,
    decimalSeparator: "AUTO" as const,
    accountId,
    transferAccountId: null,
    fallbackCurrency: null,
    defaultExpenseCategoryId: SYSTEM_OTHER_EXPENSE_ID,
    defaultIncomeCategoryId: SYSTEM_SALARY_ID,
  };
}
