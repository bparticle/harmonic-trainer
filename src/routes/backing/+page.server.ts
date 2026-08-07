import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { charts } from '$lib/server/db/schema';
import { CHARTS, type ChartSeed } from '$lib/curriculum/charts';
import { importedToSeed, parseChartText, slugify } from '$lib/curriculum/import';

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

type StoredGrid = {
	slug?: string;
	grid?: string[][];
	notes?: string;
	mode?: 'major' | 'minor';
};

export const load: PageServerLoad = async () => {
	const rows = await db.select().from(charts);

	const mine: Array<ChartSeed & { id: string }> = [];
	for (const row of rows) {
		const stored = (row.gridJson ?? {}) as StoredGrid;
		const slug = stored.slug ?? slugify(row.name);
		if (BUILT_IN.has(slug)) continue;
		if (!stored.grid?.length) continue;

		mine.push({
			id: row.id,
			slug,
			name: row.name,
			style: row.style,
			category: 'mine',
			mode: stored.mode ?? 'major',
			defaultBpm: row.defaultBpm,
			grid: stored.grid,
			notes: stored.notes ?? 'Yours.'
		});
	}

	mine.sort((a, b) => a.name.localeCompare(b.name));
	return { mine };
};

export const actions: Actions = {
	/** Save a chart written out as chord symbols. */
	create: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const keyName = String(form.get('key') ?? 'C');
		const text = String(form.get('chart') ?? '');
		const bpm = Number(form.get('bpm') ?? 140);
		const mode = form.get('mode') === 'minor' ? 'minor' : 'major';

		if (!name) return fail(400, { problems: ['Give it a name.'], name, text, key: keyName });

		const parsed = parseChartText(text, keyName);
		if (parsed.rows.length === 0) {
			return fail(400, { problems: parsed.problems, name, text, key: keyName });
		}

		const seed = importedToSeed(name, parsed.rows, {
			defaultBpm: Number.isFinite(bpm) ? Math.max(40, Math.min(300, bpm)) : 140,
			mode
		});

		await db.insert(charts).values({
			id: randomUUID(),
			name: seed.name,
			style: 'custom',
			defaultBpm: seed.defaultBpm,
			gridJson: { slug: seed.slug, grid: seed.grid, notes: seed.notes, mode: seed.mode }
		});

		// Anything not understood is still worth saying, even on success — a bar
		// silently missing from a tune you just typed in is a nasty surprise.
		redirect(303, `/backing?chart=${encodeURIComponent(seed.slug)}`);
	},

	remove: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (id) await db.delete(charts).where(eq(charts.id, id));
		redirect(303, '/backing');
	}
};
