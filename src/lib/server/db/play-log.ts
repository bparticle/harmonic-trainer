import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './index';
import { badges, charts, chordAttempts, playRuns, sessionBlocks, sessions } from './schema';
import { emptyRecord, type StreakRecord } from '$lib/effects/badges';
import { noBests, type Bests, type Flush } from '$lib/practice/run';
import {
	grade,
	gradeShelf,
	MOVEMENT_DAYS,
	noTempo,
	suggestLadder,
	type HeldRun,
	type StreakTempo,
	type TempoMovement,
	type TempoRecord
} from '$lib/practice/tempo';
import { BADGE_TIERS } from '$lib/effects/streak';
import { chartBySlug } from '$lib/curriculum/charts';

/**
 * The least a streak has to be before a run says anything about tempo.
 *
 * Referenced rather than restated: three in a row is the shelf's first rung and
 * `streak.ts` is where that number is decided.
 */
const FIRST_RUNG = BADGE_TIERS[0].from;

/**
 * The play-along record.
 *
 * Everything here filters on a user id, from the first day, which is the entire
 * point of building the seam now — see `user.ts`. Nothing in this file reaches
 * for the current user itself: it is passed in, so there is exactly one place
 * that decides who a request is for.
 */

/**
 * The two numbers the shelf shows, straight out of the log.
 *
 * A streak cannot outlive the transport, so the best run ever is the highest
 * `best_streak` any run reached and the best on a tune is the same grouped by
 * slug. There is nothing to reconcile because there is nothing else keeping a
 * second copy of the answer.
 */
export async function loadBests(userId: string): Promise<Bests> {
	const rows = await db
		.select({
			chartSlug: playRuns.chartSlug,
			best: sql<number>`max(${playRuns.bestStreak})::int`
		})
		.from(playRuns)
		.where(eq(playRuns.userId, userId))
		.groupBy(playRuns.chartSlug);

	if (rows.length === 0) return noBests();

	const byChart: Record<string, number> = {};
	let best = 0;
	for (const row of rows) {
		const value = row.best ?? 0;
		if (value <= 0) continue;
		byChart[row.chartSlug] = value;
		best = Math.max(best, value);
	}

	return { best, byChart };
}

/**
 * How fast each rung of the ladder has been held on each tune.
 *
 * Derived and never stored. There is no `best_bpm` column on `badges` and there
 * must not be: M9 deleted a stored best because it could drift from the runs
 * that justified it, and a stored tempo grade is the same bug wearing a new
 * name. The badge answers *when did you first get there*; this answers *how fast
 * have you held it*, and neither can contradict the other.
 *
 * The roadmap writes the grade as `max(bpm) where best_streak >= tier.from`, six
 * times over. It is asked here once per streak length instead — the same answer,
 * a handful of rows rather than the whole log, and the ladder applied in
 * `gradeShelf` where the ladder lives and can be tested without a database.
 *
 * **`coalesce(best_streak_bpm, bpm)` is the tempo a run is graded on.** The
 * column that knows where a streak was actually clinched shipped in M15 and is
 * null on every run recorded before it, and cannot be backfilled — the runs do
 * not know. Grading strictly on it would show nothing at all for the history
 * that exists; grading on `bpm` alone would reintroduce the flattery it was
 * added to prevent. So a run recorded before the column existed is graded on the
 * tempo it was logged at, because that is the only tempo it ever knew, and every
 * run since is graded on where its best streak was reached.
 *
 * Two answers come back from one call because they are two readings of the same
 * runs: the **shelf's** bands, which say how fast each rung has been held, and
 * the **ladder**, which says which band the tune has been held at cleanly and
 * what the next one up would cost. Splitting them across two loaders would be
 * two places for one record to come from, which is the mistake this whole
 * milestone is written against.
 */
export async function loadTempoGrades(userId: string): Promise<TempoRecord> {
	const rows = await db
		.select({
			chartSlug: playRuns.chartSlug,
			bestStreak: playRuns.bestStreak,
			bpm: sql<number>`max(coalesce(${playRuns.bestStreakBpm}, ${playRuns.bpm}))::int`
		})
		.from(playRuns)
		.where(and(eq(playRuns.userId, userId), gt(playRuns.bestStreak, 0)))
		.groupBy(playRuns.chartSlug, playRuns.bestStreak);

	if (rows.length === 0) return noTempo();

	const byChart = new Map<string, StreakTempo[]>();
	for (const row of rows) {
		const list = byChart.get(row.chartSlug) ?? [];
		list.push({ bestStreak: row.bestStreak, bpm: row.bpm ?? 0 });
		byChart.set(row.chartSlug, list);
	}

	const held = await heldRuns(userId);
	const slugs = new Set([...byChart.keys(), ...held.keys()]);
	const targets = await targetTempos(userId, [...slugs]);

	const graded: TempoRecord = noTempo();
	for (const slug of slugs) {
		const target = targets[slug];
		// A tune whose tempo nothing records grades nothing. That is a chart of
		// your own that has since been deleted: the runs still happened, and there
		// is no honest number to measure them against.
		if (!target) continue;

		const shelf = gradeShelf(byChart.get(slug) ?? [], target);
		if (Object.keys(shelf).length > 0) graded.byChart[slug] = shelf;

		graded.ladders[slug] = suggestLadder(held.get(slug) ?? [], target);
	}

	return graded;
}

/**
 * Every run that might have held its tune, per tune.
 *
 * Four columns off `play_runs` and no arithmetic: whether a run cleared the
 * mission's bar is decided by `heldCleanly`, which is where the bar lives and
 * where it can be tested. Runs with nothing played over are left out because
 * they cannot answer the question either way — an evening spent listening is
 * neither holding a tune nor failing to.
 *
 * Graded on the same `coalesce(best_streak_bpm, bpm)` the shelf is graded on, so
 * a tune's band and its ladder can never be reading two different tempos.
 */
async function heldRuns(userId: string): Promise<Map<string, HeldRun[]>> {
	const rows = await db
		.select({
			chartSlug: playRuns.chartSlug,
			bpm: sql<number>`coalesce(${playRuns.bestStreakBpm}, ${playRuns.bpm})::int`,
			voiced: playRuns.voiced,
			landed: playRuns.landed,
			bestStreak: playRuns.bestStreak
		})
		.from(playRuns)
		.where(and(eq(playRuns.userId, userId), gt(playRuns.voiced, 0)));

	const byChart = new Map<string, HeldRun[]>();
	for (const row of rows) {
		const list = byChart.get(row.chartSlug) ?? [];
		list.push({
			bpm: row.bpm ?? 0,
			voiced: row.voiced,
			landed: row.landed,
			bestStreak: row.bestStreak
		});
		byChart.set(row.chartSlug, list);
	}
	return byChart;
}

/**
 * Whether the last thirty days took any tune to a faster band.
 *
 * The first figure in the app that measures improvement rather than volume, and
 * the one most at risk of saying more than the rows do. Two facts per tune and
 * nothing else: the fastest band held before the window opened, and the fastest
 * held across the whole record. A tune with no runs at all before the window has
 * `before: null` — its history is entirely inside the window, so there is
 * nothing to compare it against, and `readMovement` counts it as such rather
 * than reporting it as a tune that stood still. Those are different facts and
 * this page has never conflated two of those.
 *
 * The band is read the shelf's way — the fastest tempo any real streak was held
 * at — so the movement figure and the per-tune band cannot disagree.
 */
export async function loadTempoMovement(
	userId: string,
	now = new Date()
): Promise<TempoMovement[]> {
	const cutoff = new Date(now.getTime() - MOVEMENT_DAYS * 86_400_000);

	const rows = await db
		.select({
			chartSlug: playRuns.chartSlug,
			now: sql<number | null>`max(coalesce(${playRuns.bestStreakBpm}, ${playRuns.bpm}))::int`,
			before: sql<
				number | null
			>`max(coalesce(${playRuns.bestStreakBpm}, ${playRuns.bpm})) filter (where ${playRuns.startedAt} < ${cutoff})::int`
		})
		.from(playRuns)
		.where(and(eq(playRuns.userId, userId), gte(playRuns.bestStreak, FIRST_RUNG)))
		.groupBy(playRuns.chartSlug);

	if (rows.length === 0) return [];

	const targets = await targetTempos(
		userId,
		rows.map((row) => row.chartSlug)
	);

	const movement: TempoMovement[] = [];
	for (const row of rows) {
		const target = targets[row.chartSlug];
		if (!target) continue;
		const graded = row.now === null ? null : grade(row.now, target);
		if (!graded) continue;
		movement.push({
			chartSlug: row.chartSlug,
			before: row.before === null ? null : grade(row.before, target),
			now: graded
		});
	}

	return movement;
}

/**
 * The tempo each tune is meant to go at — code first, then the database.
 *
 * The same order the rest of the app resolves a chart in, and it is load-bearing
 * here: a built-in lives in `charts.ts` and has no row of its own to read
 * `default_bpm` from, so a query alone would leave most of the record ungraded.
 */
async function targetTempos(userId: string, slugs: string[]): Promise<Record<string, number>> {
	const targets: Record<string, number> = {};
	const unresolved: string[] = [];

	for (const slug of slugs) {
		const seed = chartBySlug(slug);
		if (seed) targets[slug] = seed.defaultBpm;
		else unresolved.push(slug);
	}

	if (unresolved.length === 0) return targets;

	const rows = await db
		.select({ slug: charts.slug, defaultBpm: charts.defaultBpm })
		.from(charts)
		.where(and(inArray(charts.slug, unresolved), eq(charts.userId, userId)));

	for (const row of rows) targets[row.slug] = row.defaultBpm;
	return targets;
}

/** Every badge won, in the shape the shelf and the page already speak. */
export async function loadRecord(userId: string): Promise<StreakRecord> {
	const rows = await db
		.select()
		.from(badges)
		.where(eq(badges.userId, userId))
		.orderBy(badges.wonAt);

	const record = emptyRecord();
	for (const row of rows) {
		record.badges[row.chartSlug] ??= {};
		record.badges[row.chartSlug][row.tier] = {
			tier: row.tier,
			count: row.count,
			at: row.wonAt.toISOString(),
			pc: row.pc,
			chart: row.chartSlug,
			key: row.keyCenter
		};
	}

	return record;
}

/**
 * Take a flush, whole or not at all.
 *
 * One transaction, because a run whose attempts did not land is a row claiming
 * a score nothing supports. Everything is `on conflict do nothing`, on
 * client-generated ids, so a request retried after a timeout is a no-op rather
 * than a duplicate — the recovery for a lost connection has to be "send it
 * again" and not "work out what already got through".
 *
 * Badges come last because one may name a run in the same batch. They also
 * arrive with no run at all, which is how a shelf that predates this milestone
 * is carried in from local storage: the unique constraint means doing that
 * every load costs nothing after the first.
 *
 * Mission verdicts come after the runs for the same reason, and are the one
 * thing here that is an update rather than an insert — a block is a row a
 * session already made. The rule is written below where it is applied.
 */
export async function saveFlush(userId: string, flush: Flush): Promise<void> {
	if (flush.runs.length === 0 && flush.badges.length === 0 && flush.blocks.length === 0) return;

	const claimedBlocks = [
		...flush.runs.flatMap((run) => (run.sessionBlockId ? [run.sessionBlockId] : [])),
		...flush.blocks.map((block) => block.blockId)
	];
	const ownBlocks = new Set<string>();
	if (claimedBlocks.length > 0) {
		const rows = await db
			.select({ id: sessionBlocks.id })
			.from(sessionBlocks)
			.innerJoin(sessions, eq(sessions.id, sessionBlocks.sessionId))
			.where(and(inArray(sessionBlocks.id, claimedBlocks), eq(sessions.userId, userId)));
		for (const row of rows) ownBlocks.add(row.id);
	}

	await db.transaction(async (tx) => {
		for (const run of flush.runs) {
			const inserted = await tx
				.insert(playRuns)
				.values({
					id: run.id,
					userId,
					chartSlug: run.chartSlug,
					chartId: run.chartId,
					sessionBlockId:
						run.sessionBlockId && ownBlocks.has(run.sessionBlockId) ? run.sessionBlockId : null,
					keyCenter: run.keyCenter,
					bpm: run.bpm,
					groove: run.groove,
					startedAt: new Date(run.startedAt),
					endedAt: run.endedAt ? new Date(run.endedAt) : null,
					playingMs: run.playingMs,
					voiced: run.voiced,
					landed: run.landed,
					partial: run.partial,
					missed: run.missed,
					notesChord: run.notesChord,
					notesColour: run.notesColour,
					notesOutside: run.notesOutside,
					bestStreak: run.bestStreak,
					bestStreakBpm: run.bestStreakBpm
				})
				.onConflictDoNothing({ target: playRuns.id })
				.returning({ id: playRuns.id });

			// A replay: the run is already here and so are its chords.
			if (inserted.length === 0 || run.attempts.length === 0) continue;

			await tx.insert(chordAttempts).values(
				run.attempts.map((attempt) => ({
					id: attempt.id,
					runId: run.id,
					bar: attempt.bar,
					chord: attempt.chord,
					numeral: attempt.numeral,
					localKey: attempt.localKey,
					landing: attempt.landing,
					found: attempt.found,
					needed: attempt.needed,
					notesChord: attempt.notesChord,
					notesColour: attempt.notesColour,
					notesOutside: attempt.notesOutside,
					atMs: attempt.atMs
				}))
			);
		}

		/*
		 * A mission's verdict, on the block that set it.
		 *
		 * A block ends when its goal is met, and not before. Until then the latest
		 * verdict stands in `result_json` with `ended_at` still null, so a session
		 * can see how close the last attempt came and the mission stays open to be
		 * played again — which is what "a goal that can be met rather than a clock
		 * that runs out" has to mean in the row. A block already ended is left
		 * exactly as it is, so a post retried after a timeout changes nothing and
		 * neither does a later, worse run.
		 *
		 * Stamped with the end of the run that reached it rather than with now: a
		 * mission played on a train and flushed the next morning was finished on
		 * the train.
		 */
		for (const block of flush.blocks) {
			if (!ownBlocks.has(block.blockId)) continue;
			const run = flush.runs.find((candidate) => candidate.id === block.runId);
			const at = run?.endedAt ? new Date(run.endedAt) : new Date();
			await tx
				.update(sessionBlocks)
				.set({
					resultJson: block.verdict as never,
					endedAt: block.verdict.met ? at : null
				})
				.where(and(eq(sessionBlocks.id, block.blockId), isNull(sessionBlocks.endedAt)));
		}

		if (flush.badges.length === 0) return;

		const known = new Set(flush.runs.map((run) => run.id));
		await tx
			.insert(badges)
			.values(
				flush.badges.map((badge) => ({
					id: randomUUID(),
					userId,
					chartSlug: badge.chartSlug,
					tier: badge.tier,
					wonAt: new Date(badge.wonAt),
					count: badge.count,
					pc: badge.pc,
					keyCenter: badge.keyCenter,
					// Only a run in this same batch can be pointed at safely; one from
					// an earlier post may have been pruned, and a dangling id is worse
					// than none. The badge is the milestone either way.
					runId: badge.runId && known.has(badge.runId) ? badge.runId : null
				}))
			)
			// First earned wins, moved out of TypeScript and into the schema.
			.onConflictDoNothing({
				target: [badges.userId, badges.chartSlug, badges.tier]
			});
	});
}

/*
 * Everything below is read by the pages that report the record: the profile,
 * and the home page's twelve keys.
 *
 * Each is one query, and each answers a question the page states in words: how
 * long has been played, on what, and where the time went. Nothing here
 * estimates — a number a page cannot trace to rows is a number it does not
 * show.
 */

export type Headline = {
	playingMs: number;
	chordsJudged: number;
	tunesPractised: number;
	runs: number;
	bestStreak: number;
	/** The tune and key that best run happened on. */
	bestOn: { chartSlug: string; keyCenter: string } | null;
	/** How the chords went, and where the notes sat. The `Tally`, summed. */
	landed: number;
	partial: number;
	missed: number;
	notesChord: number;
	notesColour: number;
	notesOutside: number;
};

export async function loadHeadline(userId: string): Promise<Headline> {
	const [totals] = await db
		.select({
			playingMs: sql<number>`coalesce(sum(${playRuns.playingMs}), 0)::bigint`,
			chordsJudged: sql<number>`coalesce(sum(${playRuns.voiced}), 0)::int`,
			runs: sql<number>`count(*)::int`,
			// A tune practised is one something was played over, not one opened.
			tunesPractised: sql<number>`count(distinct ${playRuns.chartSlug}) filter (where ${playRuns.voiced} > 0)::int`,
			bestStreak: sql<number>`coalesce(max(${playRuns.bestStreak}), 0)::int`,
			landed: sql<number>`coalesce(sum(${playRuns.landed}), 0)::int`,
			partial: sql<number>`coalesce(sum(${playRuns.partial}), 0)::int`,
			missed: sql<number>`coalesce(sum(${playRuns.missed}), 0)::int`,
			notesChord: sql<number>`coalesce(sum(${playRuns.notesChord}), 0)::bigint`,
			notesColour: sql<number>`coalesce(sum(${playRuns.notesColour}), 0)::bigint`,
			notesOutside: sql<number>`coalesce(sum(${playRuns.notesOutside}), 0)::bigint`
		})
		.from(playRuns)
		.where(eq(playRuns.userId, userId));

	const headline: Headline = {
		playingMs: Number(totals?.playingMs ?? 0),
		chordsJudged: totals?.chordsJudged ?? 0,
		tunesPractised: totals?.tunesPractised ?? 0,
		runs: totals?.runs ?? 0,
		bestStreak: totals?.bestStreak ?? 0,
		bestOn: null,
		landed: totals?.landed ?? 0,
		partial: totals?.partial ?? 0,
		missed: totals?.missed ?? 0,
		notesChord: Number(totals?.notesChord ?? 0),
		notesColour: Number(totals?.notesColour ?? 0),
		notesOutside: Number(totals?.notesOutside ?? 0)
	};

	if (headline.bestStreak > 0) {
		const [row] = await db
			.select({ chartSlug: playRuns.chartSlug, keyCenter: playRuns.keyCenter })
			.from(playRuns)
			.where(and(eq(playRuns.userId, userId), eq(playRuns.bestStreak, headline.bestStreak)))
			.orderBy(playRuns.startedAt)
			.limit(1);
		headline.bestOn = row ?? null;
	}

	return headline;
}

export type TuneRow = {
	chartSlug: string;
	runs: number;
	playingMs: number;
	voiced: number;
	landed: number;
	partial: number;
	bestStreak: number;
	lastPlayed: Date;
	firstPlayed: Date;
};

/**
 * Per tune, sorted by time spent — the honest answer to "what have I been
 * practising", where sorting by best streak would answer "what went well once".
 */
export async function loadTunes(userId: string): Promise<TuneRow[]> {
	const rows = await db
		.select({
			chartSlug: playRuns.chartSlug,
			runs: sql<number>`count(*)::int`,
			playingMs: sql<number>`coalesce(sum(${playRuns.playingMs}), 0)::bigint`,
			voiced: sql<number>`coalesce(sum(${playRuns.voiced}), 0)::int`,
			landed: sql<number>`coalesce(sum(${playRuns.landed}), 0)::int`,
			partial: sql<number>`coalesce(sum(${playRuns.partial}), 0)::int`,
			bestStreak: sql<number>`coalesce(max(${playRuns.bestStreak}), 0)::int`,
			lastPlayed: sql<Date>`max(${playRuns.startedAt})`,
			firstPlayed: sql<Date>`min(${playRuns.startedAt})`
		})
		.from(playRuns)
		.where(eq(playRuns.userId, userId))
		.groupBy(playRuns.chartSlug)
		.orderBy(desc(sql`sum(${playRuns.playingMs})`));

	return rows.map((row) => ({ ...row, playingMs: Number(row.playingMs) }));
}

export type Trend = {
	chartSlug: string;
	recent: { voiced: number; landed: number };
	earlier: { voiced: number; landed: number };
};

/** How many recent runs count as "lately" when asking whether a tune is improving. */
const RECENT_RUNS = 5;

/**
 * The last few runs on a tune against everything before them.
 *
 * Two accuracies rather than a trend line, because a trend line drawn through
 * four runs is a decoration pretending to be evidence. The page only says
 * anything at all when both halves exist, so a tune played twice is reported as
 * played twice and not as improving.
 *
 * Runs with nothing played are excluded before the numbering, so an evening
 * spent listening does not push a real run out of "lately".
 */
export async function loadTrends(userId: string): Promise<Trend[]> {
	const rows = await db.execute<{
		chart_slug: string;
		recent_voiced: string | number;
		recent_landed: string | number;
		earlier_voiced: string | number;
		earlier_landed: string | number;
	}>(sql`
		select chart_slug,
		       coalesce(sum(voiced) filter (where rn <= ${RECENT_RUNS}), 0)::int as recent_voiced,
		       coalesce(sum(landed) filter (where rn <= ${RECENT_RUNS}), 0)::int as recent_landed,
		       coalesce(sum(voiced) filter (where rn > ${RECENT_RUNS}), 0)::int as earlier_voiced,
		       coalesce(sum(landed) filter (where rn > ${RECENT_RUNS}), 0)::int as earlier_landed
		from (
			select chart_slug, voiced, landed,
			       row_number() over (partition by chart_slug order by started_at desc) as rn
			from ${playRuns}
			where user_id = ${userId} and voiced > 0
		) numbered
		group by chart_slug
	`);

	return rows.rows.map((row) => ({
		chartSlug: row.chart_slug,
		recent: { voiced: Number(row.recent_voiced), landed: Number(row.recent_landed) },
		earlier: { voiced: Number(row.earlier_voiced), landed: Number(row.earlier_landed) }
	}));
}

export type Slice = { label: string; voiced: number; landed: number };

/**
 * Where the time went, by key and by chord quality.
 *
 * The seed of the blind-spot report, and it costs one `GROUP BY` each. The key
 * is the *local* one each chord was heard in rather than the tune's home key,
 * which is what makes practising a blues in C show up as time on F and G too.
 */
export async function loadSpread(userId: string): Promise<{ byKey: Slice[]; byQuality: Slice[] }> {
	const landed = sql<number>`count(*) filter (where ${chordAttempts.landing} = 'landed')::int`;

	const byKey = await db
		.select({
			label: chordAttempts.localKey,
			voiced: sql<number>`count(*)::int`,
			landed
		})
		.from(chordAttempts)
		.innerJoin(playRuns, eq(playRuns.id, chordAttempts.runId))
		.where(eq(playRuns.userId, userId))
		.groupBy(chordAttempts.localKey)
		.orderBy(desc(sql`count(*)`));

	/*
	 * Quality is the chord symbol with its root taken off — 'Bb7' becomes '7',
	 * 'Dm7b5' becomes 'm7b5' — so a dominant is a dominant in all twelve keys.
	 * Done in SQL because doing it in TypeScript would mean reading every
	 * attempt row into the page to count them.
	 */
	const quality = sql<string>`nullif(regexp_replace(${chordAttempts.chord}, '^[A-G][#b]?', ''), '')`;
	const byQuality = await db
		.select({
			label: sql<string>`coalesce(${quality}, 'major')`,
			voiced: sql<number>`count(*)::int`,
			landed
		})
		.from(chordAttempts)
		.innerJoin(playRuns, eq(playRuns.id, chordAttempts.runId))
		.where(eq(playRuns.userId, userId))
		.groupBy(sql`coalesce(${quality}, 'major')`)
		.orderBy(desc(sql`count(*)`));

	return { byKey, byQuality };
}

/**
 * Chords heard per key, for the home page's twelve swatches.
 *
 * The left half of `loadSpread`'s `byKey` and deliberately so: the home page and
 * the profile draw the same twelve keys, and drawing them from two different
 * questions is how two pages come to disagree about one record. The *local* key
 * again, so a blues in C fills F and G as well.
 *
 * Accuracy is not selected, and its absence is the point. A percentage per key
 * on the page you open to decide what to practise would be a verdict on ten
 * keys before the day has started, and this page never grades anybody. The
 * count is what a swatch needs.
 */
export async function loadKeyChords(
	userId: string
): Promise<Array<{ key: string; chords: number }>> {
	return db
		.select({
			key: chordAttempts.localKey,
			chords: sql<number>`count(*)::int`
		})
		.from(chordAttempts)
		.innerJoin(playRuns, eq(playRuns.id, chordAttempts.runId))
		.where(eq(playRuns.userId, userId))
		.groupBy(chordAttempts.localKey);
}

export type RecentRun = {
	id: string;
	chartSlug: string;
	keyCenter: string;
	bpm: number;
	startedAt: Date;
	playingMs: number;
	voiced: number;
	landed: number;
	bestStreak: number;
};

/** The last twenty, each linking back to the tune it was played over. */
export async function loadRecentRuns(userId: string, limit = 20): Promise<RecentRun[]> {
	return db
		.select({
			id: playRuns.id,
			chartSlug: playRuns.chartSlug,
			keyCenter: playRuns.keyCenter,
			bpm: playRuns.bpm,
			startedAt: playRuns.startedAt,
			playingMs: playRuns.playingMs,
			voiced: playRuns.voiced,
			landed: playRuns.landed,
			bestStreak: playRuns.bestStreak
		})
		.from(playRuns)
		.where(eq(playRuns.userId, userId))
		.orderBy(desc(playRuns.startedAt))
		.limit(limit);
}
