CREATE TABLE "workspace_invitation_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"invitation_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"accepted_by_user_id" text NOT NULL,
	"event_type" varchar(32) DEFAULT 'ACCEPTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_invitation_audit" ADD CONSTRAINT "workspace_invitation_audit_invitation_id_workspace_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."workspace_invitation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation_audit" ADD CONSTRAINT "workspace_invitation_audit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation_audit" ADD CONSTRAINT "workspace_invitation_audit_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_invitation_audit_invitation_idx" ON "workspace_invitation_audit" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "workspace_invitation_audit_workspace_idx" ON "workspace_invitation_audit" USING btree ("workspace_id");