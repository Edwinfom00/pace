CREATE TABLE "savings_goal_contribution" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "goal_id" text NOT NULL,
  "kind" varchar(16) NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" varchar(3) NOT NULL,
  "effective_at" timestamp with time zone NOT NULL,
  "note" varchar(500),
  "reverses_contribution_id" text,
  "actor_user_id" text NOT NULL,
  "idempotency_key" varchar(180) NOT NULL,
  "command_fingerprint" varchar(128) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "savings_goal_contribution_kind_check" CHECK ("kind" IN ('CONTRIBUTION', 'REVERSAL')),
  CONSTRAINT "savings_goal_contribution_amount_positive_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "savings_goal_contribution_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "savings_goal_contribution" ADD CONSTRAINT "savings_goal_contribution_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "savings_goal_contribution" ADD CONSTRAINT "savings_goal_contribution_goal_id_savings_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."savings_goal"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "savings_goal_contribution" ADD CONSTRAINT "savings_goal_contribution_reverses_contribution_id_fk" FOREIGN KEY ("reverses_contribution_id") REFERENCES "public"."savings_goal_contribution"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "savings_goal_contribution" ADD CONSTRAINT "savings_goal_contribution_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX "savings_goal_contribution_goal_effective_idx" ON "savings_goal_contribution" USING btree ("workspace_id", "goal_id", "effective_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "savings_goal_contribution_workspace_actor_key_unique" ON "savings_goal_contribution" USING btree ("workspace_id", "actor_user_id", "idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "savings_goal_contribution_reversal_unique" ON "savings_goal_contribution" USING btree ("reverses_contribution_id") WHERE "reverses_contribution_id" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "savings_goal_contribution" ("id", "workspace_id", "goal_id", "kind", "amount_minor", "currency", "effective_at", "note", "actor_user_id", "idempotency_key", "command_fingerprint", "created_at")
SELECT md5('m5-opening:' || id), workspace_id, id, 'CONTRIBUTION', current_saved_minor, currency, created_at, 'Opening saved amount', created_by_user_id, 'm5-opening:' || id, 'm5-opening', created_at
FROM "savings_goal" WHERE current_saved_minor > 0;
