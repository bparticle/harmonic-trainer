CREATE TABLE "theory_rounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"spec_json" jsonb NOT NULL,
	"attempts_json" jsonb NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "theory_rounds" ADD CONSTRAINT "theory_rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "theory_rounds_user_created_idx" ON "theory_rounds" USING btree ("user_id","created_at");