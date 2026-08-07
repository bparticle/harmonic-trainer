import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './index';
import { cards, reviews, sessionBlocks, sessions, skills, srsState } from './schema';
import type { BlockType, ReviewRating } from './schema';
import { initialState, schedule, type Schedulable, type SrsState } from '$lib/srs/scheduler';
import { planSession, resumeIndex, type SessionLength, type SessionPlan } from '$lib/session/plan';
import {
	FIRST_POSITION,
	positionOf,
	reachedSoFar,
	rungById,
	stageByKey,
	type Position,
	type RungId
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
 * Reading and writing sessions.
 *
 * Blocks are written as they finish rather than at the end, so a session that
 * is abandoned halfway still leaves everything up to that point on record.
 *
 * Cards are created here too, lazily: reaching a rung is what brings its cards
 * into existence. Nothing is ever due that has not been introduced.
 */

export type ActiveSession = {
	id: string;
	startedAt: Date;
	plan: SessionPlan;
	completedBlocks: BlockType[];
	resumeAt: number;
};

/** Where the ladder currently is, from settings, falling back to the very start. */
export async function currentPosition(): Promise<Position> {
	const settings = await loadSettings();
	return (
		positionOf(settings.prefs.ladderKey, settings.prefs.ladderRung) ?? FIRST_POSITION
	);
}

/**
 * Create any cards for places already reached that do not exist yet.
 *
 * Idempotent through the identity string, so it can be called on every session
 * start without duplicating anything.
 */
export async function ensureCards(generated: GeneratedCard[]): Promise<number> {
	if (generated.length === 0) return 0;

	const skillRows = await db.select({ id: skills.id, code: skills.code }).from(skills);
	const skillIds = new Map(skillRows.map((s) => [s.code, s.id]));

	const existing = await db.select({ payload: cards.payloadJson }).from(cards);
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
			skillId,
			direction: card.direction,
			keyCenter: card.keyCenter,
			payloadJson: { ...card.payload, identity: card.identity }
		});
		newStates.push({ cardId: id, ...initialState(now) });
	}

	if (newCards.length === 0) return 0;
	await db.insert(cards).values(newCards);
	await db.insert(srsState).values(newStates);
	return newCards.length;
}

/** Bring the ladder's cards up to date with where you have got to. */
export async function ensureLadderCards(position: Position): Promise<number> {
	return ensureCards(cardsForReached(reachedSoFar(position)));
}

/** Bring a progression into existence in a key, the first time it is asked for. */
export async function ensureProgressionCards(
	progressionId: string,
	keyName: string
): Promise<number> {
	const progression = progressionById(progressionId);
	if (!progression) return 0;
	return ensureCards(cardsForProgression(progression, keyName));
}

/** Move one step along the ladder, and create whatever that unlocks. */
export async function advanceLadder(to: Position): Promise<Position> {
	const settings = await loadSettings();
	await saveSettings({
		prefs: { ...settings.prefs, ladderKey: to.stage.key, ladderRung: to.rung.id }
	});
	await ensureLadderCards(to);
	return to;
}

async function gatherPlanningData(position: Position, extraKeys: string[] = []) {
	const scheduled = await db
		.select({
			cardId: cards.id,
			direction: cards.direction,
			keyCenter: cards.keyCenter,
			skillCode: skills.code,
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
		.innerJoin(skills, eq(skills.id, cards.skillId));

	const schedulable: Schedulable[] = scheduled.map((row) => ({
		cardId: row.cardId,
		direction: row.direction,
		keyCenter: row.keyCenter,
		skillCode: row.skillCode,
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

	const perKey = await db
		.select({ keyCenter: cards.keyCenter, n: sql<number>`count(${reviews.id})::int` })
		.from(cards)
		.leftJoin(reviews, eq(reviews.cardId, cards.id))
		.groupBy(cards.keyCenter);

	return {
		schedulable,
		reviewsByKey: new Map(perKey.map((r) => [r.keyCenter, r.n ?? 0])),
		// Keys that have been reached, plus anything explicitly asked for — so
		// nothing gets planned in a key that has never come up, and a key you
		// deliberately chose is never silently ignored.
		allKeys: [...new Set([...reachedSoFar(position).map((r) => r.key), ...extraKeys])],
		position
	};
}

export async function todaysSession(now = new Date()): Promise<ActiveSession | null> {
	const midnight = new Date(now);
	midnight.setHours(0, 0, 0, 0);

	const [row] = await db
		.select()
		.from(sessions)
		.where(and(gte(sessions.startedAt, midnight), isNull(sessions.endedAt)))
		.orderBy(desc(sessions.startedAt))
		.limit(1);

	if (!row) return null;
	return hydrate(row);
}

async function hydrate(row: typeof sessions.$inferSelect): Promise<ActiveSession> {
	const blocks = await db
		.select({ blockType: sessionBlocks.blockType, endedAt: sessionBlocks.endedAt })
		.from(sessionBlocks)
		.where(eq(sessionBlocks.sessionId, row.id));

	const plan = row.planJson as SessionPlan;
	const completed = blocks.filter((b) => b.endedAt !== null).map((b) => b.blockType);

	return {
		id: row.id,
		startedAt: row.startedAt,
		plan,
		completedBlocks: completed,
		resumeAt: resumeIndex(plan, completed)
	};
}

export type SessionRequest = {
	lengthMinutes?: SessionLength;
	/** A progression to work on instead of the ladder rung. */
	progressionId?: string | null;
	/** Which key to practise a progression in. Defaults to the current one. */
	progressionKey?: string | null;
	/**
	 * A key and a rung to work on instead of wherever the ladder is.
	 *
	 * Exploring is not the same as advancing: this builds a session around the
	 * chosen step and leaves the ladder exactly where it was. Nothing here is
	 * checked against how far you have got, because the ladder has never gated
	 * anything — it suggests, and you decide.
	 */
	focusKey?: string | null;
	focusRung?: string | null;
};

/**
 * Start today's session, or hand back the one already in progress.
 *
 * The session is built around wherever the ladder currently is — not around a
 * scheduler's idea of which key has been neglected. A progression can be asked
 * for instead, in any key already reached.
 */
export async function startOrResume(
	request: SessionRequest = {},
	now = new Date()
): Promise<ActiveSession> {
	const existing = await todaysSession(now);
	if (existing) return existing;

	const position = await currentPosition();
	await ensureLadderCards(position);

	let focusSkills: string[] | null = null;
	let preferredKey: string | null = position.stage.key;

	// Keys that exist in the card bank but are not on the ladder yet, because
	// something outside the current step was asked for.
	const extraKeys: string[] = [];

	if (request.progressionId) {
		const keyName = request.progressionKey ?? position.stage.key;
		await ensureProgressionCards(request.progressionId, keyName);
		focusSkills = [`prog:${request.progressionId}`];
		preferredKey = keyName;
		extraKeys.push(keyName);
	} else if (request.focusKey && request.focusRung) {
		const stage = stageByKey(request.focusKey);
		const rung = rungById(request.focusRung);
		if (stage && rung) {
			await ensureCards(cardsForRung(rung.id as RungId, stage));
			focusSkills = [rungSkillCode(rung.id)];
			preferredKey = stage.key;
			extraKeys.push(stage.key);
		}
	} else {
		focusSkills = [rungSkillCode(position.rung.id)];
	}

	const { schedulable, reviewsByKey, allKeys } = await gatherPlanningData(position, extraKeys);

	const plan = planSession({
		lengthMinutes: request.lengthMinutes ?? 20,
		cards: schedulable,
		reviewsByKey,
		allKeys: allKeys.length ? allKeys : [position.stage.key],
		atomId: null,
		preferredKey,
		focusSkills,
		now
	});

	const id = randomUUID();
	await db.insert(sessions).values({
		id,
		startedAt: now,
		keyCenter: plan.keyCenter,
		planJson: {
			...plan,
			ladderKey: position.stage.key,
			ladderRung: position.rung.id,
			progressionId: request.progressionId ?? null
		}
	});

	return { id, startedAt: now, plan, completedBlocks: [], resumeAt: 0 };
}

export async function beginBlock(sessionId: string, blockType: BlockType): Promise<string> {
	const [existing] = await db
		.select({ id: sessionBlocks.id })
		.from(sessionBlocks)
		.where(and(eq(sessionBlocks.sessionId, sessionId), eq(sessionBlocks.blockType, blockType)))
		.limit(1);
	if (existing) return existing.id;

	const id = randomUUID();
	await db.insert(sessionBlocks).values({ id, sessionId, blockType });
	return id;
}

export async function finishBlock(
	sessionId: string,
	blockType: BlockType,
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
	sessionId: string,
	result: unknown,
	now = new Date()
): Promise<void> {
	await db
		.update(sessions)
		.set({ endedAt: now, resultJson: result as never })
		.where(eq(sessions.id, sessionId));
}

export type ReviewInput = {
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
	sessionId: string | null,
	batch: ReviewInput[],
	now = new Date()
): Promise<void> {
	if (batch.length === 0) return;

	await db.transaction(async (tx) => {
		const ids = batch.map((r) => r.cardId);
		const states = await tx.select().from(srsState).where(inArray(srsState.cardId, ids));
		const byCard = new Map(states.map((s) => [s.cardId, s]));

		for (const review of batch) {
			await tx.insert(reviews).values({
				id: randomUUID(),
				cardId: review.cardId,
				sessionId,
				ts: now,
				rating: review.rating,
				correct: review.correct,
				latencyMs: review.latencyMs,
				playedJson: review.played ? { notes: review.played } : null
			});

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
		}
	});
}

/** How the current rung is going, for deciding whether to suggest moving on. */
export async function rungProgress(position: Position) {
	const code = rungSkillCode(position.rung.id);
	const [row] = await db
		.select({
			total: sql<number>`count(${reviews.id})::int`,
			correct: sql<number>`sum(case when ${reviews.correct} then 1 else 0 end)::int`
		})
		.from(cards)
		.innerJoin(skills, eq(skills.id, cards.skillId))
		.leftJoin(reviews, eq(reviews.cardId, cards.id))
		.where(and(eq(skills.code, code), eq(cards.keyCenter, position.stage.key)));

	const total = row?.total ?? 0;
	const correct = row?.correct ?? 0;
	const accuracy = total > 0 ? correct / total : 0;

	return {
		reviews: total,
		correct,
		accuracy,
		/** Only ever a suggestion — moving on is your call. */
		looksSolid: total >= position.rung.suggestAfter && accuracy >= 0.8
	};
}

export async function loadCards(cardIds: string[]) {
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
		.where(inArray(cards.id, cardIds));

	const byId = new Map(rows.map((r) => [r.id, r]));
	return cardIds.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => Boolean(r));
}

export { rungById, stageByKey };
