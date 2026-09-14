CREATE TYPE "public"."import_file_type" AS ENUM('CSV', 'XLSX');--> statement-breakpoint
CREATE TYPE "public"."import_session_status" AS ENUM('UPLOADED', 'MAPPING_REQUIRED', 'READY_FOR_PREVIEW', 'AWAITING_APPROVAL', 'IMPORTING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "import_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"import_session_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_user_id" text,
	"event" varchar(120) NOT NULL,
	"from_status" "import_session_status",
	"to_status" "import_session_status",
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_session" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"initiated_by_user_id" text NOT NULL,
	"approved_by_user_id" text,
	"status" "import_session_status" DEFAULT 'UPLOADED' NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_type" "import_file_type" NOT NULL,
	"mime_type" varchar(160),
	"file_checksum" varchar(64) NOT NULL,
	"source_size_bytes" integer NOT NULL,
	"sheet_name" varchar(160),
	"headers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parsed_rows" jsonb,
	"staged_rows" jsonb,
	"mapping" jsonb,
	"preview" jsonb,
	"result" jsonb,
	"raw_data_expires_at" timestamp with time zone,
	"failure_code" varchar(120),
	"failure_message" varchar(1000),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_audit" ADD CONSTRAINT "import_audit_import_session_id_import_session_id_fk" FOREIGN KEY ("import_session_id") REFERENCES "public"."import_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_audit" ADD CONSTRAINT "import_audit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_audit" ADD CONSTRAINT "import_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_session" ADD CONSTRAINT "import_session_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_session" ADD CONSTRAINT "import_session_initiated_by_user_id_user_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_session" ADD CONSTRAINT "import_session_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_audit_session_created_idx" ON "import_audit" USING btree ("import_session_id","created_at");--> statement-breakpoint
CREATE INDEX "import_audit_workspace_created_idx" ON "import_audit" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "import_session_workspace_status_idx" ON "import_session" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "import_session_workspace_created_idx" ON "import_session" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "import_session_checksum_idx" ON "import_session" USING btree ("workspace_id","file_checksum");