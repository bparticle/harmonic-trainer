-- A groove is a whole rhythm section, not just where the eighth falls.
--
-- `default_groove` and `default_key` are how a chart says what it is: the blues
-- opens as a shuffle, a pop tune opens in the key you wrote it in. The groove
-- defaults to 'swing' because that is what every chart already sounded like,
-- so nothing that exists changes by being migrated.
ALTER TABLE "charts" ADD COLUMN "default_groove" text DEFAULT 'swing' NOT NULL;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "default_key" text;--> statement-breakpoint

-- Renamed rather than dropped and re-added. The column holds 'rock' and 'bossa'
-- now, which `feel` would have been lying about — but every run already logged
-- is still a run, and its swing or straight means exactly what it always did.
ALTER TABLE "play_runs" RENAME COLUMN "feel" TO "groove";
