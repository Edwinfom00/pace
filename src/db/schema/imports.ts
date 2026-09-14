import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import type {
  ImportMapping,
  ImportPreview,
  ImportResult,
  NormalizedImportRow,
  ParsedImportRow,
} from "@/modules/imports/domain";

import { users } from "./auth";
import { workspaces } from "./workspaces";

export const importSessionStatus = pgEnum("import_session_status", [
  "UPLOADED",
  "MAPPING_REQUIRED",
  "READY_FOR_PREVIEW",
  "AWAITING_APPROVAL",
  "IMPORTING",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const importFileType = pgEnum("import_file_type", ["CSV", "XLSX"]);

export const importSessions = pgTable(
  "import_session",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    initiatedByUserId: text("initiated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    status: importSessionStatus("status").notNull().default("UPLOADED"),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileType: importFileType("file_type").notNull(),
    mimeType: varchar("mime_type", { length: 160 }),
    fileChecksum: varchar("file_checksum", { length: 64 }).notNull(),
    sourceSizeBytes: integer("source_size_bytes").notNull(),
    sheetName: varchar("sheet_name", { length: 160 }),
    headers: jsonb("headers").$type<string[]>().notNull().default([]),
    parsedRows: jsonb("parsed_rows").$type<ParsedImportRow[]>(),
    stagedRows: jsonb("staged_rows").$type<NormalizedImportRow[]>(),
    mapping: jsonb("mapping").$type<ImportMapping>(),
    preview: jsonb("preview").$type<ImportPreview>(),
    result: jsonb("result").$type<ImportResult>(),
    rawDataExpiresAt: timestamp("raw_data_expires_at", { withTimezone: true }),
    failureCode: varchar("failure_code", { length: 120 }),
    failureMessage: varchar("failure_message", { length: 1_000 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("import_session_workspace_status_idx").on(table.workspaceId, table.status),
    index("import_session_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("import_session_checksum_idx").on(table.workspaceId, table.fileChecksum),
    check("import_session_source_size_check", sql`${table.sourceSizeBytes} > 0`),
  ],
);

export const importAudits = pgTable(
  "import_audit",
  {
    id: text("id").primaryKey(),
    importSessionId: text("import_session_id")
      .notNull()
      .references(() => importSessions.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    event: varchar("event", { length: 120 }).notNull(),
    fromStatus: importSessionStatus("from_status"),
    toStatus: importSessionStatus("to_status"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("import_audit_session_created_idx").on(table.importSessionId, table.createdAt),
    index("import_audit_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ],
);
