import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './index';
import { cards, reviews, sessionBlocks, sessions, skills, srsState, transferEvents } from './schema';
import type { BlockType, ReviewRating } from './schema';
import { initialState, schedule, type Schedulable, type SrsState } from '$lib/srs/scheduler';
import { evaluate, type SkillStats } from '$lib/curriculum/mastery';
import { nextSkill } from '$lib/curriculum/mastery';
import { planSession, resumeIndex, type SessionLength, type SessionPlan } from '$lib/session/plan';
import { chooseAtomWithFallback } from '$lib/session/atoms';
import { skillByCode } from '$lib/curriculum/skills';

/**
 * Reading and writing sessions.
 *
 * Blocks are written as they finish rather than at the end, so a session that
 * is abandoned halfway still leaves everything up to that point on record. The
 * brief is explicit that abandoning costs nothing, and that only works if
 * nothing was being held back.
 */

export type ActiveSession = {
	id: string;
	startedAt: Date;
	plan: SessionPlan;
	completedBlocks: BlockType[];
	/** Index of the block to show. Equal to the block count when finished. */
	resumeAt: number;
};

/** Everything the planner needs, gathered in as few queries as possible. */
async function gatherPlanningData() {
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

	const perSkill = await db
		.select({
			code: skills.code,
			total: sql<number>`count(${reviews.id})::int`,
			correct: sql<number>`sum(case when ${reviews.correct} then 1 else 0 end)::int`
		})
		.from(skills)
		.leftJoin(cards, eq(cards.skillId, skills.id))
		.leftJoin(reviews, eq(reviews.cardId, cards.id))
		.groupBy(skills.code);

	// Real transfer counts, read from the table that M6 will start filling. Empty
	// for now, which is the honest value — a skill genuinely has not been seen
	// turning up unprompted until something is watching for it.
	const perTransfer = await db
		.select({ code: skills.code, n: sql<number>`count(${transferEvents.id})::int` })
		.from(skills)
		.leftJoin(transferEvents, eq(transferEvents.skillId, skills.id))
		.groupBy(skills.code);
	const transfersByCode = new Map(perTransfer.map((row) => [row.code, row.n ?? 0]));

	const stats = new Map<string, SkillStats>(
		perSkill.map((row) => [
			row.code,
			{
				skillCode: row.code,
				reviews: row.total ?? 0,
				correct: row.correct ?? 0,
				transfers: transfersByCode.get(row.code) ?? 0
			}
		])
	);

	return {
		schedulable,
		reviewsByKey: new Map(perKey.map((r) => [r.keyCenter, r.n ?? 0])),
		allKeys: [...new Set(scheduled.map((r) => r.keyCenter))].sort(),
		stats
	};
}

/** Atoms already met, so today's is a new one where possible. */
async function seenAtoms(): Promise<Set<string>> {
	const rows = await db
		.select({ result: sessionBlocks.resultJson })
		.from(sessionBlocks)
		.where(eq(sessionBlocks.blockType, 'new_atom'))
		.orderBy(desc(sessionBlocks.startedAt))
		.limit(100);

	const seen = new Set<string>();
	for (const row of rows) {
		const id = (row.result as { atomId?: string } | null)?.atomId;
		if (id) seen.add(id);
	}
	return seen;
}

/** The session started today, if there is one. */
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

/**
 * Start today's session, or hand back the one already in progress.
 *
 * Idempotent on purpose: pressing the one button twice, or reloading mid
 * session, must not throw away what has been done.
 */
export async function startOrResume(
	lengthMinutes: SessionLength = 20,
	now = new Date()
): Promise<ActiveSession> {
	const existing = await todaysSession(now);
	if (existing) return existing;

	const { schedulable, reviewsByKey, allKeys, stats } = await gatherPlanningData();
	const verdicts = evaluate(stats);
	const skill = nextSkill(verdicts);
	const levelOf = (code: string) => skillByCode(code)?.level ?? 99;
	const atom = chooseAtomWithFallback(skill?.code ?? null, await seenAtoms(), levelOf);

	const plan = planSession({
		lengthMinutes,
		cards: schedulable,
		reviewsByKey,
		allKeys,
		atomId: atom?.id ?? null,
		now
	});

	const id = randomUUID();
	await db.insert(sessions).values({
		id,
		startedAt: now,
		keyCenter: plan.keyCenter,
		planJson: { ...plan, skillCode: skill?.code ?? null }
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
 * card was reviewed when no review exists to justify it, and that is the sort
 * of drift nothing in the UI would ever reveal.
 */
export async function recordReviews(
	sessionId: string | null,
	batch: ReviewInput[],
	now = new Date()
): Promise<void> {
	if (batch.length === 0) return;

	await db.transaction(async (tx) => {
		// `inArray`, not `= any(...)`: Drizzle expands a JS array into a tuple of
		// placeholders, which `any()` cannot take.
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

/** Cards for a block, with everything needed to pose them. */
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

	// Keep the planner's order; the query does not preserve it.
	const byId = new Map(rows.map((r) => [r.id, r]));
	return cardIds.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => Boolean(r));
}
