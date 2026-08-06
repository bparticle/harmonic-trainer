import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema.ts';
import { skillSeeds } from '../src/lib/curriculum/cards.ts';
import { CHARTS } from '../src/lib/curriculum/charts.ts';

/**
 * Seed the skeleton, and nothing else.
 *
 *   npm run db:seed             skills and charts
 *   npm run db:seed -- --reset  clear everything generated first
 *
 * There is no card bank and no simulated history any more, and both absences
 * are deliberate.
 *
 * The old seed made three thousand cards across all twelve keys, every one due
 * immediately, and four weeks of invented practice with uneven key coverage.
 * The scheduler believed all of it: it pushed towards the "coldest" keys, which
 * were simply the ones the simulation had skipped, and served material from
 * anywhere in the syllabus because everything was equally due. Sessions asked
 * about chords nobody had been shown, in keys nobody had played.
 *
 * Cards are now created as the ladder is climbed. A new account starts with one
 * rung's worth: the C major scale.
 */

const args = new Set(process.argv.slice(2));
const reset = args.has('--reset');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });

async function main() {
	if (reset) {
		console.log('clearing generated rows…');
		// Order matters: reviews and srs_state hang off cards, blocks off sessions.
		await db.execute(sql`delete from ${schema.reviews}`);
		await db.execute(sql`delete from ${schema.transferEvents}`);
		await db.execute(sql`delete from ${schema.analysisFacts}`);
		await db.execute(sql`delete from ${schema.sessionBlocks}`);
		await db.execute(sql`delete from ${schema.sessions}`);
		await db.execute(sql`delete from ${schema.cards}`);
		await db.execute(sql`delete from ${schema.skills}`);
		await db.execute(sql`delete from ${schema.charts}`);
	}

	const skills = skillSeeds();
	console.log(`seeding ${skills.length} skills…`);
	for (const skill of skills) {
		await db
			.insert(schema.skills)
			.values({
				id: randomUUID(),
				code: skill.code,
				name: skill.name,
				level: skill.level,
				category: skill.category,
				description: skill.description,
				prereqIdsJson: skill.prereqs
			})
			.onConflictDoUpdate({
				target: schema.skills.code,
				set: {
					name: skill.name,
					level: skill.level,
					category: skill.category,
					description: skill.description,
					prereqIdsJson: skill.prereqs
				}
			});
	}

	console.log(`seeding ${CHARTS.length} charts…`);
	for (const chart of CHARTS) {
		await db
			.insert(schema.charts)
			.values({
				id: randomUUID(),
				name: chart.name,
				gridJson: { slug: chart.slug, grid: chart.grid, notes: chart.notes },
				style: chart.style,
				defaultBpm: chart.defaultBpm
			})
			.onConflictDoNothing();
	}

	// Put the ladder back to the beginning whenever the data is reset, so a
	// cleared database really does start at C rather than claiming progress
	// through keys whose cards no longer exist.
	if (reset) {
		await db.execute(sql`
			update ${schema.settings}
			set prefs_json = prefs_json || '{"ladderKey":"C","ladderRung":"scale"}'::jsonb
			where id = 1
		`);
		console.log('ladder reset to C / scale');
	}

	const counts = await db.execute<{ cards: number; reviews: number }>(sql`
		select (select count(*) from ${schema.cards})::int as cards,
		       (select count(*) from ${schema.reviews})::int as reviews
	`);
	console.log(
		`done. cards: ${counts.rows[0].cards}, reviews: ${counts.rows[0].reviews} — both grow only from playing.`
	);
}

main()
	.then(() => pool.end())
	.catch(async (error) => {
		console.error(error);
		await pool.end();
		process.exit(1);
	});
