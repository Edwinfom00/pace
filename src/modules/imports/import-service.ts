import { randomUUID } from "node:crypto";

import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
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
  ImportMapping,
  ImportMappingDraft,
  ImportResult,
  ImportSessionRecord,
  ImportSessionStatus,
  NormalizedImportRow,
} from "./domain";
import { detectImportMapping, validateMappingAgainstParsedFile } from "./mapping";
import { normalizeImportRows } from "./normalization";
import { parseImportUpload, type ImportFileInput } from "./parsers";
import { buildImportPreview } from "./preview";
import type { ImportRepository } from "./repositories/import-repository";

const RAW_DATA_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface ImportSessionView {
  session: ImportSessionRecord;
  mappingDraft: ImportMappingDraft;
  previewRows: NormalizedImportRow[];
}

export class ImportService {
  constructor(
    private readonly imports: ImportRepository,
    private readonly ledger: LedgerService,
    private readonly ledgerRecords: Pick<LedgerRepository, "listTransactions" | "findTransactionByFingerprint">,
    private readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">,
    private readonly inbox: Pick<FinancialInboxService, "ingestTransaction">,
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
    const resolvedMapping = await this.validateMappingContext(actor, workspaceId, mapping);
    const normalized = normalizeImportRows(session.parsedRows, resolvedMapping, {
      workspaceId,
      fallbackCurrency: resolvedMapping.fallbackCurrency,
      timezone: context.preferences.timezone,
    });
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
    });
    if (!prepared) throw new ConflictError("This import changed before its preview could be prepared.");
    await this.audit(prepared, actor.userId, "PREVIEW_PREPARED", session.status, "READY_FOR_PREVIEW", {
      parsedRowCount: preview.parsedRowCount,
      acceptedRowCount: preview.acceptedRowCount,
      invalidRowCount: preview.invalidRowCount,
      exactDuplicateRowCount: preview.exactDuplicateRowCount,
    });
    return { session: prepared, mappingDraft: detectImportMapping(prepared.headers), previewRows: deduplicated.slice(0, 100) };
  }

  async requestApproval(
    actor: AuthenticatedActor,
    workspaceId: string,
    importSessionId: string,
  ): Promise<ImportSessionRecord> {
    await this.requireManageContext(actor, workspaceId);
    const session = await this.requireInitiatedSession(actor, workspaceId, importSessionId);
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

    if (session.status !== "IMPORTING") {
      const importing = await this.imports.transitionSession({
        workspaceId,
        importSessionId,
        from: ["AWAITING_APPROVAL", "PARTIALLY_COMPLETED"],
        to: "IMPORTING",
        approvedByUserId: actor.userId,
      });
      if (!importing) throw new ConflictError("This import changed before it could begin.");
      await this.audit(importing, actor.userId, "IMPORT_STARTED", session.status, "IMPORTING");
      session = importing;
    }

    let importedRowCount = 0;
    let skippedExactDuplicateRowCount = preview.exactDuplicateRowCount;
    let failedRowCount = 0;
    let deferredPipelineCount = 0;
    for (const row of stagedRows) {
      if (row.disposition !== "ACCEPT") continue;
      const transaction = await this.findOrCreateLedgerTransaction(actor, workspaceId, session, row);
      if (!transaction) {
        failedRowCount += 1;
        continue;
      }
      if (transaction.source.importSessionId === session.id) {
        importedRowCount += 1;
      } else {
        skippedExactDuplicateRowCount += 1;
        continue;
      }
      try {
        await this.inbox.ingestTransaction(actor, workspaceId, { transaction });
      } catch (error) {
        deferredPipelineCount += 1;
        console.error("Imported transaction classification deferred", error);
      }
    }
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
      completedAt: failedRowCount ? null : completedAt.toISOString(),
    };
    const finalStatus: ImportSessionStatus = failedRowCount ? "PARTIALLY_COMPLETED" : "COMPLETED";
    const completed = await this.imports.transitionSession({
      workspaceId,
      importSessionId,
      from: ["IMPORTING"],
      to: finalStatus,
      result,
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
        accountId: session.mapping!.accountId,
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
          transferAccountId: session.mapping!.transferAccountId,
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
  ): Promise<ImportMapping> {
    const [accounts, categories] = await Promise.all([
      this.ledger.listAccounts(actor, workspaceId),
      this.ledger.listCategories(actor, workspaceId),
    ]);
    const account = requireById(accounts, mapping.accountId, "The selected import account is not in this workspace.");
    requireCategory(categories, mapping.defaultExpenseCategoryId, "EXPENSE");
    requireCategory(categories, mapping.defaultIncomeCategoryId, "INCOME");
    if (mapping.transferAccountId) {
      const destination = requireById(accounts, mapping.transferAccountId, "The transfer destination account is not in this workspace.");
      if (destination.id === account.id) throw new ConflictError("A transfer destination must be a different account.");
      if (destination.currency !== account.currency) throw new ConflictError("Imported transfers require two accounts with the same currency.");
    }
    if (mapping.fallbackCurrency && mapping.fallbackCurrency.toUpperCase() !== account.currency) {
      throw new ConflictError("The fallback currency must match the selected Pace account.");
    }
    return { ...mapping, fallbackCurrency: account.currency };
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
