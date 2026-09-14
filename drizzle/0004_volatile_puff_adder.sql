CREATE TYPE "public"."budget_frequency" AS ENUM('MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."budget_scope" AS ENUM('OVERALL', 'CATEGORY');--> statement-breakpoint
CREATE TYPE "public"."budget_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."savings_goal_status" AS ENUM('ACTIVE', 'COMPLETED', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
ALTER TYPE "public"."agent_action_type" ADD VALUE 'BUDGET_CREATE';--> statement-breakpoint
ALTER TYPE "public"."agent_action_type" ADD VALUE 'BUDGET_UPDATE';--> statement-breakpoint
ALTER TYPE "public"."agent_action_type" ADD VALUE 'SAVINGS_GOAL_CREATE';--> statement-breakpoint
ALTER TYPE "public"."agent_action_type" ADD VALUE 'SAVINGS_GOAL_UPDATE';--> statement-breakpoint
CREATE TABLE "budget" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"scope" "budget_scope" NOT NULL,
	"category_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"frequency" "budget_frequency" DEFAULT 'MONTHLY' NOT NULL,
	"status" "budget_status" DEFAULT 'ACTIVE' NOT NULL,
	"starts_on" timestamp with time zone NOT NULL,
	"ends_on" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_by_agent_action_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_amount_positive_check" CHECK ("budget"."amount_minor" > 0),
	CONSTRAINT "budget_currency_check" CHECK ("budget"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "budget_scope_shape_check" CHECK ((
        "budget"."scope" = 'OVERALL' AND "budget"."category_id" IS NULL
      ) OR (
        "budget"."scope" = 'CATEGORY' AND "budget"."category_id" IS NOT NULL
      )),
	CONSTRAINT "budget_schedule_check" CHECK ("budget"."ends_on" IS NULL OR "budget"."ends_on" >= "budget"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "savings_goal" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" varchar(160) NOT NULL,
	"target_amount_minor" bigint NOT NULL,
	"current_saved_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) NOT NULL,
	"target_date" timestamp with time zone,
	"status" "savings_goal_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_by_agent_action_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_goal_target_positive_check" CHECK ("savings_goal"."target_amount_minor" > 0),
	CONSTRAINT "savings_goal_saved_nonnegative_check" CHECK ("savings_goal"."current_saved_minor" >= 0),
	CONSTRAINT "savings_goal_currency_check" CHECK ("savings_goal"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_category_id_ledger_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_workspace_status_idx" ON "budget" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "budget_workspace_category_idx" ON "budget" USING btree ("workspace_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_workspace_agent_action_unique" ON "budget" USING btree ("workspace_id","created_by_agent_action_id") WHERE "budget"."created_by_agent_action_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "savings_goal_workspace_status_idx" ON "savings_goal" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_goal_workspace_agent_action_unique" ON "savings_goal" USING btree ("workspace_id","created_by_agent_action_id") WHERE "savings_goal"."created_by_agent_action_id" IS NOT NULL;