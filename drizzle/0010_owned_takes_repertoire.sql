-- Both tables are parked and nothing writes to them (see ROADMAP.md), so this
-- expects zero rows on every real install. The column still arrives nullable,
-- gets backfilled and is tightened only afterwards — the same shape migration
-- 0008 used for cards/sessions — so a database that somehow does hold a stray
-- row from before the record-take feature was removed takes this migration
-- without failing outright.
ALTER TABLE "repertoire" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "takes" SET "user_id" = '00000000-0000-4000-8000-000000000001' WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "repertoire" SET "user_id" = '00000000-0000-4000-8000-000000000001' WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "repertoire" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "takes" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "repertoire" ADD CONSTRAINT "repertoire_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repertoire_user_idx" ON "repertoire" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "takes_user_idx" ON "takes" USING btree ("user_id");
