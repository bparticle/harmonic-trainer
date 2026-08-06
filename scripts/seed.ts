import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema.ts';
import { SKILLS, topologicalOrder } from '../src/lib/curriculum/skills.ts';
import { CHARTS } from '../src/lib/curriculum/charts.ts';
import { cardsForSkill } from '../src/lib/curriculum/cards.ts';
import { initialState, schedule } from '../src/lib/srs/scheduler.ts';
import type { ReviewRating } from '../src/lib/server/db/schema.ts';

/**
 * Seed the curriculum, and optionally a few weeks of simulated practice.
 *
 *   npm run db:seed              curriculum only
 *   npm run db:seed -- --history four weeks of plausible review history too
 *   npm run db:seed -- --reset   clear generated rows first
 *
 * The history exists so the progress views have something to show during
 * development. It is deliberately uneven — some keys practised hard, some
 * barely touched — because a blind-spot report over perfectly uniform data
 * would look like it worked when it did not.
 */

const args = new Set(process.argv.slice(2));
const withHistory = args.has('--history');
const reset = args.has('--reset');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });

/**
 * Insert in chunks.
 *
 * Neon is a network hop away, so a row at a time means one round trip per row —
 * three thousand cards took minutes. Five hundred rows per statement turns that
 * into a handful of round trips. The chunk size is bounded by Postgres's 65535
 * parameter limit, which even the widest table here stays well inside.
 */
async function insertMany<T>(
	rows: T[],
	insert: (chunk: T[]) => Promise<unknown>,
	label: string,
	size = 500
) {
	for (let i = 0; i < rows.length; i += size) {
		await insert(rows.slice(i, i + size));
		process.stdout.write(`  ${label}: ${Math.min(i + size, rows.length)}/${rows.length}\r`);
	}
	if (rows.length) process.stdout.write('\n');
}

/** Deterministic PRNG, so a seeded database is reproducible. */
function makeRandom(seed: number) {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

async function main() {
	if (reset) {
		console.log('clearing generated rows…');
		// Cards cascade to srs_state and reviews.
		await db.execute(sql`delete from ${schema.reviews}`);
		await db.execute(sql`delete from ${schema.cards}`);
		await db.execute(sql`delete from ${schema.skills}`);
		await db.execute(sql`delete from ${schema.charts}`);
	}

	// ---- skills -----------------------------------------------------------
	const ordered = topologicalOrder(SKILLS);
	console.log(`seeding ${ordered.length} skills…`);

	const skillIds = new Map<string, string>();
	for (const skill of ordered) {
		const [row] = await db
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
			})
			.returning({ id: schema.skills.id });
		skillIds.set(skill.code, row.id);
	}

	// ---- charts -----------------------------------------------------------
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

	// ---- cards ------------------------------------------------------------
	// Identity is stable, so an existing card keeps its id and its history.
	const existing = await db
		.select({ id: schema.cards.id, payload: schema.cards.payloadJson })
		.from(schema.cards);
	const byIdentity = new Map<string, string>();
	for (const row of existing) {
		const identity = (row.payload as { identity?: string })?.identity;
		if (identity) byIdentity.set(identity, row.id);
	}

	let reused = 0;
	const seeded: Array<{ id: string; keyCenter: string }> = [];
	const newCards: Array<typeof schema.cards.$inferInsert> = [];
	const newStates: Array<typeof schema.srsState.$inferInsert> = [];
	const createdAt = new Date();

	for (const skill of ordered) {
		const skillId = skillIds.get(skill.code)!;
		for (const card of cardsForSkill(skill)) {
			const known = byIdentity.get(card.identity);
			if (known) {
				reused++;
				seeded.push({ id: known, keyCenter: card.keyCenter });
				continue;
			}

			const id = randomUUID();
			newCards.push({
				id,
				skillId,
				direction: card.direction,
				keyCenter: card.keyCenter,
				payloadJson: { ...card.payload, identity: card.identity }
			});
			newStates.push({ cardId: id, ...initialState(createdAt) });
			seeded.push({ id, keyCenter: card.keyCenter });
		}
	}

	await insertMany(newCards, (chunk) => db.insert(schema.cards).values(chunk), 'cards');
	await insertMany(newStates, (chunk) => db.insert(schema.srsState).values(chunk), 'srs');
	console.log(`cards: ${newCards.length} new, ${reused} already present`);

	if (!withHistory) {
		console.log('done. Pass --history for simulated practice data.');
		return;
	}

	// ---- simulated history ------------------------------------------------
	/*
	 * Four weeks of uneven practice. C, F and G get worked hard; the far side of
	 * the wheel barely gets touched. That unevenness is the point — it is what
	 * gives the blind-spot report something true to find.
	 */
	const random = makeRandom(20260806);
	const WARM = new Set(['C', 'F', 'G', 'Bb', 'Am', 'Dm']);
	const LUKEWARM = new Set(['D', 'Eb', 'Em', 'Gm']);

	const practiced = seeded.filter((c) => {
		if (WARM.has(c.keyCenter)) return random() < 0.75;
		if (LUKEWARM.has(c.keyCenter)) return random() < 0.3;
		return random() < 0.04;
	});

	console.log(`simulating four weeks over ${practiced.length} cards…`);

	const now = Date.now();
	const DAY = 24 * 60 * 60 * 1000;

	const sessionRows: Array<typeof schema.sessions.$inferInsert> = [];
	for (let day = 27; day >= 0; day--) {
		// Not every day: real practice has gaps, and a scheduler that has never
		// seen a gap has not been tested.
		if (random() < 0.25) continue;
		const startedAt = new Date(now - day * DAY);
		sessionRows.push({
			id: randomUUID(),
			startedAt,
			endedAt: new Date(startedAt.getTime() + 20 * 60 * 1000),
			keyCenter: ['C', 'F', 'G', 'Bb', 'D'][Math.floor(random() * 5)],
			planJson: { simulated: true, blocks: ['wheel_warmup', 'name_what_you_play', 'ear_drill'] },
			resultJson: { simulated: true }
		});
	}
	const sessionIds = sessionRows.map((s) => s.id!);

	const reviewRows: Array<typeof schema.reviews.$inferInsert> = [];
	const finalStates: Array<typeof schema.srsState.$inferInsert> = [];

	for (const card of practiced) {
		let state = initialState(new Date(now - 28 * DAY));
		let when = now - 28 * DAY;

		// Warm keys are answered better than cold ones, which is what makes the
		// resulting accuracy map worth reading.
		const ability = WARM.has(card.keyCenter) ? 0.86 : LUKEWARM.has(card.keyCenter) ? 0.62 : 0.4;

		while (when < now) {
			/*
			 * `ability` is the chance of getting it right, so it has to be the
			 * cutoff for `again` — an earlier version banded the roll such that a
			 * strong key could never miss at all, and every warm key came out at a
			 * suspiciously perfect 100%. Seed data that flatters the learner makes
			 * the blind-spot report look like it works when it does not.
			 */
			const roll = random();
			let rating: ReviewRating;
			if (roll >= ability) {
				rating = 'again';
			} else {
				const quality = roll / ability;
				rating = quality < 0.45 ? 'easy' : quality < 0.85 ? 'good' : 'hard';
			}
			const correct = rating !== 'again';

			reviewRows.push({
				id: randomUUID(),
				cardId: card.id,
				sessionId: sessionIds[Math.floor(random() * sessionIds.length)] ?? null,
				ts: new Date(when),
				rating,
				correct,
				latencyMs: correct
					? Math.round(600 + random() * (WARM.has(card.keyCenter) ? 1800 : 5000))
					: null
			});

			state = schedule(state, rating, new Date(when));
			when = state.dueAt.getTime();
		}

		finalStates.push({ cardId: card.id, ...state });
	}

	await insertMany(sessionRows, (chunk) => db.insert(schema.sessions).values(chunk), 'sessions');
	await insertMany(reviewRows, (chunk) => db.insert(schema.reviews).values(chunk), 'reviews', 300);
	await insertMany(
		finalStates,
		(chunk) =>
			db
				.insert(schema.srsState)
				.values(chunk)
				.onConflictDoUpdate({
					target: schema.srsState.cardId,
					set: {
						stability: sql`excluded.stability`,
						difficulty: sql`excluded.difficulty`,
						dueAt: sql`excluded.due_at`,
						reps: sql`excluded.reps`,
						lapses: sql`excluded.lapses`,
						state: sql`excluded.state`,
						lastReviewedAt: sql`excluded.last_reviewed_at`
					}
				}),
		'srs state'
	);

	console.log(`sessions: ${sessionRows.length}, reviews: ${reviewRows.length}`);
}

main()
	.then(() => pool.end())
	.catch(async (error) => {
		console.error(error);
		await pool.end();
		process.exit(1);
	});
