CREATE TYPE "public"."agent_action_status" AS ENUM('DRAFT', 'WAITING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."agent_action_type" AS ENUM('TRANSACTION_CREATE');--> statement-breakpoint
CREATE TABLE "agent_action_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"action_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_user_id" text,
	"event" varchar(80) NOT NULL,
	"from_status" "agent_action_status",
	"to_status" "agent_action_status",
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type" "agent_action_type" NOT NULL,
	"status" "agent_action_status" DEFAULT 'DRAFT' NOT NULL,
	"initiated_by_user_id" text NOT NULL,
	"approved_by_user_id" text,
	"draft" jsonb NOT NULL,
	"result" jsonb,
	"failure_code" varchar(120),
	"failure_message" varchar(1000),
	"idempotency_key" varchar(180) NOT NULL,
	"eve_session_id" text,
	"eve_call_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "preferred_language" varchar(10) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_action_audit" ADD CONSTRAINT "agent_action_audit_action_id_agent_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."agent_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_audit" ADD CONSTRAINT "agent_action_audit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_audit" ADD CONSTRAINT "agent_action_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_initiated_by_user_id_user_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_action_audit_action_created_idx" ON "agent_action_audit" USING btree ("action_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_action_audit_workspace_created_idx" ON "agent_action_audit" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_action_audit_status_idx" ON "agent_action_audit" USING btree ("to_status");--> statement-breakpoint
CREATE INDEX "agent_actions_workspace_status_idx" ON "agent_actions" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "agent_actions_initiated_by_idx" ON "agent_actions" USING btree ("initiated_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_actions_workspace_idempotency_unique" ON "agent_actions" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_actions_eve_session_idx" ON "agent_actions" USING btree ("eve_session_id");