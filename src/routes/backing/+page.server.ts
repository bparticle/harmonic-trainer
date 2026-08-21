import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { charts } from '$lib/server/db/schema';
import { currentUserId } from '$lib/server/db/user';
import { loadBests, loadRecord, loadTempoGrades } from '$lib/server/db/play-log';
import { CHARTS, chartDemand, type ChartSeed } from '$lib/curriculum/charts';
import { currentVocabulary } from '$lib/server/db/session-store';
import { isReady } from '$lib/curriculum/vocabulary';
import { isGroove } from '$lib/audio/groove';

/**
 * Charts you typed in yourself.
 *
 * The built-in ones are code, because they never change. Yours live in the
 * database — and as Roman numerals, exactly like the built-ins, so a tune typed
 * in once plays in all twelve keys.
 *
 * The seeded rows share slugs with the built-ins, so they are filtered out
 * rather than shown twice.
 */

const BUILT_IN = new Set(CHARTS.map((c) => c.slug));

export const load: PageServerLoad = async ({ locals }) => {
	const userId = currentUserId(locals.userId);
	const rows = await db.select().from(charts).where(eq(charts.userId, userId));

	const mine: Array<ChartSeed & { id: string }> = [];
	for (const row of rows) {
		// A slug shared with a built-in would be shown twice. The seeded rows are
		// null-owned and already excluded by the query; this catches a chart you
		// typed in before the built-in of the same name existed.
		if (BUILT_IN.has(row.slug)) continue;
		if (!row.gridJson?.length) continue;

		mine.push({
			id: row.id,
			slug: row.slug,
			name: row.name,
			style: row.style,
			category: 'mine',
			mode: row.mode,
			defaultBpm: row.defaultBpm,
			// A row written before grooves existed says `swing`, which is what it
			// played as. Anything the column does not recognise is read the same way.
			defaultGroove: isGroove(row.defaultGroove) ? row.defaultGroove : 'swing',
			defaultKey: row.defaultKey ?? undefined,
			lyrics: row.lyricsJson ?? undefined,
			grid: row.gridJson,
			notes: row.notes || 'Yours.'
		});
	}

	mine.sort((a, b) => a.name.localeCompare(b.name));

	// The shelf and the two bests, from the record rather than from the browser.
	// A run played here shows up on the other machine, which is the whole point
	// of M9 and was the one thing localStorage could never do.
	//
	// The bands come the same way and are derived from the same runs, so there is
	// nothing stored anywhere that could disagree with them.
	/*
	 * Which tunes use only chords the drill room has taught.
	 *
	 * The same comparison the workout composer makes when it decides where a
	 * mission may be set, read once here so the list can say so. It is a signpost
	 * and never a lock: every tune stays openable, in every key, and the mark
	 * exists because the list previously could not answer "which of these can I
	 * play today" at all.
	 */
	const vocabulary = await currentVocabulary(userId);
	const ready: Record<string, boolean> = {};
	for (const chart of [...CHARTS, ...mine]) {
		ready[chart.slug] = isReady(chartDemand(chart), vocabulary);
	}

	return {
		mine,
		ready,
		record: await loadRecord(userId),
		bests: await loadBests(userId),
		tempo: await loadTempoGrades(userId)
	};
};
