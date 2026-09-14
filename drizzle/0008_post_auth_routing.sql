CREATE TYPE "public"."onboarding_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "pace_user_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"onboarding_status" "onboarding_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"onboarding_step" integer,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pace_user_profile_onboarding_state_check" CHECK (
        (
          "pace_user_profile"."onboarding_status" = 'NOT_STARTED'
          AND "pace_user_profile"."onboarding_step" IS NULL
          AND "pace_user_profile"."onboarding_completed_at" IS NULL
        )
        OR (
          "pace_user_profile"."onboarding_status" = 'IN_PROGRESS'
          AND "pace_user_profile"."onboarding_step" BETWEEN 1 AND 5
          AND "pace_user_profile"."onboarding_completed_at" IS NULL
        )
        OR (
          "pace_user_profile"."onboarding_status" = 'COMPLETED'
          AND "pace_user_profile"."onboarding_step" IS NULL
          AND "pace_user_profile"."onboarding_completed_at" IS NOT NULL
        )
      )
);
--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "slug" varchar(140);--> statement-breakpoint
UPDATE "workspace"
SET "slug" = 'workspace-' || lower(regexp_replace("id", '[^a-zA-Z0-9]', '', 'g'))
WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "workspace" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pace_user_profile" ADD CONSTRAINT "pace_user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_slug_unique" ON "workspace" USING btree ("slug");--> statement-breakpoint
INSERT INTO "pace_user_profile" (
  "user_id",
  "onboarding_status",
  "onboarding_step",
  "onboarding_completed_at",
  "created_at",
  "updated_at"
)
SELECT
  "user"."id",
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "workspace_member"
      WHERE "workspace_member"."user_id" = "user"."id"
    ) THEN 'COMPLETED'::"onboarding_status"
    ELSE 'NOT_STARTED'::"onboarding_status"
  END,
  NULL,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "workspace_member"
      WHERE "workspace_member"."user_id" = "user"."id"
    ) THEN NOW()
    ELSE NULL
  END,
  NOW(),
  NOW()
FROM "user"
ON CONFLICT ("user_id") DO NOTHING;
