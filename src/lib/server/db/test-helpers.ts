import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hashPassword } from '$lib/server/password';
import { db } from './index';
import { users } from './schema';

/**
 * Fixtures for integration tests. Deliberately reuses the app's own `db` —
 * see `index.ts` — rather than opening a second connection, so a test calling
 * a real query function (`loadHeadline`, `practiceTotals`, …) exercises
 * exactly the connection that function would use in production, and that
 * connection is the one already refusing to be `DATABASE_URL` under Vitest.
 */

export type TestUser = { id: string; name: string; email: string };

let counter = 0;

/** A real, throwaway account row, for tests that need one to own other rows. */
export async function createTestUser(label = 'test'): Promise<TestUser> {
	counter += 1;
	const id = randomUUID();
	const email = `isolation-${label}-${counter}-${id}@test.invalid`;
	const name = `Isolation ${label} ${counter}`;
	await db.insert(users).values({
		id,
		name,
		email,
		passwordHash: await hashPassword(randomUUID() + randomUUID())
	});
	return { id, name, email };
}

/** Cleanup. Ahead of Slice 2 this is the only way to remove a user; once
 *  `deleteAccount` exists, tests that want to prove *it* specifically call
 *  that instead — this stays as the plain fixture teardown. */
export async function deleteTestUser(id: string): Promise<void> {
	await db.delete(users).where(eq(users.id, id));
}

export { db };
