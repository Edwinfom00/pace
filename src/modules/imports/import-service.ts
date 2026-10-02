import { randomUUID } from "node:crypto";

import { AuthorizationError, ConflictError, DomainConflictError, NotFoundError } from "@/authorization/errors";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { AuthenticatedActor } from "@/authorization/session";
import type { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import type { InsightService } from "@/modules/insights/insight-service";
import type { LedgerAccountRecord, LedgerCategoryRecord, LedgerTransactionRecord } from "@/modules/ledger/domain";
import { LedgerService } from "@/modules/ledger/ledger-service";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceMemberContext } from "@/modules/workspaces/domain";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { applyImportDeduplication } from "./deduplication";
import type {
  ImportColumnMapping,
  ImportField,
  ImportFileType,
  ImportMapping,
  ImportMappingDraft,
  ImportProgress,
  ImportResult,
  ImportSessionRecord,
  ImportSessionStatus,
  NormalizedImportRow,
  ParsedImportRow,
} from "./domain";
import { detectImportMapping, validateMappingAgainstParsedFile } from "./mapping";
import { buildDetectedColumns, buildPreviewRows, evaluateImportColumns, type ImportDetectedColumn } from "./mapping/column-mapping";
import { normalizeImportRows } from "./normalization";
import { parseImportUpload, type ImportFileInput } from "./parsers";
import { buildImportPreview } from "./preview";
import type { ImportRepository } from "./repositories/import-repository";
import {
  accountBlockedRowCount,
  activeImportAccounts,
  applyRowCorrections,
  buildFileAccounts,
  defaultImportAccount,
  defaultImportCategory,
  fileAccountLabels,
  importReviewIssues,
  isLikelyInboxHandoff,
  mappingFromConfirmedColumns,
  requiresTransferAccount,
  resolveAccountAssignments,
  summarizeImportReview,
  type ImportFileAccount,
  type ImportFileAccountRole,
  type ImportReviewIssue,
  type ImportReviewSummary,
} from "./review";
import { importColumnMappingRequestSchema, importReviewRequestSchema, type ImportReviewRequest } from "./validation";

const RAW_DATA_RETENTION_MS = 24 * 60 * 60 * 1000;
const IMPORT_LEASE_STALE_MS = 2 * 60 * 1000;
const PROGRESS_WRITE_INTERVAL_ROWS = 5;
const MAX_REPORTED_FAILED_ROWS = 50;

export interface ImportSessionView {
  session: ImportSessionRecord;
  mappingDraft: ImportMappingDraft;
  previewRows: NormalizedImportRow[];
}

export interface ImportColumnMappingView {
  session: {
    id: string;
    fileName: string;
    fileType: ImportFileType;
    fileChecksum: string;
    rowCount: number;
  };
  editable: boolean;
  columns: ImportDetectedColumn[];
  previewRows: Record<string, string>[];
  saved: ImportColumnMapping | null;
}

export type ImportReviewState = "MAPPING_REQUIRED" | "STALE" | "REVIEW" | "EXECUTING" | "RESULT";

export interface ImportReviewView {
  state: ImportReviewState;
  session: {
    id: string;
    fileName: string;
    fileType: ImportFileType;
    status: ImportSessionStatus;
  };
  accounts: { id: string; name: string; currency: string; type: LedgerAccountRecord["type"] }[];
  accountId: string | null;
  transferAccountId: string | null;
  transferAccountRequired: boolean;
  accountColumnMapped: boolean;
  unreferencedRowCount: number;
  sourceAccounts: ImportFileAccount[];
  destinationAccounts: ImportFileAccount[];
  summary: ImportReviewSummary | null;
  blockingIssues: ImportReviewIssue[];
  accountBlockedRowCount: number;
  skippedRowNumbers: number[];
  progress: ImportProgress | null;
  result: ImportResult | null;
}

export interface ImportProgressView {
  status: ImportSessionStatus;
  progress: ImportProgress | null;
  result: ImportResult | null;
}

export class ImportService {
  constructor(
    private readonly imports: ImportRepository,
    private readonly ledger: LedgerService,
    private readonly ledgerRecords: Pick<LedgerRepository, "listTransactions" | "findTransactionByFingerprint">,
    private readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">,
    private readonly inbox: Pick<FinancialInboxService, "ingestTransaction" | "routeTransactionForReview">,
    private readonly insights: Pick<InsightService, "refreshForMember">,
  ) {}

  async upload(
    actor: AuthenticatedActor,
    workspaceId: string,
    file: ImportFileInput,
  ): Promise<ImportSessionView> {
    await this.requireManageContext(actor, workspaceId);
    const uploaded = await parseImportUpload(file);
    const uploadedSession = await this.imports.createSession({
      id: randomUUID(),
      workspaceId,
      initiatedByUserId: actor.userId,
      fileName: safeFileName(file.name),
      fileType: uploaded.fileType,
      mimeType: file.mimeType || null,
      fileChecksum: uploaded.checksum,
      sourceSizeBytes: file.bytes.byteLength,
      sheetName: uploaded.parsed.sheetName,
      headers: uploaded.parsed.headers,
      parsedRows: uploaded.parsed.rows,
      rawDataExpiresAt: new Date(Date.now() + RAW_DATA_RETENTION_MS),
    });
    const session = await this.imports.transitionSession({
      workspaceId,
      importSessionId: uploadedSession.id,
      from: ["UPLOADED"],
      to: "MAPPING_REQUIRED",
    });
    if (!session) throw new ConflictError("The uploaded statement could not enter mapping.");
    await this.audit(session, actor.userId, "UPLOADED", "UPLOADED", "MAPPING_REQUIRED", {
      fileType: session.fileType,
      sourceSizeBytes: session.sourceSizeBytes,
      parsedRowCount: session.parsedRows?.length ?? 0,
    });
    return {
      session,
      mappingDraft: detectImportMapping(session.headers),
      previewRows: [],
    };
  }

  async getSession(actor: AuthenticatedActor, workspaceId: string, importSessionId: string): Promise<ImportSessionView> {
    await this.requireReadContext(actor, workspaceId);
    const session = await this.requireSession(workspaceId, importSessionId);
    return {
      session,
      mappingDraft: detectImportMapping(session.headers),
      previewRows: session.stagedRows?.slice(0, 100) ?? [],
    };
  }

  async getColumnMapping(
    actor: AuthenticatedActor,
    workspaceId: string,
    importSessionId: string,
  ): Promise<ImportColumnMappingView> {
    await this.requireManageContext(actor, workspaceId);
    const session = await this.requireInitiatedSession(actor, workspaceId, importSessionId);
    const rows = this.hasLiveRawData(session) ? session.parsedRows ?? [] : [];
    const editable = isMappingEditable(session.status) && this.hasLiveRawData(session);
    return {
      session: {
        id: session.id,
        fileName: session.fileName,
        fileType: session.fileType,
        fileChecksum: session.fileChecksum,
        rowCount: rows.length,
      },
      editable,
      columns: editable ? buildDetectedColumns(session.headers, rows, detectImportMapping(session.headers)) : [],
      previewRows: editable ? buildPreviewRows(session.headers, rows) : [],
      saved: session.columnMapping?.fileChecksum === session.fileChecksum ? session.columnMapping : null,
    };
  }

  async confirmColumnMapping(
    actor: AuthenticatedActor,
    workspaceId: string,
    importSessionId: string,
    input: unknown,
  ): Promise<ImportColumnMapping> {
    const request = importColumnMappingRequestSchema.parse(input);
    await this.requireManageContext(actor, workspaceId);
    const session = await this.requireInitiatedSession(actor, workspaceId, importSessionId);
    if (request.fileChecksum !== session.fileChecksum) {
      throw new DomainConflictError("IMPORT_FILE_CHANGED", "This import now refers to a different file.");
    }
    if (!isMappingEditable(session.status) || !this.hasLiveRawData(session)) {
      throw new DomainConflictError("IMPORT_SESSION_STALE", "This file is no longer available for mapping. Upload it again.");
    }
    const headers = new Set(session.headers);
    const mapped = Object.values(request.columns).filter((header): header is string => Boolean(header));
    const ignoredHeaders = [...new Set(request.ignoredHeaders)];
    if (
      [...mapped, ...ignoredHeaders].some((header) => !headers.has(header)) ||
      new Set(mapped).size !== mapped.length ||
      ignoredHeaders.some((header) => mapped.includes(header))
    ) {
      throw new DomainConflictError("INVALID_COLUMN_MAPPING", "Each file column can be mapped to one Pace field only.");
    }
    const evaluation = evaluateImportColumns(request.columns);
    if (evaluation.issues.includes("AMOUNT_MODE_CONFLICT")) {
      throw new DomainConflictError("AMOUNT_MODE_CONFLICT", "Map either a signed amount or debit/credit columns, not both.");
    }
    if (!evaluation.ready) {
      throw new DomainConflictError("REQUIRED_FIELDS_MISSING", "Map a date, an amount and a description before continuing.");
    }
    const columnMapping: ImportColumnMapping = {
      columns: request.columns,
      ignoredHeaders,
      fileChecksum: session.fileChecksum,
      confirmedAt: new Date().toISOString(),
    };
    const saved = await this.imports.saveColumnMapping({ workspaceId, importSessionId, columnMapping });
    if (!saved) throw new DomainConflictError("IMPORT_SESSION_STALE", "This import changed before its columns could be saved.");
    await this.audit(saved, actor.userId, "COLUMNS_CONFIRMED", saved.status, saved.status, {
      mappedFields: Object.keys(request.columns).sort(),
      ignoredColumnCount: ignoredHeaders.length,
    });
    return columnMapping;
  }

  /** Trusted scheduler entry point. Expired statement rows are never ledger mutations. */
  async purgeExpiredData(now = new Date()): Promise<number> {
    const expired = await this.imports.listExpiredSessions(now);
    let cleared = 0;
    for (const session of expired) {
      const cancelled = await this.imports.transitionSession({
        workspaceId: session.workspaceId,
        importSessionId: session.id,
        from: [session.status],
        to: "CANCELLED",
        clearRawData: true,
        failureCode: "RAW_DATA_EXPIRED",
        failureMessage: "Temporary import data expired after 24 hours.",
      });
      if (!cancelled) continue;
      cleared += 1;
      await this.audit(cancelled, null, "RAW_DATA_EXPIRED", session.status, "CANCELLED");
    }
    return cleared;
  }

  async prepare(
    actor: AuthenticatedActor,
    workspaceId: string,
    importSessionId: string,
    input: unknown,
  ): Promise<ImportSessionView> {
    const context = await this.requireManageContext(actor, workspaceId);
    const session = await this.requireInitiatedSession(actor, workspaceId, importSessionId);
    if (!session.parsedRows || !session.rawDataExpiresAt || session.rawDataExpiresAt <= new Date()) {
      throw new ConflictError("The temporary import data has expired. Upload the statement again.");
    }
    if (!["MAPPING_REQUIRED", "READY_FOR_PREVIEW", "PARTIALLY_COMPLETED"].includes(session.status)) {
      throw new ConflictError("This import can no longer be remapped.");
    }
    let mapping: ImportMapping;
    try {
      mapping = validateMappingAgainstParsedFile(input, { headers: session.headers });
    } catch (error) {
      throw new ConflictError(error instanceof Error ? error.message : "The import mapping is invalid.");
    }
    const prepared = await this.stage(actor, context, session, mapping);
    return { session: prepared, mappingDraft: detectImportMapping(prepared.headers), previewRows: prepared.stagedRows?.slice(0, 100) ?? [] };
  }

  async getImportReview(
    actor: AuthenticatedActor,
    workspaceId: string,
    importSessionId: string,
  ): Promise<ImportReviewView> {
    const context = await this.requireManageContext(actor, workspaceId);
    let session = await this.requireInitiatedSession(actor, workspaceId, importSessionId);
    const stagedWithoutAccountRouting = session.status === "READY_FOR_PREVIEW"
      && Boolean(session.columnMapping?.columns.accountReference)
      && !session.mapping?.accountAssignments
      && this.hasLiveRawData(session);
    if (session.status === "MAPPING_REQUIRED" || stagedWithoutAccountRouting) {
      if (session.columnMapping?.fileChecksum !== session.fileChecksum) return this.toReviewView(session, [], context, "MAPPING_REQUIRED");
      if (!this.hasLiveRawData(session)) return this.toReviewView(session, [], context, "STALE");
      session = await this.stageConfirmedColumns(actor, context, session, {
        accountId: session.mapping?.accountId ?? null,
        transferAccountId: session.mapping?.transferAccountId ?? null,
      }, false);
    }
    return this.toReviewView(session, await this.ledger.listAccounts(actor, workspaceId), context);
  }

  async updateImportReview(
    actor: AuthenticatedActor,
    workspaceId: string,
    importSessionId: string,
    input: unknown,
  ): Promise<ImportReviewView> {
    const request = importReviewRequestSchema.parse(input);
    const context = await this.requireManageContext(actor, workspaceId);
    let session = await this.requireInitiatedSession(actor, workspaceId, importSessionId);
    if (session.status === "AWAITING_APPROVAL") {
      const reopened = await this.imports.transitionSession({
        workspaceId,
        importSessionId,
        from: ["AWAITING_APPROVAL"],
        to: "READY_FOR_PREVIEW",
      });
      if (!reopened) throw new DomainConflictError("IMPORT_SESSION_STALE", "This import changed before it could be reviewed again.");
      session = reopened;
    }
    if (!isMappingEditable(session.status) || !session.columnMapping || !this.hasLiveRawData(session)) {
      throw new DomainConflictError("IMPORT_SESSION_STALE", "This import can no longer be reviewed. Upload the statement again.");
    }
    const staged = await this.stageConfirmedColumns(actor, context, session, request, true);
    return this.toReviewView(staged, await this.ledger.listAccounts(actor, workspaceId), context);
  }

  async getProgress(actor: AuthenticatedActor, workspaceId: string, importSessionId: string): Promise<ImportProgressView> {
    await this.requireManageContext(actor, workspaceId);
    const session = await this.requireInitiatedSession(actor, workspaceId, importSessionId);
    return { status: session.status, progress: session.progress, result: session.result };
  }

  private async stageConfirmedColumns(
    actor: AuthenticatedActor,
    context: WorkspaceMemberContext,
    session: ImportSessionRecord,
    request: Omit<ImportReviewRequest, "accountId"> & { accountId: string | null },
    explicit: boolean,
  ): Promise<ImportSessionRecord> {
    const columns = session.columnMapping!.columns;
    const [accounts, categories] = await Promise.all([
      this.ledger.listAccounts(actor, session.workspaceId),
      this.ledger.listCategories(actor, session.workspaceId),
    ]);
    const account = defaultImportAccount(accounts, request.accountId, context.preferences.currency);
    if (!account) throw new DomainConflictError("IMPORT_ACCOUNT_UNAVAILABLE", "Add an account before importing transactions.");
    if (explicit && account.id !== request.accountId) {
      throw new DomainConflictError("IMPORT_ACCOUNT_UNAVAILABLE", "The selected import account is not available in this workspace.");
    }
    const expense = defaultImportCategory(categories, "EXPENSE");
    const income = defaultImportCategory(categories, "INCOME");
    if (!expense || !income) throw new ConflictError("Default import categories are missing in this workspace.");
    const active = activeImportAccounts(accounts);
    const activeIds = new Set(active.map((candidate) => candidate.id));
    const transferAccount = request.transferAccountId
      ? active.find((candidate) => candidate.id === request.transferAccountId) ?? null
      : null;
    if (request.transferAccountId && (!transferAccount || transferAccount.id === account.id)) {
      throw new DomainConflictError("IMPORT_TRANSFER_ACCOUNT_INVALID", "Choose a different account with the same currency for transfers.");
    }
    const requestedAccountIds = [
      ...Object.values(request.accountAssignments ?? {}),
      ...Object.values(request.transferAccountAssignments ?? {}),
    ];
    if (requestedAccountIds.some((id) => !activeIds.has(id))) {
      throw new DomainConflictError("IMPORT_ACCOUNT_UNAVAILABLE", "The selected import account is not available in this workspace.");
    }

    let parsedRows = session.parsedRows ?? [];
    let corrected: { sourceRowNumber: number; field: ImportField }[] = [];
    if (request.corrections?.length) {
      const result = applyRowCorrections(parsedRows, columns, request.corrections);
      if (!result) throw new DomainConflictError("INVALID_ROW_CORRECTION", "This correction no longer matches a mapped cell in the file.");
      parsedRows = result.rows;
      corrected = result.applied;
    }
    const knownRows = new Set(parsedRows.map((row) => row.rowNumber));
    const skipped = new Set(session.mapping?.skippedRowNumbers ?? []);
    for (const row of request.skipRows ?? []) if (knownRows.has(row)) skipped.add(row);
    for (const row of request.restoreRows ?? []) skipped.delete(row);

    const mapping = mappingFromConfirmedColumns(session.columnMapping!, {
      rows: parsedRows,
      locale: context.preferences.locale,
      accountId: account.id,
      transferAccountId: transferAccount?.id ?? null,
      defaultExpenseCategoryId: expense.id,
      defaultIncomeCategoryId: income.id,
      accountAssignments: columns.accountReference
        ? resolveAccountAssignments(
          fileAccountLabels(parsedRows, columns.accountReference),
          accounts,
          session.mapping?.accountAssignments,
          request.accountAssignments,
        )
        : undefined,
      transferAccountAssignments: columns.transferAccount
        ? resolveAccountAssignments(
          fileAccountLabels(parsedRows, columns.transferAccount),
          accounts,
          session.mapping?.transferAccountAssignments,
          request.transferAccountAssignments,
        )
        : undefined,
      skippedRowNumbers: [...skipped].sort((left, right) => left - right),
    });
    const staged = await this.stage(
      actor,
      context,
      { ...session, parsedRows },
      validateMappingAgainstParsedFile(mapping, { headers: session.headers }),
      corrected.length ? parsedRows : undefined,
    );
    if (corrected.length) {
      await this.audit(staged, actor.userId, "ROWS_CORRECTED", staged.status, staged.status, { corrections: corrected });
    }
    return staged;
  }

  private toReviewView(
    session: ImportSessionRecord,
    accounts: readonly LedgerAccountRecord[],
    context: WorkspaceMemberContext,
    forcedState?: ImportReviewState,
  ): ImportReviewView {
    const rows = session.stagedRows ?? [];
    const parsedRows = session.parsedRows ?? [];
    const columns = session.mapping?.columns ?? session.columnMapping?.columns ?? {};
    const account = accounts.find((candidate) => candidate.id === session.mapping?.accountId);
    const skippedRowNumbers = session.mapping?.skippedRowNumbers ?? [];
    const fileAccounts = (role: ImportFileAccountRole) => buildFileAccounts({
      role,
      labels: fileAccountLabels(parsedRows, role === "SOURCE" ? columns.accountReference : columns.transferAccount),
      stagedRows: rows,
      parsedRows,
      columns,
      assignments: role === "SOURCE" ? session.mapping?.accountAssignments : session.mapping?.transferAccountAssignments,
      accounts,
      fallbackCurrency: account?.currency ?? context.preferences.currency,
    });
    return {
      state: forcedState ?? reviewState(session),
      session: { id: session.id, fileName: session.fileName, fileType: session.fileType, status: session.status },
      accounts: activeImportAccounts(accounts).map(({ id, name, currency, type }) => ({ id, name, currency, type })),
      accountId: session.mapping?.accountId ?? null,
      transferAccountId: session.mapping?.transferAccountId ?? null,
      transferAccountRequired: requiresTransferAccount(rows),
      accountColumnMapped: Boolean(columns.accountReference),
      unreferencedRowCount: rows.filter((row) => !row.accountReference).length,
      sourceAccounts: session.stagedRows ? fileAccounts("SOURCE") : [],
      destinationAccounts: session.stagedRows ? fileAccounts("DESTINATION") : [],
      summary: session.stagedRows
        ? summarizeImportReview(rows, account?.currency ?? session.mapping?.fallbackCurrency ?? null, skippedRowNumbers.length)
        : null,
      blockingIssues: importReviewIssues(rows, parsedRows, columns),
      accountBlockedRowCount: accountBlockedRowCount(rows),
      skippedRowNumbers,
      progress: session.progress,
      result: session.result,
    };
  }

  private async stage(
    actor: AuthenticatedActor,
    context: WorkspaceMemberContext,
    session: ImportSessionRecord,
    mapping: ImportMapping,
    correctedParsedRows?: ParsedImportRow[],
  ): Promise<ImportSessionRecord> {
    const workspaceId = session.workspaceId;
    const importSessionId = session.id;
    const { mapping: resolvedMapping, accountCurrencies } = await this.validateMappingContext(actor, workspaceId, mapping);
    const skipped = new Set(resolvedMapping.skippedRowNumbers ?? []);
    const normalized = normalizeImportRows(
      (session.parsedRows ?? []).filter((row) => !skipped.has(row.rowNumber)),
      resolvedMapping,
      {
        workspaceId,
        fallbackCurrency: resolvedMapping.fallbackCurrency,
        timezone: context.preferences.timezone,
        accountCurrencies,
      },
    );
    const deduplicated = applyImportDeduplication(
      normalized,
      await this.ledgerRecords.listTransactions(workspaceId),
    );
    const preview = buildImportPreview(deduplicated);
    const prepared = await this.imports.prepareSession({
      workspaceId,
      importSessionId,
      mapping: resolvedMapping,
      stagedRows: deduplicated,
      preview,
      ...(correctedParsedRows ? { parsedRows: correctedParsedRows } : {}),
    });
    if (!prepared) throw new ConflictError("This import changed before its preview could be prepared.");
    await this.audit(prepared, actor.userId, "PREVIEW_PREPARED", session.status, "READY_FOR_PREVIEW", {
      parsedRowCount: preview.parsedRowCount,
      acceptedRowCount: preview.acceptedRowCount,
      invalidRowCount: preview.invalidRowCount,
      exactDuplicateRowCount: preview.exactDuplicateRowCount,
      skippedRowCount: skipped.size,
    });
    return prepared;
  }

  async requestApproval(
    actor: AuthenticatedActor,
    workspaceId: string,
    importSessionId: string,
  ): Promise<ImportSessionRecord> {
    await this.requireManageContext(actor, workspaceId);
    const session = await this.requireInitiatedSession(actor, workspaceId, importSessionId);
    if (session.status === "AWAITING_APPROVAL") return session;
    if (
      !session.preview ||
      !session.stagedRows ||
      session.preview.acceptedRowCount === 0 ||
      session.preview.invalidRowCount > 0
    ) {
      throw new ConflictError("Resolve the mapping issues before requesting import approval.");
    }
    const approved = await this.imports.transitionSession({
      workspaceId,
      importSessionId,
      from: ["READY_FOR_PREVIEW"],
      to: "AWAITING_APPROVAL",
    });
    if (!approved) throw new ConflictError("This import is not ready for approval.");
    await this.audit(approved, actor.userId, "APPROVAL_REQUESTED", "READY_FOR_PREVIEW", "AWAITING_APPROVAL", {
      acceptedRowCount: approved.preview?.acceptedRowCount ?? 0,
    });
    return approved;
  }

  async execute(
    actor: AuthenticatedActor,
    workspaceId: string,
    importSessionId: string,
  ): Promise<ImportSessionRecord> {
    await this.requireManageContext(actor, workspaceId);
    let session = await this.requireInitiatedSession(actor, workspaceId, importSessionId);
    if (session.status === "COMPLETED") return session;
    if (!["AWAITING_APPROVAL", "IMPORTING", "PARTIALLY_COMPLETED"].includes(session.status)) {
      throw new ConflictError("This import has not been approved.");
    }
    const mapping = session.mapping;
    const stagedRows = session.stagedRows;
    const preview = session.preview;
    if (!mapping || !stagedRows || !preview) {
      throw new ConflictError("This import has no approved staged rows.");
    }

    const acceptedRows = stagedRows.filter((row) => row.disposition === "ACCEPT");
    const progressAt = (processedRowCount: number, phase: ImportProgress["phase"] = "IMPORT"): ImportProgress => ({
      phase,
      processedRowCount,
      totalRowCount: acceptedRows.length,
      heartbeatAt: new Date().toISOString(),
    });

    if (session.status === "IMPORTING") {
      // Only a stalled run may be resumed; a live run keeps its lease so staged rows are never processed by two requests at once.
      const claimed = await this.imports.claimStalledImport({
        workspaceId,
        importSessionId,
        staleBefore: new Date(Date.now() - IMPORT_LEASE_STALE_MS),
        progress: progressAt(0),
      });
      if (!claimed) return session;
      await this.audit(claimed, actor.userId, "IMPORT_RESUMED", "IMPORTING", "IMPORTING");
      session = claimed;
    } else {
      try {
        await this.validateMappingContext(actor, workspaceId, mapping);
      } catch (error) {
        if (error instanceof NotFoundError || error instanceof ConflictError) {
          throw new DomainConflictError("IMPORT_ACCOUNT_UNAVAILABLE", error.message);
        }
        throw error;
      }
      const importing = await this.imports.transitionSession({
        workspaceId,
        importSessionId,
        from: ["AWAITING_APPROVAL", "PARTIALLY_COMPLETED"],
        to: "IMPORTING",
        approvedByUserId: actor.userId,
        progress: progressAt(0),
      });
      if (!importing) {
        const current = await this.requireSession(workspaceId, importSessionId);
        if (current.status === "IMPORTING" || current.status === "COMPLETED") return current;
        throw new ConflictError("This import changed before it could begin.");
      }
      await this.audit(importing, actor.userId, "IMPORT_STARTED", session.status, "IMPORTING");
      session = importing;
    }

    let importedRowCount = 0;
    let skippedExactDuplicateRowCount = preview.exactDuplicateRowCount;
    let inboxRowCount = 0;
    let deferredPipelineCount = 0;
    let processedRowCount = 0;
    const failedRowNumbers: number[] = [];
    for (const row of acceptedRows) {
      const transaction = await this.findOrCreateLedgerTransaction(actor, workspaceId, session, row);
      processedRowCount += 1;
      if (!transaction) {
        failedRowNumbers.push(row.sourceRowNumber);
      } else if (transaction.source.importSessionId === session.id) {
        importedRowCount += 1;
        try {
          if (await this.handOffToInbox(actor, workspaceId, session, transaction, row)) inboxRowCount += 1;
        } catch (error) {
          deferredPipelineCount += 1;
          console.error("Imported transaction classification deferred", error);
        }
      } else {
        skippedExactDuplicateRowCount += 1;
      }
      if (processedRowCount % PROGRESS_WRITE_INTERVAL_ROWS === 0 && processedRowCount < acceptedRows.length) {
        await this.imports.recordProgress({ workspaceId, importSessionId, progress: progressAt(processedRowCount) });
      }
    }
    await this.imports.recordProgress({ workspaceId, importSessionId, progress: progressAt(processedRowCount, "FINALIZE") });
    const failedRowCount = failedRowNumbers.length;
    if (importedRowCount > 0) {
      try {
        await this.insights.refreshForMember(actor, workspaceId);
      } catch (error) {
        deferredPipelineCount += 1;
        console.error("Imported transaction insight refresh deferred", error);
      }
    }
    const completedAt = new Date();
    const result: ImportResult = {
      importedRowCount,
      skippedExactDuplicateRowCount,
      failedRowCount,
      deferredPipelineCount,
      inboxRowCount,
      failedRowNumbers: failedRowNumbers.slice(0, MAX_REPORTED_FAILED_ROWS),
      completedAt: failedRowCount ? null : completedAt.toISOString(),
    };
    const finalStatus: ImportSessionStatus = failedRowCount ? "PARTIALLY_COMPLETED" : "COMPLETED";
    const completed = await this.imports.transitionSession({
      workspaceId,
      importSessionId,
      from: ["IMPORTING"],
      to: finalStatus,
      result,
      progress: progressAt(processedRowCount, "FINALIZE"),
      completedAt: failedRowCount ? null : completedAt,
      clearRawData: !failedRowCount,
      failureCode: failedRowCount ? "ROW_IMPORT_FAILURE" : null,
      failureMessage: failedRowCount ? "One or more rows could not be imported." : null,
    });
    if (!completed) throw new ConflictError("The import status changed while it was being completed.");
    await this.audit(
      completed,
      actor.userId,
      finalStatus === "COMPLETED" ? "IMPORT_COMPLETED" : "IMPORT_PARTIALLY_COMPLETED",
      "IMPORTING",
      finalStatus,
      { ...result },
    );
    return completed;
  }

  private async handOffToInbox(
    actor: AuthenticatedActor,
    workspaceId: string,
    session: ImportSessionRecord,
    transaction: LedgerTransactionRecord,
    row: NormalizedImportRow,
  ): Promise<boolean> {
    const classified = await this.inbox.ingestTransaction(actor, workspaceId, { transaction });
    if (!isLikelyInboxHandoff(row)) return (classified?.inboxItems.length ?? 0) > 0;
    await this.inbox.routeTransactionForReview(actor, workspaceId, {
      transactionId: transaction.id,
      details: { code: "likely_duplicate", importSessionId: session.id, sourceRowNumber: row.sourceRowNumber },
    });
    return true;
  }

  async cancel(
    actor: AuthenticatedActor,
    workspaceId: string,
    importSessionId: string,
  ): Promise<ImportSessionRecord> {
    await this.requireManageContext(actor, workspaceId);
    const session = await this.requireInitiatedSession(actor, workspaceId, importSessionId);
    const cancelled = await this.imports.transitionSession({
      workspaceId,
      importSessionId,
      from: ["MAPPING_REQUIRED", "READY_FOR_PREVIEW", "AWAITING_APPROVAL", "PARTIALLY_COMPLETED", "FAILED"],
      to: "CANCELLED",
      clearRawData: true,
    });
    if (!cancelled) throw new ConflictError("This import cannot be cancelled now.");
    await this.audit(cancelled, actor.userId, "IMPORT_CANCELLED", session.status, "CANCELLED");
    return cancelled;
  }

  private async findOrCreateLedgerTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    session: ImportSessionRecord,
    row: NormalizedImportRow,
  ): Promise<LedgerTransactionRecord | null> {
    const existing = await this.ledgerRecords.findTransactionByFingerprint(workspaceId, row.fingerprint);
    if (existing) return existing;
    try {
      const common = {
        status: "POSTED" as const,
        accountId: row.accountId ?? session.mapping!.accountId,
        amountMinor: row.amountMinor,
        currency: row.currency,
        occurredAt: row.occurredAt,
        source: {
          provider: "pace-import",
          importSessionId: session.id,
          sourceRowNumber: row.sourceRowNumber,
          importDescription: row.description ?? row.merchantName ?? "",
        },
        deduplicationFingerprint: row.fingerprint,
        note: row.description ?? row.merchantName ?? undefined,
      };
      if (row.kind === "TRANSFER") {
        return await this.ledger.createTransaction(actor, workspaceId, {
          ...common,
          kind: "TRANSFER",
          transferAccountId: row.transferAccountId ?? session.mapping!.transferAccountId,
        });
      }
      const merchant = row.merchantName
        ? await this.ledger.createOrFindMerchant(actor, workspaceId, row.merchantName)
        : null;
      return await this.ledger.createTransaction(actor, workspaceId, {
        ...common,
        kind: row.kind,
        categoryId: row.kind === "EXPENSE"
          ? session.mapping!.defaultExpenseCategoryId
          : session.mapping!.defaultIncomeCategoryId,
        ...(merchant ? { merchantId: merchant.id } : {}),
      });
    } catch (error) {
      const concurrent = await this.ledgerRecords.findTransactionByFingerprint(workspaceId, row.fingerprint);
      if (concurrent) return concurrent;
      console.error("Imported transaction failed", { importSessionId: session.id, sourceRowNumber: row.sourceRowNumber, error });
      return null;
    }
  }

  private async validateMappingContext(
    actor: AuthenticatedActor,
    workspaceId: string,
    mapping: ImportMapping,
  ): Promise<{ mapping: ImportMapping; accountCurrencies: Record<string, string> }> {
    const [accounts, categories] = await Promise.all([
      this.ledger.listAccounts(actor, workspaceId),
      this.ledger.listCategories(actor, workspaceId),
    ]);
    const account = requireById(accounts, mapping.accountId, "The selected import account is not in this workspace.");
    if (account.archivedAt) throw new ConflictError("The selected import account is archived.");
    requireCategory(categories, mapping.defaultExpenseCategoryId, "EXPENSE");
    requireCategory(categories, mapping.defaultIncomeCategoryId, "INCOME");
    if (mapping.transferAccountId) {
      const destination = requireById(accounts, mapping.transferAccountId, "The transfer destination account is not in this workspace.");
      if (destination.id === account.id) throw new ConflictError("A transfer destination must be a different account.");
      if (destination.archivedAt) throw new ConflictError("The transfer destination account is archived.");
    }
    for (const id of [...Object.values(mapping.accountAssignments ?? {}), ...Object.values(mapping.transferAccountAssignments ?? {})]) {
      const assigned = requireById(accounts, id, "An assigned import account is not in this workspace.");
      if (assigned.archivedAt) throw new ConflictError("An assigned import account is archived.");
    }
    if (mapping.fallbackCurrency && mapping.fallbackCurrency.toUpperCase() !== account.currency) {
      throw new ConflictError("The fallback currency must match the selected Pace account.");
    }
    return {
      mapping: { ...mapping, fallbackCurrency: account.currency },
      accountCurrencies: Object.fromEntries(activeImportAccounts(accounts).map((candidate) => [candidate.id, candidate.currency])),
    };
  }

  private hasLiveRawData(session: ImportSessionRecord): boolean {
    return Boolean(session.parsedRows && session.rawDataExpiresAt && session.rawDataExpiresAt > new Date());
  }

  private async requireManageContext(actor: AuthenticatedActor, workspaceId: string): Promise<WorkspaceMemberContext> {
    const context = await this.workspaces.findMemberContext(workspaceId, actor.userId);
    if (!context) throw new AuthorizationError("You are not a member of this workspace.");
    assertWorkspacePermission(context.membership.role, "manage_ledger");
    return context;
  }

  private async requireReadContext(actor: AuthenticatedActor, workspaceId: string): Promise<WorkspaceMemberContext> {
    const context = await this.workspaces.findMemberContext(workspaceId, actor.userId);
    if (!context) throw new AuthorizationError("You are not a member of this workspace.");
    assertWorkspacePermission(context.membership.role, "read");
    return context;
  }

  private async requireSession(workspaceId: string, importSessionId: string): Promise<ImportSessionRecord> {
    const session = await this.imports.findSession(workspaceId, importSessionId);
    if (!session) throw new NotFoundError("Import session not found in this workspace.");
    return session;
  }

  private async requireInitiatedSession(
    actor: AuthenticatedActor,
    workspaceId: string,
    importSessionId: string,
  ): Promise<ImportSessionRecord> {
    const session = await this.requireSession(workspaceId, importSessionId);
    if (session.initiatedByUserId !== actor.userId) {
      throw new AuthorizationError("Only the member who uploaded this statement can change or approve it.");
    }
    return session;
  }

  private async audit(
    session: ImportSessionRecord,
    actorUserId: string | null,
    event: string,
    fromStatus: ImportSessionStatus | null,
    toStatus: ImportSessionStatus | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.imports.createAudit({
      id: randomUUID(),
      importSessionId: session.id,
      workspaceId: session.workspaceId,
      actorUserId,
      event,
      fromStatus,
      toStatus,
      metadata,
    });
  }
}

function isMappingEditable(status: ImportSessionStatus): boolean {
  return status === "MAPPING_REQUIRED" || status === "READY_FOR_PREVIEW";
}

function reviewState(session: ImportSessionRecord): ImportReviewState {
  switch (session.status) {
    case "READY_FOR_PREVIEW":
    case "AWAITING_APPROVAL":
      return "REVIEW";
    case "IMPORTING":
      return "EXECUTING";
    case "COMPLETED":
    case "PARTIALLY_COMPLETED":
      return "RESULT";
    case "MAPPING_REQUIRED":
      return "MAPPING_REQUIRED";
    default:
      return "STALE";
  }
}

function requireById(accounts: readonly LedgerAccountRecord[], id: string, message: string): LedgerAccountRecord {
  const account = accounts.find((candidate) => candidate.id === id);
  if (!account) throw new NotFoundError(message);
  return account;
}

function requireCategory(
  categories: readonly LedgerCategoryRecord[],
  id: string,
  kind: LedgerCategoryRecord["kind"],
): LedgerCategoryRecord {
  const category = categories.find((candidate) => candidate.id === id && candidate.kind === kind);
  if (!category) throw new NotFoundError("The selected default category is not in this workspace.");
  return category;
}

function safeFileName(name: string): string {
  return name.split(/[\\/]/).at(-1)?.trim().slice(0, 255) || "statement";
}
