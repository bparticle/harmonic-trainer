-- Charts: slug, mode and notes lifted out of grid_json into real columns.
--
-- The generated version of this migration added `slug` as NOT NULL with no
-- default, which cannot work on a table that already has rows, and left the
-- values it needed sitting inside the JSON document it was replacing. So the
-- columns arrive nullable, are filled from `grid_json`, and are only then
-- tightened.

ALTER TABLE "charts" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "mode" text DEFAULT 'major' NOT NULL;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint

-- Lift the buried values out. A row with no slug of its own gets one from its
-- id rather than a name collision: the unique constraint below is the point of
-- the exercise, and two untitled charts must not fight over one value.
UPDATE "charts" SET
	"slug" = COALESCE(NULLIF("grid_json"->>'slug', ''), 'chart-' || left("id"::text, 8)),
	"mode" = COALESCE(NULLIF("grid_json"->>'mode', ''), 'major'),
	"notes" = COALESCE("grid_json"->>'notes', '');--> statement-breakpoint

-- grid_json keeps the grid and nothing else.
UPDATE "charts" SET "grid_json" = "grid_json"->'grid'
	WHERE jsonb_exists("grid_json", 'grid');--> statement-breakpoint

ALTER TABLE "charts" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "charts_slug_idx" ON "charts" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_slug_unique" UNIQUE("slug");
