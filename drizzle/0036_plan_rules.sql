CREATE TABLE "plan_rule" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "name" varchar(160) NOT NULL,
  "status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "priority" integer NOT NULL,
  "trigger" varchar(32) NOT NULL,
  "conditions" jsonb NOT NULL,
  "action" jsonb NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "origin" varchar(16) DEFAULT 'USER' NOT NULL,
  "created_by_user_id" text NOT NULL,
  "updated_by_user_id" text NOT NULL,
  "created_by_agent_action_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plan_rule_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
  CONSTRAINT "plan_rule_origin_check" CHECK ("origin" IN ('USER', 'AGENT')),
  CONSTRAINT "plan_rule_trigger_check" CHECK ("trigger" IN ('TRANSACTION_CREATED')),
  CONSTRAINT "plan_rule_priority_check" CHECK ("priority" BETWEEN 1 AND 10000),
  CONSTRAINT "plan_rule_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "plan_rule_archived_disabled_check" CHECK ("status" = 'ACTIVE' OR "enabled" = false)
);
--> statement-breakpoint
ALTER TABLE "plan_rule" ADD CONSTRAINT "plan_rule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "plan_rule" ADD CONSTRAINT "plan_rule_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "plan_rule" ADD CONSTRAINT "plan_rule_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX "plan_rule_workspace_status_priority_idx" ON "plan_rule" USING btree ("workspace_id", "status", "priority");
--> statement-breakpoint
CREATE UNIQUE INDEX "plan_rule_workspace_agent_action_unique" ON "plan_rule" USING btree ("workspace_id", "created_by_agent_action_id") WHERE "created_by_agent_action_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "plan_rule_management_audit" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "rule_id" text NOT NULL,
  "actor_user_id" text NOT NULL,
  "action" varchar(16) NOT NULL,
  "command_fingerprint" varchar(128) NOT NULL,
  "idempotency_key" varchar(180) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plan_rule_management_audit_action_check" CHECK ("action" IN ('CREATE', 'UPDATE', 'ENABLE', 'DISABLE', 'ARCHIVE'))
);
--> statement-breakpoint
ALTER TABLE "plan_rule_management_audit" ADD CONSTRAINT "plan_rule_management_audit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "plan_rule_management_audit" ADD CONSTRAINT "plan_rule_management_audit_rule_id_plan_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."plan_rule"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "plan_rule_management_audit" ADD CONSTRAINT "plan_rule_management_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE UNIQUE INDEX "plan_rule_management_audit_workspace_actor_key_unique" ON "plan_rule_management_audit" USING btree ("workspace_id", "actor_user_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "plan_rule_management_audit_rule_idx" ON "plan_rule_management_audit" USING btree ("workspace_id", "rule_id");
--> statement-breakpoint
CREATE TABLE "plan_rule_execution" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "rule_id" text NOT NULL,
  "rule_revision" integer NOT NULL,
  "transaction_id" text NOT NULL,
  "trigger" varchar(32) NOT NULL,
  "action_type" varchar(32) NOT NULL,
  "outcome" varchar(24) NOT NULL,
  "reason" varchar(64),
  "actor_user_id" text NOT NULL,
  "explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plan_rule_execution_outcome_check" CHECK ("outcome" IN ('PENDING', 'APPLIED', 'SKIPPED', 'SHADOWED', 'FAILED')),
  CONSTRAINT "plan_rule_execution_action_type_check" CHECK ("action_type" IN ('ASSIGN_CATEGORY', 'ROUTE_FOR_REVIEW'))
);
--> statement-breakpoint
ALTER TABLE "plan_rule_execution" ADD CONSTRAINT "plan_rule_execution_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "plan_rule_execution" ADD CONSTRAINT "plan_rule_execution_rule_id_plan_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."plan_rule"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "plan_rule_execution" ADD CONSTRAINT "plan_rule_execution_transaction_id_ledger_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "plan_rule_execution" ADD CONSTRAINT "plan_rule_execution_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE UNIQUE INDEX "plan_rule_execution_rule_revision_transaction_unique" ON "plan_rule_execution" USING btree ("workspace_id", "rule_id", "rule_revision", "transaction_id");
--> statement-breakpoint
CREATE INDEX "plan_rule_execution_workspace_transaction_idx" ON "plan_rule_execution" USING btree ("workspace_id", "transaction_id");
