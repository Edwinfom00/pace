import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuthorizationError, DomainConflictError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { isSidebarPathActive } from "@/components/pace/layout/sidebar-navigation";
import { DASHBOARD_LANGUAGES } from "@/i18n/dashboard-messages";
import { jsonError } from "@/app/api/_lib/http";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import { ImportService } from "@/modules/imports/import-service";
import {
  buildDetectedColumns,
  columnsFromAssignments,
  evaluateImportColumns,
  IMPORT_COLUMN_IGNORED,
  initialColumnAssignments,
  type ImportColumnAssignments,
} from "@/modules/imports/mapping/column-mapping";
import { parseImportUpload } from "@/modules/imports/parsers";
import {
  blockedContinueCode,
  confirmImportColumns,
  importColumnStatus,
  importMappingReducer,
  importPreviewHref,
  initialImportMappingState,
} from "@/modules/imports/ui/import-mapping-flow";
import { getImportMappingLabels, IMPORT_MAPPING_ERROR_CODES, type ImportMappingLabels } from "@/modules/imports/ui/import-mapping-labels";
import { importSessionHref } from "@/modules/imports/ui/import-upload-flow";
import { ImportMappingScreen, ImportMappingStale } from "@/modules/imports/ui/views/import-mapping-view";
import { LedgerService } from "@/modules/ledger/ledger-service";

import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import { InMemoryImportRepository } from "../../support/in-memory-import-repository";
import { InMemoryLedgerRepository } from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const member: AuthenticatedActor = { userId: "member-1", email: "member@pace.test", name: "Member" };
const workspaceId = "workspace-one";
const FIXTURE = "pace_import_test_october_2026.xlsx";
const fixtureBytes = new Uint8Array(readFileSync(join(__dirname, "../../fixtures/imports", FIXTURE)));
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const en = getImportMappingLabels("en");

async function createFixture() {
  const importsRecords = new InMemoryImportRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  await workspaces.createWorkspaceWithOwner({
    workspace: { id: workspaceId, name: workspaceId, slug: workspaceId, type: "PERSONAL", createdByUserId: owner.userId, createdAt: new Date(), updatedAt: new Date() },
    preferences: { currency: "XAF", locale: "fr-CM", timezone: "Africa/Douala", weekStartsOn: 1 },
    owner: { workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: new Date() },
    initialAccount: { id: `${workspaceId}-main`, workspaceId, name: "Main account", type: "CHECKING", currency: "XAF", createdByUserId: owner.userId },
  });
  workspaces.addMembership({ workspaceId, userId: member.userId, role: "MEMBER", invitedByUserId: null, joinedAt: new Date() });
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const inbox = new FinancialInboxService(new InMemoryFinancialInboxRepository(), ledgerRecords, workspaces);
  const imports = new ImportService(importsRecords, ledger, ledgerRecords, workspaces, inbox, { refreshForMember: async () => ({}) as never });
  const upload = async (bytes = fixtureBytes) => (await imports.upload(owner, workspaceId, { name: FIXTURE, mimeType: XLSX_MIME, bytes })).session;
  const routeFetcher = (actor: AuthenticatedActor): typeof fetch => async (input, init) => {
    const importSessionId = decodeURIComponent(String(input).split("/")[5] ?? "");
    try {
      const columnMapping = await imports.confirmColumnMapping(actor, workspaceId, importSessionId, JSON.parse(String(init?.body)));
      return Response.json({ columnMapping });
    } catch (error) {
      return jsonError(error);
    }
  };
  return { imports, importsRecords, ledgerRecords, upload, routeFetcher };
}

function screen(
  view: Awaited<ReturnType<ImportService["getColumnMapping"]>>,
  assignments: ImportColumnAssignments,
  options: { labels?: ImportMappingLabels; locale?: string; errorCode?: Parameters<typeof ImportMappingScreen>[0]["errorCode"] } = {},
) {
  return renderToStaticMarkup(createElement(ImportMappingScreen, {
    labels: options.labels ?? en,
    locale: options.locale ?? "en-US",
    session: view.session,
    columns: view.columns,
    assignments,
    evaluation: evaluateImportColumns(columnsFromAssignments(assignments).columns),
    errorCode: options.errorCode ?? null,
    busy: false,
    workspaceSlug: "house",
  }));
}

test("fixture: the OpenXML SDK workbook parses through the M7 XLSX parser", async () => {
  const parsed = await parseImportUpload({ name: FIXTURE, mimeType: XLSX_MIME, bytes: fixtureBytes });
  assert.equal(parsed.parsed.sheetName, "Transactions");
  assert.deepEqual(parsed.parsed.headers, ["Date opération", "Libellé", "Montant", "Type", "Compte", "Compte destination", "Catégorie", "Référence", "Note"]);
  assert.equal(parsed.parsed.rows.length, 30);
  assert.deepEqual(parsed.parsed.rows[0]?.values, {
    "Date opération": "2026-10-01",
    "Libellé": "Salaire",
    "Montant": "500000",
    "Type": "Revenu",
    "Compte": "Main Account",
    "Compte destination": "",
    "Catégorie": "Salaire",
    "Référence": "SAL-OCT-001",
    "Note": "Salaire octobre",
  });
});

test("detected columns: M7 confident matches are pre-mapped with real samples; the rest stay unmapped", async () => {
  const { imports, upload, ledgerRecords } = await createFixture();
  const session = await upload();
  const view = await imports.getColumnMapping(owner, workspaceId, session.id);
  assert.equal(view.editable, true);
  assert.deepEqual(view.session, { id: session.id, fileName: FIXTURE, fileType: "XLSX", fileChecksum: session.fileChecksum, rowCount: 30 });
  assert.deepEqual(view.columns.map(({ header, detectedField, samples }) => [header, detectedField, samples]), [
    ["Date opération", "transactionDate", ["2026-10-01", "2026-10-02"]],
    ["Libellé", "description", ["Salaire", "MTN Internet"]],
    ["Montant", "amount", ["500000", "-10000"]],
    ["Type", "transactionType", ["Revenu", "Dépense"]],
    ["Compte", "accountReference", ["Main Account", "Mobile Money MTN"]],
    ["Compte destination", null, ["Épargne"]],
    ["Catégorie", null, ["Salaire", "Factures & Services"]],
    ["Référence", null, ["SAL-OCT-001", "MTN-NET-1001"]],
    ["Note", null, ["Salaire octobre", "Forfait internet"]],
  ]);

  const assignments = initialColumnAssignments(view.columns, view.saved);
  assert.equal(assignments.Note, null);
  assert.equal(evaluateImportColumns(columnsFromAssignments(assignments).columns).ready, true);
  assert.equal(ledgerRecords.transactions.size, 0);
  assert.equal((await imports.getSession(owner, workspaceId, session.id)).session.status, "MAPPING_REQUIRED");
});

test("detected columns: a below-threshold M7 match is left for the user to choose", () => {
  const columns = buildDetectedColumns(["Montant total"], [{ rowNumber: 2, values: { "Montant total": "12" } }], {
    columns: { amount: "Montant total" },
    confidence: { amount: 0.82 },
    reasons: { amount: "header_alias_match" },
    requiresConfirmation: true,
  });
  assert.deepEqual(columns, [{ header: "Montant total", samples: ["12"], detectedField: null }]);
});

test("samples: up to two distinct non-empty values are shown per column", () => {
  const rows = ["", "Taxi", "Taxi", "Bus", "Train"].map((value, index) => ({ rowNumber: index + 2, values: { Memo: value } }));
  const [column] = buildDetectedColumns(["Memo"], rows, { columns: {}, confidence: {}, reasons: {}, requiresConfirmation: true });
  assert.deepEqual(column?.samples, ["Taxi", "Bus"]);
});

test("required fields: Continue is blocked until date, amount and description are mapped, client and server", async () => {
  const { imports, upload, routeFetcher } = await createFixture();
  const session = await upload();
  const view = await imports.getColumnMapping(owner, workspaceId, session.id);
  let state = initialImportMappingState(initialColumnAssignments(view.columns, null));

  state = importMappingReducer(state, { type: "assigned", header: "Montant", target: IMPORT_COLUMN_IGNORED });
  state = importMappingReducer(state, { type: "assigned", header: "Libellé", target: null });
  const evaluation = evaluateImportColumns(columnsFromAssignments(state.assignments).columns);
  assert.deepEqual(evaluation.groups.map((group) => [group.id, group.satisfied]), [["date", true], ["amount", false], ["description", false]]);
  assert.equal(evaluation.satisfiedCount, 1);
  assert.equal(blockedContinueCode(evaluation), "REQUIRED_FIELDS_MISSING");

  state = importMappingReducer(state, { type: "continueBlocked", code: "REQUIRED_FIELDS_MISSING" });
  const blocked = screen(view, state.assignments, { errorCode: state.errorCode });
  assert.match(blocked, /role="alert"[^>]*>Map Amount and Description to continue\.</);
  assert.match(blocked, /aria-disabled="true"[^>]*>Continue/);
  assert.match(blocked, /1 \/ 3 mapped/);

  assert.deepEqual(
    await confirmImportColumns({ workspaceId, importSessionId: session.id, fileChecksum: session.fileChecksum, assignments: state.assignments, fetcher: routeFetcher(owner) }),
    { ok: false, code: "REQUIRED_FIELDS_MISSING" },
  );

  state = importMappingReducer(state, { type: "assigned", header: "Montant", target: "amount" });
  assert.equal(state.errorCode, "REQUIRED_FIELDS_MISSING");
  state = importMappingReducer(state, { type: "assigned", header: "Note", target: "description" });
  assert.equal(state.errorCode, null);

  const conflict = importMappingReducer(state, { type: "assigned", header: "Compte destination", target: "debit" });
  assert.equal(blockedContinueCode(evaluateImportColumns(columnsFromAssignments(conflict.assignments).columns)), "AMOUNT_MODE_CONFLICT");
  assert.deepEqual(
    await confirmImportColumns({ workspaceId, importSessionId: session.id, fileChecksum: session.fileChecksum, assignments: conflict.assignments, fetcher: routeFetcher(owner) }),
    { ok: false, code: "AMOUNT_MODE_CONFLICT" },
  );
});

test("manual remap: choosing a taken field moves it, statuses update, and the confirmed mapping is restored", async () => {
  const { imports, upload, routeFetcher, ledgerRecords } = await createFixture();
  const session = await upload();
  const view = await imports.getColumnMapping(owner, workspaceId, session.id);
  let state = initialImportMappingState(initialColumnAssignments(view.columns, null));
  const column = (header: string) => view.columns.find((candidate) => candidate.header === header)!;

  state = importMappingReducer(state, { type: "assigned", header: "Note", target: "description" });
  assert.equal(state.assignments.Note, "description");
  assert.equal(state.assignments["Libellé"], null);
  assert.deepEqual(state.moved, { field: "description", column: "Note" });
  assert.equal(importColumnStatus(column("Note"), "description"), "MAPPED");
  assert.equal(importColumnStatus(column("Libellé"), null), "UNMAPPED");

  state = importMappingReducer(state, { type: "assigned", header: "Libellé", target: "merchant" });
  state = importMappingReducer(state, { type: "assigned", header: "Compte", target: "accountReference" });
  assert.equal(importColumnStatus(column("Compte"), "accountReference"), "DETECTED");
  assert.equal(importColumnStatus(column("Compte destination"), "accountReference"), "OPTIONAL");
  assert.equal(importColumnStatus(column("Montant"), "amount"), "DETECTED");

  const result = await confirmImportColumns({ workspaceId, importSessionId: session.id, fileChecksum: session.fileChecksum, assignments: state.assignments, fetcher: routeFetcher(owner) });
  assert.deepEqual(result, { ok: true });

  const reloaded = await imports.getColumnMapping(owner, workspaceId, session.id);
  assert.deepEqual(reloaded.saved?.columns, {
    transactionDate: "Date opération",
    merchant: "Libellé",
    amount: "Montant",
    transactionType: "Type",
    accountReference: "Compte",
    description: "Note",
  });
  assert.deepEqual(initialColumnAssignments(reloaded.columns, reloaded.saved), state.assignments);
  assert.equal(ledgerRecords.transactions.size, 0);
  assert.equal(reloaded.editable, true);
  assert.equal(importPreviewHref("house", session.id), `${importSessionHref("house", session.id)}/preview`);
});

test("ignored column: ignoring is explicit, saved separately, and cannot overlap a mapped field", async () => {
  const { imports, upload, routeFetcher } = await createFixture();
  const session = await upload();
  const view = await imports.getColumnMapping(owner, workspaceId, session.id);
  let state = initialImportMappingState(initialColumnAssignments(view.columns, null));
  state = importMappingReducer(state, { type: "assigned", header: "Référence", target: IMPORT_COLUMN_IGNORED });
  state = importMappingReducer(state, { type: "assigned", header: "Catégorie", target: IMPORT_COLUMN_IGNORED });
  assert.equal(importColumnStatus(view.columns[7]!, state.assignments["Référence"] ?? null), "IGNORED");
  assert.match(screen(view, state.assignments), /data-status="IGNORED"[\s\S]*Ignored/);

  assert.deepEqual(
    await confirmImportColumns({ workspaceId, importSessionId: session.id, fileChecksum: session.fileChecksum, assignments: state.assignments, fetcher: routeFetcher(owner) }),
    { ok: true },
  );
  assert.deepEqual((await imports.getColumnMapping(owner, workspaceId, session.id)).saved?.ignoredHeaders, ["Catégorie", "Référence"]);

  const base = { fileChecksum: session.fileChecksum, columns: { transactionDate: "Date opération", amount: "Montant", description: "Libellé" } };
  for (const input of [
    { ...base, ignoredHeaders: ["Montant"] },
    { ...base, ignoredHeaders: ["Unknown column"] },
    { ...base, columns: { ...base.columns, merchant: "Libellé" }, ignoredHeaders: [] },
  ]) {
    await assert.rejects(
      imports.confirmColumnMapping(owner, workspaceId, session.id, input),
      (error: unknown) => error instanceof DomainConflictError && error.code === "INVALID_COLUMN_MAPPING",
    );
  }
});

test("stale/replaced file: checksum changes, expiry, other uploaders and a new upload never reuse old mapping", async () => {
  const { imports, upload, routeFetcher } = await createFixture();
  const first = await upload();
  const view = await imports.getColumnMapping(owner, workspaceId, first.id);
  const assignments = initialColumnAssignments(view.columns, null);

  assert.deepEqual(
    await confirmImportColumns({ workspaceId, importSessionId: first.id, fileChecksum: "0".repeat(64), assignments, fetcher: routeFetcher(owner) }),
    { ok: false, code: "IMPORT_FILE_CHANGED" },
  );
  await assert.rejects(imports.getColumnMapping(member, workspaceId, first.id), AuthorizationError);
  assert.deepEqual(
    await confirmImportColumns({ workspaceId, importSessionId: first.id, fileChecksum: first.fileChecksum, assignments, fetcher: routeFetcher(member) }),
    { ok: false, code: "FORBIDDEN" },
  );

  await confirmImportColumns({ workspaceId, importSessionId: first.id, fileChecksum: first.fileChecksum, assignments: { ...assignments, Note: IMPORT_COLUMN_IGNORED }, fetcher: routeFetcher(owner) });
  const csv = new TextEncoder().encode("Date,Amount,Memo\n2026-10-01,-1000,Taxi\n");
  const replaced = (await imports.upload(owner, workspaceId, { name: "replacement.csv", mimeType: "text/csv", bytes: csv })).session;
  const replacedView = await imports.getColumnMapping(owner, workspaceId, replaced.id);
  assert.notEqual(replaced.id, first.id);
  assert.equal(replacedView.saved, null);
  assert.deepEqual(replacedView.columns.map((column) => column.header), ["Date", "Amount", "Memo"]);
  assert.deepEqual(initialColumnAssignments(replacedView.columns, replacedView.saved), { Date: "transactionDate", Amount: "amount", Memo: "description" });

  await imports.purgeExpiredData(new Date(Date.now() + 25 * 60 * 60 * 1000));
  const expired = await imports.getColumnMapping(owner, workspaceId, first.id);
  assert.equal(expired.editable, false);
  assert.deepEqual(expired.columns, []);
  assert.deepEqual(
    await confirmImportColumns({ workspaceId, importSessionId: first.id, fileChecksum: first.fileChecksum, assignments, fetcher: routeFetcher(owner) }),
    { ok: false, code: "IMPORT_SESSION_STALE" },
  );

  const staleState = importMappingReducer(
    importMappingReducer(initialImportMappingState(assignments), { type: "saveStarted" }),
    { type: "saveFailed", code: "IMPORT_FILE_CHANGED" },
  );
  assert.equal(staleState.stale, true);
  assert.equal(importMappingReducer(staleState, { type: "assigned", header: "Note", target: "description" }), staleState);
  const staleMarkup = renderToStaticMarkup(createElement(ImportMappingStale, { labels: en, message: null, workspaceSlug: "house" }));
  assert.match(staleMarkup, /role="alert"[\s\S]*This file is no longer available[\s\S]*href="\/w\/house\/transactions\/import"[^>]*>Upload a file/);
});

test("navigation: the mapping route keeps Transactions active in the sidebar", () => {
  assert.equal(isSidebarPathActive(importSessionHref("house", "session-1"), "/w/house/transactions"), true);
});

test("i18n: mapping copy is complete in English, French, and German", async () => {
  const shape = (labels: ImportMappingLabels) => JSON.stringify(labels, (_key, value) => (typeof value === "string" ? "" : value));
  for (const language of DASHBOARD_LANGUAGES) {
    const labels = getImportMappingLabels(language);
    assert.equal(shape(labels), shape(en), language);
    assert.deepEqual(Object.keys(labels.errors).sort(), [...IMPORT_MAPPING_ERROR_CODES].sort(), language);
    const strings: string[] = [];
    JSON.stringify(labels, (_key, value) => { if (typeof value === "string") strings.push(value); return value; });
    assert.ok(strings.every((value) => value.trim()), language);
  }

  const { imports, upload } = await createFixture();
  const session = await upload();
  const view = await imports.getColumnMapping(owner, workspaceId, session.id);
  const french = screen(view, initialColumnAssignments(view.columns, null), { labels: getImportMappingLabels("fr"), locale: "fr-CM" });
  assert.match(french, /Correspondance des colonnes/);
  assert.match(french, /30 lignes/);
  assert.match(french, /Colonne dans le fichier[\s\S]*Exemple de valeur[\s\S]*Associer à/);
  assert.match(french, /Détecté/);
  assert.match(french, /Non associé/);
  assert.match(french, /3 \/ 3 associés/);
  assert.match(french, /Ignorer cette colonne/);
  assert.match(french, /aria-label="Champ Pace pour Montant"/);
  const german = screen(view, initialColumnAssignments(view.columns, null), { labels: getImportMappingLabels("de"), locale: "de-DE", errorCode: "REQUIRED_FIELDS_MISSING" });
  assert.match(german, /Spalten zuordnen/);
  assert.match(german, />Weiter</);
});

test("responsive and accessible: rows stack on mobile, selects are labelled and keyboard native, actions stack", async () => {
  const { imports, upload } = await createFixture();
  const session = await upload();
  const view = await imports.getColumnMapping(owner, workspaceId, session.id);
  const markup = screen(view, initialColumnAssignments(view.columns, null));

  assert.match(markup, /class="hidden grid-cols-\[[^"]*md:grid"/);
  assert.match(markup, /<li class="grid gap-2 px-4 py-3 md:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_minmax\(0,1\.6fr\)\]/);
  assert.match(markup, /class="grid gap-4 lg:grid-cols-\[minmax\(0,1fr\)_minmax\(240px,300px\)\]/);
  assert.match(markup, /<span class="block[^"]*md:sr-only">Sample value<\/span>/);
  assert.equal((markup.match(/<select /g) ?? []).length, 9);
  assert.match(markup, /<select aria-describedby="[^"]+-status-2" aria-label="Pace field for Montant" class="h-11[^"]*md:h-9/);
  assert.match(markup, /<option value="amount" selected="">Amount<\/option>/);
  assert.match(markup, /<optgroup label="Required">[\s\S]*<optgroup label="Optional">[\s\S]*<option value="IGNORE">Ignore this column<\/option>/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /aria-disabled="false"[^>]*>Continue/);
  assert.match(markup, /flex flex-col-reverse gap-3 sm:flex-row/);
  assert.match(markup, /href="\/w\/house\/transactions\/import"[^>]*>.*Back<\/a>/s);
  assert.match(markup, /<span class="sr-only">Amount: mapped<\/span>/);
  assert.match(markup, /<span class="sr-only">Account: mapped<\/span>/);
  assert.match(markup, /<span class="sr-only">Currency: not mapped<\/span>/);
  assert.match(markup, /<span class="block truncate text-\[#53627b\]">Main Account<\/span><span class="block truncate text-\[12px\] text-\[#9aa6b8\]">Mobile Money MTN<\/span>/);
  assert.match(markup, /title="pace_import_test_october_2026\.xlsx"/);
});
