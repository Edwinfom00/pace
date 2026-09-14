CREATE TYPE "public"."insight_severity" AS ENUM('INFO', 'WARNING', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."insight_source" AS ENUM('MONEY_ENGINE');--> statement-breakpoint
CREATE TYPE "public"."insight_status" AS ENUM('ACTIVE', 'READ', 'DISMISSED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."insight_type" AS ENUM('CATEGORY_SPIKE', 'CATEGORY_DROP', 'MERCHANT_SPIKE', 'SPENDING_PACE_HIGH', 'SPENDING_PACE_LOW', 'BUDGET_AT_RISK', 'BUDGET_EXCEEDED', 'RECURRING_PRICE_INCREASE', 'NEW_RECURRING_PAYMENT', 'POTENTIAL_SAVINGS', 'GOAL_OFF_TRACK', 'GOAL_ON_TRACK', 'UNUSUAL_TRANSACTION', 'MONTH_OVER_MONTH_CHANGE');--> statement-breakpoint
CREATE TYPE "public"."member_notification_status" AS ENUM('UNREAD', 'READ');--> statement-breakpoint
CREATE TYPE "public"."notification_cadence" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');--> statement-breakpoint
CREATE TABLE "insight" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type" "insight_type" NOT NULL,
	"severity" "insight_severity" NOT NULL,
	"data" jsonb NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"status" "insight_status" DEFAULT 'ACTIVE' NOT NULL,
	"source" "insight_source" NOT NULL,
	"fingerprint" varchar(128) NOT NULL,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_notification_preference" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"daily_enabled" boolean DEFAULT true NOT NULL,
	"weekly_enabled" boolean DEFAULT true NOT NULL,
	"monthly_enabled" boolean DEFAULT true NOT NULL,
	"minimum_severity" "insight_severity" DEFAULT 'INFO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_notification_preference_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "member_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"insight_id" text,
	"cadence" "notification_cadence" NOT NULL,
	"language" varchar(10) NOT NULL,
	"payload" jsonb NOT NULL,
	"fingerprint" varchar(128) NOT NULL,
	"status" "member_notification_status" DEFAULT 'UNREAD' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insight" ADD CONSTRAINT "insight_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_notification_preference" ADD CONSTRAINT "member_notification_preference_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_notification_preference" ADD CONSTRAINT "member_notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_notification" ADD CONSTRAINT "member_notification_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_notification" ADD CONSTRAINT "member_notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_notification" ADD CONSTRAINT "member_notification_insight_id_insight_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insight"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "insight_workspace_fingerprint_unique" ON "insight" USING btree ("workspace_id","fingerprint");--> statement-breakpoint
CREATE INDEX "insight_workspace_status_idx" ON "insight" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "insight_workspace_period_idx" ON "insight" USING btree ("workspace_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "member_notification_preference_user_idx" ON "member_notification_preference" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_notification_member_fingerprint_unique" ON "member_notification" USING btree ("workspace_id","user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "member_notification_member_status_idx" ON "member_notification" USING btree ("workspace_id","user_id","status");