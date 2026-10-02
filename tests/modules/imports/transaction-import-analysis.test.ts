import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AuthenticatedActor } from "@/authorization/session";
import { jsonError } from "@/app/api/_lib/http";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import { ImportService } from "@/modules/imports/import-service";
import { presentImportSession } from "@/modules/imports/presenters";
import { ImportAnalysisPanel, importAnalysisSteps } from "@/modules/imports/ui/components/import-analysis-panel";
import {
  analyzeImportFile,
  importUploadPercent,
  importUploadReducer,
  INITIAL_IMPORT_UPLOAD_STATE,
  selectImportFile,
  type ImportUploadState,
  type ImportUploadTransport,
  type SelectedImportFile,
} from "@/modules/imports/ui/import-upload-flow";
import { getImportUploadLabels } from "@/modules/imports/ui/import-upload-labels";
import { ImportUploadScreen } from "@/modules/imports/ui/views/import-upload-view";
import { LedgerService } from "@/modules/ledger/ledger-service";

import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import { InMemoryImportRepository } from "../../support/in-memory-import-repository";
import { InMemoryLedgerRepository } from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const workspaceId = "workspace-one";
const FIXTURE = "pace_import_test_october_2026.xlsx";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const fixtureBytes = new Uint8Array(readFileSync(join(__dirname, "../../fixtures/imports", FIXTURE)));
const en = getImportUploadLabels("en");

function fixtureFile(): SelectedImportFile {
  const selection = selectImportFile([new File([fixtureBytes], FIXTURE, { type: XLSX_MIME })]);
  assert.ok(selection.ok);
  return selection.selected;
}

function stateWith(selected: SelectedImportFile): ImportUploadState {
  return importUploadReducer(INITIAL_IMPORT_UPLOAD_STATE, { type: "filesChosen", files: [selected.file] });
}

function panel(state: ImportUploadState, options: { slow?: boolean; labels?: typeof en; locale?: string } = {}) {
  assert.ok(state.selected && state.phase !== "idle");
  return renderToStaticMarkup(createElement(ImportAnalysisPanel, {
    labels: options.labels ?? en,
    locale: options.locale ?? "en-US",
    file: state.selected,
    phase: state.phase,
    uploaded: state.uploaded,
    columnCount: state.columnCount,
    slow: options.slow ?? false,
    onCancel: () => undefined,
  }));
}

async function createService() {
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  await workspaces.createWorkspaceWithOwner({
    workspace: { id: workspaceId, name: workspaceId, slug: workspaceId, type: "PERSONAL", createdByUserId: owner.userId, createdAt: new Date(), updatedAt: new Date() },
    preferences: { currency: "XAF", locale: "fr-CM", timezone: "Africa/Douala", weekStartsOn: 1 },
    owner: { workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: new Date() },
    initialAccount: { id: `${workspaceId}-main`, workspaceId, name: "Main account", type: "CHECKING", currency: "XAF", createdByUserId: owner.userId },
  });
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const inbox = new FinancialInboxService(new InMemoryFinancialInboxRepository(), ledgerRecords, workspaces);
  return new ImportService(new InMemoryImportRepository(), ledger, ledgerRecords, workspaces, inbox, { refreshForMember: async () => ({}) as never });
}

test("phases: analysis moves uploading → reading → detected from real progress and the server response", () => {
  const selected = fixtureFile();
  const size = selected.file.size;
  let state = importUploadReducer(stateWith(selected), { type: "analyzeStarted" });
  assert.equal(state.phase, "uploading");
  assert.deepEqual(state.uploaded, { loaded: 0, total: size });

  state = importUploadReducer(state, { type: "uploadProgressed", loaded: Math.round(size * 0.4), total: size });
  assert.equal(state.phase, "uploading");
  assert.equal(importUploadPercent(state.uploaded), 40);

  const regressed = importUploadReducer(state, { type: "uploadProgressed", loaded: 10, total: size });
  assert.equal(regressed.uploaded.loaded, state.uploaded.loaded);

  state = importUploadReducer(state, { type: "uploadProgressed", loaded: size, total: size });
  assert.equal(state.phase, "reading");
  assert.equal(importUploadReducer(state, { type: "uploadProgressed", loaded: 1, total: size }), state);

  const detected = importUploadReducer(state, { type: "analyzeSucceeded", columnCount: 9 });
  assert.equal(detected.phase, "detected");
  assert.equal(detected.columnCount, 9);
  assert.equal(detected.analyzing, true);

  const failed = importUploadReducer(state, { type: "analyzeFailed", code: "MALFORMED_XLSX" });
  assert.equal(failed.phase, "idle");
  assert.equal(failed.analyzing, false);
  assert.equal(failed.errorCode, "MALFORMED_XLSX");
  assert.equal(failed.selected?.file.name, FIXTURE);

  const cancelled = importUploadReducer(state, { type: "analyzeAborted" });
  assert.equal(cancelled.phase, "idle");
  assert.equal(cancelled.selected?.file.name, FIXTURE);
  assert.equal(cancelled.errorCode, null);

  assert.equal(importUploadPercent({ loaded: 5, total: 0 }), 0);
  assert.deepEqual(importAnalysisSteps("uploading"), { upload: "active", read: "pending", detect: "pending" });
  assert.deepEqual(importAnalysisSteps("reading"), { upload: "done", read: "active", detect: "pending" });
  assert.deepEqual(importAnalysisSteps("detected"), { upload: "done", read: "done", detect: "done" });
});

test("M7 handoff: the October workbook reports upload progress and its real column count", async () => {
  const imports = await createService();
  const progress: number[] = [];
  const transport: ImportUploadTransport = async ({ body, onUploadProgress }) => {
    const file = body.get("file");
    assert.ok(file instanceof File);
    onUploadProgress?.(Math.round(file.size / 2), file.size);
    onUploadProgress?.(file.size, file.size);
    try {
      const result = await imports.upload(owner, workspaceId, { name: file.name, mimeType: file.type || null, bytes: new Uint8Array(await file.arrayBuffer()) });
      return Response.json({ session: presentImportSession(result.session) }, { status: 201 });
    } catch (error) {
      return jsonError(error);
    }
  };
  const result = await analyzeImportFile({
    workspaceId,
    file: fixtureFile().file,
    transport,
    onUploadProgress: (loaded, total) => progress.push(Math.round((loaded / total) * 100)),
  });
  assert.ok(result.ok);
  assert.equal(result.columnCount, 9);
  assert.deepEqual(progress, [50, 100]);
  assert.equal((await imports.getColumnMapping(owner, workspaceId, result.importSessionId)).session.rowCount, 30);
});

test("panel: uploading shows a determinate bar, byte progress, and a cancel action", () => {
  const selected = fixtureFile();
  const size = selected.file.size;
  const state = importUploadReducer(importUploadReducer(stateWith(selected), { type: "analyzeStarted" }), {
    type: "uploadProgressed", loaded: Math.round(size * 0.4), total: size,
  });
  const markup = panel(state);
  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /aria-valuenow="40"/);
  assert.match(markup, /Analyzing your file/);
  assert.match(markup, /pace_import_test_october_2026\.xlsx · 6\.7 kB/);
  assert.match(markup, /2\.7 kB of 6\.7 kB · 40%/);
  assert.match(markup, /data-status="active" data-step="upload"/);
  assert.match(markup, /Uploading securely<span class="sr-only"> \(in progress\)<\/span>/);
  assert.match(markup, /data-status="pending" data-step="read"/);
  assert.match(markup, />Cancel<\/button>/);
  assert.match(markup, /animate-import-scan motion-reduce:hidden/);
});

test("panel: reading is indeterminate and honest, with a hint when the file takes longer", () => {
  const selected = fixtureFile();
  const state = importUploadReducer(importUploadReducer(stateWith(selected), { type: "analyzeStarted" }), {
    type: "uploadProgressed", loaded: selected.file.size, total: selected.file.size,
  });
  const markup = panel(state);
  assert.doesNotMatch(markup, /aria-valuenow/);
  assert.match(markup, /aria-valuetext="Reading rows and columns"/);
  assert.match(markup, /animate-import-indeterminate motion-reduce:w-full motion-reduce:animate-none/);
  assert.match(markup, /data-status="done" data-step="upload"/);
  assert.match(markup, /Pace is checking the structure of your file\./);
  assert.doesNotMatch(markup, /Larger files can take a little longer/);
  assert.match(panel(state, { slow: true }), /Larger files can take a little longer\. Keep this page open\./);
});

test("panel: completion shows the detected column count and hides cancel", () => {
  const selected = fixtureFile();
  let state = importUploadReducer(stateWith(selected), { type: "analyzeStarted" });
  state = importUploadReducer(state, { type: "analyzeSucceeded", columnCount: 9 });
  const markup = panel(state, { slow: true });
  assert.match(markup, /Your file is ready/);
  assert.match(markup, /aria-valuenow="100"/);
  assert.match(markup, /bg-\[#16a34a\]/);
  assert.match(markup, /9 columns found · Opening column mapping…/);
  assert.equal((markup.match(/data-status="done"/g) ?? []).length, 3);
  assert.doesNotMatch(markup, />Cancel</);
  assert.doesNotMatch(markup, /Larger files/);

  const french = panel(state, { labels: getImportUploadLabels("fr"), locale: "fr-FR" });
  assert.match(french, /Votre fichier est prêt/);
  assert.match(french, /9 colonnes trouvées/);
  const german = panel(importUploadReducer(stateWith(selected), { type: "analyzeStarted" }), { labels: getImportUploadLabels("de"), locale: "de-DE" });
  assert.match(german, /Ihre Datei wird analysiert/);
  assert.match(german, /Sicherer Upload/);
});

test("screen: the analysis panel replaces the drop zone while keeping the guidance and back action", () => {
  const selected = fixtureFile();
  const state = importUploadReducer(stateWith(selected), { type: "analyzeStarted" });
  const markup = renderToStaticMarkup(createElement(ImportUploadScreen, {
    labels: en,
    locale: "en-US",
    selected: state.selected,
    errorCode: null,
    busy: true,
    workspaceSlug: "house",
    analysis: { phase: state.phase, uploaded: state.uploaded, columnCount: null, slow: false },
  }));
  assert.match(markup, /data-phase="uploading"/);
  assert.doesNotMatch(markup, /Choose a file/);
  assert.doesNotMatch(markup, />Replace</);
  assert.match(markup, /Before you start/);
  assert.match(markup, /href="\/w\/house\/transactions"/);
  assert.match(markup, /disabled=""[^>]*>.*Analyzing…/s);
});
