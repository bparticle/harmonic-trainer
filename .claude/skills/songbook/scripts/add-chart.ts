import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '$lib/server/db/schema';
import { importedToSeed, uniqueSlug } from '$lib/curriculum/import';
import { CHARTS } from '$lib/curriculum/charts';
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
const TAKES_A_VALUE = new Set(['--bpm']);
const positional = args.filter(
	(a, i) => !a.startsWith('--') && !TAKES_A_VALUE.has(args[i - 1] ?? '')
);
const [file, keyName, name] = positional;

if (!file || !keyName || !name) {
	console.error('usage: add-chart.ts <chart-file> <key> "<name>" [--bpm 140] [--minor]');
	process.exit(2);
}

const bpm = Number(flag('--bpm') ?? 140);
const mode = args.includes('--minor') ? 'minor' : 'major';

const check = checkChart(readFileSync(file, 'utf8'), keyName);
if (!report(check, keyName)) {
	console.error('\nnothing written.');
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = drizzle(pool, { schema });

const seed = importedToSeed(name, check.rows, {
	defaultBpm: Math.max(40, Math.min(300, Number.isFinite(bpm) ? bpm : 140)),
	mode
});

// Slugs are the chart's URL, so a second tune must not silently overwrite a first.
const existing = await db.select({ gridJson: schema.charts.gridJson }).from(schema.charts);
const taken = existing
	.map((row) => (row.gridJson as { slug?: string })?.slug)
	.filter((slug): slug is string => Boolean(slug));
seed.slug = uniqueSlug(seed.slug, [...CHARTS.map((c) => c.slug), ...taken]);

await db.insert(schema.charts).values({
	id: randomUUID(),
	name: seed.name,
	style: 'custom',
	defaultBpm: seed.defaultBpm,
	gridJson: { slug: seed.slug, grid: seed.grid, notes: seed.notes, mode: seed.mode }
});

console.log(`\nadded "${seed.name}" — /backing?chart=${seed.slug}`);
await pool.end();
