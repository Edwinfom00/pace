import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuthorizationError, DomainConflictError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { isSidebarPathActive } from "@/components/pace/layout/sidebar-navigation";
import { DASHBOARD_LANGUAGES, getDashboardLabels } from "@/i18n/dashboard-messages";
import { toCurrencyCode } from "@/money/currency";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import type { ImportField } from "@/modules/imports/domain";
import { ImportService } from "@/modules/imports/import-service";
import { parseLocalizedNumber } from "@/modules/imports/normalization";
import { IMPORT_BLOCKING_ISSUE_CODES, inferImportDateFormat } from "@/modules/imports/review";
import {
  canStartImport,
  importExecutionSteps,
  importProgressPercent,
  importResultHrefs,
  isImportProgressStalled,
} from "@/modules/imports/ui/import-execution-flow";
import {
  getImportExecutionLabels,
  IMPORT_EXECUTION_ERROR_CODES,
  type ImportExecutionLabels,
} from "@/modules/imports/ui/import-execution-labels";
import { importAccountLabels } from "@/modules/imports/ui/import-execution-labels";
import { importPreviewHref } from "@/modules/imports/ui/import-mapping-flow";
import {
  ImportExecutionScreen,
  ImportResultScreen,
  ImportReviewScreen,
} from "@/modules/imports/ui/views/import-review-view";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { calculateIncomeAndSpendingTotals } from "@/modules/ledger/totals";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";

import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import { InMemoryImportRepository } from "../../support/in-memory-import-repository";
import { InMemoryLedgerRepository } from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const member: AuthenticatedActor = { userId: "member-1", email: "member@pace.test", name: "Member" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";
const en = getImportExecutionLabels("en");
const BASIC_COLUMNS: Partial<Record<ImportField, string>> = { transactionDate: "Date", description: "Description", amount: "Amount" };

async function createFixture({ currency = "USD", locale = "en-US" }: { currency?: string; locale?: string } = {}) {
  const importsRecords = new InMemoryImportRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const inboxRecords = new InMemoryFinancialInboxRepository();
  for (const workspaceId of [workspaceOne, workspaceTwo]) {
    await workspaces.createWorkspaceWithOwner({
      workspace: { id: workspaceId, name: workspaceId, slug: workspaceId, type: "PERSONAL", createdByUserId: owner.userId, createdAt: new Date(), updatedAt: new Date() },
      preferences: { currency, locale, timezone: "UTC", weekStartsOn: 1 },
      owner: { workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: new Date() },
      initialAccount: { id: `${workspaceId}-main`, workspaceId, name: "Main account", type: "CHECKING", currency: "USD", createdByUserId: owner.userId },
    });
  }
  workspaces.addMembership({ workspaceId: workspaceOne, userId: member.userId, role: "MEMBER", invitedByUserId: null, joinedAt: new Date() });
  workspaces.addMembership({ workspaceId: workspaceOne, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: new Date() });
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const main = await ledger.createAccount(owner, workspaceOne, { name: "Main", type: "CHECKING", currency });
  const savings = await ledger.createAccount(owner, workspaceOne, { name: "Savings", type: "CHECKING", currency });
  const otherWorkspaceAccount = await ledger.createAccount(owner, workspaceTwo, { name: "Other", type: "CHECKING", currency });
  const inbox = new FinancialInboxService(inboxRecords, ledgerRecords, workspaces);
  const failingAmounts = new Set<string>();
  const createTransaction = ledger.createTransaction.bind(ledger);
  ledger.createTransaction = async (actor, workspaceId, input) => {
    const amount = String((input as { amountMinor?: unknown }).amountMinor);
    if (failingAmounts.delete(amount)) throw new Error("Simulated ledger outage");
    return createTransaction(actor, workspaceId, input);
  };
  const imports = new ImportService(importsRecords, ledger, ledgerRecords, workspaces, inbox, { refreshForMember: async () => ({}) as never });

  async function stage(csv: string, columns = BASIC_COLUMNS, workspaceId = workspaceOne) {
    const headers = csv.split("\n")[0]!;
    const uploaded = await imports.upload(owner, workspaceId, { name: "statement.csv", mimeType: "text/csv", bytes: new TextEncoder().encode(csv) });
    await imports.confirmColumnMapping(owner, workspaceId, uploaded.session.id, {
      fileChecksum: uploaded.session.fileChecksum,
      columns,
      ignoredHeaders: headers.split(",").filter((header) => !Object.values(columns).includes(header)),
    });
    return imports.getImportReview(owner, workspaceId, uploaded.session.id);
  }

  async function run(importSessionId: string, workspaceId = workspaceOne) {
    await imports.requestApproval(owner, workspaceId, importSessionId);
    return imports.execute(owner, workspaceId, importSessionId);
  }

  return { imports, importsRecords, ledger, ledgerRecords, inboxRecords, main, savings, otherWorkspaceAccount, failingAmounts, stage, run };
}

const statement = (rows: string, header = "Date,Description,Amount") => `${header}\n${rows}`;

test("successful import: staged rows become canonical POSTED transactions through the M7 ledger path", async () => {
  const fixture = await createFixture();
  const review = await fixture.stage(statement("2026-09-01,Groceries,-42.10\n2026-09-02,Salary,1500.00\n2026-09-03,Taxi,-8.00"));

  assert.equal(review.state, "REVIEW");
  assert.equal(review.accountId, fixture.main.id);
  assert.deepEqual(review.summary, {
    parsedRowCount: 3,
    toImportRowCount: 3,
    inboxRowCount: 0,
    exactDuplicateRowCount: 0,
    blockingErrorRowCount: 0,
    skippedRowCount: 0,
    currency: "USD",
    dateRange: { start: "2026-09-01", end: "2026-09-03" },
  });
  assert.equal(canStartImport(review), true);

  const completed = await fixture.run(review.session.id);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.result?.importedRowCount, 3);
  assert.equal(completed.result?.failedRowCount, 0);
  assert.deepEqual(completed.progress && { phase: completed.progress.phase, processed: completed.progress.processedRowCount, total: completed.progress.totalRowCount }, { phase: "FINALIZE", processed: 3, total: 3 });
  assert.equal(completed.parsedRows, null);
  assert.equal(completed.stagedRows, null);

  const transactions = await fixture.ledgerRecords.listTransactions(workspaceOne);
  assert.equal(transactions.length, 3);
  for (const transaction of transactions) {
    assert.equal(transaction.status, "POSTED");
    assert.equal(transaction.accountId, fixture.main.id);
    assert.equal(transaction.source.provider, "pace-import");
    assert.equal(transaction.source.importSessionId, review.session.id);
    assert.ok(transaction.deduplicationFingerprint);
  }
  assert.deepEqual(transactions.map((transaction) => transaction.kind).sort(), ["EXPENSE", "EXPENSE", "INCOME"]);
  assert.equal((await fixture.imports.getProgress(owner, workspaceOne, review.session.id)).result?.importedRowCount, 3);
});

test("exact duplicates: rows already in Pace or repeated in the file are skipped by fingerprint", async () => {
  const fixture = await createFixture();
  const first = await fixture.stage(statement("2026-09-01,Groceries,-42.10\n2026-09-02,Salary,1500.00"));
  await fixture.run(first.session.id);

  const again = await fixture.stage(statement("2026-09-01,Groceries,-42.10\n2026-09-02,Salary,1500.00\n2026-09-04,Pharmacy,-5.00\n2026-09-04,Pharmacy,-5.00"));
  assert.equal(again.summary?.exactDuplicateRowCount, 3);
  assert.equal(again.summary?.toImportRowCount, 1);
  const completed = await fixture.run(again.session.id);
  assert.equal(completed.result?.importedRowCount, 1);
  assert.equal(completed.result?.skippedExactDuplicateRowCount, 3);
  assert.equal((await fixture.ledgerRecords.listTransactions(workspaceOne)).length, 3);

  const nothingNew = await fixture.stage(statement("2026-09-01,Groceries,-42.10"));
  assert.equal(nothingNew.summary?.toImportRowCount, 0);
  assert.equal(canStartImport(nothingNew), false);
  await assert.rejects(fixture.imports.requestApproval(owner, workspaceOne, nothingNew.session.id));
});

test("Inbox handoff: LIKELY matches are imported, never merged, and routed to Inbox for review", async () => {
  const fixture = await createFixture();
  const first = await fixture.stage(statement("2026-09-01,Netflix,-15.99"));
  await fixture.run(first.session.id);
  const [existing] = await fixture.ledgerRecords.listTransactions(workspaceOne);
  assert.ok(existing);

  const second = await fixture.stage(statement("2026-09-02,Netflix,-15.99\n2026-09-05,Bakery,-3.20"));
  assert.equal(second.summary?.toImportRowCount, 2);
  assert.equal(second.summary?.inboxRowCount, 1);
  assert.equal(second.summary?.exactDuplicateRowCount, 0);

  const completed = await fixture.run(second.session.id);
  assert.equal(completed.result?.importedRowCount, 2);
  assert.ok((completed.result?.inboxRowCount ?? 0) >= 1);
  const transactions = await fixture.ledgerRecords.listTransactions(workspaceOne);
  assert.equal(transactions.length, 3);
  const likely = transactions.find((transaction) => transaction.id !== existing.id && transaction.amountMinor === 1599n);
  assert.ok(likely, "the likely match is a separate canonical transaction");
  assert.equal((await fixture.ledgerRecords.findTransactionByFingerprint(workspaceOne, existing.deduplicationFingerprint!))?.id, existing.id);
  const open = await fixture.inboxRecords.listInboxItemsForTransaction(workspaceOne, likely.id);
  assert.ok(open.some((item) => item.status === "OPEN"), "the likely match waits in Inbox");
});

test("partial failure: failed rows are reported, imported rows stay, and a retry finishes without duplicates", async () => {
  const fixture = await createFixture();
  const review = await fixture.stage(statement("2026-09-01,Groceries,-42.10\n2026-09-02,Hardware,-7.77\n2026-09-03,Taxi,-8.00"));
  fixture.failingAmounts.add("777");

  const partial = await fixture.run(review.session.id);
  assert.equal(partial.status, "PARTIALLY_COMPLETED");
  assert.equal(partial.result?.importedRowCount, 2);
  assert.equal(partial.result?.failedRowCount, 1);
  assert.deepEqual(partial.result?.failedRowNumbers, [3]);
  assert.ok(partial.stagedRows, "staged rows are kept so failed rows can be retried");
  assert.equal((await fixture.ledgerRecords.listTransactions(workspaceOne)).length, 2);
  const view = await fixture.imports.getImportReview(owner, workspaceOne, review.session.id);
  assert.equal(view.state, "RESULT");
  await assert.rejects(
    fixture.imports.updateImportReview(owner, workspaceOne, review.session.id, { accountId: fixture.savings.id, transferAccountId: null }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "IMPORT_SESSION_STALE",
  );

  const inboxBefore = await fixture.inboxRecords.countInboxItems(workspaceOne);
  const retried = await fixture.imports.execute(owner, workspaceOne, review.session.id);
  assert.equal(retried.status, "COMPLETED");
  assert.equal(retried.result?.importedRowCount, 3);
  assert.equal(retried.result?.failedRowCount, 0);
  const transactions = await fixture.ledgerRecords.listTransactions(workspaceOne);
  assert.equal(transactions.length, 3);
  assert.equal(new Set(transactions.map((transaction) => transaction.deduplicationFingerprint)).size, 3);
  assert.ok((await fixture.inboxRecords.countInboxItems(workspaceOne)) - inboxBefore <= 1, "retry does not re-route already imported rows");
});

test("idempotent retry: completed, in-flight and stalled runs never import the same staged rows twice", async () => {
  const fixture = await createFixture();
  const done = await fixture.stage(statement("2026-09-01,Groceries,-42.10\n2026-09-02,Taxi,-8.00"));
  const completed = await fixture.run(done.session.id);
  const repeated = await fixture.imports.execute(owner, workspaceOne, done.session.id);
  assert.deepEqual(repeated.result, completed.result);
  assert.equal((await fixture.ledgerRecords.listTransactions(workspaceOne)).length, 2);
  assert.equal((await fixture.imports.requestApproval(owner, workspaceOne, (await fixture.stage(statement("2026-09-09,Cafe,-2.00"))).session.id)).status, "AWAITING_APPROVAL");

  const leased = await fixture.stage(statement("2026-09-10,Books,-12.00\n2026-09-11,Gym,-30.00"));
  await fixture.imports.requestApproval(owner, workspaceOne, leased.session.id);
  fixture.importsRecords.forceStatus(leased.session.id, "IMPORTING");
  await fixture.importsRecords.recordProgress({
    workspaceId: workspaceOne,
    importSessionId: leased.session.id,
    progress: { phase: "IMPORT", processedRowCount: 0, totalRowCount: 2, heartbeatAt: new Date().toISOString() },
  });
  const live = await fixture.imports.execute(owner, workspaceOne, leased.session.id);
  assert.equal(live.status, "IMPORTING", "a live run keeps its lease");
  assert.equal((await fixture.ledgerRecords.listTransactions(workspaceOne)).length, 2);

  fixture.importsRecords.setProgressHeartbeat(leased.session.id, new Date(Date.now() - 10 * 60 * 1000));
  const resumed = await fixture.imports.execute(owner, workspaceOne, leased.session.id);
  assert.equal(resumed.status, "COMPLETED");
  assert.equal(resumed.result?.importedRowCount, 2);
  const again = await fixture.imports.execute(owner, workspaceOne, leased.session.id);
  assert.equal(again.status, "COMPLETED");
  assert.equal((await fixture.ledgerRecords.listTransactions(workspaceOne)).length, 4);
  const audit = await fixture.importsRecords.listAudit(workspaceOne, leased.session.id);
  assert.equal(audit.filter((entry) => entry.event === "IMPORT_RESUMED").length, 1);
});

test("workspace isolation: review, progress and execution are scoped to the workspace and the uploader", async () => {
  const fixture = await createFixture();
  const review = await fixture.stage(statement("2026-09-01,Groceries,-42.10"));
  const id = review.session.id;

  await assert.rejects(fixture.imports.getImportReview(owner, workspaceTwo, id), NotFoundError);
  await assert.rejects(fixture.imports.getProgress(owner, workspaceTwo, id), NotFoundError);
  await assert.rejects(fixture.imports.execute(owner, workspaceTwo, id), NotFoundError);
  await assert.rejects(fixture.imports.getImportReview(member, workspaceOne, id), AuthorizationError);
  await assert.rejects(fixture.imports.getProgress(viewer, workspaceOne, id), AuthorizationError);
  await assert.rejects(fixture.imports.execute(viewer, workspaceOne, id), AuthorizationError);
  await assert.rejects(
    fixture.imports.updateImportReview(owner, workspaceOne, id, { accountId: fixture.otherWorkspaceAccount.id, transferAccountId: null }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "IMPORT_ACCOUNT_UNAVAILABLE",
  );
  assert.deepEqual(review.accounts.map((account) => account.name), ["Main", "Savings"]);

  await fixture.run(id);
  assert.equal((await fixture.ledgerRecords.listTransactions(workspaceOne)).length, 1);
  assert.equal((await fixture.ledgerRecords.listTransactions(workspaceTwo)).length, 0);
});

test("canonical effects: balances, reporting totals and transfers move only through normal Transaction effects", async () => {
  const fixture = await createFixture();
  const mainId = fixture.main.id;
  const csv = statement(
    "2026-09-01,Groceries,-40.00,Card\n2026-09-02,Salary,1000.00,Credit\n2026-09-03,To savings,250.00,Transfer",
    "Date,Description,Amount,Type",
  );
  const review = await fixture.stage(csv, { ...BASIC_COLUMNS, transactionType: "Type" });
  assert.equal(review.transferAccountRequired, true);
  assert.equal(review.summary?.blockingErrorRowCount, 1);
  assert.deepEqual(review.blockingIssues, []);
  assert.equal(review.accountBlockedRowCount, 1);
  assert.equal(canStartImport(review), false);

  const fixed = await fixture.imports.updateImportReview(owner, workspaceOne, review.session.id, { accountId: mainId, transferAccountId: fixture.savings.id });
  assert.equal(fixed.summary?.blockingErrorRowCount, 0);
  assert.equal(fixed.transferAccountId, fixture.savings.id);
  assert.equal(canStartImport(fixed), true);
  await fixture.run(review.session.id);

  const transactions = await fixture.ledgerRecords.listTransactions(workspaceOne);
  assert.equal(transactions.some((transaction) => transaction.kind === "REFUND"), false);
  const transfer = transactions.find((transaction) => transaction.kind === "TRANSFER");
  assert.equal(transfer?.accountId, mainId);
  assert.equal(transfer?.transferAccountId, fixture.savings.id);
  assert.equal((await fixture.ledgerRecords.getAccountBalance(workspaceOne, mainId))?.currentBalanceMinor, 100_000n - 4_000n - 25_000n);
  assert.equal((await fixture.ledgerRecords.getAccountBalance(workspaceOne, fixture.savings.id))?.currentBalanceMinor, 25_000n);
  assert.deepEqual(calculateIncomeAndSpendingTotals(transactions, "USD"), { incomeMinor: 100_000n, spendingMinor: 4_000n });
});

test("result navigation: the result offers transactions, Inbox and a new import, and the route keeps Transactions active", () => {
  const hrefs = importResultHrefs("house");
  assert.deepEqual(hrefs, { transactions: "/w/house/transactions", inbox: "/w/house/inbox", another: "/w/house/transactions/import" });
  assert.equal(isSidebarPathActive(importPreviewHref("house", "session-1"), "/w/house/transactions"), true);

  const result = { importedRowCount: 12, skippedExactDuplicateRowCount: 3, failedRowCount: 0, deferredPipelineCount: 0, inboxRowCount: 2, failedRowNumbers: [], completedAt: "2026-10-02T10:00:00.000Z" };
  const complete = renderResult(en, result, false);
  assert.match(complete, /data-result="complete"/);
  assert.match(complete, /data-action="transactions" href="\/w\/house\/transactions">View transactions<\/a>/);
  assert.match(complete, /data-action="inbox" href="\/w\/house\/inbox">[\s\S]*Open Inbox[\s\S]*>2<\/span><\/a>/);
  assert.match(complete, /data-action="another" href="\/w\/house\/transactions\/import">Import another file<\/a>/);
  assert.match(complete, /data-stat="imported"[\s\S]*>12<\/dd>/);
  assert.match(complete, /data-stat="duplicates"[\s\S]*>3<\/dd>/);
  assert.doesNotMatch(complete, /Retry failed rows/);

  const partial = renderResult(en, { ...result, failedRowCount: 2, failedRowNumbers: [4, 9], completedAt: null }, true);
  assert.match(partial, /Import finished with issues/);
  assert.match(partial, /Retry failed rows/);
  assert.match(partial, /Rows that failed: 4 and 9/);
});

test("progress: steps follow authoritative server state and row counts are never invented", () => {
  const heartbeatAt = new Date().toISOString();
  assert.deepEqual(importExecutionSteps({ status: "READY_FOR_PREVIEW", progress: null, result: null }), { prepare: "active", validate: "pending", import: "pending", finalize: "pending" });
  assert.deepEqual(importExecutionSteps({ status: "AWAITING_APPROVAL", progress: null, result: null }), { prepare: "done", validate: "active", import: "pending", finalize: "pending" });
  const importing = { status: "IMPORTING" as const, progress: { phase: "IMPORT" as const, processedRowCount: 5, totalRowCount: 20, heartbeatAt }, result: null };
  assert.deepEqual(importExecutionSteps(importing), { prepare: "done", validate: "done", import: "active", finalize: "pending" });
  assert.deepEqual(importExecutionSteps({ ...importing, progress: { ...importing.progress, phase: "FINALIZE" } }).finalize, "active");
  assert.equal(importProgressPercent(importing.progress), 25);
  assert.equal(importProgressPercent(null), null);
  assert.equal(isImportProgressStalled(importing), false);
  assert.equal(isImportProgressStalled({ ...importing, progress: { ...importing.progress, heartbeatAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() } }), true);

  const counted = renderToStaticMarkup(createElement(ImportExecutionScreen, { labels: en, locale: "en-US", fileName: "statement.csv", snapshot: importing, errorCode: null, retrying: false }));
  assert.match(counted, /aria-valuenow="25"/);
  assert.match(counted, /5 of 20 rows/);
  assert.match(counted, /data-active-step="import"/);
  const waiting = renderToStaticMarkup(createElement(ImportExecutionScreen, { labels: en, locale: "en-US", fileName: "statement.csv", snapshot: { status: "AWAITING_APPROVAL", progress: null, result: null }, errorCode: null, retrying: false }));
  assert.doesNotMatch(waiting, /aria-valuenow/);
  assert.doesNotMatch(waiting, /of \d+ rows/);
  assert.match(waiting, /animate-import-indeterminate/);
  assert.doesNotMatch(waiting, /FilterLoadingSurface/);
});

test("i18n and mobile: copy is complete in EN/FR/DE and the review stacks for phones", async () => {
  const shape = (labels: ImportExecutionLabels) => JSON.stringify(labels, (_key, value) => (typeof value === "string" ? "" : value));
  for (const language of DASHBOARD_LANGUAGES) {
    const labels = getImportExecutionLabels(language);
    assert.equal(shape(labels), shape(en), language);
    assert.deepEqual(Object.keys(labels.errors).sort(), [...IMPORT_EXECUTION_ERROR_CODES].sort(), language);
    assert.deepEqual(Object.keys(labels.issues).sort(), [...IMPORT_BLOCKING_ISSUE_CODES].sort(), language);
    const strings: string[] = [];
    JSON.stringify(labels, (_key, value) => { if (typeof value === "string") strings.push(value); return value; });
    assert.ok(strings.every((value) => value.trim()), language);
  }
  assert.equal(inferImportDateFormat([{ rowNumber: 2, values: { Date: "03/04/2026" } }], "Date", "fr-CM"), "DMY");
  assert.equal(inferImportDateFormat([{ rowNumber: 2, values: { Date: "03/04/2026" } }], "Date", "en-US"), "MDY");
  assert.equal(inferImportDateFormat([{ rowNumber: 2, values: { Date: "03/04/2026" } }, { rowNumber: 3, values: { Date: "25/04/2026" } }], "Date", "en-US"), "DMY");

  const fixture = await createFixture();
  const review = await fixture.stage(statement("2026-09-01,Groceries,-42.10\n2026-09-02,Salary,1500.00"));
  const accounts = review.accounts.map(({ id, name, currency }) => ({ id, name, currency: toCurrencyCode(currency) }));
  const render = (labels: ImportExecutionLabels, locale: string, language: "en" | "fr" | "de" = "en") =>
    renderToStaticMarkup(createElement(ImportReviewScreen, {
      labels,
      accountLabels: importAccountLabels(getTransactionUiLabels(getDashboardLabels(language))),
      locale,
      review,
      accounts,
      workspaceSlug: "house",
      errorCode: null,
      busy: false,
    }));

  const french = render(getImportExecutionLabels("fr"), "fr-FR", "fr");
  assert.match(french, /Vérifier l&#x27;import/);
  assert.match(french, /Importer 2 transactions/);
  assert.match(french, /Doublons ignorés/);
  assert.match(french, /Importer dans/);
  const german = render(getImportExecutionLabels("de"), "de-DE", "de");
  assert.match(german, /Import prüfen/);
  assert.match(german, /2 Transaktionen importieren/);
  assert.match(renderResult(getImportExecutionLabels("de"), { importedRowCount: 1, skippedExactDuplicateRowCount: 0, failedRowCount: 0, deferredPipelineCount: 0, completedAt: null }, false), /Inbox öffnen/);

  const markup = render(en, "en-US");
  assert.match(markup, /<ul class="mt-3 grid grid-cols-2 gap-3[^"]*xl:grid-cols-4/);
  assert.match(markup, /class="mt-5 grid gap-5 lg:grid-cols-\[minmax\(0,1fr\)_minmax\(300px,380px\)\]"/);
  assert.match(markup, /flex flex-col-reverse gap-3 border-t[^"]*sm:flex-row/);
  assert.doesNotMatch(markup, /<select/);
  assert.match(markup, /role="combobox"[^>]*aria-label="Import into: Main"|aria-label="Import into: Main"[^>]*role="combobox"/);
  assert.match(markup, /class="flex h-11 w-full items-center/);
  assert.match(markup, /aria-disabled="false"[^>]*>Import 2 transactions/);
  assert.match(markup, /href="\/w\/house\/transactions\/import\/[^"]+"[^>]*>.*Back<\/a>/s);
  assert.doesNotMatch(markup, /Remember this format/);
});

function renderResult(labels: ImportExecutionLabels, result: Parameters<typeof ImportResultScreen>[0]["result"], partial: boolean) {
  return renderToStaticMarkup(createElement(ImportResultScreen, { labels, locale: "en-US", workspaceSlug: "house", result, partial, errorCode: null, retrying: false }));
}

const FIXTURE_COLUMNS: Partial<Record<ImportField, string>> = {
  transactionDate: "Date opération",
  description: "Libellé",
  amount: "Montant",
  transactionType: "Type",
  accountReference: "Compte",
  transferAccount: "Compte destination",
};

test("amounts with stray letters are blocking errors instead of silently becoming a different number", () => {
  assert.equal(parseLocalizedNumber("12OOO", "XAF", "AUTO"), null);
  assert.equal(parseLocalizedNumber("abc", "XAF", "AUTO"), null);
  assert.equal(parseLocalizedNumber("5 000 FCFA", "XAF", "AUTO")?.minor, 5000n);
  assert.equal(parseLocalizedNumber("XAF 5000", "XAF", "AUTO")?.minor, 5000n);
  assert.equal(parseLocalizedNumber("€12.50", "EUR", "AUTO")?.minor, 1250n);
  assert.equal(parseLocalizedNumber("(45.00)", "USD", "AUTO")?.sign, -1);
});

test("resolve in place: file accounts are matched or created, bad cells corrected, rows skipped, and each row lands in its own account", async () => {
  const fixture = await createFixture({ currency: "XAF", locale: "fr-CM" });
  const orange = await fixture.ledger.createAccount(owner, workspaceOne, { name: "Orange Money", type: "MOBILE_MONEY", currency: "XAF" });
  const bytes = new Uint8Array(readFileSync(join(__dirname, "../../fixtures/imports/pace_import_test_october_2026.xlsx")));
  const uploaded = await fixture.imports.upload(owner, workspaceOne, {
    name: "pace_import_test_october_2026.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes,
  });
  const id = uploaded.session.id;
  await fixture.imports.confirmColumnMapping(owner, workspaceOne, id, {
    fileChecksum: uploaded.session.fileChecksum,
    columns: FIXTURE_COLUMNS,
    ignoredHeaders: ["Catégorie", "Référence", "Note"],
  });

  const review = await fixture.imports.getImportReview(owner, workspaceOne, id);
  assert.equal(review.accountColumnMapped, true);
  assert.deepEqual(
    review.sourceAccounts.map(({ label, accountId, matchedByName, suggestion }) => ({ label, accountId, matchedByName, type: suggestion.type, currency: suggestion.currency })),
    [
      { label: "Main Account", accountId: null, matchedByName: false, type: "CHECKING", currency: "XAF" },
      { label: "Mobile Money MTN", accountId: null, matchedByName: false, type: "MOBILE_MONEY", currency: "XAF" },
      { label: "Orange Money", accountId: orange.id, matchedByName: true, type: "MOBILE_MONEY", currency: "XAF" },
    ],
  );
  assert.deepEqual(review.destinationAccounts.map(({ label, rowCount, suggestion }) => ({ label, rowCount, type: suggestion.type })), [
    { label: "Épargne", rowCount: 1, type: "SAVINGS" },
  ]);
  const issueFor = (view: typeof review, row: number) => view.blockingIssues.find((issue) => issue.sourceRowNumber === row);
  assert.deepEqual(issueFor(review, 28), { sourceRowNumber: 28, code: "INVALID_DATE", field: "transactionDate", value: "32/10/2026", description: "Boulangerie Akwa", resolvedByAccount: false });
  assert.deepEqual(issueFor(review, 29), { sourceRowNumber: 29, code: "INVALID_AMOUNT", field: "amount", value: "12OOO", description: "Supermarché Casino", resolvedByAccount: false });
  assert.equal(issueFor(review, 2), undefined);
  assert.equal(review.accountBlockedRowCount, 16);
  assert.deepEqual(review.blockingIssues.map((issue) => issue.sourceRowNumber), [28, 29]);
  assert.equal(canStartImport(review), false);

  const markup = renderToStaticMarkup(createElement(ImportReviewScreen, {
    labels: getImportExecutionLabels("fr"),
    accountLabels: importAccountLabels(getTransactionUiLabels(getDashboardLabels("fr"))),
    locale: "fr-CM",
    review,
    accounts: review.accounts.map(({ id: accountId, name, currency }) => ({ id: accountId, name, currency: toCurrencyCode(currency) })),
    workspaceSlug: "house",
    errorCode: null,
    busy: false,
    onCreateAccount: () => undefined,
  }));
  assert.match(markup, /Comptes dans votre fichier/);
  assert.match(markup, /data-file-account="orange money" data-state="assigned"[\s\S]*?Associé par le nom/);
  assert.match(markup, /data-file-account="main account" data-state="missing"[\s\S]*?Créer « Main Account »/);
  assert.match(markup, /data-account-blocked="16"[\s\S]*?16 lignes attendent leur compte/);
  assert.doesNotMatch(markup, /data-fix-row="2"/);
  assert.match(markup, /Destinations des virements[\s\S]*?Créer « Épargne »/);
  assert.match(markup, /data-fix-row="28"[\s\S]*?type="date" value=""[\s\S]*?Dans le fichier : 32\/10\/2026/);
  assert.match(markup, /data-fix-row="29"[\s\S]*?inputMode="decimal"[\s\S]*?value="12000"/);
  assert.doesNotMatch(markup, /<select/);

  const main = await fixture.ledger.createAccount(owner, workspaceOne, { name: "Main Account", type: "CHECKING", currency: "XAF" });
  const mtn = await fixture.ledger.createAccount(owner, workspaceOne, { name: "Mobile Money MTN", type: "MOBILE_MONEY", currency: "XAF" });
  const epargne = await fixture.ledger.createAccount(owner, workspaceOne, { name: "Épargne", type: "SAVINGS", currency: "XAF" });
  await fixture.imports.updateImportReview(owner, workspaceOne, id, {
    accountId: review.accountId,
    transferAccountId: null,
    accountAssignments: { "main account": main.id, "mobile money mtn": mtn.id },
  });
  await fixture.imports.updateImportReview(owner, workspaceOne, id, {
    accountId: review.accountId,
    transferAccountId: null,
    transferAccountAssignments: { epargne: epargne.id },
  });
  const corrected = await fixture.imports.updateImportReview(owner, workspaceOne, id, {
    accountId: review.accountId,
    transferAccountId: null,
    corrections: [
      { sourceRowNumber: 28, field: "transactionDate", value: "2026-10-22" },
      { sourceRowNumber: 29, field: "amount", value: "-12000" },
    ],
  });
  assert.equal(corrected.summary?.blockingErrorRowCount, 0);
  assert.equal(corrected.sourceAccounts.every((account) => account.accountId), true);
  assert.equal(corrected.destinationAccounts[0]?.accountId, epargne.id);
  assert.equal(corrected.summary?.exactDuplicateRowCount, 1);
  assert.equal(corrected.summary?.toImportRowCount, 29);

  const skipped = await fixture.imports.updateImportReview(owner, workspaceOne, id, { accountId: review.accountId, transferAccountId: null, skipRows: [31] });
  assert.deepEqual(skipped.skippedRowNumbers, [31]);
  assert.equal(skipped.summary?.toImportRowCount, 28);
  assert.equal(skipped.summary?.skippedRowCount, 1);
  const restored = await fixture.imports.updateImportReview(owner, workspaceOne, id, { accountId: review.accountId, transferAccountId: null, restoreRows: [31] });
  assert.equal(restored.summary?.toImportRowCount, 29);
  await assert.rejects(
    fixture.imports.updateImportReview(owner, workspaceOne, id, {
      accountId: review.accountId,
      transferAccountId: null,
      corrections: [{ sourceRowNumber: 28, field: "currency", value: "EUR" }],
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "INVALID_ROW_CORRECTION",
  );

  const completed = await fixture.run(id);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.result?.importedRowCount, 29);
  const transactions = await fixture.ledgerRecords.listTransactions(workspaceOne);
  const transfer = transactions.find((transaction) => transaction.kind === "TRANSFER");
  assert.equal(transfer?.accountId, main.id);
  assert.equal(transfer?.transferAccountId, epargne.id);
  assert.equal((await fixture.ledgerRecords.getAccountBalance(workspaceOne, epargne.id))?.currentBalanceMinor, 50_000n);
  assert.equal((await fixture.ledgerRecords.getAccountBalance(workspaceOne, mtn.id))?.currentBalanceMinor, -20_000n);
  assert.equal(transactions.filter((transaction) => transaction.accountId === orange.id).length, 13);
  const audit = await fixture.importsRecords.listAudit(workspaceOne, id);
  const corrections = audit.find((entry) => entry.event === "ROWS_CORRECTED");
  assert.deepEqual(corrections?.metadata, { corrections: [{ sourceRowNumber: 28, field: "transactionDate" }, { sourceRowNumber: 29, field: "amount" }] });
});
