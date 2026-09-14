import { and, asc, eq, inArray, lte } from "drizzle-orm";

import { db } from "@/db/client";
import { importAudits, importSessions } from "@/db/schema";

import type {
  ImportAuditRecord,
  ImportMapping,
  ImportPreview,
  ImportResult,
  ImportSessionRecord,
  ImportSessionStatus,
  NormalizedImportRow,
  ParsedImportRow,
} from "../domain";

export interface CreateImportSessionInput {
  id: string;
  workspaceId: string;
  initiatedByUserId: string;
  fileName: string;
  fileType: ImportSessionRecord["fileType"];
  mimeType: string | null;
  fileChecksum: string;
  sourceSizeBytes: number;
  sheetName: string | null;
  headers: string[];
  parsedRows: ParsedImportRow[];
  rawDataExpiresAt: Date;
}

export interface PrepareImportSessionInput {
  workspaceId: string;
  importSessionId: string;
  mapping: ImportMapping;
  stagedRows: NormalizedImportRow[];
  preview: ImportPreview;
}

export interface TransitionImportSessionInput {
  workspaceId: string;
  importSessionId: string;
  from: readonly ImportSessionStatus[];
  to: ImportSessionStatus;
  approvedByUserId?: string | null;
  result?: ImportResult | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  completedAt?: Date | null;
  clearRawData?: boolean;
}

export interface CreateImportAuditInput {
  id: string;
  importSessionId: string;
  workspaceId: string;
  actorUserId: string | null;
  event: string;
  fromStatus: ImportSessionStatus | null;
  toStatus: ImportSessionStatus | null;
  metadata?: Record<string, unknown>;
}

export interface ImportRepository {
  createSession(input: CreateImportSessionInput): Promise<ImportSessionRecord>;
  findSession(workspaceId: string, importSessionId: string): Promise<ImportSessionRecord | null>;
  listExpiredSessions(now: Date): Promise<ImportSessionRecord[]>;
  prepareSession(input: PrepareImportSessionInput): Promise<ImportSessionRecord | null>;
  transitionSession(input: TransitionImportSessionInput): Promise<ImportSessionRecord | null>;
  createAudit(input: CreateImportAuditInput): Promise<ImportAuditRecord>;
  listAudit(workspaceId: string, importSessionId: string): Promise<ImportAuditRecord[]>;
}

export class DatabaseImportRepository implements ImportRepository {
  async createSession(input: CreateImportSessionInput): Promise<ImportSessionRecord> {
    const [record] = await db
      .insert(importSessions)
      .values({ ...input, status: "UPLOADED" })
      .returning();
    if (!record) throw new Error("Failed to create import session.");
    return record;
  }

  async findSession(workspaceId: string, importSessionId: string): Promise<ImportSessionRecord | null> {
    const [record] = await db
      .select()
      .from(importSessions)
      .where(and(eq(importSessions.workspaceId, workspaceId), eq(importSessions.id, importSessionId)))
      .limit(1);
    return record ?? null;
  }

  async listExpiredSessions(now: Date): Promise<ImportSessionRecord[]> {
    return db
      .select()
      .from(importSessions)
      .where(
        and(
          lte(importSessions.rawDataExpiresAt, now),
          inArray(importSessions.status, [
            "UPLOADED",
            "MAPPING_REQUIRED",
            "READY_FOR_PREVIEW",
            "AWAITING_APPROVAL",
            "PARTIALLY_COMPLETED",
            "FAILED",
          ]),
        ),
      );
  }

  async prepareSession(input: PrepareImportSessionInput): Promise<ImportSessionRecord | null> {
    const [record] = await db
      .update(importSessions)
      .set({
        mapping: input.mapping,
        stagedRows: input.stagedRows,
        preview: input.preview,
        status: "READY_FOR_PREVIEW",
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(importSessions.workspaceId, input.workspaceId),
          eq(importSessions.id, input.importSessionId),
          inArray(importSessions.status, ["MAPPING_REQUIRED", "READY_FOR_PREVIEW", "PARTIALLY_COMPLETED"]),
        ),
      )
      .returning();
    return record ?? null;
  }

  async transitionSession(input: TransitionImportSessionInput): Promise<ImportSessionRecord | null> {
    const values: {
      status: ImportSessionStatus;
      updatedAt: Date;
      approvedByUserId?: string | null;
      result?: ImportResult | null;
      failureCode?: string | null;
      failureMessage?: string | null;
      completedAt?: Date | null;
      parsedRows?: null;
      stagedRows?: null;
      rawDataExpiresAt?: null;
    } = { status: input.to, updatedAt: new Date() };
    if (input.approvedByUserId !== undefined) values.approvedByUserId = input.approvedByUserId;
    if (input.result !== undefined) values.result = input.result;
    if (input.failureCode !== undefined) values.failureCode = input.failureCode;
    if (input.failureMessage !== undefined) values.failureMessage = input.failureMessage;
    if (input.completedAt !== undefined) values.completedAt = input.completedAt;
    if (input.clearRawData) {
      values.parsedRows = null;
      values.stagedRows = null;
      values.rawDataExpiresAt = null;
    }
    const [record] = await db
      .update(importSessions)
      .set(values)
      .where(
        and(
          eq(importSessions.workspaceId, input.workspaceId),
          eq(importSessions.id, input.importSessionId),
          inArray(importSessions.status, [...input.from]),
        ),
      )
      .returning();
    return record ?? null;
  }

  async createAudit(input: CreateImportAuditInput): Promise<ImportAuditRecord> {
    const [record] = await db
      .insert(importAudits)
      .values({ ...input, metadata: input.metadata ?? {} })
      .returning();
    if (!record) throw new Error("Failed to create import audit record.");
    return record;
  }

  async listAudit(workspaceId: string, importSessionId: string): Promise<ImportAuditRecord[]> {
    return db
      .select()
      .from(importAudits)
      .where(and(eq(importAudits.workspaceId, workspaceId), eq(importAudits.importSessionId, importSessionId)))
      .orderBy(asc(importAudits.createdAt), asc(importAudits.id));
  }
}
