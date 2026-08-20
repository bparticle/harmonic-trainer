import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '$lib/server/db/schema';
import { importedToSeed, uniqueSlug } from '$lib/curriculum/import';
import { CHARTS } from '$lib/curriculum/charts';
import { isGroove, type Groove } from '$lib/audio/groove';
import { LOCAL_PLAYER_ID } from '$lib/server/db/user';
import { checkChart, report } from './roundtrip';

/**
 * Put a chart in the songbook, under "Yours".
 *
 *   npx vite-node .claude/skills/songbook/scripts/add-chart.ts \
 *     <file> <key> "<name>" [--bpm 140] [--minor]
 *
 * This is the /backing import form done from the command line: same parse, same
 * numerals, same row. The form exists and works — reach for this when you are
 * transcribing on someone's behalf, or when the tune is long enough that a typo
 * in a text box would be miserable to find.
 *
 * Needs the database up (`npm run db:up`) and DATABASE_URL set.
 */

const args = process.argv.slice(2);
const flag = (name: string) => {
	const at = args.indexOf(name);
	return at < 0 ? undefined : args[at + 1];
};
const TAKES_A_VALUE = new Set(['--bpm', '--groove', '--notes']);
const positional = args.filter(
	(a, i) => !a.startsWith('--') && !TAKES_A_VALUE.has(args[i - 1] ?? '')
);
const [file, keyName, name] = positional;

if (!file || !keyName || !name) {
	console.error(
		'usage: add-chart.ts <chart-file> <key> "<name>" [--bpm 140] [--minor] [--groove swing] [--notes "…"]'
	);
	process.exit(2);
}

const bpm = Number(flag('--bpm') ?? 140);
const mode = args.includes('--minor') ? 'minor' : 'major';

const askedFor = flag('--groove');
if (askedFor !== undefined && !isGroove(askedFor)) {
	console.error(`! "${askedFor}" is not a groove.`);
	process.exit(2);
}
const groove: Groove = isGroove(askedFor) ? askedFor : 'swing';

const check = checkChart(readFileSync(file, 'utf8'), keyName);
if (!report(check, keyName)) {
	console.error('\nnothing written.');
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = drizzle(pool, { schema });

const seed = importedToSeed(name, check.rows, {
	defaultBpm: Math.max(40, Math.min(300, Number.isFinite(bpm) ? bpm : 140)),
	mode,
	defaultGroove: groove,
	// The key it was transcribed in is the key it opens in, exactly as the
	// editor treats the written key.
	defaultKey: keyName.replace(/m$/, '')
});

// Slugs are the chart's URL, so a second tune must not silently overwrite a first.
const existing = await db.select({ slug: schema.charts.slug }).from(schema.charts);
seed.slug = uniqueSlug(seed.slug, [...CHARTS.map((c) => c.slug), ...existing.map((r) => r.slug)]);

await db.insert(schema.charts).values({
	id: randomUUID(),
	// Null is built-in and shared; a value is yours. Without this the chart is
	// written as part of the seeded repertoire and never appears under "Yours",
	// which is the one place the person who asked for it is going to look.
	userId: LOCAL_PLAYER_ID,
	slug: seed.slug,
	name: seed.name,
	style: 'custom',
	mode: seed.mode,
	notes: flag('--notes')?.trim() || seed.notes,
	defaultBpm: seed.defaultBpm,
	defaultGroove: seed.defaultGroove,
	defaultKey: seed.defaultKey ?? null,
	gridJson: seed.grid,
	lyricsJson: check.lyrics
});

const sung = check.lyrics ? ', with words' : '';
console.log(`\nadded "${seed.name}" in ${keyName}, ${groove}${sung} — /backing?chart=${seed.slug}`);

await pool.end();
