import { eq, inArray } from 'drizzle-orm';
import { db } from './index';
import {
	analysisFacts,
	badges,
	cards,
	charts,
	chordAttempts,
	playRuns,
	repertoire,
	reviews,
	sessionBlocks,
	sessions,
	srsState,
	takes,
	transferEvents,
	userPrefs,
	users
} from './schema';

/**
 * Everything one account owns, as raw rows.
 *
 * "Exporting everything you own is the same requirement wearing a different
 * hat" as deletion (ROADMAP.md) — so this reads the full record, not the
 * profile's aggregates. `/profile` already shows the summary; this is the
 * thing the summary was computed from.
 */
export async function exportAccount(userId: string) {
	const [user] = await db
		.select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	const [prefs] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId));

	const ownedCards = await db.select().from(cards).where(eq(cards.userId, userId));
	const ownedSessions = await db.select().from(sessions).where(eq(sessions.userId, userId));
	const ownedCharts = await db.select().from(charts).where(eq(charts.userId, userId));
	const ownedRuns = await db.select().from(playRuns).where(eq(playRuns.userId, userId));
	const ownedBadges = await db.select().from(badges).where(eq(badges.userId, userId));
	const ownedTakes = await db.select().from(takes).where(eq(takes.userId, userId));
	const ownedRepertoire = await db.select().from(repertoire).where(eq(repertoire.userId, userId));

	const cardIds = ownedCards.map((row) => row.id);
	const sessionIds = ownedSessions.map((row) => row.id);
	const runIds = ownedRuns.map((row) => row.id);
	const takeIds = ownedTakes.map((row) => row.id);

	const [
		srsRows,
		sessionBlockRows,
		reviewRows,
		chordAttemptRows,
		analysisFactRows,
		transferEventRows
	] = await Promise.all([
		cardIds.length ? db.select().from(srsState).where(inArray(srsState.cardId, cardIds)) : [],
		sessionIds.length
			? db.select().from(sessionBlocks).where(inArray(sessionBlocks.sessionId, sessionIds))
			: [],
		cardIds.length ? db.select().from(reviews).where(inArray(reviews.cardId, cardIds)) : [],
		runIds.length
			? db.select().from(chordAttempts).where(inArray(chordAttempts.runId, runIds))
			: [],
		takeIds.length
			? db.select().from(analysisFacts).where(inArray(analysisFacts.takeId, takeIds))
			: [],
		takeIds.length
			? db.select().from(transferEvents).where(inArray(transferEvents.takeId, takeIds))
			: []
	]);

	return {
		exportedAt: new Date().toISOString(),
		user,
		userPrefs: prefs ?? null,
		cards: ownedCards,
		srsState: srsRows,
		sessions: ownedSessions,
		sessionBlocks: sessionBlockRows,
		reviews: reviewRows,
		charts: ownedCharts,
		playRuns: ownedRuns,
		chordAttempts: chordAttemptRows,
		badges: ownedBadges,
		// Raw MIDI has no honest JSON shape of its own; base64 is the plain one.
		takes: ownedTakes.map((take) => ({
			...take,
			midiBlob: Buffer.from(take.midiBlob).toString('base64')
		})),
		repertoire: ownedRepertoire,
		analysisFacts: analysisFactRows,
		transferEvents: transferEventRows
	};
}
