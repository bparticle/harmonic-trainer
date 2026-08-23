import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { initialState } from '$lib/srs/scheduler';
import { createResetToken, deleteAccount } from './accounts';
import {
	analysisFacts,
	badges,
	cards,
	charts,
	chordAttempts,
	passwordResetTokens,
	playRuns,
	repertoire,
	reviews,
	sessionBlocks,
	sessions,
	skills,
	srsState,
	takes,
	transferEvents,
	userPrefs,
	users
} from './schema';
import { saveSettings } from './settings';
import { createTestUser, db, type TestUser } from './test-helpers';

/**
 * ROADMAP.md's own words for this one: "a test counts rows before and after."
 *
 * Seeds one row in every table an account can own — including `takes` and
 * `repertoire`, the two the cascade graph was missing before this milestone —
 * calls the real `deleteAccount`, and checks each specific row by id rather
 * than a table-wide count, so this cannot be fooled by unrelated rows another
 * test or the seed left lying around in the same database.
 */
describe('account deletion', () => {
	let user: TestUser;
	const ids = {
		card: randomUUID(),
		session: randomUUID(),
		block: randomUUID(),
		review: randomUUID(),
		chart: randomUUID(),
		run: randomUUID(),
		attempt: randomUUID(),
		badge: randomUUID(),
		take: randomUUID(),
		repertoire: randomUUID(),
		analysisFact: randomUUID(),
		transferEvent: randomUUID()
	};

	beforeAll(async () => {
		user = await createTestUser('deletion');

		const [skill] = await db.select({ id: skills.id }).from(skills).limit(1);
		if (!skill) {
			throw new Error(
				'No seeded skill found on TEST_DATABASE_URL. Run `npm run db:seed` against it first.'
			);
		}
		const skillId = skill.id;
		const now = new Date();
		const slug = 'deletion-test';

		await db.insert(cards).values({
			id: ids.card,
			userId: user.id,
			skillId,
			direction: 'hear_name',
			keyCenter: 'C',
			payloadJson: { identity: 'deletion-card' }
		});
		await db.insert(srsState).values({ cardId: ids.card, ...initialState(now) });

		await db
			.insert(sessions)
			.values({ id: ids.session, userId: user.id, startedAt: now, keyCenter: 'C', planJson: {} });
		await db.insert(sessionBlocks).values({
			id: ids.block,
			sessionId: ids.session,
			blockType: 'mission_0',
			startedAt: now,
			endedAt: now
		});
		await db.insert(reviews).values({
			id: ids.review,
			cardId: ids.card,
			sessionId: ids.session,
			ts: now,
			rating: 'good',
			correct: true
		});

		await db.insert(charts).values({
			id: ids.chart,
			userId: user.id,
			slug,
			name: 'Deletion test chart',
			gridJson: [['I', 'IV', 'V', 'I']],
			style: 'custom',
			mode: 'major',
			defaultBpm: 120
		});

		await db.insert(playRuns).values({
			id: ids.run,
			userId: user.id,
			chartSlug: slug,
			keyCenter: 'C',
			bpm: 120,
			groove: 'swing',
			startedAt: now,
			endedAt: now,
			playingMs: 60_000,
			voiced: 4,
			landed: 4,
			partial: 0,
			missed: 0,
			notesChord: 12,
			notesColour: 0,
			notesOutside: 0,
			bestStreak: 4
		});
		await db.insert(chordAttempts).values({
			id: ids.attempt,
			runId: ids.run,
			bar: 1,
			chord: 'C',
			numeral: 'I',
			localKey: 'C',
			landing: 'landed',
			found: 3,
			needed: 3,
			notesChord: 3,
			notesColour: 0,
			notesOutside: 0,
			atMs: 0
		});
		await db.insert(badges).values({
			id: ids.badge,
			userId: user.id,
			chartSlug: slug,
			tier: 'bronze',
			wonAt: now,
			count: 4,
			pc: 0,
			keyCenter: 'C',
			runId: ids.run
		});

		await db.insert(takes).values({
			id: ids.take,
			userId: user.id,
			sessionId: ids.session,
			ts: now,
			midiBlob: new Uint8Array([0]),
			durationMs: 1000
		});
		await db.insert(repertoire).values({
			id: ids.repertoire,
			userId: user.id,
			name: 'Deletion test repertoire',
			sourceTakeId: ids.take,
			keyCenter: 'C'
		});
		await db.insert(analysisFacts).values({
			id: ids.analysisFact,
			takeId: ids.take,
			factType: 'tempo',
			factKey: 'bpm',
			valueNum: 120
		});
		await db.insert(transferEvents).values({
			id: ids.transferEvent,
			skillId,
			takeId: ids.take,
			ts: now,
			evidenceJson: {}
		});

		await saveSettings(user.id, { midiDevice: 'Deletion test keyboard' });
		await createResetToken(user.id);

		// Confirm every row actually landed before deleting — a test that "found
		// nothing" after deletion because it never created anything would pass
		// for the wrong reason.
		expect((await db.select().from(cards).where(eq(cards.id, ids.card))).length).toBe(1);
		expect((await db.select().from(userPrefs).where(eq(userPrefs.userId, user.id))).length).toBe(1);
		expect((await db.select().from(takes).where(eq(takes.id, ids.take))).length).toBe(1);
		expect(
			(await db.select().from(repertoire).where(eq(repertoire.id, ids.repertoire))).length
		).toBe(1);
		expect(
			(await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id)))
				.length
		).toBe(1);
	});

	it('leaves no row behind, in any owned table', async () => {
		const removed = await deleteAccount(user.id);
		expect(removed).toBe(true);

		const [
			userRow,
			prefsRow,
			cardRows,
			srsRows,
			sessionRows,
			blockRows,
			reviewRows,
			chartRows,
			runRows,
			attemptRows,
			badgeRows,
			takeRows,
			repertoireRows,
			factRows,
			eventRows,
			resetTokenRows
		] = await Promise.all([
			db.select().from(users).where(eq(users.id, user.id)),
			db.select().from(userPrefs).where(eq(userPrefs.userId, user.id)),
			db.select().from(cards).where(eq(cards.id, ids.card)),
			db.select().from(srsState).where(eq(srsState.cardId, ids.card)),
			db.select().from(sessions).where(eq(sessions.id, ids.session)),
			db.select().from(sessionBlocks).where(eq(sessionBlocks.id, ids.block)),
			db.select().from(reviews).where(eq(reviews.id, ids.review)),
			db.select().from(charts).where(eq(charts.id, ids.chart)),
			db.select().from(playRuns).where(eq(playRuns.id, ids.run)),
			db.select().from(chordAttempts).where(eq(chordAttempts.id, ids.attempt)),
			db.select().from(badges).where(eq(badges.id, ids.badge)),
			db.select().from(takes).where(eq(takes.id, ids.take)),
			db.select().from(repertoire).where(eq(repertoire.id, ids.repertoire)),
			db.select().from(analysisFacts).where(eq(analysisFacts.id, ids.analysisFact)),
			db.select().from(transferEvents).where(eq(transferEvents.id, ids.transferEvent)),
			db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id))
		]);

		expect(
			[
				userRow,
				prefsRow,
				cardRows,
				srsRows,
				sessionRows,
				blockRows,
				reviewRows,
				chartRows,
				runRows,
				attemptRows,
				badgeRows,
				takeRows,
				repertoireRows,
				factRows,
				eventRows,
				resetTokenRows
			].map((rows) => rows.length)
		).toEqual(new Array(16).fill(0));
	});

	it('reports false for an account that is already gone', async () => {
		expect(await deleteAccount(user.id)).toBe(false);
		// Deleting a random id that was never a row is the same case, and it
		// matters just as much: the delete route must not crash on it.
		expect(await deleteAccount(randomUUID())).toBe(false);
	});
});
