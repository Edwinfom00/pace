ALTER TABLE "pace_user_profile" DROP CONSTRAINT "pace_user_profile_onboarding_state_check";--> statement-breakpoint
ALTER TABLE "pace_user_profile" ADD CONSTRAINT "pace_user_profile_onboarding_state_check" CHECK (
  (
    "pace_user_profile"."onboarding_status" = 'NOT_STARTED'
    AND "pace_user_profile"."onboarding_step" IS NULL
    AND "pace_user_profile"."onboarding_completed_at" IS NULL
  )
  OR (
    "pace_user_profile"."onboarding_status" = 'IN_PROGRESS'
    AND ("pace_user_profile"."onboarding_step" BETWEEN 1 AND 5 OR "pace_user_profile"."onboarding_step" IS NULL)
    AND "pace_user_profile"."onboarding_completed_at" IS NULL
  )
  OR (
    "pace_user_profile"."onboarding_status" = 'COMPLETED'
    AND "pace_user_profile"."onboarding_step" IS NULL
    AND "pace_user_profile"."onboarding_completed_at" IS NOT NULL
  )
);
