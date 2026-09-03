import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from './index';
import {
	badges,
	cards,
	charts,
	chordAttempts,
	playRuns,
	reviews,
	sessionBlocks,
	sessions,
	skills,
	srsState,
	isRetiredDirection,
	userPrefs
} from './schema';
import type { CardDirection, ReviewRating, WorkoutBlockType } from './schema';
import { initialState, schedule, type Schedulable, type SrsState } from '$lib/srs/scheduler';
import {
	coldSpotsFrom,
	composeWorkout,
	noveltyId,
	type Choice,
	type ColdSpot,
	type MissionChart,
	type Workout,
	type WorkoutInput,
	type WorkoutSize
} from '$lib/session/workout';
import {
	hydrateWorkout,
	isWorkout,
	taskBlockType,
	type ActiveWorkout
} from '$lib/session/progress';
import { reportWorkout, type Asked, type WorkoutReport } from '$lib/session/report';
import {
	isLadderKey,
	looksSolid,
	readyToMoveOn,
	rungOfSkill,
	type PastWorkout,
	type RungRecord
} from '$lib/session/journey';
import { loadTempoGrades } from './play-log';
import type { Verdict } from '$lib/practice/goal';
import { chartDemand, MISSION_CHARTS } from '$lib/curriculum/charts';
import { vocabularyOf, type Vocabulary } from '$lib/curriculum/vocabulary';
import { isGroove, type Groove } from '$lib/audio/groove';
import { keyTonic } from '$lib/music/key';
import {
	cellsOf,
	deepen,
	FIRST_FRONTIER,
	frontierCovering,
	isWellFormed,
	narrower,
	nextCell,
	nextOpening,
	positionOf,
	rungById,
	stageByKey,
	STAGES,
	widen,
	widenNext,
	widest,
	workingPosition,
	type Frontier,
	type Position
} from '$lib/curriculum/ladder';
import {
	cardsForProgression,
	cardsForReached,
	cardsForRung,
	rungSkillCode,
	type GeneratedCard
} from '$lib/curriculum/cards';
import { progressionById } from '$lib/curriculum/progressions';
import { loadSettings, saveSettings } from './settings';

/**
 * Reading and writing workouts.
 *
 * Tasks are written as they finish rather than at the end, so a workout that is
 * abandoned halfway still leaves everything up to that point on record — the
 * rule the six-block session had and the one thing about it worth keeping.
 *
 * Cards are created here too, lazily: reaching a rung is what brings its cards
 * into existence. Nothing is ever due that has not been introduced.
 *
 * **What is in flight is the latest unfinished workout, not today's session.**
 * Finishing one used to end the day, because the query that found a session
 * asked for one started since midnight and the page had nothing else to offer.
 * A day has no maximum, so the question is now "is there one open" and the
 * answer to "I have finished" is a fresh workout rather than a sentence telling
 * you that you have practised enough.
 *
 * A session written by the six-block planner is left exactly where it lies: an
 * unfinished v1 plan is never hydrated, never resumed and never migrated, so its
 * `ended_at` stays null, its finished blocks keep being counted by the profile,
 * and the home page simply offers a workout instead. That decision lives in
 * `isWorkout`, one function away, and this file only ever asks it.
 */

/**
 * How far the ladder is open, from settings, falling back to the very start.
 *
 * `parsePrefs` has already migrated a stored position into the frontier it
 * meant, so this only has to guard against a row that predates validation
 * entirely. The check is `isWellFormed` rather than a shape test, because a
 * widths array that is not a staircase would let the card generator open a rung
 * in a key whose scale is closed.
 */
export async function currentFrontier(userId: string): Promise<Frontier> {
	const settings = await loadSettings(userId);
	const frontier = { widths: settings.prefs.ladderWidths };
	return isWellFormed(frontier) ? frontier : FIRST_FRONTIER;
}

/** Where the lesson is, for the hero and the rung's own review count. */
export async function currentPosition(userId: string): Promise<Position> {
	return workingPosition(await currentFrontier(userId));
}

/**
 * Put back a frontier that was never written down.
 *
 * **This repairs the worst bug in the app and it is a one-shot migration, not a
 * policy.** `readFrontier` converts a stored `ladderKey` / `ladderRung` into the
 * frontier it always meant, which is correct — and nothing ever wrote the answer
 * back. So an account whose `ladderWidths` had been lost re-derived the same
 * legacy pair on every single request and sat there. One had been through all
 * seven rungs of C and the scale of G; it came back every morning as *the home
 * chord in C*, two cells wide. Every consequence of that looked like a different
 * bug: the same nine tunes were the only ones the vocabulary gate would clear,
 * the mission was one of them, the hero said the same rung for a fortnight, and
 * the drill room meanwhile went on asking about the sevenths, because the card
 * bank had never forgotten.
 *
 * The card bank is the repair. `ensureLadderCards` is the only writer of ladder
 * cards, so a card is *proof* that its cell was open — better evidence than a
 * settings row, which is a cache and had been clobbered. `frontierCovering`
 * turns those cells back into a staircase and `widest` merges it with whatever
 * is stored, so this can only ever give ground back and never take it.
 *
 * It runs only where `ladderWidths` is absent, which is exactly the damaged
 * shape. Once one is written — by this, or by any deepen or widen — the stored
 * value is authoritative forever and stepping back keeps working, which it would
 * not if the bank were consulted on every read.
 */
export async function repairFrontier(userId: string): Promise<Frontier> {
	const stored = await currentFrontier(userId);

	const [row] = await db
		.select({ prefs: userPrefs.prefsJson })
		.from(userPrefs)
		.where(eq(userPrefs.userId, userId))
		.limit(1);

	const widths = (row?.prefs as { ladderWidths?: unknown } | null)?.ladderWidths;
	if (isWellFormed({ widths })) return stored;

	const cells = await db
		.select({ code: skills.code, key: cards.keyCenter })
		.from(cards)
		.innerJoin(skills, eq(skills.id, cards.skillId))
		.where(and(eq(cards.userId, userId), sql`${skills.code} like 'rung:%'`));

	const evidence = frontierCovering(
		cells.flatMap((cell) => {
			const rungId = rungOfSkill(cell.code);
			return rungId && isLadderKey(cell.key) ? [{ key: cell.key, rungId }] : [];
		})
	);

	return saveFrontier(userId, widest(stored, evidence));
}

/**
 * Create any cards for places already reached that do not exist yet.
 *
 * Idempotent through the identity string, so it can be called on every session
 * start without duplicating anything — including two starts racing each other
 * (two tabs, two devices, or a retried request), which is why the read-then-
 * insert below runs under a transaction-scoped advisory lock keyed on the
 * user: without it, two concurrent calls can both read the same "not yet
 * known" identity, both insert a card for it, and leave two rows silently
 * tracking one question on two independent FSRS schedules.
 */
export async function ensureCards(userId: string, generated: GeneratedCard[]): Promise<number> {
	if (generated.length === 0) return 0;

	return await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'ensure_cards:' + userId}))`);

		const skillRows = await tx.select({ id: skills.id, code: skills.code }).from(skills);
		const skillIds = new Map(skillRows.map((s) => [s.code, s.id]));

		const existing = await tx
			.select({ payload: cards.payloadJson })
			.from(cards)
			.where(eq(cards.userId, userId));
		const known = new Set(
			existing
				.map((row) => (row.payload as { identity?: string })?.identity)
				.filter((id): id is string => Boolean(id))
		);

		const fresh = generated.filter((card) => !known.has(card.identity));
		if (fresh.length === 0) return 0;

		const newCards: Array<typeof cards.$inferInsert> = [];
		const newStates: Array<typeof srsState.$inferInsert> = [];
		const now = new Date();

		for (const card of fresh) {
			const skillId = skillIds.get(card.skillCode);
			// A card with no skill row would violate the foreign key. Skipping is
			// better than failing the whole session; the seed will supply it later.
			if (!skillId) continue;

			const id = randomUUID();
			newCards.push({
				id,
				userId,
				skillId,
				direction: card.direction,
				keyCenter: card.keyCenter,
				payloadJson: { ...card.payload, identity: card.identity }
			});
			newStates.push({ cardId: id, ...initialState(now) });
		}

		if (newCards.length === 0) return 0;
		await tx.insert(cards).values(newCards);
		await tx.insert(srsState).values(newStates);
		return newCards.length;
	});
}

/** Bring the ladder's cards up to date with everything the frontier holds. */
export async function ensureLadderCards(userId: string, frontier: Frontier): Promise<number> {
	return ensureCards(userId, cardsForReached(cellsOf(frontier)));
}

/** Bring a progression into existence in a key, the first time it is asked for. */
export async function ensureProgressionCards(
	userId: string,
	progressionId: string,
	keyName: string
): Promise<number> {
	const progression = progressionById(progressionId);
	if (!progression) return 0;
	return ensureCards(userId, cardsForProgression(progression, keyName));
}

/** Write a frontier and create whatever it opened. The one way the ladder moves. */
async function saveFrontier(userId: string, to: Frontier): Promise<Frontier> {
	const settings = await loadSettings(userId);
	await saveSettings(userId, { prefs: { ...settings.prefs, ladderWidths: to.widths } });
	await ensureLadderCards(userId, to);
	return to;
}

/**
 * Go deeper: open the next rung, and one more key of every rung above it.
 *
 * Two moves where there used to be one, and this is the one that carries the
 * milestone. Deepening is not free — see `deepen` — so it is impossible to end
 * up four rungs down in a key whose scale was never opened.
 */
export async function deepenLadder(userId: string): Promise<Frontier> {
	const from = await currentFrontier(userId);
	const to = deepen(from);
	return to ? saveFrontier(userId, to) : from;
}

/** Go wider: the same rung, one more key, for somebody who wants more ground. */
export async function widenLadder(userId: string): Promise<Frontier> {
	const from = await currentFrontier(userId);
	const to = widenNext(from);
	return to ? saveFrontier(userId, to) : from;
}

/**
 * Go wider on a named line rather than on whichever one `nextWidening` picks.
 *
 * `widenLadder` opens the *deepest* line with room, which is the right default
 * and was the only thing on offer. The map made the gap obvious: it draws a
 * stub from every line that can take another stop, and somebody who wants the
 * scale in F should be able to press the one pointing at F rather than widen
 * repeatedly until the deepest line runs out of room and the shallowest becomes
 * the default. Both write the same frontier; this one is asked a question.
 *
 * `widen` refuses anything that would break the staircase, so an index that has
 * been fiddled with in a form post leaves the ladder exactly where it was.
 */
export async function widenLadderAt(userId: string, rungIndex: number): Promise<Frontier> {
	const from = await currentFrontier(userId);
	const to = widen(from, rungIndex);
	return to ? saveFrontier(userId, to) : from;
}

/**
 * Open whatever is next, whichever direction that is.
 *
 * What the workout's "ready to move on" button does, and it has to ask the same
 * question `nextOpening` answers or the two disagree in the one case that
 * matters. `deepenLadder` alone returns the frontier unchanged once every rung
 * is open somewhere, so a button wired to it did nothing at all for anybody who
 * had finished a key — pressed, redirected, and left them exactly where they
 * were. The home page has offered both moves as separate buttons all along; this
 * is the same pair behind one.
 */
export async function openLadder(userId: string): Promise<Frontier> {
	const from = await currentFrontier(userId);
	const to = deepen(from) ?? widenNext(from);
	return to ? saveFrontier(userId, to) : from;
}

/**
 * Step back, for when going on turned out to be optimistic.
 *
 * Nothing is deleted. The cards stay, their schedules stay, and the reviews
 * stay — closing a cell only stops the ladder offering it, which is what going
 * back has always meant here.
 */
export async function stepBackLadder(userId: string): Promise<Frontier> {
	const from = await currentFrontier(userId);
	const to = narrower(from);
	if (!to) return from;
	const settings = await loadSettings(userId);
	await saveSettings(userId, { prefs: { ...settings.prefs, ladderWidths: to.widths } });
	return to;
}

/**
 * The musical thing a card asks about, as the composer's budget counts it.
 *
 * Key, kind and label — so the four directions of one chord are one item, and
 * the C major triad is the same item whether it was opened by the home-chord
 * rung or the three-main-chords rung above it. That last part is deliberate: it
 * is the same chord under the same hand, and a workout that has just asked
 * about it three times has asked enough.
 *
 * The same three fields `lesson.ts` keys its guidance on, and for the same
 * reason — see `guidanceKey`, which had this idea first and needed it on the
 * page rather than in the composer. Falls back to nothing for a payload that
 * cannot name itself, and a card with no item counts as its own.
 */
function itemIdentity(keyCenter: string, payload: unknown): string | undefined {
	const shape = payload as { kind?: string; label?: string } | null;
	if (!shape?.kind || !shape.label) return undefined;
	return `${keyCenter}|${shape.kind}|${shape.label}`;
}

/** Everything with a schedule, due or not, in the shape the composer reads. */
async function schedulableCards(userId: string): Promise<Schedulable[]> {
	const scheduled = await db
		.select({
			cardId: cards.id,
			direction: cards.direction,
			keyCenter: cards.keyCenter,
			skillCode: skills.code,
			payload: cards.payloadJson,
			stability: srsState.stability,
			difficulty: srsState.difficulty,
			dueAt: srsState.dueAt,
			reps: srsState.reps,
			lapses: srsState.lapses,
			state: srsState.state,
			lastReviewedAt: srsState.lastReviewedAt
		})
		.from(cards)
		.innerJoin(srsState, eq(srsState.cardId, cards.id))
		.innerJoin(skills, eq(skills.id, cards.skillId))
		.where(eq(cards.userId, userId));

	/*
	 * One of the two places a retired direction stops.
	 *
	 * Nothing downstream would pick one anyway — no queue lists them — but a
	 * composer that never sees a withdrawn card cannot accidentally count one,
	 * and "the app does not know these exist" is a smaller thing to keep true
	 * than "every reader remembers to skip them".
	 */
	const schedulable: Schedulable[] = scheduled
		.filter((row) => !isRetiredDirection(row.direction))
		.map((row) => ({
			cardId: row.cardId,
			direction: row.direction as CardDirection,
			keyCenter: row.keyCenter,
			skillCode: row.skillCode,
			item: itemIdentity(row.keyCenter, row.payload),
			state: {
				stability: row.stability,
				difficulty: row.difficulty,
				dueAt: row.dueAt,
				reps: row.reps,
				lapses: row.lapses,
				state: row.state,
				lastReviewedAt: row.lastReviewedAt
			}
		}));

	return schedulable;
}

/**
 * The record's cold spots, as one `GROUP BY`.
 *
 * The blind-spot report from M6, arriving as an input rather than as a finding.
 * The grouping is by the chord as it was written and the key it was heard in —
 * the *local* key, so a blues in C shows up as time on F and G too — and the
 * fold into qualities happens in `coldSpotsFrom`, which is pure and where
 * `parseChord` already lives.
 */
/**
 * What the drill room has taught, as the songbook and the composer both read it.
 *
 * One derivation, two callers. The workout composer needs it to decide where a
 * mission may be set; the songbook needs it to mark which tunes are within
 * reach. Two copies of this would be two answers to the same question, and the
 * one thing worse than a locked tune is a tune the list calls ready and the
 * workout will not set.
 */
export async function currentVocabulary(userId: string): Promise<Vocabulary> {
	const frontier = await currentFrontier(userId);
	const played = await alreadyPlayed(userId);
	return vocabularyOf({
		rungs: cellsOf(frontier).map((cell) => cell.rungId),
		progressions: played.progressions
	});
}

export async function loadColdSpots(userId: string): Promise<ColdSpot[]> {
	const rows = await db
		.select({
			localKey: chordAttempts.localKey,
			chord: chordAttempts.chord,
			attempts: sql<number>`count(*)::int`,
			landed: sql<number>`count(*) filter (where ${chordAttempts.landing} = 'landed')::int`
		})
		.from(chordAttempts)
		.innerJoin(playRuns, eq(playRuns.id, chordAttempts.runId))
		.where(eq(playRuns.userId, userId))
		.groupBy(chordAttempts.localKey, chordAttempts.chord);

	return coldSpotsFrom(rows);
}

/**
 * Every chart a mission may be set on: the built-ins, plus yours.
 *
 * The same union the play-along page shows, because a mission is that page under
 * a constraint and being sent to a tune you cannot find in the list would be a
 * mission you cannot play.
 */
async function missionCharts(userId: string): Promise<MissionChart[]> {
	const built = new Set(MISSION_CHARTS.map((chart) => chart.slug));
	const rows = await db
		.select({
			slug: charts.slug,
			name: charts.name,
			style: charts.style,
			mode: charts.mode,
			gridJson: charts.gridJson,
			defaultBpm: charts.defaultBpm,
			defaultGroove: charts.defaultGroove
		})
		.from(charts)
		.where(eq(charts.userId, userId));

	const mine: MissionChart[] = rows
		.filter((row) => !built.has(row.slug))
		.map((row) => ({
			slug: row.slug,
			name: row.name,
			style: row.style,
			category: 'mine',
			mode: row.mode,
			defaultBpm: row.defaultBpm,
			// A row written before grooves existed says `swing`, which is what it
			// played as — the same reading the play-along loader gives it.
			defaultGroove: isGroove(row.defaultGroove) ? row.defaultGroove : 'swing',
			// Read from the grid you typed in, on exactly the terms a built-in is
			// read: your own tune is gated by what it asks for, not waved through
			// for being yours.
			demand: chartDemand({ grid: row.gridJson, mode: row.mode })
		}));

	return [...MISSION_CHARTS, ...mine];
}

/**
 * How many runs each tune already has, by slug.
 *
 * One `GROUP BY` over `play_runs`, and the composer's input for saying whether
 * a mission's tune is one you have met. Every run counts, mission or free — the
 * question is whether you know the tune, and an evening spent playing along to
 * it for fun taught you exactly as much as a mission did.
 */
async function chartPlays(userId: string): Promise<Record<string, number>> {
	const rows = await db
		.select({ slug: playRuns.chartSlug, n: sql<number>`count(*)::int` })
		.from(playRuns)
		.where(eq(playRuns.userId, userId))
		.groupBy(playRuns.chartSlug);

	return Object.fromEntries(rows.map((row) => [row.slug, row.n]));
}

/** Progressions the bank has met, and grooves the record has been played over. */
async function alreadyPlayed(
	userId: string
): Promise<{ progressions: string[]; grooves: Groove[] }> {
	const met = await db
		.selectDistinct({ code: skills.code })
		.from(cards)
		.innerJoin(skills, eq(skills.id, cards.skillId))
		.where(and(eq(cards.userId, userId), sql`${skills.code} like 'prog:%'`));

	const heard = await db
		.selectDistinct({ groove: playRuns.groove })
		.from(playRuns)
		.where(eq(playRuns.userId, userId));

	return {
		progressions: met.map((row) => row.code.slice('prog:'.length)),
		grooves: heard.map((row) => row.groove).filter((groove): groove is Groove => isGroove(groove))
	};
}

/**
 * The novelty of the last workout composed, so today can refuse to repeat it.
 *
 * The last one composed rather than the last one finished: what makes a new
 * thing new is having been *shown* it, and a workout walked away from still
 * showed it.
 */
async function lastNovelty(userId: string, before: Date): Promise<string | null> {
	const rows = await db
		.select({ planJson: sessions.planJson })
		.from(sessions)
		.where(and(eq(sessions.userId, userId), lt(sessions.startedAt, before)))
		.orderBy(desc(sessions.startedAt))
		.limit(RECENT_SESSIONS);

	for (const row of rows) {
		if (!isWorkout(row.planJson)) continue;
		return row.planJson.novelty ? noveltyId(row.planJson.novelty) : null;
	}
	return null;
}

/**
 * How far back to look for something the newest row cannot answer.
 *
 * A handful, not all of them. The two questions asked this way — what was new
 * last time, and is anything still open — are both about the recent past, and a
 * v1 session in flight is the one thing that can sit at the top of that list
 * without being an answer.
 */
const RECENT_SESSIONS = 5;

export type WorkoutRequest = {
	size?: WorkoutSize;
	/** What the picker pinned, already read into the composer's own shape. */
	choice?: Choice | null;
	/** Keep the whole run at the pinned station. See `WorkoutInput.stationOnly`. */
	stationOnly?: boolean;
};

/**
 * Everything the composer needs, gathered from the record.
 *
 * Four inputs and a date, exactly as the plan describes them: the due pile, the
 * neighbourhood of the ladder position, the record's cold spots, and what was
 * new last time. Nothing here decides anything — the deciding is all in
 * `composeWorkout`, which is why it can be proved without any of this.
 *
 * Since M16 the tempo ladders come the same way, and for the same reason the
 * cold spots do: the composer is pure, so a grade derived from the runs arrives
 * as an input rather than the composer reaching for the runs itself.
 */
async function gatherWorkoutInput(
	userId: string,
	frontier: Frontier,
	request: WorkoutRequest,
	now: Date
): Promise<WorkoutInput> {
	const position = workingPosition(frontier);
	const [cardBank, coldSpots, chartList, played, progress, yesterdaysNovelty, tempo, plays] =
		await Promise.all([
			schedulableCards(userId),
			loadColdSpots(userId),
			missionCharts(userId),
			alreadyPlayed(userId),
			rungProgress(userId, position, frontier),
			lastNovelty(userId, now),
			loadTempoGrades(userId),
			chartPlays(userId)
		]);

	const reached = cellsOf(frontier);

	return {
		size: request.size,
		cards: cardBank,
		reached,
		// What deepening would open next, worked out here because it needs the
		// shape of the frontier and the composer is pure.
		nextCell: nextCell(frontier),
		// And what *any* move would open, which past the seventh rung is the only
		// one of the two that still has an answer. See `nextOpening`.
		nextOpening: nextOpening(frontier),
		coldSpots,
		charts: chartList,
		ladders: tempo.ladders,
		plays,
		played,
		yesterdaysNovelty,
		choice: request.choice ?? null,
		stationOnly: request.stationOnly ?? false,
		// The wider reading, so the offer to go deeper arrives on a rung that has
		// been worked to death as well as on one that has been mastered.
		rungLooksSolid: progress.readyToMoveOn,
		standingOn: {
			rungId: position.rung.id,
			label: position.rung.label,
			reviews: progress.reviews,
			correct: progress.correct
		},
		// What the two halves of the drill room have between them taught. The rungs
		// give the shapes, the progressions give the ground; the composer compares
		// it against what each tune asks for and sets a mission only where it fits.
		vocabulary: vocabularyOf({
			rungs: reached.map((place) => place.rungId),
			progressions: played.progressions
		}),
		now
	};
}

/**
 * Today's workout at each of the three sizes, as it would be if you started now.
 *
 * For the home page, which previews the tasks rather than starting them. All
 * three are composed from one gathering, because the size picker is a button on
 * the same screen and a preview that had to go back to the server to change
 * length would be slower than the thing it is previewing.
 *
 * Composed with nothing pinned, because nothing has been pinned yet: a choice
 * moves the key and leads the queues rather than changing what the day is made
 * of, so the preview stays true while the picker is being used. Writes nothing
 * except the cards the ladder has reached, which is the same lazy creation every
 * other read of a reached rung already does — a degree card that does not exist
 * yet would otherwise make the preview promise a task the workout then drops.
 */
export async function previewWorkouts(
	userId: string,
	now = new Date()
): Promise<Record<WorkoutSize, Workout>> {
	const frontier = await repairFrontier(userId);
	await ensureLadderCards(userId, frontier);
	const input = await gatherWorkoutInput(userId, frontier, {}, now);

	return {
		short: composeWorkout({ ...input, size: 'short' }),
		standard: composeWorkout({ ...input, size: 'standard' }),
		long: composeWorkout({ ...input, size: 'long' })
	};
}

/**
 * The workout in flight, or nothing.
 *
 * Latest unfinished, with no date on the query at all. A session written by the
 * six-block planner cannot be hydrated and is skipped rather than ended: it
 * keeps its null `ended_at`, its finished blocks keep counting, and this looks
 * past it. Only a handful are considered, because anything older than that is
 * abandoned by any reasonable reading and dragging it back would be stranger
 * than leaving it.
 */
export async function activeWorkout(userId: string): Promise<ActiveWorkout | null> {
	const rows = await db
		.select()
		.from(sessions)
		.where(and(eq(sessions.userId, userId), isNull(sessions.endedAt)))
		.orderBy(desc(sessions.startedAt))
		.limit(RECENT_SESSIONS);

	for (const row of rows) {
		if (!isWorkout(row.planJson)) continue;
		const active = hydrateWorkout(row, await blocksOf(row.id));
		if (active) return active;
	}
	return null;
}

async function blocksOf(sessionId: string) {
	return db
		.select({
			id: sessionBlocks.id,
			blockType: sessionBlocks.blockType,
			endedAt: sessionBlocks.endedAt,
			resultJson: sessionBlocks.resultJson
		})
		.from(sessionBlocks)
		.where(eq(sessionBlocks.sessionId, sessionId));
}

/**
 * Start a workout, or hand back the one already open.
 *
 * The material is brought into existence first — the ladder's cards always, and
 * a pinned rung or progression as well, because a choice is allowed to be
 * somewhere the ladder has never been. Exploring is not advancing: nothing here
 * moves the ladder, and nothing is checked against how far it has got.
 */
export async function startWorkout(
	userId: string,
	request: WorkoutRequest = {},
	now = new Date()
): Promise<ActiveWorkout> {
	const open = await activeWorkout(userId);
	if (open) return open;

	// Repaired rather than read, because a workout composed from a frontier that
	// was silently rolled back is the whole of the bug: the drills would ask about
	// the sevenths while the mission gate believed nothing but the home chord had
	// ever been met. Idempotent and free once the widths are on the row.
	const frontier = await repairFrontier(userId);
	await ensureLadderCards(userId, frontier);

	const choice = request.choice ?? null;
	if (choice?.kind === 'progression') {
		await ensureProgressionCards(userId, choice.progressionId, choice.keyCenter);
	} else if (choice?.kind === 'rung') {
		const stage = stageByKey(choice.key);
		if (stage) await ensureCards(userId, cardsForRung(choice.rungId, stage));
	}

	const workout = composeWorkout(
		await gatherWorkoutInput(userId, frontier, { ...request, choice }, now)
	);

	const id = randomUUID();
	await db.insert(sessions).values({
		id,
		userId,
		startedAt: now,
		keyCenter: workout.keyCenter,
		planJson: workout
	});

	// Hydrated rather than assembled, so a workout one second old and one an hour
	// old are the same shape read the same way.
	return hydrateWorkout({ id, startedAt: now, planJson: workout }, [])!;
}

/** The workout a session holds, or null when the row is not one. */
async function workoutOf(sessionId: string, userId: string): Promise<Workout | null> {
	const [row] = await db
		.select({ planJson: sessions.planJson })
		.from(sessions)
		.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
		.limit(1);

	return row && isWorkout(row.planJson) ? row.planJson : null;
}

/**
 * Open the row that will record a task, and say which row it is.
 *
 * Begun when the task is actually started rather than when the workout is
 * composed, because `session_blocks` is also how long was spent: five rows
 * opened at once would each claim the whole workout, and the profile's hours
 * would count the same minutes five times over. A mission needs the id before it
 * can hand off to `/backing`, which is the other reason this is a call and not a
 * side effect.
 */
export async function beginTask(
	userId: string,
	sessionId: string,
	index: number
): Promise<string | null> {
	const workout = await workoutOf(sessionId, userId);
	const task = workout?.tasks[index];
	if (!task) return null;
	return beginBlock(sessionId, taskBlockType(task.kind, index));
}

/**
 * A task is over.
 *
 * The same write a mission's own verdict makes from `saveFlush`, reached the
 * other way: a drill task counts its own questions and finishes itself, and a
 * mission that was skipped or given up on is finished here rather than by a run.
 */
export async function finishTask(
	userId: string,
	sessionId: string,
	index: number,
	result: unknown,
	now = new Date()
): Promise<boolean> {
	const workout = await workoutOf(sessionId, userId);
	const task = workout?.tasks[index];
	if (!task) return false;

	await finishBlock(sessionId, taskBlockType(task.kind, index), result, now);
	return true;
}

/**
 * Open a block's row, or hand back the one already open.
 *
 * `WorkoutBlockType` and not `BlockType`, which is where the old six-block
 * vocabulary is actually retired: the names those blocks used are still readable
 * — `practiceTotals` counts their hours and always will — but there is no longer
 * a way to write one, and the type says so rather than a comment somewhere
 * hoping to be read.
 */
export async function beginBlock(sessionId: string, blockType: WorkoutBlockType): Promise<string> {
	// A plain check-then-insert races: two tabs (or a retry) opening the same
	// block at once can both see no existing row and both insert one, and
	// `finishBlock`'s update — which matches on (session, blockType), not a
	// single id — would then silently mark both duplicates finished, doubling
	// the block in every count `practiceTotals` and the workout report take
	// from it. The transaction-scoped lock serializes exactly that race,
	// released automatically when the transaction ends.
	return await db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${'session_block:' + sessionId + ':' + blockType}))`
		);
		const [existing] = await tx
			.select({ id: sessionBlocks.id })
			.from(sessionBlocks)
			.where(and(eq(sessionBlocks.sessionId, sessionId), eq(sessionBlocks.blockType, blockType)))
			.limit(1);
		if (existing) return existing.id;

		const id = randomUUID();
		await tx.insert(sessionBlocks).values({ id, sessionId, blockType });
		return id;
	});
}

export async function finishBlock(
	sessionId: string,
	blockType: WorkoutBlockType,
	result: unknown,
	now = new Date()
): Promise<void> {
	await beginBlock(sessionId, blockType);
	await db
		.update(sessionBlocks)
		.set({ endedAt: now, resultJson: result as never })
		.where(and(eq(sessionBlocks.sessionId, sessionId), eq(sessionBlocks.blockType, blockType)));
}

export async function finishSession(
	userId: string,
	sessionId: string,
	result: unknown,
	now = new Date()
): Promise<void> {
	await db
		.update(sessions)
		.set({ endedAt: now, resultJson: result as never })
		.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

/**
 * End a workout, and say what changed while it ran.
 *
 * The report is worked out before the session is closed and stored on it, so the
 * end screen can be read again months later from the row that was written at the
 * time rather than recomputed against a record that has moved on since.
 */
export async function finishWorkout(
	sessionId: string,
	userId: string,
	now = new Date()
): Promise<WorkoutReport | null> {
	const report = await loadWorkoutReport(sessionId, userId);
	await finishSession(userId, sessionId, report, now);
	return report;
}

/**
 * What a workout has to show for itself, entirely from rows.
 *
 * Six counts and no estimates. Every figure here is something the database can
 * be asked for directly — reviews graded in this session, the same over the last
 * session that graded any, verdicts written on this session's blocks, the keys
 * those touched against what the record held in them beforehand, and badges won
 * by runs this workout set. Where the rows say nothing, `reportWorkout` says
 * nothing; that decision is next door and pure, and this only counts.
 */
export async function loadWorkoutReport(
	sessionId: string,
	userId: string
): Promise<WorkoutReport | null> {
	const [row] = await db
		.select({ startedAt: sessions.startedAt, planJson: sessions.planJson })
		.from(sessions)
		.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
		.limit(1);

	if (!row || !isWorkout(row.planJson)) return null;
	const workout = row.planJson;
	const since = row.startedAt;

	const blocks = await blocksOf(sessionId);
	const finishedBlocks = blocks.filter((block) => block.endedAt !== null);
	const blockIds = blocks.map((block) => block.id);

	const [answered, keysAsked, previous, runs] = await Promise.all([
		gradedIn(sessionId),
		keysAskedIn(sessionId),
		gradedBefore(userId, since),
		runsFor(blockIds)
	]);

	const runIds = runs.map((run) => run.id);
	const [keysPlayed, badgesWon, heldBefore] = await Promise.all([
		keysPlayedIn(runIds),
		badgesWonIn(runIds),
		recordBefore(userId, since)
	]);

	const touched = [...new Set([...keysAsked, ...keysPlayed].map(keyTonic))];

	return reportWorkout({
		workout,
		tasksFinished: finishedBlocks.length,
		answered,
		previous,
		verdicts: finishedBlocks.flatMap((block) =>
			isVerdict(block.resultJson) ? [block.resultJson] : []
		),
		keysTouched: touched.map((keyCenter) => ({
			keyCenter,
			heldBefore: heldBefore.get(keyCenter) ?? 0
		})),
		badges: badgesWon
	});
}

/**
 * Is this stored result a mission's verdict?
 *
 * `result_json` holds whatever the task that finished put there — a count of
 * questions from a drill, a verdict from a mission — so the end screen has to
 * look before it quotes. Shallow on purpose: the endpoint that accepts a verdict
 * rebuilds it field by field, so anything in this column got past that already.
 */
function isVerdict(result: unknown): result is Verdict {
	if (typeof result !== 'object' || result === null) return false;
	const value = result as Record<string, unknown>;
	return typeof value.met === 'boolean' && typeof value.says === 'string' && Boolean(value.goal);
}

/** Questions graded in one session. */
async function gradedIn(sessionId: string): Promise<Asked> {
	const [row] = await db
		.select({
			asked: sql<number>`count(*)::int`,
			correct: sql<number>`count(*) filter (where ${reviews.correct})::int`
		})
		.from(reviews)
		.where(eq(reviews.sessionId, sessionId));

	return { asked: row?.asked ?? 0, correct: row?.correct ?? 0 };
}

/**
 * The same count over the last session that asked anything.
 *
 * "Last time" is the last time a question was answered, not the last row in the
 * table: a workout of one mission and one new thing grades nothing, and
 * comparing this morning's accuracy against a session that has no accuracy would
 * be comparing it against nothing at all.
 */
async function gradedBefore(userId: string, since: Date): Promise<Asked | null> {
	const [row] = await db
		.select({
			asked: sql<number>`count(*)::int`,
			correct: sql<number>`count(*) filter (where ${reviews.correct})::int`
		})
		.from(reviews)
		.innerJoin(sessions, eq(sessions.id, reviews.sessionId))
		.where(and(eq(sessions.userId, userId), lt(sessions.startedAt, since)))
		.groupBy(sessions.id, sessions.startedAt)
		.orderBy(desc(sessions.startedAt))
		.limit(1);

	return row && row.asked > 0 ? { asked: row.asked, correct: row.correct } : null;
}

/** Keys the questions in this session were asked in. */
async function keysAskedIn(sessionId: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ keyCenter: cards.keyCenter })
		.from(reviews)
		.innerJoin(cards, eq(cards.id, reviews.cardId))
		.where(eq(reviews.sessionId, sessionId));

	return rows.map((row) => row.keyCenter);
}

/** The runs a workout's missions produced, through the blocks they answered. */
async function runsFor(blockIds: string[]): Promise<Array<{ id: string }>> {
	if (blockIds.length === 0) return [];
	return db
		.select({ id: playRuns.id })
		.from(playRuns)
		.where(inArray(playRuns.sessionBlockId, blockIds));
}

/** Keys the missions were actually heard in — local keys, not the tune's home. */
async function keysPlayedIn(runIds: string[]): Promise<string[]> {
	if (runIds.length === 0) return [];
	const rows = await db
		.selectDistinct({ localKey: chordAttempts.localKey })
		.from(chordAttempts)
		.where(inArray(chordAttempts.runId, runIds));

	return rows.map((row) => row.localKey);
}

async function badgesWonIn(runIds: string[]) {
	if (runIds.length === 0) return [];
	return db
		.select({ tier: badges.tier, chartSlug: badges.chartSlug, count: badges.count })
		.from(badges)
		.where(inArray(badges.runId, runIds));
}

/**
 * How much the record held in each key before this workout started.
 *
 * Both halves of the record, because both are places a key can have been: chords
 * judged on the play-along page and questions graded in the drill room. Counted
 * per key and never compared to a threshold — the only thing anything asks of
 * this number is whether it is zero.
 */
async function recordBefore(userId: string, since: Date): Promise<Map<string, number>> {
	const [played, asked] = await Promise.all([
		db
			.select({ label: chordAttempts.localKey, n: sql<number>`count(*)::int` })
			.from(chordAttempts)
			.innerJoin(playRuns, eq(playRuns.id, chordAttempts.runId))
			.where(and(eq(playRuns.userId, userId), lt(playRuns.startedAt, since)))
			.groupBy(chordAttempts.localKey),
		db
			.select({ label: cards.keyCenter, n: sql<number>`count(*)::int` })
			.from(reviews)
			.innerJoin(cards, eq(cards.id, reviews.cardId))
			.where(and(eq(cards.userId, userId), lt(reviews.ts, since)))
			.groupBy(cards.keyCenter)
	]);

	const held = new Map<string, number>();
	for (const row of [...played, ...asked]) {
		const key = keyTonic(row.label);
		held.set(key, (held.get(key) ?? 0) + (row.n ?? 0));
	}
	return held;
}

export type ReviewInput = {
	id: string;
	cardId: string;
	rating: ReviewRating;
	correct: boolean;
	latencyMs: number | null;
	played?: number[];
};

/**
 * Record reviews and advance their schedules, in one transaction.
 *
 * All or nothing: a half-written batch would leave the scheduler believing a
 * card was reviewed when no review exists to justify it.
 */
export async function recordReviews(
	userId: string,
	sessionId: string | null,
	batch: ReviewInput[],
	now = new Date()
): Promise<void> {
	if (batch.length === 0) return;
	if (sessionId) {
		const [ownSession] = await db
			.select({ id: sessions.id })
			.from(sessions)
			.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
			.limit(1);
		if (!ownSession) return;
	}

	await db.transaction(async (tx) => {
		const ids = batch.map((r) => r.cardId);
		const states = await tx
			.select({ state: srsState, userId: cards.userId })
			.from(srsState)
			.innerJoin(cards, eq(cards.id, srsState.cardId))
			.where(and(inArray(srsState.cardId, ids), eq(cards.userId, userId)));
		const byCard = new Map(states.map((row) => [row.state.cardId, row.state]));
		const owned = new Set(states.map((row) => row.state.cardId));

		for (const review of batch) {
			if (!owned.has(review.cardId)) continue;
			const inserted = await tx
				.insert(reviews)
				.values({
					id: review.id,
					cardId: review.cardId,
					sessionId,
					ts: now,
					rating: review.rating,
					correct: review.correct,
					latencyMs: review.latencyMs,
					playedJson: review.played ? { notes: review.played } : null
				})
				.onConflictDoNothing({ target: reviews.id })
				.returning({ id: reviews.id });

			// Retried requests carry the same id: the review and SRS update happen once.
			if (inserted.length === 0) continue;

			const row = byCard.get(review.cardId);
			const current: SrsState = row
				? {
						stability: row.stability,
						difficulty: row.difficulty,
						dueAt: row.dueAt,
						reps: row.reps,
						lapses: row.lapses,
						state: row.state,
						lastReviewedAt: row.lastReviewedAt
					}
				: initialState(now);

			const next = schedule(current, review.rating, now);
			await tx
				.insert(srsState)
				.values({ cardId: review.cardId, ...next })
				.onConflictDoUpdate({ target: srsState.cardId, set: next });
			byCard.set(review.cardId, { cardId: review.cardId, ...next });
		}
	});
}

/**
 * How the current rung is going, for deciding whether to suggest moving on.
 *
 * Counted across **every key the rung is open in**, which is what the path on
 * the home page has always counted and what `looksSolid`'s own note says the two
 * had better agree about. They did not: this asked about one key — the last one
 * the rung was opened in — so a rung practised solidly in C and freshly opened
 * in G came back as whatever G held, which on the morning it opened is nothing.
 * The path drew the step as done and the button underneath it stayed dark.
 *
 * A rung is one idea and the keys are where it is met, so the total is the
 * number that answers "do I know this yet".
 */
export async function rungProgress(userId: string, position: Position, frontier?: Frontier) {
	const code = rungSkillCode(position.rung.id);
	const open = frontier
		? STAGES.slice(0, frontier.widths[position.rungIndex] ?? 0).map((stage) => stage.key)
		: [position.stage.key];

	const [row] = await db
		.select({
			total: sql<number>`count(${reviews.id})::int`,
			correct: sql<number>`sum(case when ${reviews.correct} then 1 else 0 end)::int`
		})
		.from(cards)
		.innerJoin(skills, eq(skills.id, cards.skillId))
		.leftJoin(reviews, eq(reviews.cardId, cards.id))
		.where(
			and(
				eq(cards.userId, userId),
				eq(skills.code, code),
				open.length ? inArray(cards.keyCenter, open) : eq(cards.keyCenter, position.stage.key)
			)
		);

	const total = row?.total ?? 0;
	const correct = row?.correct ?? 0;

	return {
		reviews: total,
		correct,
		accuracy: total > 0 ? correct / total : 0,
		/** Only ever a suggestion — moving on is your call. */
		looksSolid: looksSolid(position.rung, total, correct),
		/**
		 * Whether to say "ready to move on" out loud.
		 *
		 * Wider than `looksSolid` by exactly one case — a rung worked far past the
		 * point of teaching anything, see `hasOutgrown` — and kept as a separate
		 * field so the page can still draw the step honestly as unsolid while
		 * offering the way on.
		 */
		readyToMoveOn: readyToMoveOn(position.rung, total, correct)
	};
}

/**
 * The same count, for every rung of every key at once.
 *
 * One `GROUP BY` where the home page used to have nothing at all. `rungProgress`
 * answers it for the rung you are standing on and this answers it for the whole
 * ladder, so the path can say what the record holds at each step behind you
 * instead of drawing a tick that means "the settings row moved past here".
 *
 * A left join, so a rung whose cards exist but which has never been asked comes
 * back as a zero rather than as an absence — the page draws those differently
 * and needs to be able to tell them apart. Rows whose skill is not a rung's, or
 * whose key the ladder does not know, are dropped here rather than shown as a
 * step nobody can find: a progression is not a place on this path.
 */
export async function ladderRecord(userId: string): Promise<RungRecord[]> {
	const rows = await db
		.select({
			code: skills.code,
			key: cards.keyCenter,
			reviews: sql<number>`count(${reviews.id})::int`,
			correct: sql<number>`count(*) filter (where ${reviews.correct})::int`
		})
		.from(cards)
		.innerJoin(skills, eq(skills.id, cards.skillId))
		.leftJoin(reviews, eq(reviews.cardId, cards.id))
		.where(and(eq(cards.userId, userId), sql`${skills.code} like 'rung:%'`))
		.groupBy(skills.code, cards.keyCenter);

	return rows.flatMap((row) => {
		const rungId = rungOfSkill(row.code);
		if (!rungId || !isLadderKey(row.key)) return [];
		return [{ key: row.key, rungId, reviews: row.reviews, correct: row.correct }];
	});
}

/**
 * The last few workouts, as what they were made of.
 *
 * Everything on this page that looks backwards has to survive one test: it must
 * not be able to fall. This does — a workout that happened stays happened, an
 * abandoned one keeps whatever it got through, and there is no streak anywhere
 * near it. What it is for is the answer to "does this thing know what I did",
 * asked by somebody who has practised most days for a fortnight and been shown
 * the same screen every time.
 *
 * The workout in flight is excluded by id rather than by its null `ended_at`,
 * because an abandoned workout also has a null one and it happened too. Sessions
 * written by the six-block planner are skipped for the usual reason: a plan that
 * is not a v2 workout has no tasks to name.
 */
export async function recentWorkouts(
	userId: string,
	options: { limit?: number; exclude?: string | null } = {}
): Promise<PastWorkout[]> {
	const limit = options.limit ?? 5;

	// Read more rows than are wanted, because v1 sessions are dropped below and
	// a page of history should not go short on an account old enough to have any.
	const rows = await db
		.select({
			id: sessions.id,
			startedAt: sessions.startedAt,
			keyCenter: sessions.keyCenter,
			planJson: sessions.planJson
		})
		.from(sessions)
		.where(eq(sessions.userId, userId))
		.orderBy(desc(sessions.startedAt))
		.limit(limit * 4);

	const wanted = rows
		.filter((row) => row.id !== options.exclude && isWorkout(row.planJson))
		.slice(0, limit);

	if (wanted.length === 0) return [];

	const finished = await db
		.select({ sessionId: sessionBlocks.sessionId, n: sql<number>`count(*)::int` })
		.from(sessionBlocks)
		.where(
			and(
				inArray(
					sessionBlocks.sessionId,
					wanted.map((row) => row.id)
				),
				sql`${sessionBlocks.endedAt} is not null`
			)
		)
		.groupBy(sessionBlocks.sessionId);

	const bySession = new Map(finished.map((row) => [row.sessionId, row.n]));

	return wanted.map((row) => {
		const workout = row.planJson as Workout;
		return {
			id: row.id,
			startedAt: row.startedAt,
			keyCenter: row.keyCenter,
			titles: workout.tasks.map((task) => task.title),
			// Clamped: a block row for a task the plan no longer has would otherwise
			// print "5 of 4 done", which is the sort of thing that makes a reader
			// stop believing the rest of the page.
			finished: Math.min(bySession.get(row.id) ?? 0, workout.tasks.length),
			total: workout.tasks.length
		};
	});
}

/**
 * What the practice half of the app has to show for itself.
 *
 * Blocks that **finished** and the reviews graded in them. A block abandoned
 * halfway is not counted, for the same reason the play-along clock stops when
 * the transport does: the number has to mean something a person would recognise
 * as time at the piano.
 *
 * Every finished block, whatever it was called. The six-block session is gone
 * and its four question-asking blocks are gone with it, but the hours somebody
 * spent in them are not a claim this milestone gets to revise — so the query
 * asks the column for nothing but an `ended_at`, and a `wheel_warmup` row from
 * last spring counts exactly as a `mission_2` row from this morning does. That
 * is why `LegacyBlockType` still exists, one file away.
 *
 * `sessions` owns blocks and `cards` owns reviews, so both totals filter through
 * those parents. The child rows do not repeat `user_id`; storing the same owner
 * twice would only give it a way to disagree with itself.
 */
export async function practiceTotals(userId: string) {
	const [blocks] = await db
		.select({
			finished: sql<number>`count(*)::int`,
			ms: sql<number>`coalesce(sum(extract(epoch from (${sessionBlocks.endedAt} - ${sessionBlocks.startedAt})) * 1000), 0)::bigint`
		})
		.from(sessionBlocks)
		.innerJoin(sessions, eq(sessions.id, sessionBlocks.sessionId))
		.where(and(eq(sessions.userId, userId), sql`${sessionBlocks.endedAt} is not null`));

	const [graded] = await db
		.select({
			total: sql<number>`count(*)::int`,
			correct: sql<number>`count(*) filter (where ${reviews.correct})::int`,
			last: sql<Date | null>`max(${reviews.ts})`
		})
		.from(reviews)
		.innerJoin(cards, eq(cards.id, reviews.cardId))
		.where(eq(cards.userId, userId));

	const [sat] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(sessions)
		.where(eq(sessions.userId, userId));

	return {
		sessions: sat?.total ?? 0,
		blocksFinished: blocks?.finished ?? 0,
		// Clamped: a clock adjusted backwards mid-block would otherwise take hours
		// off a total that is supposed to only ever go up.
		playingMs: Math.max(0, Number(blocks?.ms ?? 0)),
		reviews: graded?.total ?? 0,
		reviewsCorrect: graded?.correct ?? 0,
		lastReviewed: graded?.last ?? null
	};
}

export async function loadCards(userId: string, cardIds: string[]) {
	if (cardIds.length === 0) return [];
	const rows = await db
		.select({
			id: cards.id,
			direction: cards.direction,
			keyCenter: cards.keyCenter,
			payload: cards.payloadJson,
			skillCode: skills.code
		})
		.from(cards)
		.innerJoin(skills, eq(skills.id, cards.skillId))
		.where(and(eq(cards.userId, userId), inArray(cards.id, cardIds)));

	/*
	 * The other place a retired direction stops.
	 *
	 * A workout composed before the cadence questions were withdrawn is still
	 * sitting in somebody's `plan_json` with their card ids in it, and one of
	 * those ids resolving to a question nothing can pose any more would break the
	 * page rather than the task. Dropped here instead: the task comes back
	 * shorter, which is what a queue over a smaller pool has always looked like.
	 */
	const byId = new Map(rows.filter((r) => !isRetiredDirection(r.direction)).map((r) => [r.id, r]));
	return cardIds
		.map((id) => byId.get(id))
		.filter((r): r is (typeof rows)[number] => Boolean(r))
		.map((r) => ({ ...r, direction: r.direction as CardDirection }));
}

export { rungById, stageByKey };
