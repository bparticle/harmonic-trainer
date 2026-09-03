import { createHash, randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { hashPassword, verifyPassword, type SessionClaim } from '$lib/server/auth';
import { sendMail } from '$lib/server/email';
import { db } from './index';
import { passwordResetTokens, users } from './schema';
import { LOCAL_PLAYER_ID } from './user';

/** One hour: long enough to find the email, short enough that a link left
 *  open in an old tab is not a standing risk. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('base64url');
}

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

/**
 * Delete an account and everything it owns.
 *
 * One statement, on purpose: every owned table's foreign key cascades from
 * `users` (see `schema.ts`'s own comment on that table), so Postgres does the
 * rest in the same transaction as this delete. Nothing here loops over tables
 * — a hand-written list is a list that goes stale the next time a table is
 * added and somebody forgets to extend it.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
	const deleted = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
	return deleted.length === 1;
}

/** Create a reset token for a user and return the raw value. Never sends
 *  mail itself — `requestPasswordReset` decides that, so this stays testable
 *  against the database alone. */
export async function createResetToken(userId: string, now = new Date()): Promise<string> {
	const token = randomBytes(32).toString('base64url');
	await db.insert(passwordResetTokens).values({
		userId,
		tokenHash: hashToken(token),
		expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS)
	});
	return token;
}

/**
 * Request a reset link by email.
 *
 * Resolves the same way whether or not the address is registered, and the
 * same way even if the mail provider itself fails — the caller shows one
 * generic message regardless, the same discipline `authenticate` already
 * keeps for a missing user. A visitor who is already locked out is the wrong
 * audience for a stack trace, and a raw error would tell them slightly more
 * than "maybe try again" ever should: that mail sending was attempted at
 * all. The failure is not silent, though — it is logged, because the
 * operator reading logs is exactly who needs to know Maileroo rejected a
 * send.
 */
export async function requestPasswordReset(
	email: string,
	resetUrl: (token: string) => string
): Promise<void> {
	const normalized = normalizeEmail(email);
	const [row] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, normalized))
		.limit(1);
	if (!row) return;

	try {
		const token = await createResetToken(row.id);
		await sendMail(
			normalized,
			'Reset your Roundel password',
			`Follow this link to choose a new password. It expires in an hour and works once.\n\n` +
				`${resetUrl(token)}\n\n` +
				`If you did not ask for this, ignore this email — nothing changes until the link is used.`
		);
	} catch (error) {
		console.error('Password reset email failed to send:', error);
	}
}

/** Whether a reset token, by its raw value, still names something spendable. */
export async function resetTokenIsValid(token: string, now = new Date()): Promise<boolean> {
	const [row] = await db
		.select({ expiresAt: passwordResetTokens.expiresAt, usedAt: passwordResetTokens.usedAt })
		.from(passwordResetTokens)
		.where(eq(passwordResetTokens.tokenHash, hashToken(token)))
		.limit(1);
	return Boolean(row && !row.usedAt && row.expiresAt >= now);
}

export type ResetOutcome = 'ok' | 'invalid';

/**
 * Spend a reset token: verify it, set the new password, revoke every
 * existing cookie the same way `changePassword` does, and burn every other
 * outstanding token for the account in the same statement — a second link
 * requested and never used should not go on quietly working forever.
 */
export async function resetPassword(
	token: string,
	newPassword: string,
	now = new Date()
): Promise<ResetOutcome> {
	const [row] = await db
		.select({
			userId: passwordResetTokens.userId,
			expiresAt: passwordResetTokens.expiresAt,
			usedAt: passwordResetTokens.usedAt
		})
		.from(passwordResetTokens)
		.where(eq(passwordResetTokens.tokenHash, hashToken(token)))
		.limit(1);

	if (!row || row.usedAt || row.expiresAt < now) return 'invalid';

	const passwordHash = await hashPassword(newPassword);
	await db.transaction(async (tx) => {
		await tx
			.update(users)
			.set({ passwordHash, sessionEpoch: sql`${users.sessionEpoch} + 1` })
			.where(eq(users.id, row.userId));
		await tx
			.update(passwordResetTokens)
			.set({ usedAt: now })
			.where(eq(passwordResetTokens.userId, row.userId));
	});

	return 'ok';
}
