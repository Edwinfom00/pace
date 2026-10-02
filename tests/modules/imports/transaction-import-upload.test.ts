import assert from "node:assert/strict";
import test from "node:test";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AuthenticatedActor } from "@/authorization/session";
import { isSidebarPathActive } from "@/components/pace/layout/sidebar-navigation";
import { DASHBOARD_LANGUAGES, getDashboardLabels } from "@/i18n/dashboard-messages";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import { checkImportFile, IMPORT_FILE_ACCEPT, MAX_IMPORT_FILE_BYTES } from "@/modules/imports/import-file-policy";
import { ImportService } from "@/modules/imports/import-service";
import { ImportParseError, parseImportUpload } from "@/modules/imports/parsers";
import { presentImportSession } from "@/modules/imports/presenters";
import {
  analyzeImportFile,
  formatImportFileSize,
  importSessionHref,
  importUploadErrorCode,
  importUploadReducer,
  INITIAL_IMPORT_UPLOAD_STATE,
  selectImportFile,
  transactionImportHref,
  type ImportUploadState,
} from "@/modules/imports/ui/import-upload-flow";
import { getImportUploadLabels, IMPORT_UPLOAD_ERROR_CODES } from "@/modules/imports/ui/import-upload-labels";
import { ImportUploadScreen } from "@/modules/imports/ui/views/import-upload-view";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { TransactionImportLink } from "@/modules/transactions/ui/components/transaction-import-link";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";
import { jsonError } from "@/app/api/_lib/http";

import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import { InMemoryImportRepository } from "../../support/in-memory-import-repository";
import { InMemoryLedgerRepository } from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const outsider: AuthenticatedActor = { userId: "outsider-1", email: "outsider@pace.test", name: "Outsider" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";
const en = getImportUploadLabels("en");
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function csv(name = "statement.csv", content = "Date,Amount,Description\n2026-09-01,-12.50,Coffee\n", type = "text/csv") {
  return new File([content], name, { type });
}

function sized(name: string, bytes: number, type: string) {
  return new File([new Uint8Array(bytes)], name, { type });
}

function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

function screen(state: Partial<ImportUploadState> & { busy?: boolean; dragActive?: boolean } = {}, labels = en) {
  return render(createElement(ImportUploadScreen, {
    labels,
    locale: "en-US",
    selected: state.selected ?? null,
    errorCode: state.errorCode ?? null,
    busy: state.busy ?? false,
    workspaceSlug: "house",
    dragActive: state.dragActive,
  }));
}

async function createFixture() {
  const importsRecords = new InMemoryImportRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  for (const workspaceId of [workspaceOne, workspaceTwo]) {
    await workspaces.createWorkspaceWithOwner({
      workspace: { id: workspaceId, name: workspaceId, slug: workspaceId, type: "PERSONAL", createdByUserId: owner.userId, createdAt: new Date(), updatedAt: new Date() },
      preferences: { currency: "USD", locale: "en-US", timezone: "UTC", weekStartsOn: 1 },
      owner: { workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: new Date() },
      initialAccount: { id: `${workspaceId}-main`, workspaceId, name: "Main account", type: "CHECKING", currency: "USD", createdByUserId: owner.userId },
    });
  }
  workspaces.addMembership({ workspaceId: workspaceOne, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: new Date() });
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const inbox = new FinancialInboxService(new InMemoryFinancialInboxRepository(), ledgerRecords, workspaces);
  const imports = new ImportService(importsRecords, ledger, ledgerRecords, workspaces, inbox, { refreshForMember: async () => ({}) as never });
  const transactionCount = () => ledgerRecords.transactions.size;

  const routeFetcher = (actor: AuthenticatedActor): typeof fetch => async (input, init) => {
    const workspaceId = decodeURIComponent(String(input).split("/")[3] ?? "");
    try {
      const file = (init?.body as FormData).get("file");
      assert.ok(file instanceof File);
      const result = await imports.upload(actor, workspaceId, {
        name: file.name,
        mimeType: file.type || null,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      return Response.json({ session: presentImportSession(result.session), mappingDraft: result.mappingDraft, rows: result.previewRows }, { status: 201 });
    } catch (error) {
      return jsonError(error);
    }
  };

  return { imports, importsRecords, transactionCount, routeFetcher };
}

test("entry: Import sits beside the transaction actions and routes to the workspace import page", () => {
  const markup = render(createElement(TransactionImportLink, { workspaceSlug: "house", label: "Importer" }));
  assert.match(markup, /href="\/w\/house\/transactions\/import"/);
  assert.match(markup, />Importer</);
  assert.equal(transactionImportHref("my house"), "/w/my%20house/transactions/import");
  assert.equal(importSessionHref("house", "session-1"), "/w/house/transactions/import/session-1");
});

test("back: the import page links back to Transactions without starting an import", () => {
  const markup = screen();
  assert.match(markup, /<a[^>]*href="\/w\/house\/transactions"[^>]*>.*Back<\/a>/s);
  assert.match(screen({ busy: true }), /<a[^>]*href="\/w\/house\/transactions"/);
  assert.equal(getImportUploadLabels("fr").back, "Retour");
  assert.equal(getImportUploadLabels("de").back, "Zurück");
});

test("entry: Transactions stays active in the sidebar on the import route", () => {
  assert.equal(isSidebarPathActive("/w/house/transactions/import", "/w/house/transactions"), true);
  assert.equal(isSidebarPathActive("/w/house/transactions/import", "/w/house/overview"), false);
});

test("files: CSV and XLSX within the size limit are accepted", () => {
  const csvSelection = selectImportFile([csv()]);
  assert.ok(csvSelection.ok);
  assert.equal(csvSelection.selected.fileType, "CSV");

  const xlsxSelection = selectImportFile([sized("Relevé Octobre.XLSX", 2048, XLSX_MIME)]);
  assert.ok(xlsxSelection.ok);
  assert.equal(xlsxSelection.selected.fileType, "XLSX");

  assert.ok(selectImportFile([sized("exact.csv", MAX_IMPORT_FILE_BYTES, "text/csv")]).ok);
  assert.ok(selectImportFile([csv("no-mime.csv", "a\n1\n", "")]).ok);
  assert.match(IMPORT_FILE_ACCEPT, /\.csv/);
  assert.match(IMPORT_FILE_ACCEPT, /\.xlsx/);
});

test("files: unsupported, empty, oversized, mismatched, unnamed, and multiple files are rejected with a code", () => {
  const rejected = (files: File[]) => {
    const selection = selectImportFile(files);
    assert.equal(selection.ok, false);
    return selection.ok ? null : selection.code;
  };
  assert.equal(rejected([sized("legacy.xls", 10, "application/vnd.ms-excel")]), "UNSUPPORTED_FILE_TYPE");
  assert.equal(rejected([sized("statement.pdf", 10, "application/pdf")]), "UNSUPPORTED_FILE_TYPE");
  assert.equal(rejected([sized("csv", 10, "text/csv")]), "UNSUPPORTED_FILE_TYPE");
  assert.equal(rejected([sized("empty.csv", 0, "text/csv")]), "EMPTY_FILE");
  assert.equal(rejected([sized("big.xlsx", MAX_IMPORT_FILE_BYTES + 1, XLSX_MIME)]), "FILE_SIZE_LIMIT");
  assert.equal(rejected([sized("fake.xlsx", 10, "image/png")]), "MIME_MISMATCH");
  assert.equal(rejected([sized(`${"a".repeat(260)}.csv`, 10, "text/csv")]), "INVALID_FILE_NAME");
  assert.equal(rejected([csv("a.csv"), csv("b.csv")]), "MULTIPLE_FILES");
  assert.equal(rejected([]), null);
});

test("files: the client policy matches the M7 server parser for type and size", async () => {
  assert.deepEqual(checkImportFile({ name: "legacy.xls", type: null, size: 10 }), { ok: false, code: "UNSUPPORTED_FILE_TYPE" });
  await assert.rejects(
    parseImportUpload({ name: "legacy.xls", mimeType: null, bytes: new Uint8Array(10) }),
    (error: unknown) => error instanceof ImportParseError && error.code === "UNSUPPORTED_FILE_TYPE",
  );
  await assert.rejects(
    parseImportUpload({ name: "fake.xlsx", mimeType: "image/png", bytes: new Uint8Array(10) }),
    (error: unknown) => error instanceof ImportParseError && error.code === "MIME_MISMATCH",
  );
  await assert.rejects(
    parseImportUpload({ name: "big.csv", mimeType: "text/csv", bytes: new Uint8Array(MAX_IMPORT_FILE_BYTES + 1) }),
    (error: unknown) => error instanceof ImportParseError && error.code === "FILE_SIZE_LIMIT",
  );
});

test("replace/remove: a valid replacement swaps the file, an invalid one keeps it and shows the error", () => {
  const first = importUploadReducer(INITIAL_IMPORT_UPLOAD_STATE, { type: "filesChosen", files: [csv("first.csv")] });
  assert.equal(first.selected?.file.name, "first.csv");

  const replaced = importUploadReducer(first, { type: "filesChosen", files: [sized("second.xlsx", 100, XLSX_MIME)] });
  assert.equal(replaced.selected?.file.name, "second.xlsx");
  assert.equal(replaced.errorCode, null);

  const invalid = importUploadReducer(replaced, { type: "filesChosen", files: [sized("legacy.xls", 10, "")] });
  assert.equal(invalid.selected?.file.name, "second.xlsx");
  assert.equal(invalid.errorCode, "UNSUPPORTED_FILE_TYPE");

  const cancelledPicker = importUploadReducer(invalid, { type: "filesChosen", files: [] });
  assert.equal(cancelledPicker, invalid);

  const recovered = importUploadReducer(invalid, { type: "filesChosen", files: [csv("third.csv")] });
  assert.equal(recovered.errorCode, null);

  const removed = importUploadReducer(invalid, { type: "removed" });
  assert.deepEqual(removed, INITIAL_IMPORT_UPLOAD_STATE);
});

test("replace/remove: the file is locked while analysis is pending and failure keeps it for retry", () => {
  const selected = importUploadReducer(INITIAL_IMPORT_UPLOAD_STATE, { type: "filesChosen", files: [csv()] });
  assert.equal(importUploadReducer(INITIAL_IMPORT_UPLOAD_STATE, { type: "analyzeStarted" }).analyzing, false);
  const pending = importUploadReducer(selected, { type: "analyzeStarted" });
  assert.equal(pending.analyzing, true);
  assert.equal(importUploadReducer(pending, { type: "removed" }), pending);
  assert.equal(importUploadReducer(pending, { type: "filesChosen", files: [csv("other.csv")] }), pending);

  const failed = importUploadReducer(pending, { type: "analyzeFailed", code: "MISSING_HEADERS" });
  assert.equal(failed.analyzing, false);
  assert.equal(failed.errorCode, "MISSING_HEADERS");
  assert.equal(failed.selected?.file.name, "statement.csv");
});

test("M7 handoff: Analyze uploads through the M7 service, opens a mapping session, and persists no transaction", async () => {
  const fixture = await createFixture();
  const result = await analyzeImportFile({ workspaceId: workspaceOne, file: csv(), fetcher: fixture.routeFetcher(owner) });
  assert.ok(result.ok);
  const view = await fixture.imports.getSession(owner, workspaceOne, result.importSessionId);
  assert.equal(view.session.status, "MAPPING_REQUIRED");
  assert.equal(view.session.workspaceId, workspaceOne);
  assert.deepEqual(view.session.headers, ["Date", "Amount", "Description"]);
  assert.equal(fixture.transactionCount(), 0);
});

test("M7 handoff: workspace boundaries and parser failures map to field-level codes without persisting", async () => {
  const fixture = await createFixture();
  assert.deepEqual(
    await analyzeImportFile({ workspaceId: workspaceOne, file: csv(), fetcher: fixture.routeFetcher(viewer) }),
    { ok: false, code: "FORBIDDEN" },
  );
  assert.deepEqual(
    await analyzeImportFile({ workspaceId: workspaceTwo, file: csv(), fetcher: fixture.routeFetcher(outsider) }),
    { ok: false, code: "FORBIDDEN" },
  );
  assert.deepEqual(
    await analyzeImportFile({ workspaceId: workspaceOne, file: csv("bad.csv", "", "text/csv"), fetcher: fixture.routeFetcher(owner) }),
    { ok: false, code: "FILE_SIZE_LIMIT" },
  );
  assert.deepEqual(
    await analyzeImportFile({ workspaceId: workspaceOne, file: csv("bad.csv", "Date,Date\n1,2\n"), fetcher: fixture.routeFetcher(owner) }),
    { ok: false, code: "DUPLICATE_HEADERS" },
  );
  assert.equal(fixture.transactionCount(), 0);
});

test("M7 handoff: network failures, unexpected payloads, and cross-workspace sessions never navigate", async () => {
  const offline: typeof fetch = async () => { throw new TypeError("Failed to fetch"); };
  assert.deepEqual(await analyzeImportFile({ workspaceId: workspaceOne, file: csv(), fetcher: offline }), { ok: false, code: "NETWORK" });

  const foreign: typeof fetch = async () => Response.json({ session: { id: "s-1", workspaceId: workspaceTwo } }, { status: 201 });
  assert.deepEqual(await analyzeImportFile({ workspaceId: workspaceOne, file: csv(), fetcher: foreign }), { ok: false, code: "GENERIC" });

  const html: typeof fetch = async () => new Response("<html>", { status: 502 });
  assert.deepEqual(await analyzeImportFile({ workspaceId: workspaceOne, file: csv(), fetcher: html }), { ok: false, code: "GENERIC" });

  const controller = new AbortController();
  controller.abort();
  const aborted: typeof fetch = async () => { throw new DOMException("Aborted", "AbortError"); };
  await assert.rejects(analyzeImportFile({ workspaceId: workspaceOne, file: csv(), fetcher: aborted, signal: controller.signal }));

  assert.equal(importUploadErrorCode(401, null), "FORBIDDEN");
  assert.equal(importUploadErrorCode(400, { code: "SOMETHING_NEW" }), "GENERIC");
});

test("i18n: upload labels and the Import action are complete in English, French, and German", () => {
  const keys = Object.keys(en).sort();
  for (const language of DASHBOARD_LANGUAGES) {
    const labels = getImportUploadLabels(language);
    assert.deepEqual(Object.keys(labels).sort(), keys, language);
    for (const [key, value] of Object.entries(labels)) {
      if (typeof value === "string") assert.ok(value.trim(), `${language}.${key}`);
    }
    assert.deepEqual(Object.keys(labels.errors).sort(), [...IMPORT_UPLOAD_ERROR_CODES].sort(), language);
    assert.ok(Object.values(labels.errors).every((message) => message.trim()), language);
    assert.ok(getTransactionUiLabels(getDashboardLabels(language)).actionImport.trim(), language);
  }
  assert.equal(getTransactionUiLabels(getDashboardLabels("fr")).actionImport, "Importer");
  assert.equal(getImportUploadLabels("fr").title, "Importer des transactions");
  assert.equal(getImportUploadLabels("de").analyze, "Datei analysieren");

  const french = screen({ errorCode: "FILE_SIZE_LIMIT" }, getImportUploadLabels("fr"));
  assert.match(french, /Glissez et déposez votre fichier ici/);
  assert.match(french, /Formats acceptés : CSV, XLSX · Taille maximale : 5 MB/);
  assert.match(french, /dépasse 5 MB/);
  assert.equal(formatImportFileSize(38 * 1024, "fr-FR").replace(/\s/g, " "), "38 ko");
  assert.equal(formatImportFileSize(1536, "en-US"), "1.5 kB");
});

test("accessibility: the drop zone, picker, field error, and live region are labelled", () => {
  const empty = screen();
  assert.match(empty, /<h1[^>]*>Import transactions<\/h1>/);
  assert.match(empty, /role="group"[^>]*>|<div[^>]*role="group"/);
  const groupTag = empty.match(/<div[^>]*role="group"[^>]*>/)?.[0] ?? "";
  assert.match(groupTag, /aria-labelledby="[^"]+-title"/);
  assert.match(groupTag, /aria-describedby="[^"]+-formats"/);
  assert.match(empty, /<button[^>]*type="button"[^>]*>Choose a file<\/button>/);
  assert.match(empty, /<input[^>]*type="file"/);
  assert.match(empty, /aria-label="Statement file"/);
  assert.match(empty, /accept="\.csv,\.xlsx/);
  assert.match(empty, /aria-live="polite"/);
  assert.match(empty, /<button[^>]*disabled=""[^>]*>Analyze file/);
  assert.doesNotMatch(empty, /role="alert"/);

  const errored = screen({ errorCode: "UNSUPPORTED_FILE_TYPE" });
  const errorId = errored.match(/<p[^>]*id="([^"]+-error)"[^>]*role="alert"/)?.[1];
  assert.ok(errorId);
  assert.match(errored, /This format isn&#x27;t supported\. Choose a CSV, XLSX file\./);
  assert.match(errored, new RegExp(`aria-describedby="[^"]+-formats ${errorId}"[^>]*aria-invalid="true"`));

  const selection = selectImportFile([csv("transactions-octobre.csv")]);
  assert.ok(selection.ok);
  const selected = screen({ selected: selection.selected });
  assert.match(selected, /aria-label="Selected file"/);
  assert.match(selected, /transactions-octobre\.csv/);
  assert.match(selected, />Replace</);
  assert.match(selected, /aria-label="Remove transactions-octobre\.csv"/);
  assert.doesNotMatch(selected, /<button[^>]*disabled=""[^>]*>Analyze file/);

  const pending = screen({ selected: selection.selected, busy: true });
  assert.match(pending, /aria-busy="true"[^>]*disabled=""[^>]*>.*Analyzing…/s);
  assert.doesNotMatch(pending, /FilterLoadingSurface|TransactionNavigationLoadingSurface/);

  assert.match(screen({ dragActive: true }), /data-drag-active="true"[\s\S]*Drop your file to add it/);
});

test("mobile: the layout stacks, the primary action spans the width, and touch targets are at least 44px", () => {
  const selection = selectImportFile([csv()]);
  assert.ok(selection.ok);
  const markup = screen({ selected: selection.selected });
  assert.match(markup, /class="grid gap-4 lg:grid-cols-\[minmax\(0,1fr\)_minmax\(280px,340px\)\]/);
  assert.match(markup, /px-4 py-6 sm:px-6/);
  assert.match(markup, /h-11 w-full[^"]*sm:w-auto/);
  assert.match(markup, /h-11 rounded-\[8px\] bg-\[#eef3ff\]/);
  assert.match(markup, /size-11 rounded-\[8px\]/);
  assert.match(markup, /min-w-0 flex-1[\s\S]*truncate/);
});
