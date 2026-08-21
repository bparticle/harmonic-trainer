import { and, eq, sql } from 'drizzle-orm';
import { hashPassword, verifyPassword, type SessionClaim } from '$lib/server/auth';
import { db } from './index';
import { users } from './schema';
import { LOCAL_PLAYER_ID } from './user';

export type SessionUser = {
	id: string;
	name: string;
	email: string;
	sessionEpoch: number;
};

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function sessionIsCurrent(user: SessionUser, claim: SessionClaim): boolean {
	if (user.id !== (claim.userId ?? LOCAL_PLAYER_ID)) return false;
	if (claim.sessionEpoch === user.sessionEpoch) return true;
	return claim.sessionEpoch === null && user.id === LOCAL_PLAYER_ID && user.sessionEpoch === 0;
}

/** Resolve a signed claim against a real, non-revoked account. */
export async function resolveSessionUser(claim: SessionClaim | null): Promise<SessionUser | null> {
	if (!claim) return null;
	const claimedId = claim.userId ?? LOCAL_PLAYER_ID;

	const [user] = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			sessionEpoch: users.sessionEpoch
		})
		.from(users)
		.where(eq(users.id, claimedId))
		.limit(1);

	if (!user) return null;
	return sessionIsCurrent(user, claim) ? user : null;
}

/** Authenticate one invite-only account without revealing which field failed. */
export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
	const normalized = normalizeEmail(email);
	const [row] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);

	if (!row) {
		// Keep a missing address on the same expensive path as a wrong password.
		await hashPassword(password.length >= 12 ? password : password.padEnd(12, '\0'));
		return null;
	}

	if (!(await verifyPassword(password, row.passwordHash))) return null;
	return { id: row.id, name: row.name, email: row.email, sessionEpoch: row.sessionEpoch };
}

/** Change a password and revoke every existing cookie in the same update. */
export async function changePassword(
	userId: string,
	currentPassword: string,
	newPassword: string
): Promise<boolean> {
	const [row] = await db
		.select({ passwordHash: users.passwordHash })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) return false;

	const next = await hashPassword(newPassword);
	const updated = await db
		.update(users)
		.set({ passwordHash: next, sessionEpoch: sql`${users.sessionEpoch} + 1` })
		.where(and(eq(users.id, userId), eq(users.passwordHash, row.passwordHash)))
		.returning({ id: users.id });
	return updated.length === 1;
}

/** Revoke every cookie for an account, including the caller's. */
export async function revokeSessions(userId: string): Promise<void> {
	await db
		.update(users)
		.set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
		.where(eq(users.id, userId));
}
