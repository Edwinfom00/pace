import type {
  ImportAuditRecord,
  ImportSessionRecord,
  ImportSessionStatus,
} from "@/modules/imports/domain";
import type {
  CreateImportAuditInput,
  CreateImportSessionInput,
  ImportRepository,
  PrepareImportSessionInput,
  TransitionImportSessionInput,
} from "@/modules/imports/repositories/import-repository";

export class InMemoryImportRepository implements ImportRepository {
  private readonly sessions = new Map<string, ImportSessionRecord>();
  private readonly audits = new Map<string, ImportAuditRecord>();

  async createSession(input: CreateImportSessionInput): Promise<ImportSessionRecord> {
    const now = new Date();
    const session: ImportSessionRecord = {
      ...input,
      approvedByUserId: null,
      status: "UPLOADED",
      parsedRows: input.parsedRows,
      stagedRows: null,
      mapping: null,
      preview: null,
      result: null,
      failureCode: null,
      failureMessage: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findSession(workspaceId: string, importSessionId: string): Promise<ImportSessionRecord | null> {
    const session = this.sessions.get(importSessionId);
    return session?.workspaceId === workspaceId ? session : null;
  }

  async listExpiredSessions(now: Date): Promise<ImportSessionRecord[]> {
    return [...this.sessions.values()].filter((session) =>
      session.rawDataExpiresAt !== null &&
      session.rawDataExpiresAt <= now &&
      ["UPLOADED", "MAPPING_REQUIRED", "READY_FOR_PREVIEW", "AWAITING_APPROVAL", "PARTIALLY_COMPLETED", "FAILED"].includes(session.status),
    );
  }

  async prepareSession(input: PrepareImportSessionInput): Promise<ImportSessionRecord | null> {
    const current = await this.findSession(input.workspaceId, input.importSessionId);
    if (
      !current ||
      (current.status !== "MAPPING_REQUIRED" &&
        current.status !== "READY_FOR_PREVIEW" &&
        current.status !== "PARTIALLY_COMPLETED")
    ) return null;
    const session: ImportSessionRecord = {
      ...current,
      mapping: input.mapping,
      stagedRows: input.stagedRows,
      preview: input.preview,
      status: "READY_FOR_PREVIEW",
      failureCode: null,
      failureMessage: null,
      updatedAt: new Date(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async transitionSession(input: TransitionImportSessionInput): Promise<ImportSessionRecord | null> {
    const current = await this.findSession(input.workspaceId, input.importSessionId);
    if (!current || !input.from.includes(current.status)) return null;
    const session: ImportSessionRecord = {
      ...current,
      status: input.to,
      approvedByUserId: input.approvedByUserId === undefined ? current.approvedByUserId : input.approvedByUserId,
      result: input.result === undefined ? current.result : input.result,
      failureCode: input.failureCode === undefined ? current.failureCode : input.failureCode,
      failureMessage: input.failureMessage === undefined ? current.failureMessage : input.failureMessage,
      completedAt: input.completedAt === undefined ? current.completedAt : input.completedAt,
      parsedRows: input.clearRawData ? null : current.parsedRows,
      stagedRows: input.clearRawData ? null : current.stagedRows,
      rawDataExpiresAt: input.clearRawData ? null : current.rawDataExpiresAt,
      updatedAt: new Date(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async createAudit(input: CreateImportAuditInput): Promise<ImportAuditRecord> {
    const record: ImportAuditRecord = { ...input, metadata: input.metadata ?? {}, createdAt: new Date() };
    this.audits.set(record.id, record);
    return record;
  }

  async listAudit(workspaceId: string, importSessionId: string): Promise<ImportAuditRecord[]> {
    return [...this.audits.values()].filter(
      (record) => record.workspaceId === workspaceId && record.importSessionId === importSessionId,
    );
  }

  forceStatus(importSessionId: string, status: ImportSessionStatus): void {
    const current = this.sessions.get(importSessionId);
    if (current) this.sessions.set(importSessionId, { ...current, status, updatedAt: new Date() });
  }

  expireRawData(importSessionId: string): void {
    const current = this.sessions.get(importSessionId);
    if (current) this.sessions.set(importSessionId, { ...current, rawDataExpiresAt: new Date(0), updatedAt: new Date() });
  }
}
