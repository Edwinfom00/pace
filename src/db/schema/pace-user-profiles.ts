import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

export const onboardingStatus = pgEnum("onboarding_status", [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
]);

export const onboardingStartingMethod = pgEnum("onboarding_starting_method", [
  "MANUAL",
  "IMPORT_STATEMENT",
  "BANK_CONNECTION",
  "MOBILE_MONEY",
]);


export const paceUserProfiles = pgTable(
  "pace_user_profile",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    onboardingStatus: onboardingStatus("onboarding_status")
      .notNull()
      .default("NOT_STARTED"),
    onboardingStep: integer("onboarding_step"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    countryCode: text("country_code"),
    currency: text("currency"),
    timezone: text("timezone"),
    onboardingWorkspaceId: text("onboarding_workspace_id"),
    onboardingSkippedSteps: integer("onboarding_skipped_steps")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    onboardingInvitationId: text("onboarding_invitation_id"),
    onboardingStartingMethod: onboardingStartingMethod("onboarding_starting_method"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "pace_user_profile_onboarding_state_check",
      sql`
        (
          ${table.onboardingStatus} = 'NOT_STARTED'
          AND ${table.onboardingStep} IS NULL
          AND ${table.onboardingCompletedAt} IS NULL
        )
        OR (
          ${table.onboardingStatus} = 'IN_PROGRESS'
          AND (${table.onboardingStep} BETWEEN 1 AND 5 OR ${table.onboardingStep} IS NULL)
          AND ${table.onboardingCompletedAt} IS NULL
        )
        OR (
          ${table.onboardingStatus} = 'COMPLETED'
          AND ${table.onboardingStep} IS NULL
          AND ${table.onboardingCompletedAt} IS NOT NULL
        )
      `,
    ),
  ],
);
