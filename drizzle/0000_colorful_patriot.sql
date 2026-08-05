CREATE TYPE "public"."card_direction" AS ENUM('hear_name', 'hear_play', 'see_play', 'play_name');--> statement-breakpoint
CREATE TYPE "public"."review_rating" AS ENUM('again', 'hard', 'good', 'easy');--> statement-breakpoint
CREATE TYPE "public"."srs_state_kind" AS ENUM('new', 'learning', 'review', 'relearning');--> statement-breakpoint
CREATE TABLE "analysis_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"take_id" uuid NOT NULL,
	"fact_type" text NOT NULL,
	"fact_key" text NOT NULL,
	"value_num" real,
	"value_text" text
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"direction" "card_direction" NOT NULL,
	"key_center" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"grid_json" jsonb NOT NULL,
	"style" text NOT NULL,
	"default_bpm" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repertoire" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_take_id" uuid,
	"chart_json" jsonb,
	"key_center" text NOT NULL,
	"roman_json" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"session_id" uuid,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"rating" "review_rating" NOT NULL,
	"correct" boolean NOT NULL,
	"latency_ms" integer,
	"played_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "session_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"block_type" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"result_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"key_center" text NOT NULL,
	"plan_json" jsonb NOT NULL,
	"result_json" jsonb,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"color_map_json" jsonb NOT NULL,
	"wheel_config_json" jsonb NOT NULL,
	"midi_device" text,
	"prefs_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" smallint NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"prereq_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "srs_state" (
	"card_id" uuid PRIMARY KEY NOT NULL,
	"stability" real NOT NULL,
	"difficulty" real NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" "srs_state_kind" DEFAULT 'new' NOT NULL,
	"last_reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "takes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"midi_blob" "bytea" NOT NULL,
	"bpm" real,
	"duration_ms" integer NOT NULL,
	"analysis_json" jsonb,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"take_id" uuid NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence_json" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_facts" ADD CONSTRAINT "analysis_facts_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertoire" ADD CONSTRAINT "repertoire_source_take_id_takes_id_fk" FOREIGN KEY ("source_take_id") REFERENCES "public"."takes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blocks" ADD CONSTRAINT "session_blocks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_state" ADD CONSTRAINT "srs_state_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_events" ADD CONSTRAINT "transfer_events_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_events" ADD CONSTRAINT "transfer_events_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_facts_take_idx" ON "analysis_facts" USING btree ("take_id");--> statement-breakpoint
CREATE INDEX "analysis_facts_type_key_idx" ON "analysis_facts" USING btree ("fact_type","fact_key");--> statement-breakpoint
CREATE INDEX "cards_skill_idx" ON "cards" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "cards_key_idx" ON "cards" USING btree ("key_center");--> statement-breakpoint
CREATE INDEX "reviews_card_idx" ON "reviews" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "reviews_session_idx" ON "reviews" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "reviews_ts_idx" ON "reviews" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "session_blocks_session_idx" ON "session_blocks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "skills_level_idx" ON "skills" USING btree ("level");--> statement-breakpoint
CREATE INDEX "srs_due_idx" ON "srs_state" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "takes_session_idx" ON "takes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "takes_ts_idx" ON "takes" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "transfer_events_skill_idx" ON "transfer_events" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "transfer_events_take_idx" ON "transfer_events" USING btree ("take_id");