-- M9. The record: a user to own it, the play-along log, and the shelf.
--
-- The generated version of this migration creates the four tables and adds
-- `charts.user_id`, and stops there — which would leave a `users` table with no
-- rows for every NOT NULL foreign key to point at, and every chart already
-- typed in reading as built-in and shared. Both are filled in below.

CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"chart_slug" text NOT NULL,
	"tier" text NOT NULL,
	"won_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"pc" smallint NOT NULL,
	"key_center" text NOT NULL,
	"run_id" uuid,
	CONSTRAINT "badges_user_chart_tier" UNIQUE("user_id","chart_slug","tier")
);
--> statement-breakpoint
CREATE TABLE "chord_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"bar" integer NOT NULL,
	"chord" text NOT NULL,
	"numeral" text NOT NULL,
	"local_key" text NOT NULL,
	"landing" text NOT NULL,
	"found" smallint NOT NULL,
	"needed" smallint NOT NULL,
	"notes_chord" smallint NOT NULL,
	"notes_colour" smallint NOT NULL,
	"notes_outside" smallint NOT NULL,
	"at_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"chart_slug" text NOT NULL,
	"chart_id" uuid,
	"key_center" text NOT NULL,
	"bpm" integer NOT NULL,
	"feel" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"playing_ms" integer NOT NULL,
	"voiced" integer NOT NULL,
	"landed" integer NOT NULL,
	"partial" integer NOT NULL,
	"missed" integer NOT NULL,
	"notes_chord" integer NOT NULL,
	"notes_colour" integer NOT NULL,
	"notes_outside" integer NOT NULL,
	"best_streak" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "user_id" uuid;--> statement-breakpoint

-- The local player, at the fixed id `src/lib/server/db/user.ts` resolves to.
--
-- A constant rather than gen_random_uuid(), for the same reason `settings` is
-- pinned to id = 1: there is exactly one of these, and a well-known value means
-- a ninety-day cookie still names a real row after the database is rebuilt.
INSERT INTO "users" ("id", "name")
	VALUES ('00000000-0000-4000-8000-000000000001', 'The local player')
	ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- Null is built-in and shared; a value is yours.
--
-- The seeded repertoire keeps its null, so nobody inherits the standards by
-- being the first row in `users`. Everything else in the table was typed in on
-- the play-along page and belongs to the one player there is — without this it
-- would read as built-in for ever, and would be handed to a stranger on the day
-- accounts land. The slugs below are the built-ins as of this migration, which
-- is the only moment this statement runs.
UPDATE "charts" SET "user_id" = '00000000-0000-4000-8000-000000000001'
	WHERE "slug" NOT IN (
		'blues-12', 'blues-12-jazz', 'minor-blues-12', 'rhythm-changes', 'modal-vamp',
		'bird-blues', 'three-tonic-cycle', 'fifths-cycle', 'indiana',
		'sweet-georgia-brown', 'st-louis-blues', 'st-james-infirmary', 'ja-da',
		'salty-dog', 'after-youve-gone', 'basin-street-blues', 'avalon', 'bill-bailey'
	);--> statement-breakpoint

ALTER TABLE "badges" ADD CONSTRAINT "badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_run_id_play_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."play_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chord_attempts" ADD CONSTRAINT "chord_attempts_run_id_play_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."play_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_runs" ADD CONSTRAINT "play_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_runs" ADD CONSTRAINT "play_runs_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "badges_user_idx" ON "badges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chord_attempts_run_idx" ON "chord_attempts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "play_runs_user_started_idx" ON "play_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "play_runs_user_chart_idx" ON "play_runs" USING btree ("user_id","chart_slug");--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;