import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

export const workspaceType = pgEnum("workspace_type", [
  "PERSONAL",
  "COUPLE",
  "FAMILY",
  "CUSTOM",
]);

export const workspaceRole = pgEnum("workspace_role", [
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
]);

export const workspaces = pgTable(
  "workspace",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    type: workspaceType("type").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("workspace_created_by_idx").on(table.createdByUserId),
    uniqueIndex("workspace_slug_unique").on(table.slug),
  ],
);

export const workspacePreferences = pgTable("workspace_preference", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  locale: varchar("locale", { length: 35 }).notNull().default("en-US"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
  weekStartsOn: integer("week_starts_on").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_member",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: workspaceRole("role").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_member_user_idx").on(table.userId),
  ],
);

export const workspaceInvitations = pgTable(
  "workspace_invitation",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Null means a secure, shareable link that is not email-restricted. */
    invitedEmail: varchar("invited_email", { length: 320 }),
    role: workspaceRole("role").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_invitation_token_hash_unique").on(table.tokenHash),
    uniqueIndex("workspace_invitation_code_hash_unique").on(table.codeHash),
    index("workspace_invitation_workspace_idx").on(table.workspaceId),
    check("workspace_invitation_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

/** Immutable, secret-free record of successful invitation acceptance. */
export const workspaceInvitationAudit = pgTable(
  "workspace_invitation_audit",
  {
    id: text("id").primaryKey(),
    invitationId: text("invitation_id")
      .notNull()
      .references(() => workspaceInvitations.id, { onDelete: "restrict" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    acceptedByUserId: text("accepted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    eventType: varchar("event_type", { length: 32 }).notNull().default("ACCEPTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_invitation_audit_invitation_idx").on(table.invitationId),
    index("workspace_invitation_audit_workspace_idx").on(table.workspaceId),
  ],
);
