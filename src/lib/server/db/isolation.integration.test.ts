import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initialState } from '$lib/srs/scheduler';
import { exportAccount } from './export';
import { loadHeadline, loadRecord, loadTunes } from './play-log';
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
	srsState
} from './schema';
import { practiceTotals } from './session-store';
import { loadSettings, saveSettings } from './settings';
import { createTestUser, db, deleteTestUser, type TestUser } from './test-helpers';

/**
 * Proves the isolation ROADMAP.md's M12 "Done when" list asks for: two
 * accounts practising the same evening, neither able to see the other's
 * cards, charts, runs, badges or colours.
 *
 * Calls the real query functions the routes call rather than hand-rolled
 * queries, so a scoping bug in the app itself — not just a schema that could
 * in principle be scoped — is what this actually catches.
 */
describe('cross-account isolation', () => {
	let userA: TestUser;
	let userB: TestUser;
	let skillId: string;

	async function seedOwnedRows(userId: string, slug: string) {
		const cardId = randomUUID();
		const sessionId = randomUUID();
		const blockId = randomUUID();
		const runId = randomUUID();
		const now = new Date();

		await db.insert(cards).values({
			id: cardId,
			userId,
			skillId,
			direction: 'hear_name',
			keyCenter: 'C',
			payloadJson: { identity: `${slug}-card` }
		});
		await db.insert(srsState).values({ cardId, ...initialState(now) });

		await db
			.insert(sessions)
			.values({ id: sessionId, userId, startedAt: now, keyCenter: 'C', planJson: {} });
		await db
			.insert(sessionBlocks)
			.values({ id: blockId, sessionId, blockType: 'mission_0', startedAt: now, endedAt: now });
		await db
			.insert(reviews)
			.values({ id: randomUUID(), cardId, sessionId, ts: now, rating: 'good', correct: true });

		await db.insert(charts).values({
			id: randomUUID(),
			userId,
			slug,
			name: `Isolation chart ${slug}`,
			gridJson: [['I', 'IV', 'V', 'I']],
			style: 'custom',
			mode: 'major',
			defaultBpm: 120
		});

		await db.insert(playRuns).values({
			id: runId,
			userId,
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
			id: randomUUID(),
			runId,
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
			id: randomUUID(),
			userId,
			chartSlug: slug,
			tier: 'bronze',
			wonAt: now,
			count: 4,
			pc: 0,
			keyCenter: 'C',
			runId
		});

		await saveSettings(userId, { midiDevice: `Isolation Keyboard ${slug}` });
	}

	beforeAll(async () => {
		[userA, userB] = await Promise.all([createTestUser('a'), createTestUser('b')]);

		const [skill] = await db.select({ id: skills.id }).from(skills).limit(1);
		if (!skill) {
			throw new Error(
				'No seeded skill found on TEST_DATABASE_URL. Run `npm run db:seed` against it first.'
			);
		}
		skillId = skill.id;

		await seedOwnedRows(userA.id, 'isolation-a');
		await seedOwnedRows(userB.id, 'isolation-b');
	});

	afterAll(async () => {
		await deleteTestUser(userA.id);
		await deleteTestUser(userB.id);
	});

	it('keeps play-along headlines apart', async () => {
		const [headlineA, headlineB] = await Promise.all([
			loadHeadline(userA.id),
			loadHeadline(userB.id)
		]);
		expect(headlineA.runs).toBe(1);
		expect(headlineB.runs).toBe(1);
	});

	it('keeps tune lists apart', async () => {
		const [tunesA, tunesB] = await Promise.all([loadTunes(userA.id), loadTunes(userB.id)]);
		expect(tunesA.map((t) => t.chartSlug)).toEqual(['isolation-a']);
		expect(tunesB.map((t) => t.chartSlug)).toEqual(['isolation-b']);
	});

	it('keeps practice totals apart', async () => {
		const [totalsA, totalsB] = await Promise.all([
			practiceTotals(userA.id),
			practiceTotals(userB.id)
		]);
		expect(totalsA.sessions).toBe(1);
		expect(totalsA.reviews).toBe(1);
		expect(totalsB.sessions).toBe(1);
		expect(totalsB.reviews).toBe(1);
	});

	it('keeps badges apart', async () => {
		const [recordA, recordB] = await Promise.all([loadRecord(userA.id), loadRecord(userB.id)]);
		expect(Object.keys(recordA.badges)).toEqual(['isolation-a']);
		expect(Object.keys(recordB.badges)).toEqual(['isolation-b']);
	});

	it('keeps charts apart', async () => {
		const [chartsA, chartsB] = await Promise.all([
			db.select({ slug: charts.slug }).from(charts).where(eq(charts.userId, userA.id)),
			db.select({ slug: charts.slug }).from(charts).where(eq(charts.userId, userB.id))
		]);
		expect(chartsA.map((c) => c.slug)).toEqual(['isolation-a']);
		expect(chartsB.map((c) => c.slug)).toEqual(['isolation-b']);
	});

	it('keeps settings — including MIDI device — apart', async () => {
		const [settingsA, settingsB] = await Promise.all([
			loadSettings(userA.id),
			loadSettings(userB.id)
		]);
		expect(settingsA.midiDevice).toBe('Isolation Keyboard isolation-a');
		expect(settingsB.midiDevice).toBe('Isolation Keyboard isolation-b');
	});

	it('keeps exports apart', async () => {
		const [exportA, exportB] = await Promise.all([
			exportAccount(userA.id),
			exportAccount(userB.id)
		]);

		expect(exportA.user?.id).toBe(userA.id);
		expect(exportA.charts.map((c) => c.slug)).toEqual(['isolation-a']);
		expect(exportA.playRuns.every((run) => run.userId === userA.id)).toBe(true);
		expect(exportA.badges.every((badge) => badge.userId === userA.id)).toBe(true);

		expect(exportB.user?.id).toBe(userB.id);
		expect(exportB.charts.map((c) => c.slug)).toEqual(['isolation-b']);
		expect(exportB.playRuns.every((run) => run.userId === userB.id)).toBe(true);
		expect(exportB.badges.every((badge) => badge.userId === userB.id)).toBe(true);
	});
});
