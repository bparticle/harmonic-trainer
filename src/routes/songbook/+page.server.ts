import { randomUUID } from 'node:crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { charts } from '$lib/server/db/schema';
import { currentUserId } from '$lib/server/db/user';
import { currentVocabulary } from '$lib/server/db/session-store';
import { CHARTS, chartDemand, type ChartSeed } from '$lib/curriculum/charts';
import { isGroove, type Groove } from '$lib/audio/groove';
import { slugify, uniqueSlug } from '$lib/curriculum/import';
import { gridToRows, lyricsToRows, readGrid, type Grid } from '$lib/curriculum/editor';
import {
	CROSSING_CHIPS,
	DEVICE_CHIPS,
	isReady,
	reachOf,
	shortfall,
	type Demand
} from '$lib/curriculum/vocabulary';

/**
 * The songbook: everything there is to play, and where a tune of your own is written.
 *
 * Both of those used to live on `/backing`. The list was a sidebar you could
 * collapse, and writing a chart down happened *in the practice area* — the
 * editor replaced the chart, the transport and the score with a grid of text
 * boxes, reached by a small link at the bottom of the list. It worked and it
 * read as bolted on, because it was: two different activities sharing one
 * screen because there was nowhere else to put the second.
 *
 * So they are separated by what you are doing rather than by what they operate
 * on. **`/backing` is for playing** — it keeps its list, because choosing the
 * next tune mid-sitting is part of practising. **`/songbook` is for finding and
 * for writing down**, which are both things you do with your hands off the keys.
 *
 * Everything the list needs to be filtered on is computed here rather than in
 * the browser: a chart's demand is derived from its grid, and whether you are
 * ready for it is a comparison against what the drill room has taught. The page
 * gets facts and does no music theory.
 */

const BUILT_IN = new Set(CHARTS.map((c) => c.slug));

/** A chart as the songbook lists it: what it is, and where you stand with it. */
export type SongbookEntry = {
	slug: string;
	name: string;
	category: ChartSeed['category'];
	style: ChartSeed['style'];
	mode: 'major' | 'minor';
	bars: number;
	defaultBpm: number;
	defaultGroove: string;
	defaultKey?: string;
	published?: number;
	notes: string;
	/** Set only for a chart of your own, which is also what makes it editable. */
	id?: string;
	/** The grid itself, so a chart of your own can be reopened in the editor. */
	grid: string[][];
	lyrics?: string[][];
	demand: Demand;
	ready: boolean;
	/** What it would ask that nothing has taught yet. Empty when ready. */
	wants: string[];
	/** For ordering: how far into the vocabulary it reaches. */
	reach: number;
};

/** Charts you typed in yourself, read on the same terms as the built-ins. */
async function mine(userId: string): Promise<Array<ChartSeed & { id: string }>> {
	const rows = await db.select().from(charts).where(eq(charts.userId, userId));

	const out: Array<ChartSeed & { id: string }> = [];
	for (const row of rows) {
		if (BUILT_IN.has(row.slug)) continue;
		if (!row.gridJson?.length) continue;
		out.push({
			id: row.id,
			slug: row.slug,
			name: row.name,
			style: row.style,
			category: 'mine',
			mode: row.mode,
			defaultBpm: row.defaultBpm,
			defaultGroove: isGroove(row.defaultGroove) ? row.defaultGroove : 'swing',
			defaultKey: row.defaultKey ?? undefined,
			lyrics: row.lyricsJson ?? undefined,
			grid: row.gridJson,
			notes: row.notes || 'Yours.'
		});
	}
	return out;
}

export const load: PageServerLoad = async ({ locals }) => {
	const userId = currentUserId(locals.userId);
	const [ownCharts, vocabulary] = await Promise.all([mine(userId), currentVocabulary(userId)]);

	const entries: SongbookEntry[] = [...CHARTS, ...ownCharts].map((chart) => {
		const demand = chartDemand(chart);
		const gap = shortfall(demand, vocabulary);
		return {
			slug: chart.slug,
			name: chart.name,
			category: chart.category,
			style: chart.style,
			mode: chart.mode,
			bars: chart.grid.flat().length,
			defaultBpm: chart.defaultBpm,
			defaultGroove: chart.defaultGroove,
			defaultKey: chart.defaultKey,
			published: chart.published,
			notes: chart.notes,
			id: 'id' in chart ? (chart.id as string) : undefined,
			grid: chart.grid,
			lyrics: chart.lyrics,
			demand,
			ready: isReady(demand, vocabulary),
			// Already in words, because the page must not have to know what a
			// half-diminished is in order to say that you have not met one.
			wants: [
				...gap.shapes,
				...gap.devices.map((device) => DEVICE_CHIPS[device]),
				...gap.crossings.map((relation) => CROSSING_CHIPS[relation])
			],
			reach: reachOf(demand)
		};
	});

	// Plainest first, so the list reads as a curriculum rather than as an index.
	entries.sort((a, b) => a.reach - b.reach || a.name.localeCompare(b.name));

	return { entries, vocabulary };
};

/*
 * Writing a chart down.
 *
 * All of this moved here from `/backing` unchanged — the helpers that read the
 * posted grid, and the three actions that write it. The editor posts to the page
 * it is on, so moving the editor moved them.
 *
 * The redirect after a save still lands on the play-along page with the tune
 * open. You typed it in in order to play it, and the songbook is not where that
 * ends; only `remove` comes back here, because there is no longer a tune to go to.
 */

/**
 * The words, pinned to the grid the editor posted them with.
 *
 * They arrive in the same shape and are attached bar by bar rather than kept
 * alongside, so that everything downstream filters them through one function
 * together with the chords — see `lyricsToRows`. A bar the lyrics do not reach
 * is simply a bar with nothing sung over it.
 */
function attachLyrics(grid: Grid, raw: string): Grid {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return grid;
	}
	if (!Array.isArray(value)) return grid;

	return grid.map((row, r) =>
		row.map((bar, c) => {
			const line = (value as unknown[])[r];
			const word = Array.isArray(line) ? line[c] : undefined;
			return typeof word === 'string' ? { ...bar, lyric: word } : bar;
		})
	);
}

/** The editor posts the chords as typed. Anything else is not a grid. */
function parseGridField(raw: string): Grid | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}

	if (!Array.isArray(value)) return null;
	const grid: Grid = [];
	for (const row of value) {
		if (!Array.isArray(row)) return null;
		grid.push(row.map((text) => ({ text: typeof text === 'string' ? text : '' })));
	}
	return grid.length ? grid : null;
}

/**
 * What the editor sent, checked once for both actions.
 *
 * The numerals are derived here rather than taken from the form, using the same
 * `readGrid` the editor showed you. A browser is not the authority on what a
 * chord means, and running the one implementation on both sides is what stops
 * the screen and the database describing different tunes.
 *
 * A refusal carries the chords back as typed, not as numerals. Saying "bar 3
 * would come back as something else" and then handing back the something else
 * would be the editor arguing with itself.
 */
type Refusal = { ok: false; problems: string[]; entered: Record<string, unknown> };
type Accepted = {
	ok: true;
	name: string;
	keyName: string;
	mode: 'major' | 'minor';
	notes: string;
	bpm: number;
	groove: Groove;
	rows: string[][];
	lyrics: string[][] | null;
};

function readSubmission(form: FormData): Accepted | Refusal {
	const name = String(form.get('name') ?? '').trim();
	const keyName = String(form.get('key') ?? 'C');
	const mode = form.get('mode') === 'minor' ? 'minor' : 'major';
	const notes = String(form.get('notes') ?? '').trim();
	const bpm = Number(form.get('bpm') ?? 140);
	const safeBpm = Number.isFinite(bpm) ? Math.max(40, Math.min(300, bpm)) : 140;
	const rawGroove = form.get('groove');
	const groove: Groove = isGroove(rawGroove) ? rawGroove : 'swing';

	const posted = parseGridField(String(form.get('grid') ?? ''));
	const grid = posted && attachLyrics(posted, String(form.get('lyrics') ?? ''));
	const entered = {
		id: String(form.get('id') ?? '') || undefined,
		name,
		key: keyName,
		mode,
		bpm: safeBpm,
		notes,
		groove,
		// Rebuilt in the shape `parseIntoGrid` reads, so a refused save reopens on
		// the chart that was refused instead of on an empty grid.
		text: grid?.map((row) => row.map((bar) => bar.text).join(' | ')).join('\n'),
		lyrics: grid?.map((row) => row.map((bar) => bar.lyric ?? ''))
	};

	if (!grid) return { ok: false, problems: ['Nothing to save.'], entered };
	if (!name) return { ok: false, problems: ['Give it a name.'], entered };

	const reading = readGrid(grid, keyName);
	if (!reading.ok) {
		// The editor blocks its own save button on exactly this, so reaching here
		// means the form was posted some other way.
		const problems = reading.problems.length
			? reading.problems
			: reading.drift.map((d) => `Bar ${d.bar}: ${d.written} would come back as ${d.playback}.`);
		return { ok: false, problems: problems.length ? problems : ['Nothing to save.'], entered };
	}

	return {
		ok: true,
		name,
		keyName,
		mode,
		notes,
		bpm: safeBpm,
		groove,
		rows: gridToRows(reading),
		lyrics: lyricsToRows(reading)
	};
}

export const actions: Actions = {
	/** Save a chart written out as chord symbols. */
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const read = readSubmission(form);
		if (!read.ok) return fail(400, { problems: read.problems, ...read.entered });

		const userId = currentUserId(locals.userId);
		const taken = await db
			.select({ slug: charts.slug })
			.from(charts)
			.where(or(isNull(charts.userId), eq(charts.userId, userId)));
		const slug = uniqueSlug(slugify(read.name), [...BUILT_IN, ...taken.map((row) => row.slug)]);

		await db.insert(charts).values({
			id: randomUUID(),
			userId,
			slug,
			name: read.name,
			style: 'custom',
			mode: read.mode,
			notes: read.notes,
			defaultBpm: read.bpm,
			defaultGroove: read.groove,
			// The key it was written in is the key it opens in. A song has one —
			// that is most of what makes it a song rather than a form — and asking
			// for it twice would only be a chance to disagree with yourself.
			defaultKey: read.keyName,
			gridJson: read.rows,
			lyricsJson: read.lyrics
		});

		redirect(303, `/backing?chart=${encodeURIComponent(slug)}`);
	},

	/**
	 * Change a chart you already have.
	 *
	 * Everything is editable except the slug, which is frozen at creation and
	 * stays frozen through a rename. `play_runs.chart_slug` and
	 * `badges.chart_slug` are strings rather than foreign keys — deliberately, so
	 * that a run over a built-in has something to point at — and a slug that
	 * followed the name would orphan every run logged and every badge won on the
	 * tune the moment you fixed a typo in its title. The name is what you read;
	 * the slug is what the record is filed under, and those are allowed to differ.
	 *
	 * Scoped to the owner and not just to the id, exactly as `remove` is. An
	 * update that trusts an id from a form is the same bug as a delete that does.
	 */
	update: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { problems: ['No chart to change.'] });

		const read = readSubmission(form);
		if (!read.ok) return fail(400, { problems: read.problems, ...read.entered });

		const [changed] = await db
			.update(charts)
			.set({
				name: read.name,
				mode: read.mode,
				notes: read.notes,
				defaultBpm: read.bpm,
				defaultGroove: read.groove,
				defaultKey: read.keyName,
				gridJson: read.rows,
				lyricsJson: read.lyrics
			})
			.where(and(eq(charts.id, id), eq(charts.userId, currentUserId(locals.userId))))
			.returning({ slug: charts.slug });

		// Nothing matched: the chart is gone, or was never yours. Either way there
		// is nothing to go back to, so the list is the honest place to land.
		if (!changed) redirect(303, '/songbook');
		redirect(303, `/backing?chart=${encodeURIComponent(changed.slug)}`);
	},

	remove: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		// Scoped to the owner, not just to the id. A delete that trusts an id from
		// a form is the shape of bug M12 would otherwise have to go looking for.
		if (id) {
			await db
				.delete(charts)
				.where(and(eq(charts.id, id), eq(charts.userId, currentUserId(locals.userId))));
		}
		redirect(303, '/songbook');
	}
};
