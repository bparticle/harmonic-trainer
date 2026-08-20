-- The words, in the same shape as the grid: rows of bars, one fragment per bar.
--
-- Nullable, and the null means something rather than being a value not filled
-- in yet: this chart is an instrumental. Every existing chart is one, which is
-- why there is no backfill here and nothing to change about how any of them
-- already looks.
ALTER TABLE "charts" ADD COLUMN "lyrics_json" jsonb;