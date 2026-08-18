import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { charts } from '$lib/server/db/schema';
import { currentUserId } from '$lib/server/db/user';
import { loadBests, loadRecord } from '$lib/server/db/play-log';
import { CHARTS, type ChartSeed } from '$lib/curriculum/charts';
import { slugify, uniqueSlug } from '$lib/curriculum/import';
import { gridToRows, readGrid, type Grid } from '$lib/curriculum/editor';

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
			grid: row.gridJson,
			notes: row.notes || 'Yours.'
		});
	}

	mine.sort((a, b) => a.name.localeCompare(b.name));

	// The shelf and the two bests, from the record rather than from the browser.
	// A run played here shows up on the other machine, which is the whole point
	// of M9 and was the one thing localStorage could never do.
	return { mine, record: await loadRecord(userId), bests: await loadBests(userId) };
};

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

export const actions: Actions = {
	/**
	 * Save a chart written out as chord symbols.
	 *
	 * The numerals are derived here rather than taken from the form, using the
	 * same `readGrid` the editor showed you. A browser is not the authority on
	 * what a chord means, and running the one implementation on both sides is
	 * what stops the screen and the database describing different tunes.
	 */
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const keyName = String(form.get('key') ?? 'C');
		const mode = form.get('mode') === 'minor' ? 'minor' : 'major';
		const notes = String(form.get('notes') ?? '').trim();
		const bpm = Number(form.get('bpm') ?? 140);
		const safeBpm = Number.isFinite(bpm) ? Math.max(40, Math.min(300, bpm)) : 140;
		const entered = { name, key: keyName, mode, bpm: safeBpm, notes };

		const grid = parseGridField(String(form.get('grid') ?? ''));
		if (!grid) return fail(400, { problems: ['Nothing to save.'], ...entered });
		if (!name) return fail(400, { problems: ['Give it a name.'], ...entered });

		const reading = readGrid(grid, keyName);
		if (!reading.ok) {
			// The editor blocks its own save button on exactly this, so reaching
			// here means the form was posted some other way.
			const problems = reading.problems.length
				? reading.problems
				: reading.drift.map((d) => `Bar ${d.bar}: ${d.written} would come back as ${d.playback}.`);
			return fail(400, {
				problems: problems.length ? problems : ['Nothing to save.'],
				...entered
			});
		}

		const taken = await db.select({ slug: charts.slug }).from(charts);
		const slug = uniqueSlug(slugify(name), [...BUILT_IN, ...taken.map((row) => row.slug)]);

		await db.insert(charts).values({
			id: randomUUID(),
			userId: currentUserId(locals.userId),
			slug,
			name,
			style: 'custom',
			mode,
			notes,
			defaultBpm: safeBpm,
			gridJson: gridToRows(reading)
		});

		redirect(303, `/backing?chart=${encodeURIComponent(slug)}`);
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
		redirect(303, '/backing');
	}
};
