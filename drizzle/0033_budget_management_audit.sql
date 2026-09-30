CREATE TABLE "budget_management_audit" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE cascade,
  "budget_id" text NOT NULL REFERENCES "budget"("id") ON DELETE restrict,
  "actor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "action" varchar(16) NOT NULL,
  "command_fingerprint" varchar(128) NOT NULL,
  "idempotency_key" varchar(180) NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "budget_management_audit_workspace_actor_key_unique" ON "budget_management_audit" ("workspace_id", "actor_user_id", "idempotency_key");
