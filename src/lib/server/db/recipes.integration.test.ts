import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUser, db } from './test-helpers';
import { loadLineRecord, saveRound } from './recipes';
import { theoryRounds } from './schema';
import { begin, isOver, replay, serve, type Round } from '$lib/recipes/round';

const users: string[] = [];
afterEach(async () => {
	for (const id of users.splice(0)) await deleteTestUser(id);
});

function played(stop: 'major' | 'clockwise', slips: number[] = []) {
	let round: Round = begin({ line: 'recipes', stop, seed: 3, practised: false, version: 1 });
	while (!isOver(round)) {
		const entry = round.queue[round.position];
		const slipped = slips.includes(entry.item) && !entry.again;
		round = serve(round, { strays: slipped ? 1 : 0, shown: false });
	}
	return replay({ id: randomUUID(), spec: round.spec, outcomes: round.outcomes })!;
}

describe('the recipe line record', () => {
	it('saves once, keeps accounts apart and goes with the account', async () => {
		const a = await createTestUser('recipes-a');
		const b = await createTestUser('recipes-b');
		users.push(a.id, b.id);

		const clean = played('major');
		expect(await saveRound(a.id, clean.submission, clean.result)).toBe(true);
		// Sent again after a timeout: still one row, still theirs.
		expect(await saveRound(a.id, clean.submission, clean.result)).toBe(true);
		// The same id from somebody else is not theirs to claim.
		expect(await saveRound(b.id, clean.submission, clean.result)).toBe(false);

		const slipped = played('major', [3]);
		expect(await saveRound(a.id, slipped.submission, slipped.result)).toBe(true);

		const record = await loadLineRecord(a.id);
		expect(record.major).toEqual({ rounds: 2, best: 1 });
		expect(record.minor).toEqual({ rounds: 0, best: null });
		expect((await loadLineRecord(b.id)).major.rounds).toBe(0);

		await deleteTestUser(a.id);
		const left = await db
			.select()
			.from(theoryRounds)
			.where(eq(theoryRounds.id, clean.submission.id));
		expect(left).toEqual([]);
	});

	it('reads the best share of a round, not the best count', async () => {
		const a = await createTestUser('recipes-best');
		users.push(a.id);
		const trip = played('clockwise', [4, 6]);
		await saveRound(a.id, trip.submission, trip.result);
		expect(trip.result).toEqual({ total: 9, clean: 7 });
		expect((await loadLineRecord(a.id)).clockwise.best).toBeCloseTo(7 / 9);
	});

	it('ignores rows written before the line existed', async () => {
		const a = await createTestUser('recipes-legacy');
		users.push(a.id);
		await db.insert(theoryRounds).values({
			id: randomUUID(),
			userId: a.id,
			// The shape the first draft of this page wrote into the same table.
			specJson: { game: 'circle', mode: 'recall' } as never,
			attemptsJson: [],
			resultJson: { total: 13, clean: 13 } as never
		});
		const record = await loadLineRecord(a.id);
		expect(Object.values(record).every((stop) => stop.rounds === 0)).toBe(true);
	});
});
