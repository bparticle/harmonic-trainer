import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUser, db } from './test-helpers';
import { loadTheoryProgress, saveTheoryRound } from './theory';
import { theoryRounds } from './schema';
import { beginRound, parseSubmission, submitAnswer } from '$lib/theory/round';
import { makeDeck } from '$lib/theory/catalog';

const users: string[] = [];
afterEach(async () => {
	for (const id of users.splice(0)) await deleteTestUser(id);
});

describe('theory record ownership', () => {
	it('saves idempotently, isolates accounts and cascades deletion', async () => {
		const a = await createTestUser('theory-a');
		const b = await createTestUser('theory-b');
		users.push(a.id, b.id);
		let round = beginRound({
			game: 'circle',
			mode: 'recall',
			direction: 'counterclockwise',
			level: 'starter',
			seed: 1
		});
		for (const question of makeDeck(round.spec)) round = submitAnswer(round, question.answer);
		const submission = parseSubmission({
			id: randomUUID(),
			spec: round.spec,
			attempts: round.attempts
		})!;
		expect(await saveTheoryRound(a.id, submission)).toBe(true);
		expect(await saveTheoryRound(a.id, submission)).toBe(true);
		expect(await saveTheoryRound(b.id, submission)).toBe(false);
		expect((await loadTheoryProgress(a.id)).circle).toEqual({
			rounds: 1,
			recallRounds: 1,
			bestStars: 3
		});
		expect((await loadTheoryProgress(b.id)).circle.rounds).toBe(0);
		await deleteTestUser(a.id);
		expect(await db.select().from(theoryRounds).where(eq(theoryRounds.id, submission.id))).toEqual(
			[]
		);
	});
});
