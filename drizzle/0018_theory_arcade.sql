CREATE TABLE "theory_rounds" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "spec_json" jsonb NOT NULL,
  "attempts_json" jsonb NOT NULL,
  "result_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "theory_rounds_user_created_idx" ON "theory_rounds" ("user_id", "created_at");
