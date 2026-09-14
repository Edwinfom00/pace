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

/**
 * Pace-owned product state keyed by Better Auth's immutable user ID.
 * Authentication identity and credentials remain owned by Better Auth.
 */
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
    /** ISO 3166-1 alpha-2 value chosen during Pace onboarding. */
    countryCode: text("country_code"),
    /** ISO 4217 value chosen during Pace onboarding. */
    currency: text("currency"),
    /** Canonical IANA timezone chosen during Pace onboarding. */
    timezone: text("timezone"),
    /** Reserved before creation so retries can only ever use one workspace id. */
    onboardingWorkspaceId: text("onboarding_workspace_id"),
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
          AND ${table.onboardingStep} BETWEEN 1 AND 5
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
