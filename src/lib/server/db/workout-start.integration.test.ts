import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activeWorkout, startWorkout } from './session-store';
import { sessions } from './schema';
import { createTestUser, db, deleteTestUser, type TestUser } from './test-helpers';

/**
 * The production pool deliberately has one connection. A workout start must
 * therefore do every query inside its locking transaction through `tx`; using
 * the shared `db` from inside that transaction waits forever for a second
 * connection. Two starts also exercise the reason for the lock: both callers
 * must receive the same stored workout rather than creating twins.
 */
describe('workout start locking', () => {
	let user: TestUser;

	beforeEach(async () => {
		user = await createTestUser('workout-start');
	});

	afterEach(async () => {
		await deleteTestUser(user.id);
	});

	it('starts once when two requests arrive together on a one-connection pool', async () => {
		const now = new Date('2026-09-27T08:00:00.000Z');
		const [first, second] = await Promise.all([
			startWorkout(user.id, { size: 'short' }, now),
			startWorkout(user.id, { size: 'short' }, now)
		]);

		expect(second.id).toBe(first.id);
		expect((await activeWorkout(user.id))?.id).toBe(first.id);

		const openRows = await db
			.select({ id: sessions.id })
			.from(sessions)
			.where(and(eq(sessions.userId, user.id), isNull(sessions.endedAt)));
		expect(openRows).toEqual([{ id: first.id }]);
	}, 15_000);
});
