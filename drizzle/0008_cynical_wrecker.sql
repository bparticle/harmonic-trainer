CREATE TABLE "user_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"color_map_json" jsonb NOT NULL,
	"wheel_config_json" jsonb NOT NULL,
	"midi_device" text,
	"prefs_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charts" DROP CONSTRAINT "charts_slug_unique";--> statement-breakpoint
-- Existing rows belong to the original local player. Columns arrive nullable,
-- are backfilled, and are tightened only afterwards so a live database can take
-- this migration without losing any practice history.
ALTER TABLE "cards" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "cards" SET "user_id" = '00000000-0000-4000-8000-000000000001' WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "sessions" SET "user_id" = '00000000-0000-4000-8000-000000000001' WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "users"
SET "email" = 'owner@local.invalid', "password_hash" = 'disabled'
WHERE "id" = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Preserve the owner's current room measurements and ladder position. New
-- accounts copy the same singleton lazily on first use.
INSERT INTO "user_prefs" ("user_id", "color_map_json", "wheel_config_json", "midi_device", "prefs_json", "updated_at")
SELECT '00000000-0000-4000-8000-000000000001', "color_map_json", "wheel_config_json", "midi_device", "prefs_json", "updated_at"
FROM "settings" WHERE "id" = 1
ON CONFLICT ("user_id") DO NOTHING;--> statement-breakpoint
CREATE INDEX "cards_user_idx" ON "cards" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "charts_user_slug_unique" ON "charts" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "charts_shared_slug_unique" ON "charts" USING btree ("slug") WHERE "charts"."user_id" is null;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
